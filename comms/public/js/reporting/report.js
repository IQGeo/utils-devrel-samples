// Copyright: IQGeo Limited 2010-2023
import myw, { MywClass } from 'myWorld-client';

export default class Report extends MywClass {
    /**
     * @class Interface definition for report objects registered with ReportManager
     *
     * Subclasses must implement:
     *    canBuildFor(app,feature)    static
     *    initialize(app,feature)
     *    typeName()
     *    title()
     *    build()                     async
     *    generate(strm)
     */

    /**
     * Ensures that all the necessary properties for the featureItems are available particularly
     * display values
     * @param {Array<Feature>} featureItems
     * @returns {Array<Feature>}
     */
    async ensureValues(featureItems) {
        if (featureItems.length == 0) return featureItems;

        const aspects = ['display_values'];

        const missingData = featureItems.filter(feature => feature.hasAspects?.(aspects) === false);

        if (missingData.length == 0) return featureItems;

        const featureUrnsByDs = this.getFeatureUrnsbyDatasource(featureItems);
        const dsFeatureRequests = this.featureRequestsByDatasource(featureUrnsByDs);

        const results = await Promise.allSettled(dsFeatureRequests);

        const features = results
            .filter(r => r.status == 'fulfilled')
            .map(r => r.value)
            .flat();
        return features;
    }

    /**
     * Returns an object keyed on datasource name with a datasource instance and an array of URNs
     * @param {Array<Feature>} featureItems
     * @returns {Object}
     */
    getFeatureUrnsbyDatasource(featureItems) {
        return featureItems.reduce((obj, item) => {
            const dsName = item.datasource.name;
            if (!(dsName in obj)) {
                obj[dsName] = { datasource: item.datasource, featureUrns: [item.getUrn()] };
            } else {
                obj[dsName].featureUrns.push(item.getUrn());
            }
            return obj;
        }, {});
    }

    /**
     *
     * @param {Object} featureUrnsByDs
     * @returns {Array} an array of getFeaturebyUrn requests by Datasource
     */
    featureRequestsByDatasource(featureUrnsByDs) {
        const dsRequests = [];

        Object.keys(featureUrnsByDs).forEach(dsName => {
            const dsItem = featureUrnsByDs[dsName];
            const ds = dsItem.datasource;
            const featureUrns = dsItem.featureUrns;

            if (ds.getFeaturesByUrn)
                dsRequests.push(ds.getFeaturesByUrn(featureUrns, { displayValues: true }));
        });
        return dsRequests;
    }
}
