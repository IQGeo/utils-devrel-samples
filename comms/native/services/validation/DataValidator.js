// Copyright: IQGeo Limited 2010-2023

//import traceback
//import OrderedDict from 'collections'
//import {MywError} from 'myWorld-native-services'
import { MywProgressHandler, MywError, Reference } from 'myWorld-native-services';
//import {MywPoint} from 'myWorld-native-services'

import Conn from '../api/Conn';
import PinRange from '../api/PinRange';
import NetworkView from '../api/NetworkView';
import geomUtils from '../base/GeomUtils';

import IntegrityError from './IntegrityError';

import { MywClass, FilterParser } from 'myWorld-base';
/**
 * Engine for checking network data consistency
 */
/*eslint-disable no-await-in-loop*/
class DataValidator extends MywClass {
    /**
     * Init slots of self
     *
     * Optional POLYGON limits the area checked by .run()
     *
     * DB_VIEW is a FeatureView
     */
    constructor(db_view, polygon = undefined, progress = MywProgressHandler()) {
        super();
        // ENH: Move validation code to managers?

        // Init slots
        this.db_view = db_view; // TODO new ReadonlyFeatureView(db_view);
        this.polygon = polygon;
        this.progress = progress;

        this.categories = {};
        this.validators = {};
        this.errors = {};

        // Get managers
        this.nw_view = new NetworkView(this.db_view, this.progress);

        // Build validator lookup table
        this.add_category('routes', this.check_route, this.nw_view.routes);
        this.add_category('conduits', this.check_conduit, this.nw_view.conduits);
        this.add_category('conduit_runs', this.check_conduit_run, this.nw_view.conduit_runs);
        this.add_category('equips', this.check_equip, this.nw_view.equips);
        this.add_category('cables', this.check_cable, this.nw_view.cables);
        this.add_category('segments', this.check_segment, this.nw_view.segments);
        this.add_category('connections', this.check_connection, this.nw_view.connections);
        this.add_category('circuits', this.check_circuit, this.nw_view.circuits);
        this.add_category('line_of_count', this.check_line_of_count, this.nw_view.line_of_counts);
    }

    /**
     * Add validator METH for FEATURE_TYPES
     */
    add_category(category, meth, feature_types) {
        meth = meth.bind(this);
        if (!feature_types.length) feature_types = Object.keys(feature_types); // ENH: Fix NetworkView to return arrays for all
        this.categories[category] = feature_types.sort();

        for (const feature_type of feature_types) {
            this.validators[feature_type] = meth;
        }
    }

    /**
     * Validate all network records in self's view
     *
     * Optional categories in a list of categories to check (default: all)
     *
     * Returns a list of IntegrityErrors
     */
    // ENH: Support incremental check
    async run(categories = undefined) {
        // Deal with defaults
        if (categories === undefined) categories = Object.keys(this.categories);

        this.progress(5, 'Validating:', ...categories);

        // Check requested categories (in top-down order)
        for (const category in this.categories) {
            if (categories.includes(category)) {
                await this.check_category(category);
            }
        }

        return this.errors;
    }

    /**
     * Runs validator for all features of category
     */
    async check_category(category) {
        this.progress(3, 'Checking', category);

        const feature_types = this.categories[category];

        for (const feature_type of feature_types) {
            const tab = await this.db_view.table(feature_type);
            await tab.initialized;
            const meth = this.validators[feature_type];

            // Build query
            let query = tab.query();
            if (this.polygon) {
                const geom_field = tab.descriptor?.primary_geom_name;
                query = query.whereIntersects(geom_field, this.polygon);
            }
            const recs = await query.all();

            // Check records
            // ENH: Find a way to include bad record count in stats ... without losing rate
            for (const rec of recs) {
                await this._check(rec, meth);
            }
        }
    }

    /**
     * Validate REC (if it is something we recognise)
     */
    async check(rec) {
        const meth = this.validators[rec.getType()];

        if (meth) {
            await this._check(rec, meth);
        }
    }

    /**
     * Run method METH on REC, handling errors
     *
     * Returns number of integrity errors found
     */
    async _check(rec, meth) {
        const orig_n_errs = this.errors.length;

        try {
            await meth(rec);
        } catch (cond) {
            this.progress('error', rec, ':', cond);
            this.error(rec, '', 'validation_failed', { error: cond });
            throw cond; // TODO: DEBUG
        }

        return this.errors.length - orig_n_errs;
    }

