import myw from 'myWorld-client';

/**
 * Adds methods for running Comms feature services
 */
// Required because cannot use modulePost() etc with MywcomFeatureController (as is subclass of core FeatureController)
// ENH: Add Core support for server-side triggers and remove this
// Cut-and-paste from Core RestServer in order to override URLs
// ENH: Extend core methods to accept URL
const commsRestServerExtension = {
    async commsInsertFeature(featureType, insertData, update = false) {
        const feature = await this._insertRecord(
            'modules/comms/feature',
            featureType,
            insertData,
            update
        );
        return feature.id;
    },

    async commsUpdateFeature(featureType, featureId, updateData) {
        return this._updateRecord('modules/comms/feature', featureType, featureId, updateData);
    },

    async commsDeleteFeature(featureType, featureId) {
        return this._deleteRecord('modules/comms/feature', featureType, featureId);
    },

    commsRunTransaction(transaction) {
        return this.ajax({
            async: true,
            contentType: 'application/json',
            data: JSON.stringify(transaction),
            dataType: 'json',
            type: 'POST',
            url: `${this.baseUrl}modules/comms/feature?delta=${this.delta}`
        });
    },

    async getFeaturesByUrn(featureType, ids, options) {
        const url = `feature/${featureType}/get`;
        const data = {
            display_values: options.displayValues,
            include_lobs: options.includeLobs,
            include_geo_geometry: options.includeGeoGeometry,
            ids: ids.join(','),
            delta: this.delta
        };
        return this.getJSONPost(url, data);
    }
};

Object.assign(myw.RestServer.prototype, commsRestServerExtension);
