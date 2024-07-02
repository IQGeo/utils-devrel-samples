// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin } from 'myWorld-client';

export default class LaborCostManagerPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'laborCostsManager';

        /**
         * @class Provides API for accessing laborCosts
         *
         * Called from commsFeatureEditor
         *
         * @extends {Plugin}
         */

        this.prototype.laborCostMap = {};

        this.prototype.laborCostsCache = { linear_labor_costs: {}, unit_labor_costs: {} }; //maps featureType to laborCost feature type and laborCost feature dd, keyped on feature type
    }

    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
        this.ready = this.getReadyPromise();
        this.laborCostsConfig = myw.config['mywcom.laborCosts'];

        this.structsConfig = myw.config['mywcom.structures'];
        this.routesConfig = myw.config['mywcom.routes'];
        this.equipConfig = myw.config['mywcom.equipment'];
        this.conduitsConfig = myw.config['mywcom.conduits'];
        this.cablesConfig = myw.config['mywcom.cables'];
    } //cached laborCostFeatures, keyed on urn;

    /**
     * Creates promise that waits for laborCosts to be cached before resolving
     * @returns {Promise}
     */
    getReadyPromise() {
        const readyPromise = new Promise(resolve => {
            this.ds.initialized.then(() => {
                this.ds.comms.ensureAllDDInfo().then(allFeatureDDs => {
                    this.allFeatureDDs = allFeatureDDs;
                    this.cacheLaborCosts().then(() => {
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
     * @return {string]} spec field name
     */
    getLaborCostsFieldNameFor(featureType) {
        return this.laborCostsConfig[featureType];
    }

    // ------------------------------------------------------------------------
    //                          DB CACHE
    // ------------------------------------------------------------------------

    /**
     * Caches laborCost feature and laborCost feature dd for all feature types on the laborCostMap
     * Caches all laborCost features on the laborCostsCache
     */
    async cacheLaborCosts() {
        //cache all mywcom_labor_cost features
        const laborCostFeatures = await this._getLaborCostFeaturesFor('mywcom_labor_cost');
        if (laborCostFeatures) {
            laborCostFeatures.forEach(laborCost => {
                const laborCostUrn = laborCost.getUrn();
                if (laborCost.properties.linear) {
                    this.laborCostsCache.linear_labor_costs[laborCostUrn] = laborCost;
                } else {
                    this.laborCostsCache.unit_labor_costs[laborCostUrn] = laborCost;
                }
            });
        }
    }

    async _getLaborCostFeaturesFor(laborCostFeatureType) {
        const laborCostFeatures = await this.ds.getFeatures(laborCostFeatureType).catch(error => {
            console.log('Error caching ' + laborCostFeatureType + ' features: ' + error.message);
            return null;
        });

        if (laborCostFeatures && laborCostFeatures.length > 0) return laborCostFeatures;
    }

    /**
     * Updates cached representation of the laborCost feature
     * @param {*} laborCostFeature The laborCost feature
     */
    updateLaborCostCacheFor(laborCostFeature) {
        if (!laborCostFeature) return;
        if (!this.laborCostsCache) return;

        // Add to cache
        if (laborCostFeature.properties.linear) {
            this.laborCostsCache.linear_labor_costs[laborCostFeature.getUrn()] = laborCostFeature;
        } else {
            this.laborCostsCache.unit_labor_costs[laborCostFeature.getUrn()] = laborCostFeature;
        }
    }

    /**
     * update laborCost cache by feature if feature has been update by manager
     * @param {urn} urn laborCost feature urn
     */
    async _updateCacheFor(urn) {
        const updatedLaborCost = await this.ds.getFeatureByUrn(urn);
        this.laborCostsCache[urn] = updatedLaborCost;
    }

    // ------------------------------------------------------------------------
    //                          FEATURES
    // ------------------------------------------------------------------------

    /**
     * get laborCost features for feature type, filter based on state of feature editor
     * @param  {String} laborCostType
     */
    getLaborCosts(laborCostType) {
        if (laborCostType == 'linear_labor_costs') {
            return this.laborCostsCache.linear_labor_costs;
        } else {
            return this.laborCostsCache.unit_labor_costs;
        }
    }

    /**
     * get laborCost features for feature type, filter based on state of feature editor
     * @param  {MywFeature} feature
     */
    getLaborCostsFor(feature) {
        if (!feature.geometry) {
            return this.getSpecLaborCostsFeatures(feature);
        }

        if (feature.geometry.type == 'LineString') {
            return this.laborCostsCache.linear_labor_costs;
        } else {
            return this.laborCostsCache.unit_labor_costs;
        }
    }

    /**
     * Get labor cost features relating to spec feature
     * @param {MywFeature} feature
     */
    getSpecLaborCostsFeatures(feature) {
        const type = feature.getType().replace('_spec', '');
        if (type in this.structsConfig || type in this.equipConfig) {
            return this.laborCostsCache.unit_labor_costs;
        } else if (
            type in this.routesConfig ||
            type in this.cablesConfig ||
            type in this.conduitsConfig
        ) {
            return this.laborCostsCache.linear_labor_costs;
        }
    }

    /**
     * Gets labor cost from passed labor cost urn
     * @param {String} urn
     */
    getLaborCostFromUrn(urn) {
        if (urn in this.laborCostsCache.linear_labor_costs) {
            return this.laborCostsCache.linear_labor_costs[urn];
        }

        if (urn in this.laborCostsCache.unit_labor_costs) {
            return this.laborCostsCache.unit_labor_costs[urn];
        }
    }

    /**
     * Gets all cached labor cost features
     * @returns {Array<MywFeature>}
     */
    getAllLaborCosts() {
        return [
            ...Object.values(this.laborCostsCache.unit_labor_costs),
            ...Object.values(this.laborCostsCache.linear_labor_costs)
        ];
    }

    // ------------------------------------------------------------------------
    //                          DATABASE OPERATIONS
    // ------------------------------------------------------------------------

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
        this.updateLaborCostCacheFor(feature);

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
        this.updateLaborCostCacheFor(feature);

        return feature;
    }

    /**
     * Saves changes to the laborCost feature, and updates local cache
     * @param {*} feature LaborCost Feature
     */
    async saveLaborCostFeature(feature) {
        const featureJson = { properties: { ...feature.properties } };
        const resp = await this.updateFeature(feature, featureJson);
        this.updateLaborCostCacheFor(resp);
    }

    // -----------------------------------------------------------------------------
    //                              HELPERS
    // -----------------------------------------------------------------------------

    /**
     * Gets a feature's laborCost feature based on its configured laborCost field
     * @param  {string} featureType
     * @return {string} laborCostFeatureType
     */
    _parseLaborCostFeatureTypeFor(featureType) {
        const laborCostField = this.getLaborCostFieldNameFor(featureType);

        if (!laborCostField) return null;

        const featureDD = this.allFeatureDDs[featureType];
        const laborCostFieldDD = featureDD.fields[laborCostField];
        const regExp = /\(([^)]+)\)/; // regExp for in text between two parantheses ()
        const laborCostFeatureType = regExp.exec(laborCostFieldDD.type)[1];

        return laborCostFeatureType;
    }
}