    // ------------------------------------------------------------------------------
    //                                   FEATURE VALIDATION
    // ------------------------------------------------------------------------------

    /**
     * Check route ROUTE
     */
    async check_route(route) {
        this.progress(4, 'Checking', route);

        // Check referenced objects exist
        const in_struct = await this.check_reference(route, 'in_structure', false);
        const out_struct = await this.check_reference(route, 'out_structure', false);

        // Check geometry
        const geom = this.check_geometry(route);
        if (geom) {
            if (in_struct) this.check_coord(route, 'in_structure', geom.firstCoord(), in_struct);
            if (out_struct) this.check_coord(route, 'out_structure', geom.lastCoord(), out_struct);
        }
    }

    /**
     * Check conduit CND
     */
    async check_conduit(cnd) {
        this.progress(4, 'Checking', cnd);

        // Check mandatory references exist
        const housing = await this.check_reference(cnd, 'housing');
        await this.check_reference(cnd, 'root_housing');
        if (!housing) {
            return;
        }

        if ('root_housing' in housing.featureDef.fields) {
            this.check_derived_field(cnd, 'root_housing', housing, 'root_housing');
        } else {
            this.check_derived_field(cnd, 'root_housing', housing);
        }

        // Check derived references and geom matches housing
        this.check_derived_geom_and_structs(cnd, housing);

        // If continuous .. check prev/next links
        if ('out_conduit' in cnd.featureDef.fields) {
            // Check next/prev
            await this.check_conduit_link(cnd, 'in');
            await this.check_conduit_link(cnd, 'out');

            // Check conduit run is set
            if ('conduit_run' in cnd.featureDef.fields) {
                this.check_reference(cnd, 'conduit_run');
            }
        }
    }

    /**
     * Check the two-way chain reference at SIDE of CND
     */
    async check_conduit_link(cnd, side) {
        const struct_field = side + '_structure';
        const field = side + '_conduit';

        // Get structure at which side is located
        const struct_urn = cnd.properties[struct_field];

        // Get next conduit at that structure
        const next_cnd = await this.check_reference(cnd, field, false);
        if (!next_cnd) {
            return;
        }

        // Find field of next_cnd that should point to us
        let back_ref_field;
        if (next_cnd.properties.in_structure == struct_urn) {
            back_ref_field = 'in_conduit';
        } else if (next_cnd.properties.out_structure == struct_urn) {
            back_ref_field = 'out_conduit';
        } else {
            const struct = await cnd.followRef(struct_field);
            this.error(cnd, field, 'broken_chain', {
                at: struct.getTitle(),
                _ref: cnd.properties[field]
            });
            return next_cnd;
        }

        // Check back ref points to self
        if (next_cnd.properties[back_ref_field] != cnd.getUrn()) {
            const struct = await cnd.followRef(struct_field);
            this.error(cnd, field, 'broken_chain', {
                at: struct.getTitle(),
                _ref: cnd.properties[field]
            });
            return next_cnd;
        }

        return next_cnd;
    }

    /**
     * Check conduit run CND_RUN
     */
    async check_conduit_run(cnd_run) {
        this.progress(4, 'Checking', cnd_run);
        const conduit_mgr = this.nw_view.conduit_mgr;

        const conduits = await cnd_run.followRefSet('conduits');

        // Check has at least one conduit
        if (!conduits || !conduits.length) {
            this.error(cnd_run, 'conduits', 'no_conduits');
            return;
        }

        // Check geometry set
        const run_geom = this.check_geometry(cnd_run);
        if (!run_geom) {
            return;
        }

        //Check geometry matches conduits
        const cnd_chain = await conduit_mgr.conduitChain(conduits[0]);
        const expected_geom = await conduit_mgr.calcConduitRunGeom(cnd_chain);

        // Compare geometry, allows reverse
        this.check_geometry_matches(cnd_run, 'conduits', expected_geom, true);
    }

