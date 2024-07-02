// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Conn from 'modules/comms/js/api/conn';
import Report from 'modules/comms/js/reporting/report';
import ReportTable from 'modules/comms/js/reporting/streams/reportTable';
import { zeroPad } from 'modules/comms/js/base/strUtils';

export default class SpliceReport extends Report {
    static {
        /**
         * Report listing the splices within an enclosure, by cable
         *
         * Consists of table for each cable, showing connection and circuit on each pin in a cable
         * here pin refers to the internals of the cable, for a fiber cable it refers to a single fiber
         * and for a copper cable it refers to a copper pair
         */
        this.prototype.messageGroup = 'SpliceReport';

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
        return (
            !!feature.featureDD.fields.fiber_splices || !!feature.featureDD.fields.copper_splices
        );
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
        this.displayManager = app.plugins.displayManager;

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
        // Find cable segments that are spliced
        await this.getCables();

        // Build info about what each cable is connected to
        this.cableConns = {};
        for (const cable of this.cables) {
            this.cableConns[cable.getUrn()] = this.buildCableConns(cable);
        }

        // Set report order
        const sortProc = (c1, c2) => (c1.properties.name < c2.properties.name ? -1 : 1);
        this.cables = this.cables.sort(sortProc);
    }

    /**
     * Get connections direcly in enclosure
     */
    async getCables() {
        // TODO: See if connectionMgr has API for this
        const pred = myw.Predicate.eq('housing', this.housing.getUrn()).and(
            myw.Predicate.eq('splice', true)
        );

        this.connRecs = await this.ds.getFeatures(this.connectionTable, { predicate: pred });

        // get new conns to the design
        this.deltaConns = await this._getDeltaConns();
        // Get list of cable segments
        this.features = {};
        this.segs = [];
        this.cables = [];

        for (const connRec of this.connRecs) {
            // Check for not a splice
            const inUrn = connRec.properties.in_object;
            const outUrn = connRec.properties.out_object;
            if (!inUrn.startsWith(this.segmentTable + '/')) continue;
            if (!outUrn.startsWith(this.segmentTable + '/')) continue;

            // Get objects
            // ENH: Faster to build list of URNs and get in one op
            for (const urn of [inUrn, outUrn]) {
                if (!(urn in this.features)) {
                    const seg = await this.ds.getFeatureByUrn(urn);
                    const cable = await seg.followReference('cable');

                    this.segs.push(seg);
                    this.cables.push(cable);

                    this.features[seg.getUrn()] = seg;
                    this.features[cable.getUrn()] = cable;
                }
            }
        }
    }

    /**
     * Gets new conns to delta/design
     * @returns {Array}
     */
    async _getDeltaConns() {
        const delta = this.ds.getDelta();
        if (!delta) return [];

        const recs = await this.ds.comms.deltaChanges(
            delta,
            ['insert'],
            null,
            [this.connectionTable],
            null,
            null
        );

        return recs.map(rec => rec.getUrn());
    }

    /**
     * Build connection info for each pin of 'cable'
     */
    buildCableConns(cable) {
        const conns = {};

        // Init table
        for (let pin = 1; pin <= cable.properties[this.pinCountField]; pin++) {
            conns[pin] = [];
        }

        // For each segment of cable ..
        // TODO: Should only ever be one at BAI .. but would be good to handle passthrough etc
        // TODO: Group these earlier
        for (const seg of this.segs) {
            const segUrn = seg.getUrn();
            if (seg.properties.cable != cable.getUrn()) continue;

            // Add its connections
            for (const connRec of this.connRecs) {
                let forward;
                if (connRec.properties.in_object == segUrn) {
                    forward = true;
                } else if (connRec.properties.out_object == segUrn) {
                    forward = false;
                } else {
                    continue;
                }

                let conn = new Conn(connRec, forward, this.features);
                if (this._isConnNew(connRec)) {
                    conn.proposed = true;
                }
                for (let pin = conn.from_pins.low; pin <= conn.from_pins.high; pin++) {
                    conns[pin].push(conn);
                }
            }
        }

        return conns;
    }

