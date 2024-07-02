// import view_config from 'pyramid.view';

// import { Session, MywFeatureCollection } from 'myWorld-native-services';
import LOCManager from '../api/LocManager';
import NetworkView from '../api/NetworkView';
import MywcomController from './MywcomController';

/**
 * Tracing logic in this class is based on the NM show terminations code
 */
class MywcomLocController extends MywcomController {
    async ripple_trace(routeParams, params) {
        return this.runInTransaction(async () => this._ripple_trace(routeParams, params));
    }

    async _ripple_trace(routeParams, params) {
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;

        const do_update = params.do_update;
        const delta = params.delta;
        const side = params.side;
        const config = JSON.parse(params.config);

        const db_view = this.db.view(delta);
        const nw_view = new NetworkView(db_view);
        const loc_mgr = new LOCManager(nw_view);

        const result = await loc_mgr.rippleTrace(feature_type, id, side, config);

        // Update loc segment records along the trace if requested
        if (do_update) {
            const feature = await db_view.get(`${feature_type}/${id}`);
            await loc_mgr.rippleUpdate(result, feature, side);
        }

        return result;
    }

    async ripple_trace_update(routeParams, params) {
        return this.runInTransaction(async () => this._ripple_trace_update(routeParams, params));
    }

    async _ripple_trace_update(routeParams, params) {
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;

        const delta = params.delta;
        const side = params.side;

        const db_view = this.db.view(delta);
        const nw_view = new NetworkView(db_view);
        const loc_mgr = new LOCManager(nw_view);

        const result = await loc_mgr.rippleTrace(feature_type, id, side);

        const feature = await db_view.get(`${feature_type}/${id}`);
        await loc_mgr.rippleUpdate(result, feature, side);

        return result;
    }

    async get_loc(routeParams, params) {
        const delta = params.delta;
        const feature_qurns = JSON.parse(params.urns);
        const include_proposed = params.include_proposed;

        const db_view = this.db.view(delta);
        const nw_view = new NetworkView(db_view);
        const loc_mgr = new LOCManager(nw_view);

        const loc_data = await loc_mgr.getLocMany(feature_qurns, { include_proposed });

        return loc_data;
    }

    async get_loc_details(routeParams, params) {
        const delta = params.delta;
        const feature_qurns = JSON.parse(params.urns);
        const include_proposed = params.include_proposed;

        const db_view = this.db.view(delta);
        const nw_view = new NetworkView(db_view);
        const loc_mgr = new LOCManager(nw_view);

        const loc_data = await loc_mgr.getLocDetailsMany(feature_qurns, include_proposed);

        return loc_data;
    }

    async update_loc(routeParams, params) {
        return this.runInTransaction(async () => this._update_loc(routeParams, params));
    }

    async _update_loc(routeParams, params) {
        const delta = params.delta;
        const feature_loc_json = params.feature_loc;

        const db_view = this.db.view(delta);
        const nw_view = new NetworkView(db_view);
        const loc_mgr = new LOCManager(nw_view);

        const feature_loc = JSON.parse(feature_loc_json);
        const mark_stale = params.mark_stale;

        await loc_mgr.updateLocMany(feature_loc, mark_stale);

        const feature_qurns = Object.keys(feature_loc);

        const update_loc_data = await loc_mgr.getLocMany(feature_qurns);

        return update_loc_data;
    }

    async ripple_deletions(routeParams, params) {
        return this.runInTransaction(async () => this._ripple_deletions(routeParams, params));
    }

    async _ripple_deletions(routeParams, params) {
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;

        const delta = params.delta;
        const side = params.side;

        const db_view = this.db.view(delta);
        const nw_view = new NetworkView(db_view);
        const loc_mgr = new LOCManager(nw_view);

        const feature = await db_view.get(`${feature_type}/${id}`);

        const updates = await loc_mgr.rippleDeletions(feature, side);

        return { update: updates };
    }

    async disconnect_loc(routeParams, params) {
        return this.runInTransaction(async () => this._disconnect_loc(routeParams, params));
    }

    async _disconnect_loc(routeParams, params) {
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;

        const side = params.side;
        const ripple = params.ripple;
        const delta = params.delta;

        const db_view = this.db.view(delta);
        const nw_view = new NetworkView(db_view);
        const loc_mgr = new LOCManager(nw_view);

        const feature = await db_view.get(`${feature_type}/${id}`);

        const result = await loc_mgr.disconnectLoc(feature, side, ripple);

        return result;
    }

    async connect_loc(routeParams, params) {
        return this.runInTransaction(async () => this._connect_loc(routeParams, params));
    }

    async _connect_loc(routeParams, params) {
        const feature_type = routeParams.feature_type;
        const id = routeParams.id;

        const side = params.side;
        const ripple = params.ripple;
        const delta = params.delta;

        const db_view = this.db.view(delta);
        const nw_view = new NetworkView(db_view);
        const loc_mgr = new LOCManager(nw_view);

        const feature = await db_view.get(`${feature_type}/${id}`);

        const result = await loc_mgr.connectLoc(feature, ripple);

        return result;
    }
}

export default MywcomLocController;