    /**
     * Check equipment record EQUIP
     */
    async check_equip(equip) {
        this.progress(4, 'Checking', equip);

        // Check mandatory referenced records exist
        const housing = await this.check_reference(equip, 'housing');
        await this.check_reference(equip, 'root_housing');
        if (!housing) {
            return;
        }

        // Check other derived fields
        if ('root_housing' in housing.featureDef.fields) {
            this.check_derived_field(equip, 'root_housing', housing, 'root_housing');
        } else {
            this.check_derived_field(equip, 'root_housing', housing);
        }

        // Check geom matches housing
        const geom = this.check_geometry(equip);
        if (geom) {
            this.check_derived_geom(equip, housing, geom);
        }
    }

    /**
     * Check cable record CABLE
     */
    async check_cable(cable) {
        this.progress(4, 'Checking', cable);

        // Check mandatory fields
        this.check_field(cable, 'directed');

        // Check geometry set
        this.check_geometry(cable);

        // TODO: Check geometry matches segments
    }

    /**
     * Check cable segment SEG
     */
    async check_segment(seg) {
        this.progress(4, 'Checking', seg);

        // Check mandatory referenced records exist
        const housing = await this.check_reference(seg, 'housing');
        await this.check_reference(seg, 'root_housing');
        const cable = await this.check_reference(seg, 'cable');
        await this.check_reference(seg, 'in_structure');
        await this.check_reference(seg, 'out_structure');

        // Check prev/next records exist
        const in_seg = await this.check_twoway_reference(seg, 'in_segment', 'out_segment', false);
        const out_seg = await this.check_twoway_reference(seg, 'out_segment', 'in_segment', false);

        // Check derived properties
        if (cable) {
            this.check_derived_field(seg, 'directed', cable, 'directed');
        }

        // Check geometry set
        const geom = this.check_geometry(seg);

        // Check derived references
        if (!housing) {
            return;
        }

        // Check root_housing matches that of housing
        if ('root_housing' in housing.featureDef.fields) {
            this.check_derived_field(seg, 'root_housing', housing, 'root_housing');
        } else {
            this.check_derived_field(seg, 'root_housing', housing);
        }

        // Check in/out structures and geometry match those of housing
        const internal = seg.properties.in_structure == seg.properties.out_structure;
        if (internal) {
            this.check_derived_geom(seg, housing, geom, 'housing', seg.properties.forward);
        } else {
            this.check_derived_geom_and_structs(seg, housing);
        }

        // Check geometry start and end joins to prev/next seg
        if (in_seg) {
            this.check_coord(seg, 'in_segment', geom.firstCoord(), in_seg, 'out');
        }
        if (out_seg) {
            this.check_coord(seg, 'out_segment', geom.lastCoord(), out_seg, 'in');
        }

        // Check tick marks of seg dont overlap in_seg and out_seg
        if (in_seg && out_seg) {
            this.check_tick_marks(seg, in_seg, out_seg);
        }
    }

    /**
     * Check relational and geometric consistency of connection CONN_REC
     */
    async check_connection(conn_rec) {
        const conn = new Conn(conn_rec);
        this.progress(4, 'Checking connection', conn_rec, conn);

        // Get geometry
        const geom = this.check_geometry(conn_rec);

        // Check referenced features exist
        const in_feature = await this.check_connection_side(conn_rec, conn, 'in');
        const out_feature = await this.check_connection_side(conn_rec, conn, 'out');

        // Check pin ranges sane
        const from_pins_valid = conn.from_pins.size > 0;
        const in_fields = ['in_low', 'in_high'];
        const out_fields = ['out_low', 'out_high'];

        const [housing_title, struct_title] = await this._getHousingAndRootHousingTitle(conn_rec);

        if (!from_pins_valid) {
            const error = conn.is_from_cable ? 'bad_pin_range' : 'bad_port_range';
            for (const field of in_fields) {
                this.error(conn.conn_rec, field, error, {
                    side: 'in',
                    connection: await conn.description(),
                    range: conn.from_pins.spec,
                    housing: housing_title,
                    struct: struct_title
                });
            }
        }

        const to_pins_valid = conn.to_pins.size > 0;
        if (!to_pins_valid) {
            const error = conn.is_to_cable ? 'bad_pin_range' : 'bad_port_range';
            for (const field of out_fields) {
                this.error(conn.conn_rec, field, error, {
                    side: 'out',
                    connection: await conn.description(),
                    range: conn.to_pins.spec,
                    housing: housing_title,
                    struct: struct_title
                });
            }
        }

        // Check pin range sizes match (avoiding duplicate error if not sane)
        if (from_pins_valid && to_pins_valid && conn.from_pins.size != conn.to_pins.size) {
            const fields = [...in_fields, ...out_fields];
            console.log(fields);
            for (const field of fields) {
                this.error(conn.conn_rec, field, 'pin_range_mismatch', {
                    connection: await conn.description(),
                    in_size: conn.from_pins.size,
                    out_size: conn.to_pins.size,
                    housing: housing_title,
                    struct: struct_title
                });
            }
        }

        // Check housing exists
        const housing = await this.check_reference(conn_rec, 'housing');

        // Check matches housing
        if (housing) {
            if ('root_housing' in housing.featureDef.fields) {
                this.check_derived_field(conn_rec, 'root_housing', housing, 'root_housing');
            } else {
                this.check_derived_field(conn_rec, 'root_housing', housing);
            }

            this.check_derived_geom(conn_rec, housing, geom);
        }

        // Check derived properties
        if (in_feature && out_feature) {
            if (conn_rec.properties.splice != conn.is_splice) {
                this.error(conn_rec, 'splice', 'derived_value_mismatch', {
                    value: conn_rec.properties.splice,
                    expected: conn.is_splice
                });
            }
        }
    }

