// Copyright: IQGeo Limited 2010-2023
import myw, { MywClass } from 'myWorld-base';
import _ from 'underscore';
/**
 * Example of custom name manager
 */
class DevDbNameManager extends MywClass {
    static {
        // Which features to use naming engine on, keyed on feature name, with abbreviation
        this.prototype.featureTypes = {
            fiber_cable: { abbr: 'FCB', service_area: 'service_area' },
            copper_cable: { abbr: 'CC', service_area: 'service_area' },
            coax_cable: { abbr: 'HFC', service_area: 'node_boundary' },
            manhole: { abbr: 'M', service_area: 'service_area' },
            cabinet: { abbr: 'C', service_area: 'service_area' },
            pole: { abbr: 'P', service_area: 'service_area' },
            drop_point: { abbr: 'DP', service_area: 'service_area' },
            conduit: { abbr: 'CND', service_area: 'service_area' },
            splice_closure: { abbr: 'SC', service_area: 'service_area' },
            copper_splice_closure: { abbr: 'CSC', service_area: 'service_area' },
            slot: { abbr: 'SL', service_area: 'service_area' },
            shelf: { abbr: 'S', service_area: 'service_area' },
            copper_shelf: { abbr: 'CS', service_area: 'service_area' },
            fiber_patch_panel: { abbr: 'ODF', service_area: 'service_area' },
            fiber_splitter: { abbr: 'SPL', service_area: 'service_area' },
            fiber_splice_tray: { abbr: 'TR', service_area: 'service_area' },
            fiber_olt: { abbr: 'OLT', service_area: 'service_area' },
            fiber_ont: { abbr: 'ONT', service_area: 'service_area' },
            fiber_mux: { abbr: 'MUX', service_area: 'service_area' },
            fiber_tap: { abbr: 'TAP', service_area: 'service_area' },
            coax_tap: { abbr: 'CTAP', service_area: 'node_boundary' },
            blown_fiber_tube: { abbr: 'BF', service_area: 'service_area' },
            copper_repeater: { abbr: 'CRE', service_area: 'service_area' },
            copper_load_coil: { abbr: 'LC', service_area: 'service_area' },
            copper_capacitor: { abbr: 'CAP', service_area: 'service_area' },
            copper_bridge_tap: { abbr: 'BT', service_area: 'service_area' },
            copper_build_out: { abbr: 'BO', service_area: 'service_area' },
            copper_dslam: { abbr: 'DSLAM', service_area: 'service_area' },
            copper_pair_gain: { abbr: 'PG', service_area: 'service_area' },
            copper_terminal: { abbr: 'T', service_area: 'service_area' },
            coax_amplifier: { abbr: 'A', service_area: 'node_boundary' },
            coax_splice: { abbr: 'CXS', service_area: 'node_boundary' },
            coax_terminator: { abbr: 'CT', service_area: 'node_boundary' },
            directional_coupler: { abbr: 'DC', service_area: 'node_boundary' },
            inline_equalizer: { abbr: 'IE', service_area: 'node_boundary' },
            internal_directional_coupler: { abbr: 'IDC', service_area: 'node_boundary' },
            internal_splitter: { abbr: 'IS', service_area: 'node_boundary' },
            optical_node_closure: { abbr: 'ONC', service_area: 'node_boundary' },
            optical_node: { abbr: 'ON', service_area: 'node_boundary' },
            power_block: { abbr: 'PB', service_area: 'node_boundary' },
            power_inserter: { abbr: 'PI', service_area: 'node_boundary' },
            power_supply: { abbr: 'PS', service_area: 'node_boundary' },
            three_way_splitter: { abbr: '3WSPL', service_area: 'node_boundary' },
            two_way_splitter: { abbr: '2WSPL', service_area: 'node_boundary' }
        };

        // Default to use when none found from scan
        this.prototype.defaultServiceAreaAbbr = 'XX';

        // Search radius for service areas
        this.prototype.service_area_tolerance = 5;
    }

    static registerTriggers(NetworkView) {
        // ENH: Use different methods for different categories
        NetworkView.registerTrigger('struct', 'pos_insert', this, 'setNameFor');
        NetworkView.registerTrigger('cable', 'pos_insert', this, 'setNameFor');
        NetworkView.registerTrigger('equip', 'pos_insert', this, 'setNameFor');
        NetworkView.registerTrigger('conduit', 'pos_insert', this, 'setNameFor');

        NetworkView.registerTrigger('struct', 'pos_update', this, 'setNameFor');
        NetworkView.registerTrigger('cable', 'pos_update', this, 'setNameFor');
        NetworkView.registerTrigger('equip', 'pos_update', this, 'setNameFor');
        NetworkView.registerTrigger('conduit', 'pos_update', this, 'setNameFor');
    }

