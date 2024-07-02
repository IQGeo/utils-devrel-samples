// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';
import PinRange from '../api/pinRange';
import { zeroPad, formatdBStr, formatLengthStr } from 'modules/comms/js/base/strUtils';

export default class LoopMakeupReport extends Report {
    static {
        /**
         * Report listing the splices within an enclosure, by cable
         *
         * Consists of table for each cable, showing connection and circuit on each fiber
         */
        this.prototype.messageGroup = 'LoopMakeupReport';

        this.prototype.tableStyle = 'modern';

        this.prototype.tech_mapping = {
            fiber_splices: {
                connectionTable: 'mywcom_fiber_connection',
                segmentTable: 'mywcom_fiber_segment',
                pinCountField: 'fiber_count'
            },
            copper_splices: {
                connectionTable: 'mywcom_copper_connection',
                segmentTable: 'mywcom_copper_segment',
                pinCountField: 'copper_count'
            }
        };
    }

    static canBuildFor(app, feature) {
        return Object.keys(myw.config['mywcom.structures']).includes(feature.featureDD.name);
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     */
    constructor(app, housing) {
        super(app, housing);
        this.app = app;
        this.housing = housing;
        this.ds = housing.datasource;

        this.structManager = app.plugins.structureManager;
        this.connectionManager = app.plugins.connectionManager;

        const spliceField = this.housing.featureDD.fields.fiber_splices
            ? 'fiber_splices'
            : 'copper_splices';
        this.connectionTable = this.tech_mapping[spliceField].connectionTable;
        this.segmentTable = this.tech_mapping[spliceField].segmentTable;
        this.pinCountField = this.tech_mapping[spliceField].pinCountField;
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        return `${this.typeName()}: ${this.housing.getTitle()}`;
    }

    /**
     * String used to identify self in choice lists etc
     */
    typeName() {
        return this.msg('type');
    }

    // ------------------------------------------------------------------------
    //                               DATA GATHERING
    // ------------------------------------------------------------------------

    /**
     * Get objects and group them
     *
     * Returns true if report non-empty
     */
    async build() {
        await this.buildHeaderData();
        await this.buildData();

        return this.cables.length > 0;
    }

    /**
     * Get information for header
     */
    async buildHeaderData() {
        // cope with if housing is top level
        if (this.housing.featureDD.fields.root_housing) {
            this.struct = await this.housing.followReference('root_housing'); // TODO: Show the tree
        } else {
            this.struct = this.housing;
        }

        // Get generation time
        this.date = new Date();

        // Get design
        const delta = this.ds.getDelta();
        if (delta) {
            this.deltaOwner = await this.ds.getFeatureByUrn(delta);
        }
    }

    /**
     * Get information for report body
     */
    async buildData() {
        await this.getCablesAndSegs();
        await this.getTraceResults();
    }

    /**
     * Get connections direcly in enclosure
     */
    async getCablesAndSegs() {
        const structContent = await this.structManager.structContent(this.housing);
        this.structContent = structContent;
        const cables = structContent.cables.filter(cable => cable.type === 'copper_cable');

        // Set report order
        const sortProc = (c1, c2) => (c1.properties.name < c2.properties.name ? -1 : 1);
        this.cables = cables.sort(sortProc);

        this.segs = structContent.segs.filter(seg => seg.type === 'mywcom_copper_segment');
    }

    getTraceResults = async strm => {
        let traceResults = [];
        for (const seg of this.segs) {
            const cable = this.cables.filter(
                cable => cable.id == seg.properties.cable.split('/')[1]
            )[0];
            const traceResult = await this.connectionManager.traceOut(
                'copper',
                seg,
                new PinRange('in', 1, cable.properties.copper_count),
                // TODO don't hardcode direction
                'downstream'
            );
            traceResults.push(traceResult);
        }
        this.traceResults = traceResults;
    };

    // ------------------------------------------------------------------------
    //                                GENERATION
    // ------------------------------------------------------------------------

    /**
     * Write report on ReportStream 'strm'
     */
    generate(strm) {
        this.writeHeader(strm);
        this.writeBody(strm);
        return strm.doc;
    }

    /**
     * Output header info
     */
    writeHeader(strm) {
        strm.newSection('Summary');

        // Show report type
        strm.writeHeading(3, this.typeName());

        // Show object being reported on
        strm.writeHeading(1, this.housing.getTitle());

        // Show containing structure (if necessary)
        if (this.struct != this.housing) {
            strm.writeLine(this.struct.getTitle());
        }

        // Add design info (if appropriate)
        if (this.deltaOwner) {
            strm.writeLine(this.deltaOwner.getTitle());
        }

        // Add generation date
        strm.writeLine(this.msg('date') + ': ', this.date.toLocaleDateString());

        strm.writeLine();
    }

    writeBody = strm => {
        this.traceResults.map(result => {
            const spine = result.items[0].buildSpine();
            this.maxDepthOf(spine[0]);

            const cols = [];
            const colHeadings = {
                feature: this.msg('feature')
            };

            const colStyles = {};

            for (let i = 0; i <= this.maxDepth; i++) {
                const nodeCols = [
                    `connType:${i}`,
                    `feature:${i}`,
                    `pins:${i}`,
                    `distance:${i}`,
                    `cumulative_distance:${i}`,
                    `individual_loss:${i}`,
                    `cumulative_loss:${i}`,
                    `ewl_aed:${i}`
                ];

                cols.push(...nodeCols);

                for (const colName of nodeCols) {
                    const msgName = colName.split(':')[0];
                    colHeadings[colName] = this.msg(msgName);
                    if (
                        colName.includes('distance') ||
                        colName.includes('cumulativeDistance') ||
                        colName.includes('individualLoss') ||
                        colName.includes('cumulativeLoss')
                    )
                        colStyles[colName] = { hAlign: 'right' };
                }
            }

            cols.push(...['ports', 'from', 'to']);

            const tab = new ReportTable(cols);

            tab.nextRow();
            this.outputSpine(tab, spine[0]);

            const options = { colHeadings, colStyles, skipEmptyCols: true, style: this.tableStyle };
            strm.writeTable(tab, options);
        });
    };

    /**
     * Returns child of traceNode on spineNo if there is one
     */
    findSpine(traceNode, spineNo) {
        for (const child of traceNode.children) {
            if (child.spine == spineNo) return child;
        }
    }

    maxDepthOf(traceNode, spineNo = 0, group = 0) {
        for (const child of traceNode.children) {
            if (child.spine <= spineNo) continue;
            this.maxDepthOf(child, child.spine, group + 1);
        }

        const child = this.findSpine(traceNode, spineNo);

        if (child) {
            this.maxDepthOf(child, spineNo, group);
        }

        this.maxDepth = Math.max(group, this.maxDepth || 0);
    }

    /**
     * Adds to tab an entry for 'traceNode' and all sub trees for children where spine is greater than 'spineNumber'
     */
    outputSpine(tab, traceNode, spineNo = 0, group = 0, firstRow = false) {
        this.outputNode(tab, group, traceNode, spineNo, firstRow);

        // Output branches
        let firstBranch = true;
        for (const i in traceNode.children) {
            const child = traceNode.children[i];

            if (child.spine <= spineNo) continue;

            if (!firstBranch) tab.nextRow();
            this.outputSpine(tab, child, child.spine, group + 1, true);
            firstBranch = false;
        }

        // Output remaining spine
        const child = this.findSpine(traceNode, spineNo);

        if (child) {
            tab.nextRow();
            this.outputSpine(tab, child, spineNo, group);
        }
    }

    /**
     * Outputs data relevant to traceNode to 'tab'
     */
    outputNode(tab, group, traceNode, spineNo, showConnType) {
        if (showConnType) tab.add(`connType:${group}`, '->');

        const ewl = this.calculateEWL(traceNode);
        tab.add(`feature:${group}`, traceNode.properties.name || traceNode.getTitle());
        tab.add(`pins:${group}`, traceNode.ports);
        tab.add(`distance:${group}`, traceNode.length ? formatLengthStr(traceNode.length) : null);
        tab.add(`cumulative_distance:${group}`, formatLengthStr(traceNode.dist));
        tab.add(`individual_loss:${group}`, formatdBStr(traceNode.individualLoss));
        tab.add(`cumulative_loss:${group}`, formatdBStr(traceNode.cumulativeLoss));
        tab.add(`ewl_aed:${group}`, ewl ? formatLengthStr(ewl) : null);

        if (traceNode.from_ || traceNode.to_) {
            let fromText = traceNode.from_ ?? '';
            const regExp = /^-?\d*\.?\d*$/; // Test if string is number
            let isNumeric = regExp.test(fromText);
            if (isNumeric) fromText = `#${fromText}`;

            let toText = traceNode.to_ ?? '';
            isNumeric = regExp.test(toText);
            if (isNumeric) toText = `#${toText}`;
            const fromToStr = `${fromText} -> ${toText}`;
            tab.add(`pins:${group}`, fromToStr);
        }
        if (traceNode.fibers) tab.add(`pins:${group}`, `#${traceNode.fibers}`);
    }

    /**
     * Calculate the Effective working length (Access Edge Distance) of a copper cable
     */
    calculateEWL(traceNode) {
        let ewl;
        if (traceNode.length) {
            const conversion = myw.config['mywcom.ewl'].conversions.filter(
                con => con.gauge === traceNode.feature.properties.gauge
            )[0].ewl;
            ewl = conversion * parseFloat(traceNode.length);
        }
        return ewl;
    }
}