    /**
     * Check relational consistency of SIDE of CONN_REC
     */
    async check_connection_side(conn_rec, conn, side) {
        const feature_field = side + '_object';
        const pins_side_field = side + '_side';
        const pins_low_field = side + '_low';
        const pins_high_field = side + '_high';

        // Check target feature exists
        const feature = await this.check_reference(conn_rec, feature_field);
        const conn_tech = this.nw_view.connections[conn_rec.myw.feature_type].name;
        if (!feature) {
            return;
        }

        // Check pins exist
        const pins = new PinRange(
            conn_rec.properties[pins_side_field],
            conn_rec.properties[pins_low_field],
            conn_rec.properties[pins_high_field]
        );
        if (this.nw_view.cable_mgr.isSegment(feature)) {
            await this.check_fibers_exist(feature, pins, conn_rec, pins_high_field);
        } else {
            await this.check_ports_exist(feature, pins, conn_rec, pins_high_field, conn_tech);
        }

        // Check no overlaps
        let field;
        if (this.nw_view.cable_mgr.isSegment(feature)) field = side + '_structure';
        else field = `n_${conn_tech}_${side}_ports`;
        await this.check_connection_unique(feature, pins, conn_rec, field);

        // Check connection root housing is valid root housing or end point for feature
        if (this.nw_view.cable_mgr.isSegment(feature)) {
            await this.check_segment_end(feature, conn_rec);
        } else {
            this.check_derived_field(conn_rec, 'root_housing', feature, 'root_housing');
        }

        return feature;
    }

    /**
     *
     * Check that segment ends or starts at the root housing of the connection conn_rec
     *
     * @param {MywFeature} feature
     * @param {MywFeature} conn_rec
     * @returns MywFeature
     */
    async check_segment_end(feature, conn_rec) {
        const housing = conn_rec.properties.root_housing;

        if (
            feature.properties.in_structure != housing &&
            feature.properties.out_structure != housing
        ) {
            this.error(conn_rec, 'root_housing', 'derived_value_mismatch', {
                ref_rec: feature,
                value: housing,
                expected: `${feature.properties.in_structure} or ${feature.properties.out_structure}`
            });
        }
    }

    /**
     * Check that CONN_REC is the only connection record that references PINS of FEATURE
     */
    //ENH: Prevent reporting both size when running full validation
    async check_connection_unique(feature, pins, conn_rec, field) {
        const conn_tab = await conn_rec.view.table(conn_rec.getType());
        const feature_urn = feature.getUrn();

        for (const conn_side of ['in', 'out']) {
            const feature_field = conn_side + '_object';
            const side_field = conn_side + '_side';
            const low_field = conn_side + '_low';
            const high_field = conn_side + '_high';

            const clauses = [
                `[${feature_field}] = '${feature_urn}'`,
                `[${side_field}] = '${pins.side}'`,
                `[${low_field}] <= ${pins.high}`,
                `[${high_field}] >= ${pins.low}`,
                `[id] <> ${conn_rec.id}`
            ];

            const filter = clauses.join(' & ');
            const pred = new FilterParser(filter).parse();
            const query = conn_tab.query().filter([pred]);
            const clash_recs = await query.orderBy('id').all();

            for (const clash_rec of clash_recs) {
                let housing = await conn_rec.followRef('housing');

                const conn1 = new Conn(conn_rec);
                const conn2 = new Conn(clash_rec);

                const clash_pins = new PinRange(
                    clash_rec.properties[side_field],
                    clash_rec.properties[low_field],
                    clash_rec.properties[high_field]
                );
                const overlap_pins = pins.intersect(clash_pins);

                if (housing == feature && housing.featureDef.fields['housing'])
                    housing = await housing.followRef('housing');

                const [housing_title, struct_title] = await this._getHousingAndRootHousingTitle(
                    conn_rec
                );

                this.error(feature, field, 'duplicate_connection', {
                    ref_rec: housing,
                    _conn1: conn_rec.getUrn(),
                    _conn2: clash_rec.getUrn(),
                    side: conn_side,
                    conn1: await conn1.description(),
                    conn2: await conn2.description(),
                    clash_pins: overlap_pins.spec,
                    housing: housing_title,
                    struct: struct_title
                });
            }
        }
    }

