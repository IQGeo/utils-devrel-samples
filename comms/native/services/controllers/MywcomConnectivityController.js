//#############################################################################
// Controller for managing connection records
//##############################################################################
// Copyright: IQGeo Limited 2010-2023

import PinRange from '../api/PinRange';
import ConnSet from '../api/ConnSet';

import MywcomController from './MywcomController';
import { Reference, NetworkEngine } from 'myWorld-native-services';

/**
 * Controller for managing access to connection records
 */
/*eslint-disable no-await-in-loop*/
class MywcomConnectivityController extends MywcomController {
    /**
     * Initialize slots of self
     */
    constructor(database) {
        super(database);
    }

    // ==============================================================================
    //                               PIN TREE ACCESS
    // ==============================================================================

    //@view_config(route_name='mywcom_connectivity_controller.connections', request_method='GET', renderer='json')
    //@handling_exceptions
    /**
     * Returns pins on SIDE of FEATURE (with their connections)
     *
     * Returns:
     *  CONNECTIONS  a tree of connection points
     *  FEATURES     features referenced by urns in CONNECTIONS (list keyed by URN)
     */
    async connections(routeParams, params) {
        const tech = routeParams.tech;
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const side = routeParams.side;
        const delta = params.delta;

        // Get feature record
        const db_view = this.db.view(delta);
        const feature_rec = await this.featureRec(db_view, feature_type, id);

        // Get connection points
        const conn_set = new ConnSet(feature_rec, tech, side);
        await conn_set.complete();

        return { conns: await conn_set.definition() };
    }

    // ==============================================================================
    //                               CONNECT / DISCONNECT
    // ==============================================================================

    //@view_config(route_name='mywcom_connectivity_controller.connect', request_method='POST', renderer='json')
    /**
     * Connect a pair of objects in network TECH
     *
     * Returns connection record created
     */
    async connect(routeParams, params) {
        return this.runInTransaction(() => this._connect(routeParams, params));
    }

    async _connect(routeParams, params) {
        // Unpick parameters
        const tech = routeParams.tech;
        const fr_ref = Reference.parseUrn(params.from);
        const to_ref = Reference.parseUrn(params.to);
        const housing_ref = Reference.parseUrn(params.housing);
        const delta = params.delta;

        // Get managers
        const db_view = this.db.view(delta);
        const nw_view = this.networkView(db_view);
        const conduit_mgr = nw_view.conduit_mgr;
        const conn_mgr = nw_view.connection_mgr;

        // Get features to connect
        const fr_feature = await this.featureRec(db_view, fr_ref.feature_type, fr_ref.id);
        const to_feature = await this.featureRec(db_view, to_ref.feature_type, to_ref.id);
        const housing = await this.featureRec(db_view, housing_ref.feature_type, housing_ref.id);

        // Get pins to connect
        const fr_pins = await PinRange.parse(fr_ref.qualifiers['pins']);
        const to_pins = await PinRange.parse(to_ref.qualifiers['pins']);

        // Get structure we are connecting in
        let struct = housing;
        if (housing.properties.root_housing) {
            struct = await housing.followRef('root_housing');
        }

        // Check not in continuous conduit
        await conduit_mgr._assertCanConnectAt(fr_feature, struct);
        await conduit_mgr._assertCanConnectAt(to_feature, struct);

        // Make connection
        const conn_rec = await conn_mgr.connect(
            tech,
            housing,
            fr_feature,
            fr_pins,
            to_feature,
            to_pins
        );
        // }

        return conn_rec;
    }

    //@view_config(route_name='mywcom_connectivity_controller.disconnect', request_method='POST', renderer='json')
    /**
     * Disconnect port or splice in network TECH
     */
    async disconnect(routeParams, params) {
        return this.runInTransaction(() => this._disconnect(routeParams, params));
    }

