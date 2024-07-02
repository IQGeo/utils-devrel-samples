//##############################################################################
// Controller for managing cable substructure
//##############################################################################
// Copyright: IQGeo Limited 2010-2023

import { Reference } from 'myWorld-native-services';

import MywcomController from './MywcomController';

/**
 * Controller for managing cable substructure and derived properties
 */
/*eslint-disable no-await-in-loop*/
class MywcomCableController extends MywcomController {
    /**
     * Initialize slots of self
     */
    constructor(request) {
        super(request, 'CABLE');
    }

    //@view_config(route_name='mywcom_cable_controller.equip_cables', request_method='GET', renderer='json')
    /**
     * Find cables connected to given equipment feature
     *
     * Navigates connections to determine associated cables
     *
     * Returns a set of cable features
     */
    async equip_cables(routeParams, params) {
        // ENH: Move to separate controller

        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;

        // Find equipment
        const equip = await this.featureRec(db_view, feature_type, id);
        if (!equip) {
            // throw exc. new HTTPForbidden()
        }

        // For each technology ... find URNS of connected segments
        // ENH: Delegate to equipment manager?
        const seg_urns = new Set();
        for (const network of Object.values(cable_mgr.nw_view.networks)) {
            // Skip network/tech if equipment has no connections for technology
            const conn_field = network.connections_field;
            const field_desc = equip.featureDef.fields[conn_field];
            if (!field_desc) {
                continue;
            }
            const conn_recs = await equip.followRefSet(conn_field);
            // For each connection record ..
            for (const conn_rec of Object.values(conn_recs)) {
                // If it goes to a cable segment ... get its cable
                if (conn_rec.properties.in_object == equip.getUrn()) {
                    const ref = Reference.parseUrn(conn_rec.properties.out_object);
                    if (ref.feature_type == network.segment_type) {
                        seg_urns.add(conn_rec.properties.out_object);
                    }
                }

                if (conn_rec.properties.out_object == equip.getUrn()) {
                    const ref = Reference.parseUrn(conn_rec.properties.in_object);
                    if (ref.feature_type == network.segment_type) {
                        seg_urns.add(conn_rec.properties.in_object);
                    }
                }
            }
        }

        // Map segment URNs -> cable URNs
        const cable_urns = new Set();
        for (const seg_rec of await db_view.getRecs(seg_urns)) {
            cable_urns.add(seg_rec.properties.cable);
        }

        // Get cable records
        const cable_recs = await db_view.getRecs(cable_urns);

        // Map recs -> feature collection
        const features = await this.featuresFromRecs(cable_recs);

        return { type: 'MywFeatureCollection', features: features }; //return as feature collection
    }

    // ------------------------------------------------------------------------------
    //                                   ROUTING
    // ------------------------------------------------------------------------------

    //@view_config(route_name='mywcom_cable_controller.find_path', request_method='POST', renderer='json')
    /**
     * Find path through routes network linking given structures
     *
     * Returns a list of (route,forward) tuples
     */
    async find_path(routeParams, params) {
        // Unpick args
        const feature_type = params.feature_type;
        const struct_urns = JSON.parse(params.structures);
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;

        // Find structures
        const structs = [];
        for (const urn of struct_urns) {
            const struct = await db_view.get(urn);
            if (!struct) {
                // throw exc. new HTTPForbidden()
            }
            structs.push(struct);
        }

        // Find path that links them
        const route_infos = await cable_mgr.findPath(structs, feature_type);

        // Return route info
        const routes = [];
        for (const route_info of route_infos) {
            routes.push([await route_info[0].asGeojsonFeature(), route_info[1]]);
        }

        return { routes };
    }

    //@view_config(route_name='mywcom_cable_controller.route_cable', request_method='POST', renderer='json')
    /**
     * Route cable ID through the given structures
     */
    async route_cable(routeParams, params) {
        return this.runInTransaction(() => this._route_cable(routeParams, params));
    }

    async _route_cable(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const struct_urns = JSON.parse(params.structures);
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;

        // Find cable
        const cable = await this.featureRec(db_view, feature_type, id);
        if (!cable) {
            // throw exc. new HTTPForbidden()
        }

        // Find structures to route via
        const structs = [];
        for (const urn of struct_urns) {
            const struct = await db_view.get(urn);
            if (!struct) {
                // throw exc. new HTTPForbidden()
            }
            structs.push(struct);
        }

        // Route the cable
        const routes = await cable_mgr.findPath(structs, feature_type);
        await cable_mgr.route(cable, routes);
        await cable_mgr.buildPlacementGeometry(cable, structs);

        // Return updated cable object
        return { cable: await cable.asGeojsonFeature() };
    }

    //@view_config(route_name='mywcom_cable_controller.reroute_cable', request_method='POST', renderer='json')
    /**
     * Update route of cable ID
     *
     * Retains connections and existing segments where possible. Supports dry run
     *
     * Returns dict with member:
     *   cable
     *   add_routes
     *   remove_routes
     *   same_routes
     *   affected_structures
     */
    async reroute_cable(routeParams, params) {
        return this.runInTransaction(() => this._reroute_cable(routeParams, params));
    }