    /**
     * Init slots of self
     *
     * NW_VIEW is a NetworkView. PROGRESS is a MywProgressHandler
     */
    constructor(nw_view, progress) {
        super();
        this.nw_view = nw_view;
        this.db_view = nw_view.db_view;
        this.progress = progress;
    }

    /**
     * Called after REC has been inserted
     *
     * Define feature names based on their service area and abbreviated feature type
     */
    async setNameFor(rec, orig_rec = undefined) {
        if (rec.getType() in this.featureTypes) {
            await this._setValuesFor(rec);
        }
    }

    /**
     * Sets name for feature
     */
    async _setValuesFor(rec) {
        // Check for name already set
        if (rec.properties.name) {
            return;
        }

        // Check for cannot determine name yet
        if (!rec.geometry) {
            return;
        }

        const feature_type = rec.getType();
        let feature_id = rec.id;
        const service_area = this.featureTypes[feature_type]['service_area'];
        const service_area_abbr = await this._getServiceAreaAbbrFor(rec, service_area);
        const feature_abbr = this._getAbbreviationFor(feature_type);

        // Prevent very long names on NativeApp
        // WARNING: This could lead to non-unique names for objects created on Native App
        const maxOnlineID = 101000;
        if (feature_id > maxOnlineID) feature_id = maxOnlineID + (feature_id % maxOnlineID);

        // Update field
        if (feature_type == 'fiber_cable') {
            await this._setValuesForCable(feature_abbr, service_area_abbr, rec, feature_id);
        } else {
            await this._setValuesForFeature(feature_abbr, service_area_abbr, rec, feature_id);
        }

        // Rebuild computed properties (in case they contain name)
        this.buildTitle(rec);
        this.buildShortDescription(rec);

        // Save to database
        const table = await rec.view.table(rec.getType()); // ENH: Encapsulate
        await table.update(rec.id, rec);

        this.progress(3, 'Auto named', rec, 'as', rec.properties.name);
    }

    /**
     * Set name on new fiber cable: <service area>-<feature abbreviation>-<id>
     * if non-directed use BB for backbone in place of service area.
     */
    async _setValuesForCable(feature_abbr, service_area_abbr, rec, id) {
        if (rec.properties.directed == true) {
            rec.properties.name = `${service_area_abbr}-${feature_abbr}-${id}`;
        } else {
            rec.properties.name = `BB-${feature_abbr}-${id}`;
        }
    }

    /**
     * Set name on structure: <service area>-<feature abbreviation>-<id>
     */
    async _setValuesForFeature(feature_abbr, service_area_abbr, rec, id) {
        rec.properties.name = `${service_area_abbr}-${feature_abbr}-${id}`;
    }

    /**
     * Returns abbreviated feature name for feature type
     */
    _getAbbreviationFor(name) {
        return this.featureTypes[name].abbr;
    }

    /**
     * Get service area name a feature is within
     */
    async _getServiceAreaAbbrFor(rec, service_area_name) {
        const service_area_table = await this.db_view.table(service_area_name);
        const service_area_field = service_area_table.descriptor.primary_geom_name;

        const rec_geom = rec.geometry;

        const query = service_area_table.query().whereIntersects(service_area_field, rec_geom);

        const service_area = await query.first();

        if (service_area) {
            return service_area.properties.name;
        }

        return this.defaultServiceAreaAbbr;
    }

    /**
     * Rebuild property myw.title
     */
    // This is cut-and-paste from featureModel.initialize()
    // ENH: Provide this in core
    buildTitle(rec) {
        // Get data
        const fieldValues = rec._getFieldValues(rec.properties); // Should pass record really
        const pseudoValues = _.pick(rec.featureDef, 'title', 'short_description', 'external_name');
        pseudoValues.display_name = pseudoValues.external_name;

        // Build fields
        rec.myw.title = rec._evaluateFieldExpression('title_expr', fieldValues, pseudoValues);
    }

    /**
     * Rebuild property myw.short_description
     */
    // This is cut-and-paste from featureModel.initialize()
    // ENH: Provide this in core
    buildShortDescription(rec) {
        if (!rec.featureDef.short_description_expr) return;

        // Get data
        const fieldValues = rec._getFieldValues(rec.properties); // Should pass record really
        const pseudoValues = _.pick(rec.featureDef, 'title', 'short_description', 'external_name');
        pseudoValues.display_name = pseudoValues.external_name;

        rec.myw.short_description = rec._evaluateFieldExpression(
            'short_description_expr',
            fieldValues,
            pseudoValues
        );
    }
}

export default DevDbNameManager;

// ==============================================================================
//                               TRIGGER REGISTRATION
// ==============================================================================
//ENH: Change trigger mechanism to ignore duplicates and do this from callers

import NetworkView from '../../../comms/native/services/api/NetworkView';
DevDbNameManager.registerTriggers(NetworkView.prototype);
