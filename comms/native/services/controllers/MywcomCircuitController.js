//##############################################################################
// Controller for managing circuit records
//##############################################################################
// Copyright: IQGeo Limited 2010-2023

//import json
//import view_config from 'pyramid.view'
import { mywAbort } from 'myWorld-native-services';
//import {Session} from 'myWorld-native-services'
import PinRange from '../api/PinRange';

//import handling_exceptions from './Utils'
import MywcomController from './MywcomController';

/**
 * Controller for managing access to circuit records
 */
class MywcomCircuitController extends MywcomController {
    /**
     * Initialize slots of self
     */
    constructor(request) {
        super(request, 'CIRCUIT');
    }

    // ==============================================================================
    //                                   ROUTING
    // ==============================================================================

    //@view_config(route_name='mywcom_circuit_controller.route_circuit', request_method='POST', renderer='json')
    /**
     * Route circuit ID to given termination pins
     */
    async route_circuit(routeParams, params) {
        return this.runInTransaction(() => this._route_circuit(routeParams, params));
    }

    async _route_circuit(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const delta = params.delta;
        const tech = routeParams.tech || 'fiber';

        // Get manager
        const db_view = this.db.view(delta);
        const circuit_mgr = this.networkView(db_view).circuit_mgr;

        // Find circuit
        const circuit = await this.featureRec(db_view, feature_type, id);

        // Find termination info
        const out_feature = await circuit.followRef('out_feature');
        const out_pins = PinRange.parse(circuit.properties.out_pins);

        // Unroute the circuit
        await circuit_mgr.unroute(circuit, tech);

        // Route the circuit
        const in_node = await circuit_mgr.findPathTo(out_feature, out_pins, tech);

        if (!in_node) {
            const params = { bad_path: true };
            throw mywAbort('bad_circuit_path', params);
        }

        await circuit_mgr.route(circuit, in_node);
        return { circuit: await circuit.asGeojsonFeature(false) };
    }

    // @view_config(route_name='mywcom_circuit_controller.unroute_circuit', request_method='POST', renderer='json')
    /**
     * Unroute circuit ID by deleting all of its segments
     */
    async unroute_circuit(routeParams, params) {
        return this.runInTransaction(() => this._unroute_circuit(routeParams, params));
    }

    async _unroute_circuit(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const delta = params.delta;
        const tech = routeParams.tech || 'fiber';

        // Get manager
        const db_view = this.db.view(delta);
        const circuit_mgr = this.networkView(db_view).circuit_mgr;

        // Find circuit
        const circuit = await this.featureRec(db_view, feature_type, id);

        // Unroute the circuit
        await circuit_mgr.unroute(circuit, tech);

        // Return updated circuit object
        return { circuit: await circuit.asGeojsonFeature(false) };
    }
}

export default MywcomCircuitController;
