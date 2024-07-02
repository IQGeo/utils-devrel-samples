//##############################################################################
// Controller for managing routes and structures
//##############################################################################
// Copyright: IQGeo Limited 2010-2023

//import view_config from 'pyramid.view'

//import {Session} from 'myWorld-native-services'
//import {MywFeatureCollection} from 'myWorld-native-services'

//import NetworkView from '../api/NetworkView'
//import utils from '../base/Utils'

//import handling_exceptions from './Utils'
import MywcomController from './MywcomController';

/**
 * Controller for managing routes and structures
 */
class MywcomStructureController extends MywcomController {
    /**
     * Initialize slots of self
     */
    constructor(database) {
        super(database);
    }

    //@view_config(route_name='mywcom_structure_controller.struct_contents', request_method='GET', renderer='json')
    //@handling_exceptions
    /**
     * Returns contents of structure
     *
     * Returns dict with keys:
     *  conduits       FeatureCollection
     *  conduit_runs   FeatureCollection
     *  cable_segs     FeatureCollection
     *  cables         FeatureCollection
     *  conns          FeatureCollection
     *  equip          FeatureCollection
     *  seg_circuits   Segment circuit infos
     *  port_circuits  Port circuit infos
     */
    async struct_contents(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const include_proposed = params.include_proposed;
        const delta = params.delta;

        // Get views
        const db_view = this.db.view(delta); // ENH: Use cached feature view for performance
        const nw_view = this.networkView(db_view);

        // Get structure
        const struct = await this.featureRec(db_view, feature_type, id);

        // Get data
        const conduits = await nw_view.conduit_mgr.conduitsAt(struct, include_proposed);
        const conduit_runs = await nw_view.conduit_mgr.conduitRunsFor(conduits);
        const segs = await nw_view.cable_mgr.segmentsAt(struct, include_proposed);
        const cables = await nw_view.cable_mgr.cablesFor(segs);
        const equips = await nw_view.equip_mgr.equipsIn(struct, include_proposed);
        const conns = await nw_view.connection_mgr.connectionsIn(struct, include_proposed);
        const circuit_segs = await nw_view.circuit_mgr.circuitSegmentsAt(struct, include_proposed);
        const circuit_ports = await nw_view.circuit_mgr.circuitPortsAt(struct, include_proposed);

        // Encode it
        return {
            conduits: await this._asFeatureCollection(db_view, conduits),
            conduit_runs: await this._asFeatureCollection(db_view, conduit_runs),
            cable_segs: await this._asFeatureCollection(db_view, segs),
            cables: await this._asFeatureCollection(db_view, cables),
            equip: await this._asFeatureCollection(db_view, equips),
            conns: await this._asFeatureCollection(db_view, conns),
            seg_circuits: circuit_segs,
            port_circuits: circuit_ports
        };
    }

    //@view_config(route_name='mywcom_structure_controller.route_contents', request_method='GET', renderer='json')
    //@handling_exceptions
    /**
     * Returns contents of route
     *
     * Returns dict with keys:
     *  conduits      FeatureCollection
     *  conduit_runs  FeatureCollection
     *  cable_segs    FeatureCollection
     *  cables        FeatureCollection
     *  circuits      ?
     */
    async route_contents(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const include_proposed = params.include_proposed;
        const delta = params.delta;

        // Get views
        const db_view = this.db.view(delta); // ENH: Use cached feature view for performance
        const nw_view = this.networkView(db_view);

        // Get route
        const route = await this.featureRec(db_view, feature_type, id);

        // Get data
        const conduits = await nw_view.conduit_mgr.conduitsIn(route, include_proposed);
        const conduit_runs = await nw_view.conduit_mgr.conduitRunsFor(conduits);
        const segs = await nw_view.cable_mgr.segmentsIn(route, include_proposed);
        const cables = await nw_view.cable_mgr.cablesFor(segs);
        const circuit_segs = await nw_view.circuit_mgr.circuitSegmentsIn(route, include_proposed);

        // Encode it
        return {
            conduits: await this._asFeatureCollection(db_view, conduits),
            conduit_runs: await this._asFeatureCollection(db_view, conduit_runs),
            cable_segs: await this._asFeatureCollection(db_view, segs),
            cables: await this._asFeatureCollection(db_view, cables),
            circuits: circuit_segs
        };
    }

    /**
     * Splits routes on structs along inner coords
     */

    // @view_config(route_name='mywcom_structure_controller.route_split', request_method='POST', renderer='json')
    // @handling_exceptions
    async route_split(routeParams, params) {
        return this.runInTransaction(() => this._route_split(routeParams, params));
    }

    async _route_split(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const delta = params.delta;

        // Get views
        const db_view = this.db.view(delta);
        const struct_mgr = this.networkView(db_view).struct_mgr;

        // Get route
        const route = await this.featureRec(db_view, feature_type, id);

        // Split it
        const routes = await struct_mgr.splitRoute(route);

        // Return routes
        return { type: 'MywFeatureCollection', features: routes };
    }

    async replace_structure(routeParams, params) {
        const feature_type = routeParams.feature_type;
        const feature = JSON.parse(params.feature);
        const newFeature = routeParams.new_feature_type;
        const id = routeParams.id;
        const delta = params.delta;

        const db_view = this.db.view(delta);
        const nw_view = this.networkView(db_view);

        const newStructure = await nw_view.struct_mgr.replaceStructureWith(
            feature,
            feature_type,
            id,
            newFeature
        );

        return newStructure.asGeojsonFeature();
    }

    /**
     * Serialize RECS
     */
    async _asFeatureCollection(db_view, recs) {
        const features = await this.featuresFromRecs(recs, db_view.delta, {
            displayValues: true
        });

        return { type: 'MywFeatureCollection', features: features };
    }
}

export default MywcomStructureController;
