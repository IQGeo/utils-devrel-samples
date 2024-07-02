// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';
import { strCmp, zeroPad } from '../base/strUtils';

export default class FiberReport extends Report {
    static {
        /**
         * @class Report detailing the cables within a route or structure
         */
        this.prototype.messageGroup = 'FiberReport';

        // Customisation hooks
        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, feature) {
        if (feature.getType() == 'mywcom_fiber_segment') return true;
        for (const category of ['routes']) {
            const config = app.system.settings['mywcom.' + category];
            if (feature.getType() in config) return true;
        }

        return false;
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     */
    constructor(app, feature) {
        super(app, feature);
        this.app = app;

        this.feature = feature;
        this.structManager = app.plugins.structureManager;
        this.displayManager = app.plugins.displayManager;
        this.deltaOwner = null;

        this.cableFields = myw.config['mywcom.fiberReport'].cableFields;
        this.circuitFields = myw.config['mywcom.fiberReport'].circuitFields;

        this.initialized = this._asyncInit();
    }

    async _asyncInit() {
        if (this.feature.getType() == 'mywcom_fiber_segment') {
            this.cable = await this.feature.followReference('cable');
        }
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        let title = this.feature.getTitle();
        if (this.feature.getType() == 'mywcom_fiber_segment') {
            title = this.cable.getTitle();
        }
        return `${this.typeName()}: ${title}`;
    }

    /**
     * String used to identify self in choice lists etc
     */
    typeName() {
        return this.msg('type');
    }

    /**
     * Get information for report body
     */
    // ENH: Move to server? Or use containment service?
    async build() {
        await this.buildHeaderData();
        await this.buildData();
    }

    /**
     * Get information for header
     */
    async buildHeaderData() {
        const ds = this.feature.datasource;

        // Get generation time
        this.date = new Date();

        // Get design
        const delta = ds.getDelta();
        if (delta) {
            this.deltaOwner = await ds.getFeatureByUrn(delta);
        }
    }

    /**
     * Get information for table
     */
    async buildData() {
        this.root_housing = null;
        if (this.feature.getType() in this.app.system.settings['mywcom.routes']) {
            this.root_housing = this.feature;
        } else {
            this.root_housing = await this.feature.followReference('root_housing');
        }

        // Get subtree for feature
        const routeContent = await this.structManager.routeContent(this.root_housing);
        const cableTree = routeContent.cableTree();
        this.cableTree = this.subtreeFor(cableTree, this.feature.getUrn());

        // Get circuits
        // ENH: return these in structContent
        this.circuitsBySegUrn = {};
        const circuitUrns = routeContent.circuitInfos.map(circuitInfo => circuitInfo.circuit_urn);
        const circuits = await this.feature.datasource.getFeaturesByUrn(circuitUrns);
        this.circuits = {};
        for (const circuit of circuits) {
            this.circuits[circuit.getUrn()] = circuit;
        }

        for (const circuitInfo of routeContent.circuitInfos) {
            if (!this.circuitsBySegUrn[circuitInfo.seg_urn])
                this.circuitsBySegUrn[circuitInfo.seg_urn] = [];
            this.circuitsBySegUrn[circuitInfo.seg_urn].push(circuitInfo);
        }
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
        let title = this.root_housing.getTitle();
        if (this.feature.getType() == 'mywcom_fiber_segment') {
            title = this.cable.getTitle();
        }
        strm.writeHeading(1, title);

        // Add design info (if appropriate)
        if (this.deltaOwner) {
            strm.writeLine(this.deltaOwner.getTitle());
        }

        // Add generation date
        strm.writeLine(this.msg('date') + ': ', this.date.toLocaleDateString());

        // ENH: Show location map and connectivity schematic
        strm.writeLine();
    }

    /**
     * Output content as a table
     * Adds columns for featureFields
     */
    writeBody(strm) {
        const columns = [];

        const cols = ['housing', 'name'];
        columns.push(...cols);
        columns.push(...this.cableFields);

        const circuitCols = ['pin', 'fiberColor', 'circuit'];
        columns.push(...circuitCols);
        columns.push(...this.circuitFields);

        //Set unchanging col headings
        const staticColHeadings = {
            housing: this.msg('housing'),
            name: this.msg('name'),
            pin: this.msg('pin'),
            circuit: this.msg('circuit'),
            fiberColor: this.msg('fiberColor')
        };

        //Build table
        const tab = new ReportTable(columns);
        const colStyles = {};

        const {
            tab: tab1,
            colStyles: colStyles1,
            colHeadings
        } = this.buildTable(tab, colStyles, staticColHeadings, this.cableTree, 0);

        const options = {
            colHeadings,
            colStyles: colStyles1,
            skipEmptyCols: true,
            style: this.tableStyle
        };
        strm.writeTable(tab1, options);
    }

    /**
     * Build table (recursive)
     */
    buildTable(tab, colStyles, colHeadings, tree, depth) {
        depth += 1;

        if (tree.cable) {
            tab.nextRow();
            tab.add('housing', tree.feature.properties.name);
            this._addCable(tab, tree.cable, tree.feature, tree.pins, colHeadings);
        }

        const children = tree.children.sort(this.sortProc);
        for (const child of children) {
            this.buildTable(tab, colStyles, colHeadings, child, depth);
        }

        return { tab, colStyles, colHeadings };
    }

    /**
     * Add cable to the tab, adding a row for each fiber and any circuits
     */
    _addCable(tab, cable, seg, pins, colHeadings) {
        tab.add('name', cable.properties.name);
        //Add feature fields if they exist on equip
        for (const fieldName of this.cableFields) {
            if (!(fieldName in cable.featureDD.fields)) continue;
            const field = cable.getFieldDD(fieldName);
            //Set table header to first feature with 'fieldName'
            if (!colHeadings[fieldName]) colHeadings[fieldName] = field.external_name;

            tab.add(fieldName, cable.properties[fieldName]);
        }

        // Create pin nodes
        for (let pin = pins.low; pin <= pins.high; pin++) {
            // Get colour info (if known)
            let fiberColor = this.displayManager.getFiberColorFor(cable, pin);
            if (fiberColor) {
                fiberColor = {
                    value: fiberColor,
                    renderer: fiberColor.reportOn.bind(fiberColor)
                };
                tab.add('fiberColor', fiberColor);
            }

            const circuits = this._getCircuitsForPin(this.circuitsBySegUrn[seg.getUrn()], pin);
            tab.add('pin', this.pinItem(cable, pin, pins.size));
            let i = 0;
            for (const circuit of circuits) {
                tab.add('circuit', circuit.getTitle());
                for (const fieldName of this.circuitFields) {
                    if (!(fieldName in circuit.featureDD.fields)) continue;
                    const field = circuit.getFieldDD(fieldName);
                    //Set table header to first feature with 'fieldName'
                    if (!colHeadings[fieldName]) colHeadings[fieldName] = field.external_name;
                    tab.add(fieldName, circuit.properties[fieldName]);
                }
                i++;
                if (i <= circuits.length - 1) tab.nextRow();
            }
            tab.nextRow();
        }
    }

    // -----------------------------------------------------------------------------
    //                              HELPERS
    // -----------------------------------------------------------------------------

    /**
     * return list of circuits on pin
     * @param {Array} circuits list of circuit for for segment
     * @param {integer} pin
     */
    _getCircuitsForPin(circuitInfos, pin) {
        if (!circuitInfos) return [];
        const pinCircuits = [];

        for (const circuitInfo of circuitInfos) {
            if (circuitInfo.pins.includesPin(pin)) {
                pinCircuits.push(this.circuits[circuitInfo.circuit_urn]);
            }
        }
        return pinCircuits;
    }

    /**
     * Helper for ordering cable trees
     */
    sortProc(cableTree1, cableTree2) {
        // Within housing, items ordered by type (cables first) .. then feature name
        if (!cableTree1.cable && cableTree2.cable) return -1;
        if (cableTree1.cable && !cableTree2.cable) return 1;

        if (cableTree1.cable && cableTree2.cable)
            return strCmp(cableTree1.cable.properties.name, cableTree2.cable.properties.name);

        return strCmp(cableTree1.feature.getTitle(), cableTree2.feature.getTitle());
    }

    /**
     * Node of cableTree that relates to 'featureUrn' (if any)
     * ENH: Move to cableTree.js
     */
    subtreeFor(cableTree, featureUrn) {
        // Try self
        if (cableTree.feature.getUrn() == featureUrn) return cableTree;

        // Try children
        for (const child of cableTree.children) {
            const node = this.subtreeFor(child, featureUrn);
            if (node) return node;
        }

        return null;
    }

    pinItem(cable, pin, nPins) {
        const nDigits = Math.ceil(Math.log10(nPins));
        // Build text
        const text = '#' + zeroPad(pin, nDigits);
        return text;
    }
}
