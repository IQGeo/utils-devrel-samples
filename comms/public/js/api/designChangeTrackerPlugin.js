// Copyright: IQGeo Limited 2010-2023
import myw, { Predicate } from 'myWorld-client';
import _ from 'underscore';
import FeatureChange from 'modules/comms/js/validation/featureChange';

export default class DesignChangeTracker extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'DesignChangeTracker';
    }

    constructor(owner, options) {
        super(owner, options);

        this.changeDetailTable = (options && options.changeDetailTable) || 'mywcom_change_detail';

        this.app.ready.then(async () => {
            this.workflow = this.app.plugins.workflow;
            this.setEventHandlers();
        });
    }

    get datasource() {
        return this.workflow.ds;
    }

    /**
     * Setup event handler to listen to fiber connect and disconnect events
     * so that we can record changes to connections
     */
    setEventHandlers() {
        const connectionManager = this.app.plugins.connectionManager;
        this.stopListening(connectionManager);

        this.listenTo(connectionManager, 'connected', options => {
            this.handleConnectionChange(options, 'connected');
        });

        this.listenTo(connectionManager, 'disconnected', options => {
            this.handleConnectionChange(options, 'disconnected');
        });
    }

    /**
     * Handle disconnect and connect events.
     * ENH - Make the information we record in change record more informative
     * @param options
     * @param action
     */
    async handleConnectionChange(options, action) {
        const feature = options.conn ? options.conn : options.feature; // options.conn only appear on connection, not disconnect
        if (action == 'connected') {
            // ENH: create trackConnectionChange() to specifically handle connections.
            this.trackInsertChange(feature, feature.asGeoJson());
        } else {
            this.trackDisconnectChange(feature);
        }
    }

    /**
     * Get changes for delta and list of users making those changes.
     * @returns
     */
    async getUsersForChanges() {
        const delta = this.workflow.currentDeltaOwner.getUrn();
        const predicate = Predicate.eq('delta', delta);
        const userChanges = await this.datasource.getFeatures(this.changeDetailTable, {
            predicate
        });
        const users = _.map(userChanges, f => f.properties.change_user);
        return [_.uniq(users), userChanges];
    }

    /**
     * Set the current feature set to a list of features that users have changed in the design.
     */
    async userChanges(userList, userChanges) {
        userChanges = _.filter(userChanges, f => _.contains(userList, f.properties.change_user));
        return this.processUserChanges(userChanges);
    }

    /**
     * Process user changes and add to current feature set
     * @param {*} userChanges
     * @returns
     */
    async processUserChanges(userChanges) {
        if (userChanges.length == 0) {
            this.showMessage(this.msg('no_elements'));
            return;
        }
        const delta = this.workflow.currentDeltaOwner.getUrn();
        const featureUrns = _.map(userChanges, f => {
            return f.properties.feature;
        });
        const changedFeatures = await this.datasource.getFeaturesByUrn(featureUrns);

        // Convert userChanges to FeatureChange instances so that we get the same
        // behaviour as for the delta change set.

        const featureChanges = await Promise.all(
            userChanges.map(async changeItem => {
                let feature = _.find(
                    changedFeatures,
                    f => f.getUrn() == changeItem.properties.feature
                );
                const featureType = changeItem.properties.feature.split('/')[0];

                let originalFeatureJson;
                if (changeItem.properties.orig_feature) {
                    originalFeatureJson = JSON.parse(changeItem.properties.orig_feature);
                }

                if (!feature) {
                    feature = this.datasource._asFeature(originalFeatureJson, featureType);
                }

                let fields = [];
                if (changeItem.properties.fields) {
                    fields = JSON.parse(changeItem.properties.fields);
                }

                return this._featureChangeFrom(
                    changeItem,
                    fields,
                    featureType,
                    feature,
                    originalFeatureJson,
                    delta
                );
            })
        );

        this.app.setCurrentFeatureSet(featureChanges);
    }

    /**
     * Get full list of changes for delta
     * @param {string} delta
     * @returns
     */
    async _deltaChanges(delta) {
        const url = `modules / comms / delta / ${delta} /changes`;
        const data = {};
        const response = await this.datasource.comms.ds.moduleGet(url, data);
        await this.datasource.comms.ensureAllDDInfo(); // ENH: Just get the ones we need

        return response;
    }

    /**
     * Create FeatureChange instance from supplied information.
     * @param {string} changeType
     * @param {Array} changedFields
     * @param {string} featureType
     * @param {MywFeature} feature
     * @param {string} originalFeatureJson
     * @param {string} delta
     * @returns {FeatureChange}
     */
    _featureChangeFrom(
        changeItem,
        changedFields,
        featureType,
        feature,
        originalFeatureJson,
        delta
    ) {
        const changeType = changeItem.properties.change_type;

        let originalFeature;
        if (originalFeatureJson) {
            originalFeature = changeItem.datasource._asFeature(originalFeatureJson, featureType);
        }

        let featureChange = new FeatureChange(feature, originalFeature, changeType, changedFields);
        featureChange = featureChange.augmentFeature(feature);

        featureChange.myw_change_time = changeItem.properties.change_time;
        featureChange.myw_change_user = changeItem.properties.change_user;
        featureChange._myw.title = feature.getTitle();
        featureChange._myw.delta = delta;

        return featureChange;
    }

    /**
     * Set details on change record from supplied information
     *
     * @param {FeatureChange} changeFeature
     * @param {string} changeType
     * @param {MywFeature} feature
     * @param {MywFeature} originalFeature
     */
    _setChangeDetails(changeFeature, changeType, feature, originalFeature) {
        const delta = this.workflow.currentDeltaOwner.getUrn();

        const fields = [];
        if (originalFeature) {
            // Use originalFeature as this doesn't have calculated fields
            // and we are not interested in those.
            for (let prop in originalFeature.properties) {
                const value = originalFeature.properties[prop];
                if (!_.isEqual(value, feature.properties[prop])) {
                    fields.push(prop);
                }
            }

            if (!_.isEqual(originalFeature.geometry, feature.geometry)) {
                fields.push(feature.featureDD.primary_geom_name);
            }
        }

        changeFeature.properties.change_user = myw.currentUser.username;
        changeFeature.properties.change_time = new Date(Date.now());
        changeFeature.properties.feature = feature.getUrn();
        changeFeature.properties.delta = delta;
        changeFeature.properties.change_type = changeType;

        // Needed as we won't have access to record when it is deleted.
        changeFeature.properties.feature_title = feature.getTitle();

        changeFeature.properties.orig_feature = JSON.stringify(originalFeature);
        changeFeature.properties.fields = JSON.stringify(fields);
    }

    /**
     * Insert change detail record for change
     * @param {MywFeature} feature
     * @param {string} changeType
     * @param {MywFeature} originalFeature
     * @returns {MywFeature}
     */
    async insertChangeDetails(feature, changeType, originalFeature) {
        const changeFeature = await this.datasource.createDetachedFeature(this.changeDetailTable);
        this._setChangeDetails(changeFeature, changeType, feature, originalFeature);
        return this.datasource.insertFeature(changeFeature);
    }

    /**
     * Update, or insert if required, change details record
     * @param {MywFeature} feature
     * @param {string} changeType
     * @param {MywFeature} originalFeature
     * @returns {MywFeature}
     */
    async updateChangeDetails(feature, changeType, originalFeature) {
        const delta = this.workflow.currentDeltaOwner.getUrn();
        const urn = feature.getUrn();
        const predicate = Predicate.eq('delta', delta).and(Predicate.eq('feature', urn));
        const changeFeatures = await this.datasource.getFeatures(this.changeDetailTable, {
            predicate
        });

        if (changeFeatures.length == 0) {
            return this.insertChangeDetails(feature, changeType, originalFeature);
        }
        const changeFeature = changeFeatures[0];
        this._setChangeDetails(changeFeature, changeType, feature, originalFeature);
        return this.datasource.updateFeature(changeFeature);
    }

    /**
     * Delete all change details for a delta.
     * ENH: Replace by bulk delete by filter if it becomes available.
     * @param {string} delta
     * @returns
     */
    async deleteChangeDetails(delta) {
        const predicate = Predicate.eq('delta', delta);
        const changeFeatures = await this.datasource.getFeatures(this.changeDetailTable, {
            predicate
        });
        const transaction = new myw.Transaction(this.app.database);
        for (let conn of changeFeatures) {
            transaction.addDelete(conn);
        }
        return this.datasource.runTransaction(transaction);
    }

    /**
     *
     * @param {*} feature
     * @param {*} featureJson
     * @returns
     */
    async trackInsertChange(feature, featureJson) {
        if (this.workflow.currentDeltaOwner) {
            return this.insertChangeDetails(feature, 'insert');
        }
    }

    /**
     *
     * @param {*} feature
     * @param {*} preUpdateGeoJson
     * @returns
     */
    async trackUpdateChange(feature, preUpdateGeoJson) {
        if (this.workflow.currentDeltaOwner) {
            return this.updateChangeDetails(feature, 'update', preUpdateGeoJson);
        }
    }

    /**
     *
     * @param {*} feature
     * @returns
     */
    async trackDeleteChange(feature) {
        if (this.workflow.currentDeltaOwner) {
            return this.updateChangeDetails(feature, 'delete', feature.asGeoJson());
        }
    }

    /**
     *
     * @param {*} feature
     * @returns
     */
    async trackDisconnectChange(feature) {
        if (this.workflow.currentDeltaOwner) {
            return this.updateChangeDetails(feature, 'disconnect', feature.asGeoJson());
        }
    }

    // Show an info message
    showMessage(msg) {
        new myw.Dialog({
            title: 'Information', // TODO: Use message
            contents: msg
        });
    }
}
