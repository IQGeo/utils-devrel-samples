// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';
import { strCmp, zeroPad } from '../base/strUtils';

export default class CircuitReport extends Report {
    static {
        /**
         * @class Report detailing the circuits that run on a cable  (or on cables within a route)
         */
        this.prototype.messageGroup = 'CircuitReport';

        // Customisation hooks
        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, feature) {
        if (feature.getType() == 'mywcom_fiber_segment') return true;
        const config = app.system.settings['mywcom.routes'];
        if (feature.getType() in config) return true;

        return false;
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     * @param {MywApp} app
     * @param {MywFeature} feature
     */
    constructor(app, feature) {
        super(app);
        this.app = app;

        this.feature = feature;
        this.structManager = app.plugins.structureManager;
        this.displayManager = app.plugins.displayManager;
        this.deltaOwner = null;

        this.circuitFields = myw.config['mywcom.circuitReport'].circuitFields;

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
            // Fiber segment
            this.root_housing = await this.feature.followReference('root_housing');
        }

        // Get subtree for feature
        const routeContent = await this.structManager.routeContent(this.root_housing);
        const cableTree = routeContent.cableTree();
        this.cableTree = this.subtreeFor(cableTree, this.feature.getUrn());

        // Get circuits
        // ENH: return these in structContent
        const circuitUrns = routeContent.circuitInfos.map(circuitInfo => circuitInfo.circuit_urn);
        const circuits = await this.feature.datasource.getFeaturesByUrn(circuitUrns);
        const circuitsByUrn = {};
        for (const circuit of circuits) {
            circuitsByUrn[circuit.getUrn()] = circuit;
        }

        // Build lookup table of circuit info
        this.circuitInfos = {};
        for (const circuitInfo of routeContent.circuitInfos) {
            this.circuitInfos[circuitInfo.circuit_urn] = {
                circuitInfo,
                circuit: circuitsByUrn[circuitInfo.circuit_urn]
            };
        }
    }

    // ------------------------------------------------------------------------
    //                                GENERATION
    // ------------------------------------------------------------------------

    /**
     * Write report on ReportStream 'strm'
     * @param {Stream} strm
     * @returns {Document}
     */
    generate(strm) {
        this.writeHeader(strm);
        this.writeBody(strm);
        return strm.doc;
    }

    /**
     * Output header info
     * @param {Stream} strm
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
     * @param {Stream} strm
     */
    writeBody(strm) {
        const columns = [];

        const cols = ['cable', 'pin', 'name'];
        columns.push(...cols);

        columns.push(...this.circuitFields);

        //Set unchanging col headings
        const staticColHeadings = {
            cable: this.msg('cable'),
            name: this.msg('name'),
            pin: this.msg('pin')
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
     * @param {Table} tab
     * @param {Object} colStyles
     * @param {Object} colHeadings
     * @param {CableTree} tree
     * @returns {Table}
     */
    buildTable(tab, colStyles, colHeadings, tree) {
        if (tree.cable) {
            tab.nextRow();
            tab.add('cable', tree.cable.properties.name);

            if (tree.circuits) {
                // Sort circuits by pin number
                const circuits = tree.circuits.sort((circ1, circ2) => {
                    return circ1.pins.low - circ2.pins.low;
                });

                // Add to table
                let i = 0;
                for (const circuitInfo of circuits) {
                    const circuit = this.circuitInfos[circuitInfo.circuit_urn].circuit;
                    this._addCircuit(tab, circuit, circuitInfo, tree, colHeadings);
                    i++;
                    if (i <= circuits.length - 1) tab.nextRow();
                }
            }
        }
        const children = tree.children.sort(this.sortProc);
        for (const child of children) {
            this.buildTable(tab, colStyles, colHeadings, child);
        }

        return { tab, colStyles, colHeadings };
    }

    /**
     * Add circuits to the tab
     * @param {Table} tab
     * @param {CableTree} tree
     * @param {Object} colHeadings
     * @param {Array} circuits
     */
    _addCircuit(tab, circuit, circuitInfo, tree, colHeadings) {
        tab.add('pin', this.pinRangeItem(circuitInfo.pins, tree.pins.size));
        tab.add('name', circuit.properties.name);

        //Add feature fields if they exist on circuit
        for (const fieldName of this.circuitFields) {
            if (!(fieldName in circuit.featureDD.fields)) continue;
            const field = circuit.getFieldDD(fieldName);
            //Set table header to first feature with 'fieldName'
            if (!colHeadings[fieldName]) colHeadings[fieldName] = field.external_name;

            tab.add(fieldName, circuit.properties[fieldName]);
        }
    }

    // -----------------------------------------------------------------------------
    //                              HELPERS
    // -----------------------------------------------------------------------------

    /**
     * Helper for ordering cable trees
     * @param {CableTree} cableTree1
     * @param {CableTree} cableTree2
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
     * @param {CableTree} cableTree
     * @param {String} featureUrn
     * @returns
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

    /**
     * Build text to display pin range
     * @param {PinRange} pinRange
     * @param {integer} nPins
     * @returns
     */
    pinRangeItem(pinRange, nPins) {
        // Build text
        if (pinRange.low != pinRange.high) {
            return `${this.pinItem(pinRange.low, nPins)} - ${this.pinItem(pinRange.high, nPins)}`;
        } else {
            return `${this.pinItem(pinRange.low, nPins)}`;
        }
    }

    /**
     * Build text to display individual pin
     * @param {integer} pin
     * @param {integer} nPins
     * @returns
     */
    pinItem(pin, nPins) {
        const nDigits = Math.ceil(Math.log10(nPins));
        const text = '#' + zeroPad(pin, nDigits);
        return text;
    }

    /**
     * Get fiber color from pin of cable
     * @param {MywFeature} cable
     * @returns {fiberColor}
     */
    fiberColorItem(cable, circuit) {
        const pinRange = this.circuitInfos[circuit.getUrn()].circuitInfo.pins;
        // Dont display fiber color if range
        if (pinRange.low != pinRange.high) return;

        // Get fiber color
        let fiberColor = this.displayManager.getFiberColorFor(cable, pinRange.low);
        if (fiberColor) {
            fiberColor = {
                value: fiberColor,
                renderer: fiberColor.reportOn.bind(fiberColor)
            };
        }
        return fiberColor;
    }
}
