//import {MywError} from 'myWorld-native-services'
import myw from 'myWorld-native-services';
import ProgressHandler from '../base/ProgressHandler';
import NetworkView from '../api/NetworkView';

/**
 * Controller for Comms feature routings
 *
 * Runs Comms triggers when features are inserted/updated/deleted
 */
/*eslint-disable no-await-in-loop*/
class MywcomFeatureController extends myw.FeatureController {
    // ------------------------------------------------------------------------------
    //                              SUBCLASSED METHODS
    // ------------------------------------------------------------------------------
    // These are cut-and-paste from Core

    // NATIVE: These are not required on native app
    // // Prevent route end points from returning 404 not found errors
    // //@view_config(route_name='mywcom_feature_controller.transaction', request_method='POST', renderer='json')
    // transaction() {
    //     return MywFeatureController.prototype.transaction.call(this);
    // },

    // //@view_config(route_name='mywcom_feature_controller.insert', request_method='POST', renderer='json')
    // create() {
    //     return MywFeatureController.prototype.create.call(this);
    // },

    // //@view_config(route_name='mywcom_feature_controller.update_delete', request_method='PUT', renderer='json')
    // update() {
    //     return MywFeatureController.prototype.update.call(this);
    // },

    // //@view_config(route_name='mywcom_feature_controller.update_delete', request_method='DELETE')
    // delete() {
    //     return MywFeatureController.prototype.delete.call(this);
    // },
    // NATIVE: END

    /**
     * Insert a feature into a table (running comms triggers)
     * @param  {string}   featureName
     * @param  {object}   insertData
     */
    insertFeature(featureName, insertData, update) {
        return this.runInTransaction(async () => {
            const table = this.view.table(featureName);
            await table.initialized;
            const keyFieldName = table.featureDef.key_name;
            const keyFieldDef = table.featureDef.fields[keyFieldName];
            const isFeature = typeof insertData.properties == 'object';

            //Get supplied key (if there is one)
            let key = isFeature ? insertData.properties[keyFieldName] : insertData[keyFieldName];

            //Ignore supplied key for generated keys (to avoid messing up sequences)
            if (key && keyFieldDef.generator) {
                if (isFeature) delete insertData.properties[keyFieldName];
                else delete insertData[keyFieldName];
                key = undefined;
            }

            //Check for already exists
            let rec;
            if (key) rec = await table.get(key);

            if (rec && !update) throw new myw.DuplicateKeyError();

            // Do action
            let id;
            if (rec) {
                await table.update(key, insertData, false);
                id = key;
            } else {
                id = await this.commsInsert(table, insertData);
            }

            return { res: id, table };
        });
    }

    /**
     * Update a feature in a table
     * @param  {string}   tableName  [description]
     * @param  {string}   featureId
     * @param  {object}   updateData
     * @param  {boolean}   [ignoreFailure=true]
     */
    updateFeature(featureName, featureId, updateData, ignoreFailure = true) {
        return this.runInTransaction(async () => {
            const table = this.view.table(featureName);
            await this.commsUpdate(table, featureId, updateData, ignoreFailure);

            return { res: true, table };
        });
    }

    /**
     * Delete a feature by its id
     * @param  {string}   tableName
     * @param  {string}   recordId
     */
    deleteFeature(tableName, recordId) {
        return this.runInTransaction(async () => {
            const table = this.view.table(tableName);
            await this.commsDelete(table, recordId);
            return { res: true, table }; // Success
        });
    }

    async _runTransaction(transactions) {
        //TODO: Run in write lock
        let changedTableBeingTracked = false;
        //run sql sequentially since otherwise updates are not detected in jsqlite database
        //and invalid values are returned

        const recs = [];
        const ids = [];

        for (const transactionItem of transactions) {
            const featureData = transactionItem[2];
            const properties = featureData.properties;
            const table = this.view.table(transactionItem[1]);
            let key;
            await table.initialized;

            this._substitutePlaceholders(table, featureData, recs);

            if (table.isTrackingChanges) changedTableBeingTracked = true;
            if (transactionItem[0] == 'insert') {
                const id = await this.commsInsert(table, featureData);
                recs.push(await table.get(id));
                ids.push(isNaN(id) ? id : parseInt(id));
            } else if (transactionItem[0] == 'update') {
                key = properties[table.key_name];
                const result = await this.commsUpdate(table, key, featureData, false);
                if (result) {
                    recs.push(await table.get(key));
                    ids.push(key);
                }
            } else if (transactionItem[0] == 'delete' || transactionItem[0] == 'deleteIfExists') {
                const ignoreFailure = 'deleteIfExists' === transactionItem[0];
                key = properties[table.key_name];
                recs.push[null];
                if (
                    transactionItem[0] == 'delete' &&
                    (await this.commsDelete(table, key, ignoreFailure))
                ) {
                    ids.push(key);
                    continue;
                }
                ids.push('');
            }
        }

        return {
            ids,
            changedTableBeingTracked
        };
    }

    // ------------------------------------------------------------------------------
    //                                  TRIGGERS
    // ------------------------------------------------------------------------------

    /**
     * Insert 'feature', running triggers
     */
    async commsInsert(table, insertData) {
        const nw_view = this.comms_nw_view(table.db);

        // ENH: Avoid need for this (use detached record instead)
        insertData.getType = function () {
            return table.featureName;
        };

        // Run pre-insert trigger
        await nw_view.runPreInsertTriggers(insertData);

        // Insert record
        const id = await table.insert(insertData);

        // Run post-insert trigger
        const rec = await table.get(id);
        await nw_view.runPosInsertTriggers(rec);

        return id;
    }

    /**
     * Update 'rec', running triggers
     */
    async commsUpdate(table, id, updateData, ignoreFailure) {
        const nw_view = this.comms_nw_view(table.db);

        // Get original state (for trigger)
        const orig_rec = await table.get(id);

        // Update record
        await table.update(id, updateData, ignoreFailure);

        // Run post-update trigger
        const rec = await table.get(id);
        await nw_view.runPosUpdateTriggers(rec, orig_rec);

        return rec;
    }

    /**
     * Perform pre-delete actions
     */
    async commsDelete(table, id) {
        const nw_view = this.comms_nw_view(table.db);

        // Run pre-delete trigger
        const rec = await table.get(id);
        if (rec) await nw_view.runPreDeleteTriggers(rec);

        // Delete record
        const res = await table.delete(id);

        return res;
    }

    /**
     * Returns a NetworkView
     */
    comms_nw_view(db) {
        if (!this._comms_nw_view) {
            const db_view = this.view;
            const progress = ProgressHandler.newFor('comms.controllers');
            this._comms_nw_view = new NetworkView(db_view, progress);
        }

        return this._comms_nw_view;
    }

    /**
     * Runs asynchronous function 'func' inside a database transaction
     *
     * Used to avoid creation of broken data. Also provides interlock with sync uploads
     */
    // ENH: Change Core modulePut etc to do this automatically
    // ENH: Copied from MywcomController.js
    async runInTransaction(func) {
        return this.view.runWithinWriteLock(async () => {
            await this.view.db.beginTransaction();
            try {
                const ret = await func();
                await this.view.commit();
                return ret;
            } catch (error) {
                await this.view.rollback();
                throw error;
            }
        });
    }
}

export default MywcomFeatureController;
