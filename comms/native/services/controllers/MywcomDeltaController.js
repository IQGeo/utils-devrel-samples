//##############################################################################
// Controller for managing versioned data
//##############################################################################
// Copyright: IQGeo Limited 2010-2023

import DeltaManager from '../validation/DeltaManager';

import MywcomController from './MywcomController';
import DataValidator from '../validation/DataValidator';

import myw from 'myWorld-base';

/**
 * Controller for managing versioned data
 */
class MywcomDeltaController extends MywcomController {
    /**
     * Initialize slots of self
     */
    constructor(request) {
        super(request, 'DELTA');
    }

    //@view_config(route_name='mywcom_delta_controller.changes', request_method='GET', renderer='json')
    /**
     * Returns feature changes in FEATURE_TYPE/ID
     */
    async changes(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = decodeURIComponent(routeParams.id);
        const change_types = this.stringsFrom(params.change_types);
        const bounds = this.coordsFrom(params.bounds);
        const feature_types = this.stringsFrom(params.feature_types);
        const limit = params.limit;

        const query_limit = limit ? limit + 1 : undefined;

        let bounds_poly = undefined;
        if (bounds) {
            bounds_poly = myw.geometry.Polygon([
                [
                    [bounds[0][0], bounds[0][1]],
                    [bounds[0][0], bounds[1][1]],
                    [bounds[1][0], bounds[1][1]],
                    [bounds[1][0], bounds[0][1]],
                    [bounds[0][0], bounds[0][1]]
                ]
            ]);
        }

        const delta = feature_type + '/' + id;

        // Get view
        const db_view = this.db.view(delta); // ENH: Use ReadonlyFeatureView  (for performance)

        // Find changes
        const engine = new DeltaManager(db_view, this.progress);
        const changes = await engine.changes(feature_types, change_types, bounds_poly, query_limit);

        // Check to see if we have truncated result
        let truncated = false;
        if (limit && changes.length > limit) {
            changes.pop();
            truncated = true;
        }

        // Build result
        const res = [];
        for (const change of changes) {
            res.push(change.definition());
        }

        if (truncated) {
            return { changes: res, truncated: truncated };
        } else {
            return { changes: res };
        }
    }

    //@view_config(route_name='mywcom_delta_controller.conflicts', request_method='GET', renderer='json')
    /**
     * Return ifno for records of FEATURE_TYPE that are in conflict with master
     */
    //ENH: Support feature types, aspects, session vars, change_type etc?
    async conflicts(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = decodeURIComponent(routeParams.id);
        const bounds = this.coordsFrom(params.bounds);
        const categories = this.stringsFrom(params.categories);

        let bounds_poly = undefined;
        if (bounds) {
            bounds_poly = myw.geometry.Polygon([
                [
                    [bounds[0][0], bounds[0][1]],
                    [bounds[0][0], bounds[1][1]],
                    [bounds[1][0], bounds[1][1]],
                    [bounds[1][0], bounds[0][1]],
                    [bounds[0][0], bounds[0][1]]
                ]
            ]);
        }

        const delta = feature_type + '/' + id;

        // Get view
        const db_view = this.db.view(delta); // ENH: Use ReadonlyFeatureView  (for performance)

        const engine = new DeltaManager(db_view, this.progress);
        const conflicts = await engine.conflicts(bounds_poly, categories);

        const res = {};
        for (const [ft, ft_conflicts] of Object.entries(conflicts)) {
            const ft_res = (res[ft] = {});
            for (const [id, conflict] of Object.entries(ft_conflicts)) {
                ft_res[id] = conflict.definition();
            }
        }

        return { conflicts: res };
    }

    //@view_config(route_name='mywcom_delta_controller.validate', request_method='GET', renderer='json')
    /**
     * Find geometry of objects in delta FEATURE_TYPE/ID
     *
     * Returns conflict objects
     */
    async validate(routeParams, params) {
        // Unpick args
        const feature_type = routeParams.feature_type;
        const id = decodeURIComponent(routeParams.id);
        const bounds = this.coordsFrom(params.bounds);
        const categories = this.stringsFrom(params.categories);
        const max_errors = params.max_errors;

        const delta = feature_type + '/' + id;

        let bounds_poly = undefined;
        if (bounds) {
            bounds_poly = this.polygonFromBounds(bounds);
        }

        // Find integrity problems
        const db_view = this.db.view(delta); // ENH: Use ReadonlyFeatureView  (for performance)
        const engine = new DeltaManager(db_view, this.progress);
        const errors = await engine.validate(bounds_poly, categories, max_errors);

        // Build result
        const res = {};
        for (const [feature_urn, errors_by_field] of Object.entries(errors)) {
            res[feature_urn] = {};
            for (const [field_name, error] of Object.entries(errors_by_field)) {
                res[feature_urn][field_name] = error.definition();
            }
        }
        return { errors: res };
    }

