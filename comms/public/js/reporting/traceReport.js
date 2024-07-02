// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';

export default class TraceReport extends Report {
    static {
        /**
         * @class Report detailing the feature returned by a trace
         */
        this.prototype.messageGroup = 'TraceReport';

        // Customisation hooks
        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, featureSet) {
        return featureSet.isTraceResult;
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     */
    constructor(app, traceResult) {
        super(app, traceResult);
        this.app = app;
        this.traceResult = traceResult;
        this.reportMgr = this.app.plugins.reportManager;
        this.deltaOwner = null;
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        return this.typeName();
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
     * Get information for report body
     */
    async build() {
        this.date = new Date();

        if (this.app.getDelta()) {
            this.deltaOwner = await this.app
                .getDatasource('myworld')
                .getFeatureByUrn(this.app.getDelta());
        }

        this.spine = this.traceResult.items[0].buildSpine();
        this.maxDepthOf(this.spine[0]);

        // Only export the schematic if it's visible
        if (this.app.plugins.schematics.view?.visible)
            this.schematicImage = await this.app.plugins.schematics.view?.export();
    }

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
        // Show report type
        strm.writeHeading(3, this.typeName());

        // Show object being reported on
        const rootNode = this.spine[0];
        strm.writeHeading(1, rootNode.getTitle());
        // ENH: Show metadata for root node

        // Add design info (if appropriate)
        if (this.deltaOwner) {
            strm.writeLine(this.deltaOwner.getTitle());
        }

        // Add generation date
        strm.writeLine(this.msg('date'), ': ', this.date.toLocaleDateString());

        strm.writeLine();

        // Only add schematic if it is visible
        if (this.app.plugins.schematics.view?.visible) {
            const schematicTable = this.buildSchematicTable();
            strm.writeTable(schematicTable);

            //Create a new page after the schematic.
            strm.newSection();
        }
    }

    writeBody(strm) {
        const cols = ['feature'];
        const colHeadings = {
            feature: this.msg('feature')
        };

        const colStyles = {};

        for (let i = 0; i <= this.maxDepth; i++) {
            const nodeCols = [
                `connType:${i}`,
                `feature:${i}`,
                `feature_ports:${i}`,
                `feature_distance:${i}`,
                `feature_direction:${i}`,
                `feature_from:${i}`,
                `feature_to:${i}`,
                `feature_fibers:${i}`
            ];

            cols.push(...nodeCols);

            for (const colName of nodeCols) {
                const msgName = colName.split(':')[0];
                colHeadings[colName] = this.msg(msgName);
                if (colName.includes('distance')) colStyles[colName] = { hAlign: 'right' };
            }
        }

        cols.push(...['ports', 'from', 'to']);

        const tab = new ReportTable(cols);
        tab.nextRow();

        //Build table from root node
        this.outputSpine(tab, this.spine[0]);

        const options = { colHeadings, colStyles, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);
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

        const child = this.findSpine(traceNode, spineNo);

        if (child) {
            tab.nextRow();
            this.outputSpine(tab, child, spineNo, group);
        }
    }

    /**
     * Returns child of traceNode on spineNo if there is one
     */
    findSpine(traceNode, spineNo) {
        for (const child of traceNode.children) {
            if (child.spine == spineNo) return child;
        }
    }

    /**
     * Outputs data relevant to traceNode to 'tab'
     */
    outputNode(tab, group, traceNode, spineNo, showConnType) {
        if (showConnType) tab.add(`connType:${group}`, '->');
        tab.add(`feature:${group}`, traceNode.getTitle());
        tab.add(`feature_ports:${group}`, traceNode.ports);
        tab.add(`feature_distance:${group}`, this.getDistance(traceNode));
        if (traceNode.direction)
            tab.add(`feature_direction:${group}`, this.msg(traceNode.direction));
        if (traceNode.from_) tab.add(`feature_from:${group}`, traceNode.from_);
        if (traceNode.to_) tab.add(`feature_to:${group}`, traceNode.to_);
        if (traceNode.fibers) tab.add(`feature_fibers:${group}`, traceNode.fibers);
    }

    // -----------------------------------------------------------------------------
    //                              HELPERS
    // -----------------------------------------------------------------------------

    /**
     * Get max breadth of tree
     */
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
     * Gets distance string in application units
     */
    getDistance(traceNode) {
        const defaultUnit = myw.applicationDefinition.displayUnits.length;
        const lengthConfig = myw.config['core.units'].length;
        const unitScale = new myw.UnitScale(lengthConfig);
        const unit = unitScale.value(traceNode.dist, 'm');
        return `${unit.toString(defaultUnit)}`;
    }

    buildSchematicTable() {
        const cols = ['image1'];
        const mapTable = new ReportTable(cols);
        mapTable.nextRow();
        for (const col of cols) {
            // Calculate aspect ratio. Adjust so that the preview is not too wide.
            const apsectRatio =
                this.schematicImage.width > this.schematicImage.height
                    ? this.schematicImage.height / this.schematicImage.width
                    : 1;
            mapTable.add(col, { value: this.schematicImage, scale: apsectRatio * 100 });
        }

        return mapTable;
    }
}
