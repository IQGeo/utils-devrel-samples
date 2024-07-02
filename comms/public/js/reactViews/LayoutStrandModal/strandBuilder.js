// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

// Engine to create aerial route and pole features
class StrandBuilder extends myw.MywClass {
    static {
        this.prototype.messageGroup = 'StrandBuilder';
    }

    // Init slots
    constructor(app) {
        super();
        this.app = app;
        this.database = app.database;
        this.datasource = app.database.getDatasource('myworld');
    }

    async calcLinestringLength(geoJson) {
        await myw.geometry.init();
        const linestring = myw.geometry(geoJson);
        return parseFloat(linestring.length().toFixed(2));
    }

    // Create feature at 'latlng'
    async addFeature(latlng, featureName, props = {}) {
        const coord = this.coordFor(latlng);
        const geom = { type: 'Point', coordinates: coord };
        return this.insertFeature(featureName, props, geom);
    }

    // Create route linking feature1 -> feature2
    async addRoute(feature1, feature2, routeName) {
        const geom = {
            type: 'LineString',
            coordinates: [feature1.geometry.coordinates, feature2.geometry.coordinates]
        };
        const length = await this.calcLinestringLength(geom);
        const props = {
            in_structure: feature1.getUrn(),
            out_structure: feature2.getUrn(),
            length: length
        };

        return this.insertFeature(routeName, props, geom);
    }

    // Helper to create a feature (and update display)
    // TODO: Duplicated with customer connection builder
    async insertFeature(featureType, properties, geometry) {
        const ftrData = {
            type: 'Feature',
            properties: properties,
            geometry: geometry
        };

        const id = await this.datasource.comms.insertFeature(featureType, ftrData);

        const ftr = await this.database.getFeature(featureType, id);
        this.app.fire('featureCollection-modified', {
            featureType: featureType,
            changeType: 'insert',
            feature: ftr
        });
        ftr.posInsert(ftrData, this.app);
        return ftr;
    }

    // Build coordinate from latlng
    coordFor(latlng) {
        const roundFac = 1.0e10; // Workaround to ensure object will be snappable (see Fogbugz 14942)
        return [
            Math.round(latlng.lng * roundFac) / roundFac,
            Math.round(latlng.lat * roundFac) / roundFac
        ];
    }
}

export default StrandBuilder;