    /**
     * check relational and geometric consistency of circuit
     */
    async check_circuit(circuit, tech = 'fiber') {
        this.progress(4, 'Checking', circuit);
        const circuit_mgr = this.nw_view.circuit_mgr;

        // Check referenced features exiits
        const in_feature = await this.check_reference(circuit, 'in_feature', /*mandatory=*/ false);
        const out_feature = await this.check_reference(
            circuit,
            'out_feature',
            /*mandatory=*/ false
        );

        // Check pin ranges
        if (in_feature && circuit.properties.in_pins) {
            const pins = PinRange.parse(circuit.properties.in_pins);
            await this.check_ports_exist(in_feature, pins, circuit, 'in_pins');
        }

        if (out_feature && circuit.properties.out_pins) {
            const pins = PinRange.parse(circuit.properties.out_pins);
            await this.check_ports_exist(out_feature, pins, circuit, 'out_pins');
        }

        // Check circuit path
        // Note: Does not check matches segments as geom is not currently maintained on split
        const segs = await circuit_mgr.cableSegmentsOf(circuit, tech);
        if (segs.length) {
            this.check_geometry(circuit);
        }
    }

    /**
     * Check validity of line of count record
     * @param {*} loc_record
     */
    async check_line_of_count(loc_record) {
        this.progress(4, 'Checking', loc_record);

        if (loc_record.getType() == 'mywcom_line_of_count_section')
            await this._check_line_of_count_section(loc_record);
        else await this._check_line_of_count(loc_record);
    }

    /**
     * Check line of count section record
     * @param {MywFeature} loc_record
     */
    async _check_line_of_count_section(loc_record) {
        await this.check_reference(loc_record, 'container', true);
        await this.check_reference(loc_record, 'line_of_count', true);

        // Check section geometry against container's geometry
        const container_ref = Reference.parseUrn(loc_record.properties.container);
        const container = await this.db_view.get(container_ref.base);
        const container_geom = container.geometry;
        this.check_geometry_matches(loc_record, 'container', container_geom);

        // ENH: Add check for loc assignment overlap. This could be expensive. Is there
        // a simpler quicker test?
    }

    /**
     * Check line of count record
     * @param {*} loc_record
     */
    async _check_line_of_count(loc_record) {
        await this.check_reference(loc_record, 'origin', true);

        // Check that line of count is not stale
        if (loc_record.properties.stale) {
            this.error(loc_record, '', 'loc_stale', loc_record, loc_record.properties.stale);
        }

        // Check that physical and logical ranges (per name) don't overlap with other
        // line of count records at the same origin

        const loc_table = this.db_view.table('mywcom_line_of_count');
        const filter = `[origin] = '${loc_record.properties.origin}'`;
        const pred = new FilterParser(filter).parse();
        const loc_recs = await this.nw_view.getRecs(loc_table, pred);

        const l_range = new PinRange(
            'in',
            loc_record.properties.low_logical,
            loc_record.properties.high_logical
        );
        const p_range = new PinRange(
            'in',
            loc_record.properties.low_physical,
            loc_record.properties.high_physical
        );

        for (const rec of loc_recs) {
            if (rec.id == loc_record.id) continue;

            const other_l_range = new PinRange(
                'in',
                rec.properties.low_logical,
                rec.properties.high_logical
            );
            const other_p_range = new PinRange(
                'in',
                rec.properties.low_physical,
                rec.properties.high_physical
            );

            if (
                rec.properties.name == loc_record.properties.name &&
                !rec.properties.physical &&
                !loc_record.properties.physical &&
                rec.properties.name
            ) {
                if (l_range.intersect(other_l_range))
                    this.error(loc_record, '', 'loc_overlap', rec, rec);

                if (p_range.intersect(other_p_range))
                    this.error(loc_record, '', 'loc_overlap', rec, rec);
            }
        }
    }

