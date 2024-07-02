import myw from 'myWorld-native-services';
import MywcomFeatureController from '../controllers/MywcomFeatureController';

/**
 * Adds methods for running Comms feature services
 */
// Required because cannot use modulePost() etc with MywcomFeatureController (as is subclass of core MywcomFeatureController)
// ENH: Add Core support for server-side triggers and remove this
// Cut-and-paste from Core NativeServer in order to override URL
// ENH: Extend core methods to accept URLs?
const commsNativeServerExtension = {
    async commsInsertFeature(featureName, insertData, update = false) {
        const db_view = this._db.view(this.delta);
        const controller = new MywcomFeatureController(db_view);
        const { res, table } = await controller.insertFeature(featureName, insertData, update);
        if (table.isTrackingChanges()) {
            this._trackedFeatureChanged();
        }
        return res;
    },

    async commsUpdateFeature(featureName, featureId, updateData, handleError) {
        const db_view = this._db.view(this.delta);
        const controller = new MywcomFeatureController(db_view);
        const { res, table } = await controller.updateFeature(
            featureName,
            featureId,
            updateData,
            handleError
        );
        if (table.isTrackingChanges()) {
            this._trackedFeatureChanged();
        }
        return res;
    },

    async commsDeleteFeature(tableName, recordId) {
        const db_view = this._db.view(this.delta);
        const controller = new MywcomFeatureController(db_view);
        const { res, table } = await controller.deleteFeature(tableName, recordId);
        if (table.isTrackingChanges()) {
            this._trackedFeatureChanged();
        }
        return res;
    },

    async commsRunTransaction(transactions) {
        const db_view = this._db.view(this.delta);
        const controller = new MywcomFeatureController(db_view);
        const result = await controller.runTransaction(transactions);
        if (result.changedTableBeingTracked) this._trackedFeatureChanged();
        return { ids: result.ids };
    }
};

Object.assign(myw.NativeServer.prototype, commsNativeServerExtension);