    _isConnNew(connRec) {
        return this.deltaConns.includes(connRec.getUrn());
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

    /**
     * Output content as a table of the form:
     *
     *    <housing>  <group_1> .. <group_n>  <circuit_fields>
     *
     * where each group shows in and out pins for a given cable or equip
     */
    writeBody(strm) {
        this.writeSummaryTable(strm);

        for (const cable of this.cables) {
            this.writeCableTable(strm, cable, this.cableConns[cable.getUrn()]);
        }
    }

    /**
     * Write list of cables in enclosure
     */
    writeSummaryTable(strm) {
        // if no cables, don't write summary table
        if (this.cables.length == 0) {
            strm.writeLine(this.msg('no_cables_in_housing'));
            return;
        }

        const cols = ['name', 'specification', this.pinCountField];
        const colStyles = {};
        colStyles[this.pinCountField] = { hAlign: 'right' };

        // Build column headings
        const fieldsDD = this.cables[0].getFieldsDD();
        const colHeadings = {};
        for (const col of cols) {
            colHeadings[col] = fieldsDD[col].external_name;
        }

        // Build table
        const tab = new ReportTable(cols);
        for (const cable of this.cables) {
            tab.nextRow();
            for (const fld of cols) {
                tab.add(fld, cable.properties[fld]);
            }
        }

        // Display it
        strm.writeTable(tab, {
            colHeadings: colHeadings,
            colStyles: colStyles,
            skipEmptyCols: false
        });

        strm.writeLine();
    }

    /**
     * Output table showing splices to make for 'cable'
     *
     * 'pinConns' is a list of lists of Conn objects, keyed by pin no
     */
    writeCableTable(strm, cable, pinConns) {
        const nPins = cable.properties[this.pinCountField];

        // Write section header
        strm.newSection(cable.properties.name, nPins);
        strm.writeHeading(2, this.msg('cable_heading'), ': ', cable.properties.name);

        //ENH: Show cable count, spec etc
        strm.writeLine();

        const cols = ['cable', 'pinNo', 'pinColor', 'sep', 'toPinColor', 'toPin', 'toCable', 'new'];
        const colHeadings = { cable: 'From', toPinColor: 'To', new: 'New' }; // TODO: localize
        const colStyles = { sep: { hAlign: 'center', leftPad: 1, rightPad: 1 } };

        // Build table
        const tab = new ReportTable(cols);
        let prevToCable;

        for (const pin in pinConns) {
            prevToCable = this.addRowsForPin(tab, cable, pin, pinConns[pin], prevToCable);
        }

        // Display it
        strm.writeTable(tab, {
            colHeadings: colHeadings,
            colStyles: colStyles
        });

        strm.writeLine();
    }

    /**
     * Add line(s) to 'tab' for 'pin' of 'cable'
     *
     * 'conns' is a list of Conns on pin. 'prevToCable' is toCable from previous row (if any)
     */
    addRowsForPin(tab, cable, pin, conns, prevToCable) {
        tab.nextRow();

        tab.add('cable', cable.properties.name);
        tab.add('pinNo', this.pinNoItem(cable, pin));
        tab.add('pinColor', this.pinColorItem(cable, pin));

        // Show connections
        // Note: Should be at most one .. but conflict could have created more
        for (const [i, conn] of Object.entries(conns)) {
            const toPin = conn.toPinFor(pin);
            const toCable = conn.to_cable;

            if (i > 0) tab.nextRow();

            // Check for change to new cable
            if (toCable != prevToCable) {
                tab.add('sep', '===>');
            } else {
                tab.add('sep', '->');
            }
            prevToCable = toCable;

            // Show connected pins
            tab.add('toPinColor', this.pinColorItem(toCable, toPin));
            tab.add('toPin', this.pinNoItem(toCable, toPin));
            tab.add('toCable', toCable.properties.name);
            if (conn.proposed) {
                tab.add('new', '***');
            }
        }

        return prevToCable;
    }

    // Label for a pin (zero-padded)
    pinNoItem(cable, pin) {
        const nDigits = Math.ceil(Math.log10(cable.properties[this.pinCountField]));
        return '#' + zeroPad(pin, nDigits);
    }

    /**
     * Report item showing pin colour (if known)
     */
    pinColorItem(cable, pin) {
        let color = this.displayManager.getFiberColorFor(cable, pin);
        if (!color) return;

        return {
            value: color,
            renderer: color.reportOn.bind(color)
        };
    }
}
