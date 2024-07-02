// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import { strCmp } from '../base/strUtils';
import Report from './report';
import ReportTable from './streams/reportTable';
import { zeroPad } from '../base/strUtils';

export default class ConnectivityReport extends Report {
    static {
        /**
         * @class Report detailing the connections within an enclosure
         *
         * Consists of a single table showing connections from upstream to downstream
         * (left to right). Handles multiple hops (patching)
         */
        this.prototype.messageGroup = 'ConnectivityReport';

        // Customisation hooks
        this.prototype.groupCols = [
            'inPinColor',
            'inPin',
            'feature',
            'outPin',
            'outPinColor',
            'connType'
        ];

        this.prototype.tableStyle = 'modern';
        this.prototype.featureStyle = {};
        this.prototype.pinStyle = {};
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
     */
    constructor(app, housing) {
        super();
        this.app = app;
        this.housing = housing;
        this.structManager = app.plugins.structureManager;
        this.connectionManager = app.plugins.connectionManager;
        this.displayManager = app.plugins.displayManager;

        this.circuitFields = myw.config['mywcom.connectivityReport'].circuitFields;
        this.circuitFieldNames = {}; // Populated as records encountered
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

        return this.pinTrees.length > 0;
    }

    /**
     * Get information for header
     */
    async buildHeaderData() {
        const ds = this.housing.datasource;

        // Get generation time
        this.date = new Date();

        // Get design
        const delta = ds.getDelta();
        if (delta) {
            this.deltaOwner = await ds.getFeatureByUrn(delta);
        }
    }

    /**
     * Get information for report body
     *
     * Sets this.pinTrees to a list of PinTree objects (see EquipTree.traceTrees)
     */
    async buildData() {
        // Get structure
        if (this.housing.properties.root_housing) {
            this.struct = await this.housing.followReference('root_housing'); // ENH: Handle missing?
        } else {
            this.struct = this.housing;
        }

        // Get equipment tree
        const structContent = await this.structManager.structContent(this.struct);
        const structTree = structContent.equipTree(); // ENH: Return PinRanges in CircuitInfos
        const equipTree = structTree.subtreeFor(this.housing.getUrn());

        // Get trees of objects downstream from each pin
        const pinTrees = equipTree.traceTrees();

        // Get circuits
        // ENH: return these in structContent
        const circuitUrns = equipTree.allCircuitUrns();
        const circuits = await this.housing.datasource.getFeaturesByUrn(circuitUrns);
        this.circuits = {};
        for (const circuit of circuits) {
            this.circuits[circuit.getUrn()] = circuit;
        }

        // Cull passthroughs and unconnected equipment
        this.pinTrees = [];
        for (const pinTree of pinTrees) {
            if (pinTree.children.length) this.pinTrees.push(pinTree);
        }

        // Make names more regular (to simplify sorting)
        for (const pinTree of this.pinTrees) {
            pinTree.name = pinTree.cable
                ? pinTree.cable.properties.name
                : pinTree.feature.properties.name;

            if (pinTree.housing && pinTree.housing.getUrn() == this.housing.getUrn())
                pinTree.housing = null;
        }

        // Sort
        this.pinTrees.sort(this.sortProc);

        // ENH: Raise error if empty?
    }

    /**
     * Helper for ordering root pin trees
     *
     * Returns -1 if 'pintree1' should come first
     */
    // ENH: Order numeric on value, not textual representation
    sortProc(pinTree1, pinTree2) {
        // Main housing comes first
        if (!pinTree1.housing && pinTree2.housing) return -1;
        if (pinTree1.housing && !pinTree2.housing) return 1;

        // Child enclosures come in housing order
        if (pinTree1.housing != pinTree2.housing) {
            return strCmp(pinTree1.housing.properties.name, pinTree2.housing.properties.name); // ENH: Faster to split once using strParts()
        }

        // Within housing, items ordered by type (equips first) .. then feature name
        if (!pinTree1.cable && pinTree2.cable) return -1;
        if (pinTree1.cable && !pinTree2.cable) return 1;

        if (pinTree1.feature != pinTree2.feature) {
            return strCmp(pinTree1.name, pinTree2.name); // ENH: Faster to split once using strParts()
        }

        // With feature, items ordered by out pin
        return pinTree1.outPin - pinTree2.outPin;
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

        // ENH: Show location map and connectivity schematic
        strm.writeLine();
    }

    /**
     * Output content as a table of the form:
     *
     *    <housing>  <group_1> .. <group_n>  <circuit_fields>
     *
     * where each group shows in and out pins for a given cable or equip
     */
    writeBody(strm) {
        // Determine number of groups
        const nGroups = this.maxDepthOf(this.pinTrees);

        // Build column names and styles
        const [cols, colStyles] = this.buildCols(nGroups);

        // Populate data table
        const tab = new ReportTable(cols);
        tab.nextRow();
        for (const pinTree of this.pinTrees) {
            this.addRowsFor(tab, pinTree);
        }

        // Build column titles
        const colHeadings = this.buildColHeadings(nGroups, tab);

        // Write table
        strm.writeTable(tab, {
            colHeadings: colHeadings,
            colStyles,
            skipEmptyCols: true,
            style: this.tableStyle
        });
    }

    /**
     * Build column names and styles (handling repeating groups)
     * colStyles can have:
     *      leftPad, rightPad as a number
     *      hAlign: one of 'left', 'center', 'right' - this will align the columns in the table (headings are left aligned)
     *                 eg: {hAlign: 'left'}
     */
    buildCols(nGroups) {
        const cols = [];
        const colStyles = {};
        const groupSep = 2; //chars

        // Add housing column
        cols.push('housing');
        colStyles['housing'] = { rightPad: groupSep };

        // Add columns for each group
        for (let group = 1; group <= nGroups; group++) {
            for (const colName of this.groupCols) {
                // Build full name for column
                const fullColName = group + colName;
                cols.push(fullColName);
                colStyles[fullColName] = {};

                // Add separation at end
                if (colName == 'connType') {
                    colStyles[fullColName].leftPad = groupSep;
                    colStyles[fullColName].rightPad = groupSep;
                }
            }
        }

        // Add circuit columns
        for (const field of this.circuitFields) {
            const colName = `circuit_${field}`;
            cols.push(colName);
            colStyles[colName] = { leftPad: groupSep };
        }

        return [cols, colStyles];
    }

    /**
     * Build column titles
     */
    buildColHeadings(nGroups, tab) {
        const usedCols = tab.usedColumns();
        const colHeadings = {};

        // Add housing title
        colHeadings['housing'] = this.msg('housing_col');

        // For each group .. add heading at first used column
        // ENH: Support merged cells in report streams and improve this
        for (let group = 1; group <= nGroups; group++) {
            for (const colName of this.groupCols) {
                const fullColName = group + colName;

                if (usedCols.includes(fullColName)) {
                    const msg = group == 1 ? 'from_col' : 'to_col';
                    colHeadings[fullColName] = { value: this.msg(msg) };
                    break;
                }
            }
        }

        // Add circuit column titles
        let firstCol = true;
        for (const field of this.circuitFields) {
            const col = `circuit_${field}`;
            if (!usedCols.includes(col)) continue;
            colHeadings[col] = firstCol ? this.msg('circuit_col') : this.circuitFieldNames[col];
            firstCol = false;
        }

        return colHeadings;
    }

    /**
     * Add table rows for 'pinTree' (recursive)
     *
     * 'group' is the group within the row (recursion depth).
     * 'firstRow' is false if this is a continuation row
     */
    addRowsFor(tab, pinTree, group = 1, firstRow = true) {
        // Add housing
        if (group === 1 && pinTree.housing && pinTree.housing.getUrn() != this.housing.getUrn()) {
            tab.add('housing', pinTree.housing.properties.name);
        }

        // Add group for feature
        if (pinTree.cable) {
            this.addCableGroup(tab, group, pinTree, firstRow);
        } else {
            this.addEquipGroup(tab, group, pinTree, firstRow);
        }

        // Add child groups
        for (const i in pinTree.children) {
            const firstChildRow = i == 0;
            const child = pinTree.children[i];
            if (firstChildRow) tab.add(group + 'connType', '->');
            this.addRowsFor(tab, child, group + 1, firstChildRow);
        }

        // Add circuits (if last group)
        if (pinTree.children.length == 0 && pinTree.circuits) {
            for (let i = 0; i < pinTree.circuits.length; i++) {
                if (i > 0) tab.nextRow();
                const circuitUrn = pinTree.circuits[i];
                const circuit = this.circuits[circuitUrn];

                for (const field of this.circuitFields) {
                    if (!(field in circuit.featureDD.fields)) continue;
                    const fieldDD = circuit.getFieldDD(field);

                    const colName = `circuit_${field}`;
                    tab.add(colName, circuit.properties[field]);

                    // Set table header to first feature with 'field'
                    if (!this.circuitFieldNames[colName])
                        this.circuitFieldNames[colName] = fieldDD.external_name;
                }
            }
        }

        if (pinTree.children.length != 1) tab.nextRow();
    }

    /**
     * Add group for a cable PinTree node
     *
     * 'firstRow' is true if this is the primary row for the root PinTree
     */
    addCableGroup(tab, group, pinTree, firstRow) {
        const cable = pinTree.cable;
        const fiber = pinTree.outPin;

        // Determine which sides to show fiber number
        const showInPin = group > 1;
        const showOutPin = group == 1 || pinTree.children.length;

        // Get colour info (if known)
        let fiberColor = this.displayManager.getFiberColorFor(cable, fiber);
        if (fiberColor) {
            fiberColor = {
                value: fiberColor,
                renderer: fiberColor.reportOn.bind(fiberColor)
            };
        }

        // Add in pin and fiber color
        if (firstRow && showInPin) {
            tab.add(group + 'inPin', this.pinItem(cable, 'in', fiber, true));
            if (fiberColor) tab.add(group + 'inPinColor', fiberColor);
        }

        // Add cable name
        if (firstRow) {
            tab.add(group + 'feature', this.featureItem(cable, true));
        }

        // Add out pin and fiber color
        if (showOutPin) {
            tab.add(group + 'outPin', this.pinItem(cable, 'out', fiber, true));
            if (fiberColor) tab.add(group + 'outPinColor', fiberColor);
        }
    }

    /**
     * Add group for an equipment PinTree node
     *
     * 'firstRow' is true if this is the primary row for the root PinTree
     */
    addEquipGroup(tab, group, pinTree, firstRow) {
        const feature = pinTree.feature;
        const inPin = pinTree.inPin;
        const outPin = pinTree.outPin;

        // Determine which sides to show port number on
        const showInPin = group > 1;

        // Add input port
        if (firstRow && showInPin) {
            tab.add(group + 'inPin', this.pinItem(feature, 'in', inPin));
        }

        // Add equip name
        if (firstRow) {
            tab.add(group + 'feature', this.featureItem(feature));
        }

        // Add output port
        if (outPin) {
            tab.add(group + 'outPin', this.pinItem(feature, 'out', outPin));
        }
    }

    /**
     * ReportItem displaying 'feature'
     */
    featureItem(feature, isCable = false) {
        return {
            value: feature.properties.name,
            style: this.featureStyle
        };
    }

    /**
     * ReportItem displaying 'pin' on 'side' of 'feature'
     */
    pinItem(feature, side, pin, isCable = false) {
        // Get number of digits to pad to
        const nPins = this.connectionManager.pinCountFor(feature, 'fiber', side);
        const nDigits = Math.ceil(Math.log10(nPins));

        // Build text
        let text;
        if (isCable) {
            text = '#' + zeroPad(pin, nDigits);
        } else {
            text = '[' + zeroPad(pin, nDigits) + ']';
        }

        // Build report item
        return {
            value: text,
            style: this.pinStyle
        };
    }

    /**
     * Depth of deepest pin tree in 'pinTrees' (recursive)
     */
    maxDepthOf(pinTrees) {
        let maxDepth = 0;
        for (const pinTree of pinTrees) {
            maxDepth = Math.max(maxDepth, 1 + this.maxDepthOf(pinTree.children));
        }

        return maxDepth;
    }
}
