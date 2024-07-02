// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin } from 'myWorld-client';
import _ from 'underscore';

export default class SpecManagerPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'specManager';

        /**
         * @class Provides API for accessing specs
         *
         * Called from commsFeatureEditor
         *
         * @extends {Plugin}
         */

        this.prototype.specMap = {};

        this.prototype.specCache = {}; //maps featureType to spec feature type and spec feature dd, keyped on feature type
    }

    constructor(owner, options) {
        super(owner, options);
        this.specConfig = myw.config['mywcom.specs'];
        this.ds = this.app.getDatasource('myworld');
        this.ready = this.getReadyPromise();
    } //cached specFeatures, keyed on urn;

    /**
     * Creates promise that waits for specs to be cached before resolving
     * @returns {Promise}
     */
    getReadyPromise() {
        const readyPromise = new Promise(resolve => {
            this.ds.initialized.then(() => {
                this.ds.comms.ensureAllDDInfo().then(allFeatureDDs => {
                    this.allFeatureDDs = allFeatureDDs;
                    this.cacheSpecs().then(() => {
                        resolve();
                    });
                });
            });
        });
        return readyPromise;
    }

    /**
     * gets configured spec field name for feature
     * @param  {string} feature type
     * @return {string} spec field name
     */
    getSpecFieldNameFor(featureType) {
        return this.specConfig[featureType];
    }

    /**
     * Returns list of features types configurd as specs
     * @returns {Array<string>} list of spec feature types
     */
    getSpecFeatureTypes() {
        const specConfig = this.specConfig;
        const specFeatureTypes = [];
        Object.keys(specConfig).forEach(commFeatureType => {
            const specFeatureType = this._parseSpecFeatureTypeFor(commFeatureType);
            if (specFeatureType) {
                specFeatureTypes.push(specFeatureType);
            }
        });

        return specFeatureTypes;
    }

    /********** DD Cache ************/

    /**
     * Caches spec feature and spec feature dd for all feature types on the specMap
     * Caches all spec features on the specCache
     */
    async cacheSpecs() {
        // set the specMap
        Object.keys(this.specConfig).forEach(commFeatureType => {
            const specFeatureType = this._parseSpecFeatureTypeFor(commFeatureType);
            if (specFeatureType) {
                this.specMap[commFeatureType] = {
                    specFeatureType: specFeatureType,
                    specDD: this.allFeatureDDs[specFeatureType]
                };
            }
        });

        //cache all specFeatures
        const specFeatureTypes = this.getSpecFeatureTypes();
        for (const specType of specFeatureTypes) {
            const specFeatures = await this._getSpecFeaturesFor(specType);
            if (specFeatures) {
                specFeatures.forEach(spec => {
                    const specUrn = spec.getUrn();
                    this.specCache[specUrn] = spec;
                });
            }
        }
    }

    async _getSpecFeaturesFor(specFeatureType) {
        const specFeatures = await this.ds.getFeatures(specFeatureType).catch(error => {
            console.log('Error caching ' + specFeatureType + ' features: ' + error.message);
            return null;
        });

        if (specFeatures && specFeatures.length > 0) return specFeatures;
    }

    /**
     * get spec feature DD for Feature
     * @param  {MywFeature}
     * @return {FeatureDD} Spec Feature DD
     */
    getSpecDDFor(feature) {
        return this.specMap[feature.getType()].specDD;
    }

    /**
     * gets spec feature type for feature from cache
     * @param  {string} feature type
     * @return {string} spec feature type
     */
    getSpecFeatureTypeFor(featureType) {
        if (this.specMap[featureType]) return this.specMap[featureType].specFeatureType;
    }

    /**
     * Updates cached representation of the spec feature
     * @param {*} specFeature The spec feature
     */
    updateSpecCacheFor(specFeature) {
        if (!specFeature) return;
        if (!this.specCache) return;
        this.specCache[specFeature.getUrn()] = specFeature;
    }

    /**
     * update spec cache by feature if feature has been update by manager
     * @param {urn} urn spec feature urn
     */
    async _updateCacheFor(urn) {
        const updatedSpec = await this.ds.getFeatureByUrn(urn);
        this.specCache[urn] = updatedSpec;
    }

    /********** Features ************/

    /**
     * get spec features for feature type, filter based on state of feature editor
     * @param  {string} featureType
     * @return {myw.FeatureSet}
     */
    async getSpecsFor(featureType, filter) {
        const specFeatureType = this.getSpecFeatureTypeFor(featureType);
        let features;

        if (specFeatureType) features = await this.ds.getFeatures(specFeatureType, { filter });
        else features = [];

        return features;
    }

    /**
     * Get spec features matching predicate
     * @param {string} featureType Spec Feature Type
     * @param {myw.Predicate} predicate Filter predicate
     * @returns {myw.FeatureSet}
     */
    async getSpecsForPredicate(featureType, predicate) {
        const specFeatureType = this.getSpecFeatureTypeFor(featureType);
        let features;

        if (specFeatureType) features = await this.ds.getFeatures(specFeatureType, { predicate });
        else features = [];

        return features;
    }

    /**
     * Get a spec feature for given feature, cache it.
     * @param  {DDFeature} feature
     * @return {DDFeature|null}
     */
    getSpecFor(feature) {
        const featureType = feature.getType();
        const specFieldName = this.getSpecFieldNameFor(featureType);
        if (!specFieldName) return null;

        const specFeatureName = this.getSpecFeatureTypeFor(featureType);
        const specId = feature.properties[specFieldName];
        if (!specId) return null;

        return this._getCachedSpec(specFeatureName + '/' + specId);
    }

    _getCachedSpec(specFeatureUrn) {
        return this.specCache[specFeatureUrn];
    }

    /********** Fieldss ************/

    /**
     * gets physical spec fields for a given feature
     * @param  {MywFeature} feature [description]
     * @return {array}  an array of field dds
     */
    getSpeccedFieldsFor(feature) {
        const specDD = this.getSpecDDFor(feature);
        const specFields = [];

        if (specDD) {
            Object.keys(feature.featureDD.fields).forEach(field => {
                if (_.contains(Object.keys(specDD.fields), field)) specFields.push(field);
            });
        }

        return specFields;
    }

    /********* Database Operations *********/

    /**
     * Inserts a new feature into the database
     * @param  {featureData} featureJson
     * @return {promise<DDFeature>}
     */
    async insertFeature(featureType, featureJson) {
        let feature = await this.ds.database.createDetachedFeature(featureType);

        //start by running any preInsert hook
        await feature.preInsert(featureJson, this.app);

        //obtain from the feature model a transaction to perform the insertion
        const { transaction, opIndex } = await feature.buildInsertTransaction(featureJson);
        const res = await this.ds.runTransaction(transaction);

        //get feature from database (gets values updated by database triggers)
        const id = res.ids[opIndex];
        feature = await this.ds.getFeature(feature.getType(), id);

        //run post insert hook
        await feature.posInsert(featureJson, this.app);

        return feature;
    }

    /**
     * Sends a set of changes to a feature to the database
     * @param  {featureData} featureJson
     * @return {promise<DDFeature>}
     */
    async updateFeature(feature, featureJson) {
        const preUpdateGeoJson = feature.asGeoJson();
        //start by running pre update hook
        await feature.preUpdate(featureJson, this.app);

        //send changes to database (via transaction that can be defined in feature's model)
        const transaction = await feature.buildUpdateTransaction(featureJson);
        await this.ds.runTransaction(transaction);

        await feature.update(); //refresh feature properties
        await feature.posUpdate(preUpdateGeoJson, this.app); //run post update hook

        return feature;
    }

    /**
     * Saves changes to the spec feature, and updates local cache
     * @param {*} feature Spec Feature
     */
    async saveSpecFeature(feature) {
        const featureJson = { properties: { ...feature.properties } };
        const resp = await this.updateFeature(feature, featureJson);
        this.updateSpecCacheFor(resp);
    }

    /*********** Helpers **********/

    /**
     * Gets a feature's spec feature based on its configured spec field
     * @param  {string} featureType
     * @return {string} specFeatureType
     */
    _parseSpecFeatureTypeFor(featureType) {
        const specField = this.getSpecFieldNameFor(featureType);

        if (!specField) return null;

        const featureDD = this.allFeatureDDs[featureType];
        if (!featureDD) return null;
        const specFieldDD = featureDD.fields[specField];
        const regExp = /\(([^)]+)\)/; // regExp for in text between two parantheses ()
        const specFeatureType = regExp.exec(specFieldDD.type)[1];

        return specFeatureType;
    }
}
