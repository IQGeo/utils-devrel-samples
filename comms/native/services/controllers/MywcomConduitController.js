//##############################################################################
// Controller for managing conduits
//##############################################################################
// Copyright: IQGeo Limited 2010-2023

import MywcomController from './MywcomController';

/**
 * Controller for managing conduits
 */
/*eslint-disable no-await-in-loop*/
class MywcomConduitController extends MywcomController {
    /**
     * Initialize slots of self
     */
    constructor(request) {
        super(request, 'CONDUIT');
    }

    //@view_config(route_name='mywcom_conduit_controller.continuous_conduits', request_method='GET', renderer='json')
    /**
     * Returns ordered chain of continuous conduits
     */
    async continuous_conduits(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const conduit_mgr = this.networkView(db_view).conduit_mgr;

        // Get feature record
        const conduit_rec = await this.featureRec(db_view, feature_type, id);

        // Build chain
        const conduits = await conduit_mgr.conduitChain(conduit_rec);

        // Map recs -> feature collection
        const features = await this.featuresFromRecs(conduits);

        return { type: 'MywFeatureCollection', features };
    }

    // ------------------------------------------------------------------------------
    //                                   ROUTING
    // ------------------------------------------------------------------------------

    //@view_config(route_name='mywcom_conduit_controller.find_path', request_method='POST', renderer='json')
    /**
     * Find path through routes network linking given structures
     *
     * Returns a list of routes in order
     */
    async find_path(routeParams, params) {
        return this.runInTransaction(() => this._find_path(routeParams, params));
    }

    async _find_path(routeParams, params) {
        // ENH: similar code in cable controller, move to super class

        // Unpick args
        const feature_type = params.feature_type;
        const struct_urns = JSON.parse(params.structures);
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const conduit_mgr = this.networkView(db_view).conduit_mgr;

        // Find structures
        const structs = [];
        for (const urn of struct_urns) {
            const struct = await db_view.get(urn);
            if (!struct) {
                // abort(403);
            }
            structs.push(struct);
        }

        // Find path that links them
        const routes = await conduit_mgr.findPath(structs, feature_type);

        // Map recs -> feature collection
        const features = await this.featuresFromRecs(routes);

        return { type: 'MywFeatureCollection', features };
    }

    //@view_config(route_name='mywcom_conduit_controller.route', request_method='POST', renderer='json')
    /**
     * Find path through routes network linking given structures
     * and insert new conduits. Returns conduits created
     */
    async route(routeParams, params) {
        return this.runInTransaction(() => this._route(routeParams, params));
    }

    async _route(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const delta = params.delta;
        const num_paths = params.num_paths;
        const feature_json = JSON.parse(params.feature); // geojson feature
        const struct_urns = JSON.parse(params.structures);

        // Get manager
        const db_view = this.db.view(delta);
        const conduit_mgr = this.networkView(db_view).conduit_mgr;

        // Find structures
        const structs = [];
        for (const urn of struct_urns) {
            const struct = await db_view.get(urn);
            if (!struct) {
                // abort(403);
            }
            structs.push(struct);
        }

        // Do the routing
        const conduits = await conduit_mgr.routeConduit(
            feature_type,
            feature_json,
            structs,
            num_paths
        );

        // Map recs -> feature collection
        const features = await this.featuresFromRecs(conduits);

        return { type: 'MywFeatureCollection', features };
    }

    // ==============================================================================
    //                                   CONDUIT MANAGEMENT
    // ==============================================================================

    //@view_config(route_name='mywcom_conduit_controller.connect', request_method='POST', renderer='json')
    /**
     * Connect the conduits at the structure
     */
    async connect(routeParams, params) {
        return this.runInTransaction(() => this._connect(routeParams, params));
    }

    async _connect(routeParams, params) {
        // Unpick parameters
        const struct_feature_type = routeParams.struct_ft;
        const struct_id = routeParams.struct_id;
        const conduit1_feature_type = routeParams.cnd1_ft;
        const conduit1_id = routeParams.cnd1_id;
        const conduit2_feature_type = routeParams.cnd2_ft;
        const conduit2_id = routeParams.cnd2_id;
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const conduit_mgr = this.networkView(db_view).conduit_mgr;

        // Get feature records
        const struct = await this.featureRec(db_view, struct_feature_type, struct_id);
        const conduit1 = await this.featureRec(db_view, conduit1_feature_type, conduit1_id);
        const conduit2 = await this.featureRec(db_view, conduit2_feature_type, conduit2_id);

        // Connect ends
        await conduit_mgr.connect(struct, conduit1, conduit2);

        return { ok: true };
    }

    //@view_config(route_name='mywcom_conduit_controller.disconnect', request_method='POST', renderer='json')
    /**
     * Disconnect/cut the conduit at structure
     */
    async disconnect(routeParams, params) {
        return this.runInTransaction(() => this._disconnect(routeParams, params));
    }

    async _disconnect(routeParams, params) {
        // Unpick parameters
        const conduit_feature_type = routeParams.conduit_ft;
        const struct_feature_type = routeParams.struct_ft;
        const conduit_id = routeParams.conduit_id;
        const struct_id = routeParams.struct_id;
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const conduit_mgr = this.networkView(db_view).conduit_mgr;

        // Get feature records
        const conduit = await this.featureRec(db_view, conduit_feature_type, conduit_id);
        const struct = await this.featureRec(db_view, struct_feature_type, struct_id);

        // Disconnect ends
        await conduit_mgr.disconnectConduitAt(conduit, struct);

        return { ok: true };
    }

    //@view_config(route_name='mywcom_conduit_controller.move_into', request_method='POST', renderer='json')
    //@view_config(route_name='mywcom_conduit_controller.move_cable_into', request_method='POST', renderer='json')
    /**
     * Move a cable segment or conduit to a new housing in same route
     *
     * Deals with propagation of changes when moving a cable into/out of a continuous conduit
     */
    async move_into(routeParams, params) {
        return this.runInTransaction(() => this.set_housing(routeParams, params));
    }

    /**
     * Move conduit to a new housing in same route
     */
    async move_cable_into(routeParams, params) {
        //Same as above because of routing from python
        return this.runInTransaction(() => this.set_housing(routeParams, params));
    }

    async set_housing(routeParams, params) {
        // Unpick args
        const feature_id = routeParams.feature_id;
        const housing_feature_type = routeParams.housing_ft;
        const housing_id = routeParams.housing_id;
        const feature_type = routeParams.feature_type;
        const delta = params.delta;

        // Get managers
        const db_view = this.db.view(delta);
        const nw_view = this.networkView(db_view);

        // Get feature record
        const new_housing_rec = await this.featureRec(db_view, housing_feature_type, housing_id);
        const contained_rec = await this.featureRec(db_view, feature_type, feature_id);

        // Move
        const mgr = nw_view.managerFor(contained_rec);

        this.progress(2, 'Change housing ', mgr, contained_rec, new_housing_rec);
        await mgr.moveToHousing(contained_rec, new_housing_rec);

        return { ok: true };
    }
}

export default MywcomConduitController;