    // ------------------------------------------------------------------------------
    //                                    HELPERS
    // ------------------------------------------------------------------------------
    /**
     * Get title of REC and title of root_housing of REC
     */

    async _getHousingAndRootHousingTitle(rec) {
        let housing_title = null;
        let struct_title = null;
        if (rec) {
            if ('housing' in rec.properties) {
                const housing = await rec.followRef('housing');
                if (housing) {
                    housing_title = housing.getTitle();
                }
            }

            if ('root_housing' in rec.properties) {
                const struct = await rec.followRef('root_housing');
                if (struct) {
                    struct_title = struct.getTitle();
                }
            }
        }
        return [housing_title, struct_title];
    }

    /**
     * Checks properties in_structure, out_structure and geometry match HOUSING
     *
     * REC is a conduit or cable_segment
     */
    check_derived_geom_and_structs(rec, housing) {
        // Determine direction relative to housing
        const rec_forward = 'forward' in rec.featureDef.fields ? rec.properties.forward : true;
        const housing_forward =
            'forward' in housing.featureDef.fields ? housing.properties.forward : true;
        const same_dir = rec_forward == housing_forward;

        // Check structures refs
        if (same_dir) {
            this.check_derived_field(rec, 'in_structure', housing, 'in_structure');
            this.check_derived_field(rec, 'out_structure', housing, 'out_structure');
        } else {
            this.check_derived_field(rec, 'in_structure', housing, 'out_structure');
            this.check_derived_field(rec, 'out_structure', housing, 'in_structure');
        }

        // Check geometry
        const geom = this.check_geometry(rec);
        if (geom) {
            this.check_derived_geom(rec, housing, geom, 'housing', same_dir);
        }

        return geom;
    }

    /**
     * Check that cable segment SEG has pins PINS
     */
    async check_fibers_exist(seg, pins, feature, field = null) {
        const tech = this.nw_view.segments[seg.myw.feature_type].name;

        const cable = await seg.followRef('cable');
        if (!cable) {
            return;
        }

        const count_field_name = this.nw_view.networks[tech].cable_n_pins_field;

        const cable_pins = new PinRange('in', 1, cable.properties[count_field_name]);

        const [housing_title, struct_title] = await this._getHousingAndRootHousingTitle(feature);

        if (!cable_pins.contains(pins)) {
            if (!field) field = pins.side + '_structure';
            this.error(feature, field, 'pins_out_of_range', {
                ref_rec: cable,
                pins: pins.rangeSpec(),
                cable_pins: cable_pins.rangeSpec(),
                housing: housing_title,
                struct: struct_title
            });
        }
    }

    /**
     * Check that pin range on FEATURE is in range of EQUIP
     */
    async check_ports_exist(equip, pins, feature, field, tech = 'fiber') {
        const [housing_title, struct_title] = await this._getHousingAndRootHousingTitle(equip);

        const equip_pins = await this.nw_view.networks[tech].pinsOn(equip, pins.side);
        if (pins && equip_pins && !equip_pins.contains(pins)) {
            this.error(feature, field, 'port_out_of_range', {
                ref_rec: equip,
                ports: pins.spec,
                equip_ports: equip_pins.spec,
                housing: housing_title,
                struct: struct_title
            });
        }
    }