    async _disconnect(routeParams, params) {
        // Unpick Parameters
        const tech = routeParams.tech;
        const ref = Reference.parseUrn(params.pins);
        const delta = params.delta;

        const pin_range_str = ref.qualifiers['pins'];
        if (!pin_range_str) {
            console.log('Disconnect: Missing pin range:', ref);
            throw new Error(400); // TODO: Raise condition
        }
        const pins = PinRange.parse(pin_range_str);

        // Get Manager
        const db_view = this.db.view(delta);
        const conn_mgr = this.networkView(db_view).connection_mgr;

        // Find feature
        const feature_rec = await this.featureRec(db_view, ref.feature_type, ref.id);

        // Do disconnect
        await conn_mgr.disconnect(tech, feature_rec, pins);

        return {};
    }

    // ==============================================================================
    //                                    PIN INFO
    // ==============================================================================

    //@view_config(route_name='mywcom_connectivity_controller.paths', request_method='GET', renderer='json')
    //@handling_exceptions
    /**
     * Find paths for pins of feature ID
     *
     * Returns a list of path objects, keyed by pin number
     */
    async paths(routeParams, params) {
        // Unpick params
        const feature_type = routeParams.feature_type;
        const tech = routeParams.tech;
        const id = routeParams.id;
        const pins_spec = params.pins;
        const full = params.full;
        const delta = params.delta;

        const pins = PinRange.parse(pins_spec);

        // Get Manager
        const db_view = this.db.view(delta);
        const conn_mgr = this.networkView(db_view).connection_mgr;

        // Check feature record exists
        const ftr = await this.featureRec(db_view, feature_type, id);

        //Create engine
        const network = conn_mgr.nw_view.networks[tech];

        const networkRec = await this.db.cachedTable('network').get(network.network_name);
        await networkRec.setFeatureItems();

        const network_engine = NetworkEngine.newFor(db_view, networkRec);

        // Find upstream and downstream paths
        const upstreamTraceResult = await network_engine.traceOutRaw(ftr, pins, 'upstream');
        const in_trace_pins = upstreamTraceResult.root.terminations();

        const downstreamTraceResult = await network_engine.traceOutRaw(ftr, pins, 'downstream');
        const out_trace_pins = downstreamTraceResult.root.terminations();

        // Build result
        const res = {};
        for (const pin of pins.range()) {
            res[pin] = {
                in: await in_trace_pins[pin].definition(full),
                out: await out_trace_pins[pin].definition(full)
            };
        }

        return res;
    }

    //@view_config(route_name='mywcom_connectivity_controller.circuits', request_method='GET', renderer='json')
    //@handling_exceptions
    /**
     * Find circuits running on a given set of pins
     *
     * Returns list of lists of circuit infos, keyed by pin number
     */
    async circuits(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;
        const delta = params.delta;
        const pins_spec = params.pins;
        const include_proposed = params.include_proposed;

        const pins = PinRange.parse(pins_spec);

        // Get manager
        const db_view = this.db.view(delta);
        const circuit_mgr = this.networkView(db_view).circuit_mgr;

        // Get feature record
        // db_view = utils(db_view); // ENH
        const ftr_rec = await this.featureRec(db_view, feature_type, id);

        // Get circuits
        const circuits = await circuit_mgr.circuitsOn(ftr_rec, pins, true, include_proposed);

        // Serialise them
        const circuit_infos = {};
        for (const [pin, pin_circuits] of Object.entries(circuits)) {
            circuit_infos[pin] = await this.circuitInfoFor(pin_circuits, db_view.delta);
        }

        return { circuits: circuit_infos };
    }

    /**
     * Convert circuit records CIRCUITS to JSON-serialisable form
     *
     * Excludes geometry etc to reduce data volume. DELTA is for handling proposed circuits
     *
     * Returns a list of dicts
     */
    async circuitInfoFor(circuits, delta) {
        // Serialise (seleced properties only)
        let infos = [];
        for (const circuit of circuits) {
            // Get basic info
            const info = { name: circuit.myw.title, urn: circuit.getUrn() };

            // If proposed .. add delta info
            if (circuit.myw.delta && circuit.myw.delta !== delta) {
                info['delta'] = {
                    name: circuit.myw.delta,
                    title: await this._deltaOwnerTitle(circuit)
                };
            }

            infos.push(info);
        }

        // Sort (just to keep tests stable)
        infos.sort((a, b) => (a.urn > b.urn ? 1 : -1));

        return infos;
    }
}

export default MywcomConnectivityController;