    //@view_config(route_name='mywcom_delta_controller.validate_area', request_method='GET', renderer='json')
    /**
     * Find broken objects
     *
     * Returns integrity error objects
     */
    // ENH: Move to better controller
    async validate_area(routeParams, params) {
        // Unpick args
        const delta = decodeURIComponent(params.delta);
        const bounds = this.coordsFrom(params.bounds);
        const categories = this.stringsFrom(params.categories);

        // Build polygon
        const poly = this.polygonFromBounds(bounds);

        // Find integrity problems
        const db_view = this.db.view(delta); // ENH: Use ReadonlyFeatureView  (for performance)
        const engine = new DataValidator(db_view, poly, this.progress);
        let errors = await engine.run(categories);

        // Build result
        const res = {};
        for (const [feature_urn, errors_by_field] of Object.entries(errors)) {
            res[feature_urn] = {};
            for (const [field_name, error] of Object.entries(errors_by_field)) {
                res[feature_urn][field_name] = error.definition();
            }
        }

        return { errors: res };
    }

    //@view_config(route_name='mywcom_delta_controller.merge_feature', request_method='POST', renderer='json')
    /**
     * Auto-resolve integrity errors and conflicts in delta FEATURE_TYPE/ID
     *
     * Returns features updated
     */
    merge_feature() {
        // Unpick args
        const feature_type = this.get_param(this.request, 'feature_type');
        const id = this.get_param(this.request, 'id');

        const delta = '/'.join([feature_type, id]);

        // Check authorised
        this.current_user.assertAuthorized(
            this.request,
            /*feature_type=*/ feature_type,
            /*right=*/ 'editFeatures',
            /*application=*/ this.get_param(this.request, 'application')
        );

        // Check delta is accessible to user (taking filters into account)
        /*eslint-disable no-undef*/
        const delta_owner = this.db.view()[delta] || false;
        if (!delta_owner) {
            throw exc.HTTPForbidden(); // TODO: find javascript equivelant
        }
        /*eslint-enable no-undef*/

        // Apply auto-resolution and fixup
        const engine = new DeltaManager(this.db.view(delta), this.progress);
        const changes = engine.merge();
        this.db.commit();

        // Build result
        let res = [];
        for (const change of changes) {
            res.push(change.definition());
        }

        return { changes: res };
    }

    // @view_config(route_name='mywcom_delta_controller.revert_feature', request_method='POST', renderer='json')
    // @handling_exceptions
    /**
     *  Set delta record to base
     */
    async revert_feature(routeParams, params) {
        return this.runInTransaction(() => this._revert_feature(routeParams, params));
    }

    async _revert_feature(routeParams, params) {
        //Unpick args
        let delta_owner = routeParams.delta_owner;
        const delta_id = decodeURIComponent(routeParams.delta_id);
        const feature_type = routeParams.feature_type;
        const feature_id = routeParams.feature_id;

        const delta = [delta_owner, delta_id].join('/');
        const db_view = this.db.view(delta);

        //Check delta is accessible to user (taking filters into account)
        delta_owner = await db_view.get(delta, false);
        if (!delta_owner) throw new Error(403); //exc.HTTPForbidden()
        const table = await db_view.table(feature_type);
        let delta_rec = await table.get(feature_id);
        const base_rec = await table._baseRec(feature_id);

        if (!delta_rec) {
            if (!base_rec) throw new Error(400); // Trying to revert a feature that has no base rec
            // delta_rec deleted in delta
            delta_rec = base_rec;
        }

        //Apply auto-resolution and fixup
        const engine = new DeltaManager(db_view, this.progress);
        await engine.revert(delta_rec);

        return { status: 200 };
    }

    //@view_config(route_name="mywcom_delta_controller.rebase_feature", request_method="POST", renderer="json")
    //@handling_exceptions
    /**
     *  Set delta record to base
     */
    async rebase_feature(routeParams, params) {
        return this.runInTransaction(() => this._rebase_feature(routeParams, params));
    }

    async _rebase_feature(routeParams, params) {
        //Unpick args
        let delta_owner = routeParams.delta_owner;
        const delta_id = decodeURIComponent(routeParams.delta_id);
        const feature_type = routeParams.feature_type;
        const feature_id = routeParams.feature_id;

        const delta = [delta_owner, delta_id].join('/');
        const db_view = this.db.view(delta);

        //Check delta is accessible to user (taking filters into account)
        delta_owner = await db_view.get(delta, false);
        if (!delta_owner) throw new Error(403); //exc.HTTPForbidden()
        const table = await db_view.table(feature_type);
        let delta_rec = await table.get(feature_id);
        const base_rec = await table._baseRec(feature_id);

        if (!delta_rec) {
            if (!base_rec) throw new Error(400); // Trying to revert a feature that has no base rec
            // delta_rec deleted in delta
            delta_rec = base_rec;
        }

        // Rebase
        const engine = new DeltaManager(db_view, this.progress);
        await engine.rebase(delta_rec);

        return { status: 200 };
    }

    /**
     * Controller end point for returning bounds of delta.
     * @param {Object} routeParams
     * @returns {Object} bounds of delta
     */
    async bounds(routeParams) {
        const feature_type = routeParams.feature_type;
        const id = decodeURIComponent(routeParams.id);

        const delta = [feature_type, id].join('/');
        const db_view = this.db.view(delta);

        const engine = new DeltaManager(db_view, this.progress);
        const bounds = await engine.bounds();

        return bounds;
    }
}

export default MywcomDeltaController;