    async _reroute_cable(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const struct_urns = JSON.parse(params.structures);
        const delta = params.delta;
        const dry_run = params.dry_run;

        // Get manager
        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;

        // Find cable
        const table = await db_view.table(feature_type);
        const cable = await table.get(id);
        if (!cable) {
            // throw exc. new HTTPForbidden()
        }

        // Find structures to route via
        const structs = [];
        for (const urn of struct_urns) {
            const struct = await db_view.get(urn);
            if (!struct) {
                // abort(403);
            }
            structs.push(struct);
        }

        // Route the cable
        const routes = await cable_mgr.findPath(structs, feature_type);
        const changes = await cable_mgr.update_route(cable, dry_run, routes);

        if (!dry_run) {
            await cable_mgr.buildPlacementGeometry(cable, structs);
        }

        // Build result
        changes['cable'] = await cable.asGeojsonFeature();
        changes['add_routes'] = await this.featuresFromRecs(changes['add_routes']);
        changes['remove_routes'] = await this.featuresFromRecs(changes['remove_routes']);
        changes['same_routes'] = await this.featuresFromRecs(changes['same_routes']);

        for (const urn in changes.affected_structures) {
            const entry = changes.affected_structures[urn];
            const feature = await db_view.get(urn);
            if (feature) {
                entry['feature'] = await feature.asGeojsonFeature();
            }
        }

        return changes;
    }

    // ------------------------------------------------------------------------------
    //                                CONNECTIONS
    // ------------------------------------------------------------------------------

    //@view_config(route_name='mywcom_cable_controller.connections', request_method='GET', renderer='json')
    /**
     * Returns connections for cable (for all technology)
     */
    async connections(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const delta = params.delta;
        const sort = params.sort;
        const splice = params.splice;

        // Get manager
        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;

        // Find cable
        const cable = await this.featureRec(db_view, feature_type, id);

        // Get the connections
        const conn_recs = await cable_mgr.connectionsFor(cable, splice, sort);

        // Map recs -> feature collection
        const features = await this.featuresFromRecs(conn_recs);

        return { type: 'MywFeatureCollection', features: features }; //return as feature collection
    }

    //@view_config(route_name='mywcom_cable_controller.highest_connected', request_method='GET', renderer='json')
    /**
     * Returns highest number fiber of a cable that is connected (0 if none)
     */
    async highest_connected(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;

        // Find cable
        const cable = await this.featureRec(db_view, feature_type, id);

        // Get top pin
        return { high: await cable_mgr.highestConnectedPin(cable) };
    }

    // @view_config(route_name='mywcom_cable_controller.add_slack', request_method='POST', renderer='json')
    // @handling_exceptions
    /**
     * Create slack at side of structure
     */
    // Returns new slack record
    async add_slack(routeParams, params) {
        return this.runInTransaction(() => this._add_slack(routeParams, params));
    }

    async _add_slack(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const feature_json = JSON.parse(params.feature);
        const seg_urn = params.seg_urn;
        const side = params.side;
        const delta = params.delta;

        // Create new segment, update segment chain, transfer any connections
        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;
        const slack_rec = await cable_mgr.addSlack(feature_type, feature_json, seg_urn, side);

        return slack_rec.asGeojsonFeature({ include_lobs: false });
    }

    // @view_config(route_name='mywcom_cable_controller.split_slack', request_method='POST', renderer='json')
    // @handling_exceptions
    /**
     * Splits Slack at given LENGTH
     * Returns old and new slack record
     */
    async split_slack(routeParams, params) {
        return this.runInTransaction(() => this._split_slack(routeParams, params));
    }

    async _split_slack(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const length = params.length;
        const delta = params.delta;

        // Get manager
        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;

        const slack_tab = await db_view.table(feature_type);
        const slack = await slack_tab.get(id);

        const [slack_rec, new_slack_rec] = await cable_mgr.splitSlack(slack, parseFloat(length));

        return {
            old_slack: await slack_rec.asGeojsonFeature(),
            new_slack: await new_slack_rec.asGeojsonFeature()
        };
    }

    //@view_config(
    //    route_name="mywcom_cable_controller.split_cable", request_method="POST", renderer="json"
    //)
    //@handling_exceptions
    /**
     * Splits cable at specificed segment in either forward or backward direction. Connect unconnected
     * fibres if splice housing is provided
     * @returns
     */
    async split_cable(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.feature_id;
        const delta = params.delta;
        let splice_housing = params.splice_housing;
        const seg_id = routeParams.seg_id;
        const cut_forward = routeParams.cut_forward == 'true';

        const db_view = this.db.view(delta);
        const cable_mgr = this.networkView(db_view).cable_mgr;

        const cable = await this.featureRec(db_view, feature_type, id);

        if (splice_housing) {
            splice_housing = await db_view.get(splice_housing);
        }

        const seg_table = cable_mgr.segmentTypeFor(cable);
        const segment = await this.featureRec(db_view, seg_table, seg_id);
        const new_cable = await cable_mgr.splitCableAt(cable, segment, cut_forward, splice_housing);

        return new_cable.asGeojsonFeature(false);
    }
}

export default MywcomCableController;
