//##############################################################################
// Superclass Mywcomcontroller for comms
//##############################################################################
// Copyright: IQGeo Limited 2010-2023

import ProgressHandler from '../base/ProgressHandler';
import NetworkView from '../api/NetworkView';
import myw, { MywClass } from 'myWorld-base';

/**
 * Superclass for comms controllers
 */
/*eslint-disable no-await-in-loop*/
class MywcomController extends MywClass {
    // ==============================================================================
    //                                CONSTRUCTION
    // ==============================================================================

    /**
     * Initialize slots of self
     */
    constructor(view) {
        super();
        // ENH: Find a way to inherit from BaseController and remove these
        this.db = view.db;
        this.dd = view.dd;
        this.currentUser = this.dd.currentUser;

        this.progress = ProgressHandler.newFor('comms.controllers');
    }

    // ==============================================================================
    //                               HELPERS
    // ==============================================================================

    /**
     * Build list of string from comma-separated URL param 'str'
     */
    stringsFrom(str) {
        if (!str || str == '') return undefined;

        return str.split(',');
    }

    /**
     * Build list of coords from comma-separated URL param 'str'
     */
    coordsFrom(str) {
        if (!str) return undefined;

        const xy_strs = str.split(',');
        const coords = [];
        let i = 0;
        while (i < xy_strs.length) {
            const x = parseFloat(xy_strs[i++]);
            const y = parseFloat(xy_strs[i++]);
            coords.push([x, y]);
        }

        return coords;
    }

    /**
     * Build polygon from coordinate pair 'bounds'
     */
    polygonFromBounds(bounds) {
        // ENH: Check for exacty 2 coords
        // ENH: Implement Bounds object

        return myw.geometry.Polygon([
            [
                [bounds[0][0], bounds[0][1]],
                [bounds[0][0], bounds[1][1]],
                [bounds[1][0], bounds[1][1]],
                [bounds[1][0], bounds[0][1]],
                [bounds[0][0], bounds[0][1]]
            ]
        ]);
    }

    /**
     * Runs asynchronous function 'func' inside a database transaction
     *
     * Used to avoid creation of broken data. Also provides interlock with sync uploads
     */
    // ENH: Change Core modulePut etc to do this automatically
    async runInTransaction(func) {
        return this.db.runWithinWriteLock(async () => {
            await this.db.beginTransaction();
            try {
                const ret = await func();
                await this.db.commit();
                return ret;
            } catch (error) {
                await this.db.rollback();
                throw error;
            }
        });
    }

    /**
     * Gets feature record (or aborts)
     */
    async featureRec(db_view, feature_type, id) {
        const urn = feature_type + '/' + id;
        const feature_rec = await db_view.get(urn);

        if (!feature_rec) {
            throw new myw.ObjectNotFoundError();
        }

        return feature_rec;
    }

    /**
     * Returns FEATURE_RECS as a list of GeoJSON features
     *
     * Optional FIELDS specified the attributes to encode (default: all )
     *
     * CURRENT_DELTA - if specified then any records from other deltas will have delta title information added
     */
    async featuresFromRecs(feature_recs, current_delta = null, options) {
        const check_delta = !!current_delta;

        const features = {};

        for (const feature_rec of feature_recs) {
            const feature = await feature_rec.asGeojsonFeature(options);
            features[feature_rec.getUrn()] = feature;

            if (check_delta && feature_rec.myw.delta != current_delta) {
                feature.myw.delta_owner_title = await this._deltaOwnerTitle(feature);
            }
        }

        return Object.values(features);
    }

    /**
     * Returns delta owner title for REC
     */
    async _deltaOwnerTitle(rec) {
        if (!rec.myw.delta) {
            return undefined;
        }

        const delta_owner = await this.db.dd.getFeatureByUrn(rec.myw.delta);
        const delta_owner_title = delta_owner
            ? delta_owner.myw.title
            : 'Bad reference: ' + rec.myw_delta;

        return delta_owner_title;
    }

    /**
     * Returns network view
     */
    networkView(db_view) {
        return new NetworkView(db_view, this.progress);
    }
}

export default MywcomController;
