// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';
import { strCmp, zeroPad } from '../base/strUtils';

export default class EquipCircuitReport extends Report {
    static {
        /**
         * @class Report detailing the circuits that run on an equipment
         */
        this.prototype.messageGroup = 'EquipCircuitReport';

        // Customisation hooks
        this.prototype.tableStyle = 'modern';

        this.prototype.sides = ['in', 'out'];
    }

    static canBuildFor(app, feature) {
        for (const category of ['structures', 'equipment']) {
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
     * @param {MywApp} app
     * @param {MywFeature} feature
     */
    constructor(app, feature) {
        super(app, feature);
        this.app = app;

        this.feature = feature;
        this.structManager = app.plugins.structureManager;
        this.displayManager = app.plugins.displayManager;
        this.deltaOwner = null;

        this.circuitFields = myw.config['mywcom.circuitReport'].circuitFields;
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        let title = this.feature.getTitle();
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
        if (this.feature.getType() in this.app.system.settings['mywcom.structures']) {
            this.root_housing = this.feature;
        } else {
            // Equipment: Get housing structure
            this.root_housing = await this.feature.followReference('root_housing');
        }

        // Get subtree for feature
        const equipContent = await this.structManager.structContent(this.root_housing);
        const equipTree = equipContent.equipTree();
        this.equipTree = equipTree.subtreeFor(this.feature.getUrn());

        // Get circuits, keyed by URN
        // ENH: return these in structContent
        const circuitUrns = this.equipTree.allCircuitUrns();
        const circuits = await this.feature.datasource.getFeaturesByUrn(circuitUrns);
        this.circuitsByUrn = {};
        for (const circuit of circuits) {
            this.circuitsByUrn[circuit.getUrn()] = circuit;
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
        if (this.root_housing.getUrn() !== this.feature.getUrn()) {
            title = this.feature.getTitle();
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

        const cols = ['housing', 'side', 'port', 'name'];
        columns.push(...cols);
        columns.push(...this.circuitFields);

        //Set unchanging col headings
        const staticColHeadings = {
            housing: this.msg('housing'),
            side: this.msg('side'),
            name: this.msg('name'),
            port: this.msg('port')
        };

        //Build table
        const tab = new ReportTable(columns);
        const colStyles = {};

        const {
            tab: tab1,
            colStyles: colStyles1,
            colHeadings
        } = this.buildTable(tab, colStyles, staticColHeadings, this.equipTree, 0);

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
     * @param {EquipTree} tree
     * @returns {Table}
     */
    buildTable(tab, colStyles, colHeadings, tree) {
        if (tree.splice_circuits?.length) {
            this._addSpliceCircuits(tab, tree, colHeadings);
        } else {
            this._addCircuits(tab, tree, colHeadings);
        }

        const children = tree.children.sort(this.sortProc);
        for (const child of children) {
            this.buildTable(tab, colStyles, colHeadings, child);
        }

        return { tab, colStyles, colHeadings };
    }

    /**
     * Add Splice Circuits (which dont have a side)
     * @param {Table} tab
     * @param {EquipTree} tree
     * @param {Object} colHeadings
     */
    _addSpliceCircuits(tab, tree, colHeadings) {
        if (!tree.splice_circuits || !tree.splice_circuits.length) return;

        let circuits = tree.splice_circuits.sort((circ1, circ2) => {
            return circ1.pins.low - circ2.pins.low;
        });

        // remove duplicate circuits (if any)
        // ENH: fix in equipTree
        circuits = _.uniq(circuits, 'circuit_urn');

        tab.nextRow();
        tab.add('housing', tree.feature.properties.name);

        // Add to table
        for (const circuitInfo of circuits) {
            const circuit = this.circuitsByUrn[circuitInfo.circuit_urn];
            this._addCircuit(tab, circuit, circuitInfo, circuitInfo.pins.size, colHeadings);
            tab.nextRow();
        }
    }

    /**
     * Add circuits to the tab taking into account the side of the equip they are on
     * @param {Table} tab
     * @param {EquipTree} tree
     * @param {Object} colHeadings
     */
    _addCircuits(tab, tree, colHeadings) {
        if (!tree.circuits) return;

        for (const side of this.sides) {
            // Sort circuits by name
            let sideCircuits = tree.circuits
                .filter(circuit => {
                    return circuit.pins.side == side || !circuit.pins.side;
                })
                .sort((circ1, circ2) => {
                    return circ1.pins.low - circ2.pins.low;
                });

            if (sideCircuits.length && tree.pins[side + '_pins']) {
                tab.nextRow();
                tab.add('side', this.msg(side));
                tab.add('housing', tree.feature.properties.name);

                // Add to table
                for (const circuitInfo of sideCircuits) {
                    const circuit = this.circuitsByUrn[circuitInfo.circuit_urn];
                    this._addCircuit(
                        tab,
                        circuit,
                        circuitInfo,
                        tree.pins[side + '_pins'].pins.size,
                        colHeadings
                    );
                    tab.nextRow();
                }
            }
        }
    }

    /**
     * Add circuit to the tab
     * @param {Table} tab
     * @param {EquipTree} tree
     * @param {Object} colHeadings
     * @param {Array} circuits
     */
    _addCircuit(tab, circuit, circuitInfo, size, colHeadings) {
        tab.add('port', this.pinRangeItem(circuitInfo.pins, size));
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
     * Helper for ordering equip trees
     * @param {EquipTree} equipTree1
     * @param {EquipTree} equipTree2
     */
    sortProc(equipTree1, equipTree2) {
        // Within housing, items ordered by feature title
        return strCmp(equipTree1.feature.getTitle(), equipTree2.feature.getTitle());
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
        const text = '[' + zeroPad(pin, nDigits) + ']';
        return text;
    }
}