    /**
     * Checks that tick_marks of SEG do not overlap IN_SEG AND OUT_SEG
     */
    check_tick_marks(seg, in_seg, out_seg) {
        // Check in_tick
        let ticks = [
            in_seg.properties.out_tick,
            seg.properties.in_tick,
            out_seg.properties.in_tick
        ];
        ticks = ticks.filter(tick => tick != undefined);
        let sorted_ticks = [...ticks].sort();

        // Check ticks are the same forwards or backwards
        if (
            !this.arrayEqual(sorted_ticks, ticks) &&
            !this.arrayEqual(sorted_ticks, [...ticks].reverse())
        ) {
            const next_seg = seg.properties.forward ? out_seg : in_seg;
            this.error(seg, 'in_tick', 'tick_mark_invalid', {
                invalid_tick: seg.properties.in_tick,
                overlap_seg: next_seg.getTitle()
            });
        }

        // Check out_tick
        ticks = [in_seg.properties.out_tick, seg.properties.out_tick, out_seg.properties.in_tick];
        ticks = ticks.filter(tick => tick != undefined);
        sorted_ticks = [...ticks].sort((a, b) => a - b);

        // Check ticks are the same forwards or backwards
        if (
            !this.arrayEqual(sorted_ticks, ticks) &&
            !this.arrayEqual(sorted_ticks, [...ticks].reverse())
        ) {
            const next_seg = seg.properties.forward ? out_seg : in_seg;
            this.error(seg, 'out_tick', 'tick_mark_invalid', {
                invalid_tick: seg.properties.out_tick,
                overlap_seg: next_seg.getTitle()
            });
        }
    }

    /**
     * True if arr1 and arr2 are identical else false
     */
    arrayEqual(arr1, arr2) {
        if (arr1.length != arr2.length) return false;

        for (const i in arr1) {
            if (arr1[i] !== arr2[i]) return false;
        }

        return true;
    }

    /**
     * Check value of REC.FIELD matches PARENT_REC.PARENT_FIELD
     *
     * If PARENT_FIELD omitted, checks REC.FIELD contains URN of PARENT_REC
     */
    check_derived_field(rec, field, parent_rec, parent_field = undefined) {
        // Check expected value
        let parent_value;
        if (parent_field) {
            parent_value = parent_rec.properties[parent_field];
        } else {
            parent_value = parent_rec.getUrn();
        }

        // Check actual value
        const value = rec.properties[field];

        if (value != parent_value) {
            this.error(rec, field, 'derived_value_mismatch', {
                ref_rec: parent_rec,
                value: value,
                expected: parent_value
            });
        }
    }

    /**
     * Check geometry of REC matches that of PARENT_REC
     */
    check_derived_geom(rec, parent_rec, geom, ref_field = 'housing', forward = true) {
        if (geom.type == 'Point') {
            this.check_coord(rec, ref_field, geom.firstCoord(), parent_rec);
        } else {
            this.check_linestring(rec, parent_rec, geom, ref_field, forward);
        }
    }

    /**
     * Check primary geometry of FEATURE matches EXPECTED_GEOM
     *
     * ALLOW_REVERSE - if True then geometry considered a match if coords match forwards or backwards
     */
    check_geometry_matches(feature, seg_field, expected_geom, allow_reverse = false) {
        const geom = this.check_geometry(feature);

        if (!geom) {
            return;
        }

        const coords = geom.flatCoordinates();
        const expected_coords = expected_geom.flatCoordinates();

        let ok = geomUtils.coordsEqual(coords, expected_coords);

        if (!ok && allow_reverse) {
            expected_coords.reverse();
            ok = geomUtils.coordsEqual(coords, expected_coords);
        }

        if (!ok) {
            this.error(feature, feature.featureDef.primary_geom_name, 'geom_mismatch', {
                ref: seg_field
            });
        }
    }

    /**
     * Checks all coords of GEOM match PARENT_REC
     */
    check_linestring(rec, parent_rec, geom, ref_field = 'housing', forward = true) {
        // Get geometry of housing
        const ref_geom = parent_rec.geometry;
        if (!ref_geom) {
            return;
        }

        // Get housing coords
        let coords = ref_geom.flatCoordinates();
        if (!forward) {
            coords = coords.reverse();
        }

        // Hack for internal segments
        if (ref_geom.type == 'Point') {
            coords.push(coords[0]);
        }

        // Check for different number of coords
        if (coords.length != geom.flatCoordinates().length) {
            this.error(rec, rec.featureDef.primary_geom_name, 'geom_size_mismatch', {
                _ref: ref_field,
                ref_rec: parent_rec,
                n_coords: coords.length,
                n_expected: geom.flatCoordinates().length
            });
            return;
        }

        // Check coords match
        for (const [index, ref_coord] of Object.entries(coords)) {
            const coord = geom.flatCoordinates()[index];

            if (!geomUtils.coordEqual(coord, ref_coord)) {
                this.error(rec, rec.featureDef.primary_geom_name, 'geom_mismatch_at', {
                    _ref: ref_field,
                    ref_rec: parent_rec,
                    _coord: coord,
                    _expected_coord: ref_coord
                });
                return;
            }
        }
    }

    /**
     * Check COORD of REC is coincident with SIDE of REF_REC
     */
    check_coord(rec, ref_field, coord, ref_rec, ref_side = null) {
        // Get geometry of referenced rec
        const ref_geom = ref_rec.geometry;
        if (!ref_geom) {
            return;
        }

        // Get coordinate to match
        let ref_coord;
        if (ref_side) {
            ref_coord = this.coord_for(ref_geom, ref_side);
        } else {
            if (ref_geom.type == 'Point') ref_coord = ref_geom.coordinates;
            else if (ref_geom.type == 'LineString') ref_coord = ref_geom.coordinates[0];
            else if (ref_geom.type == 'Polygon') ref_coord = ref_geom.coordinates[0][0];
        }

        // Do the check
        if (!geomUtils.coordEqual(coord, ref_coord)) {
            this.error(rec, rec.featureDef.primary_geom_name, 'geom_mismatch_at', {
                _ref: ref_field,
                ref_rec: ref_rec,
                ref_side: ref_side,
                _coord: coord,
                _expected_coord: ref_coord
            });
        }
    }

    /**
     * The coordinate at SIDE of linestring GEOM
     */
    coord_for(geom, side) {
        if (side == 'in') return geom.firstCoord();
        if (side == 'out') return geom.lastCoord();
        throw new MywError('Bad side:', side);
    }

    /**
     * Get the primary geometry of REC (if set)
     *
     * If optional FIELD is set, get geometry from that field instead
     */
    check_geometry(rec, field = undefined) {
        if (!field) {
            field = rec.featureDef.primary_geom_name;
        }

        const geom = rec.geometry; // TODO: _field(field).geom();
        if (!geom) {
            this.error(rec, field, 'not_set');
        }

        return geom;
    }

    /**
     * Check the bi-direction link REC.FIELD
     *
     * BACKREF_FIELD is the field on the referenced rec that
     * should point to REC
     */
    async check_twoway_reference(rec, field, backref_field, mandatory = true) {
        // Check the forward reference
        const to_rec = await this.check_reference(rec, field, mandatory);
        if (!to_rec) {
            return;
        }

        // Check the back reference
        // ENH: Quicker just to check the ref ... but need to handle urn and foreign key
        const back_rec = await to_rec.followRef(backref_field);
        if (!back_rec || back_rec.getUrn() != rec.getUrn()) {
            this.error(rec, field, 'broken_chain', {
                _ref: rec.properties[field],
                back_ref: to_rec.properties[backref_field]
            });
        }

        return to_rec;
    }

    /**
     * Check rec referenced by REC.FIELD exists
     */
    async check_reference(rec, field, mandatory = true) {
        // Check for not set
        if (!rec.properties[field]) {
            if (mandatory) {
                this.error(rec, field, 'not_set');
            }
            return undefined;
        }

        // Check reference is good
        const ref_rec = await rec.followRef(field);
        if (!ref_rec) {
            this.error(rec, field, 'referenced_record_missing', {
                _ref: rec.properties[field]
            });
        }

        return ref_rec;
    }

    /**
     * Checks that mandatory field FIELD is not null
     */
    check_field(rec, field) {
        const val = rec.properties[field];

        if (val == undefined) {
            this.error(rec, field, 'not_set');
        }

        return val;
    }

    /**
     * Report a problem
     */
    // Data is a list of additional properties. Keys starting with '_' are hidden in GUI
    error(rec, field, problem_type, data = {}) {
        const ref_rec = data.ref_rec;
        delete data.ref_rec;
        if (!Object.keys(data).length) data = null;
        const item = new IntegrityError(rec, field, problem_type, ref_rec, data);

        this.progress(2, item);
        if (data) {
            for (const prop of Object.keys(data).sort()) {
                const val = data[prop];
                this.progress(3, ' ', prop, ':', val);
            }
        }

        if (!(rec.getUrn() in this.errors)) this.errors[rec.getUrn()] = {};

        this.errors[rec.getUrn()][field] = item;
    }
}

export default DataValidator;
