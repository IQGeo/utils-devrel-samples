// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin } from 'myWorld-client';
import _ from 'underscore';
import StructContents from './structContent';
import RouteContents from './routeContent';

export default class StructureManagerPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'StructureManager';
        this.prototype.routeJunctionType = 'mywcom_route_junction';
    }

    /**
     * @class Provides API for maintaining structures and routes
     *
     * Maintains structure network connectivity and containment of equipment, conduits and cables
     *
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');

        this.structureFeatureTypes = _.keys(myw.config['mywcom.structures']);
        this.routeFeatureTypes = _.keys(myw.config['mywcom.routes']);
        this.equipmentFeatureTypes = _.keys(myw.config['mywcom.equipment']);
        this.conduitFeatureTypes = _.keys(myw.config['mywcom.conduits']);
        this.cableFeatureTypes = _.keys(myw.config['mywcom.cables']);
        this.circuitFeatureTypes = _.keys(myw.config['mywcom.circuit']);

        // List of all feature types considered structure
        this.allStructureTypes = _.union(
            this.structureFeatureTypes,
            this.routeFeatureTypes,
            this.conduitFeatureTypes
        );
    }

    /**
     * Raise events to update display etc after a change
     */
    // ENH: Only raise for feature types that have actually changed
    // ENH: Should also raise for cable and circuit substructure really
    fireFeatureEvents(aspect, structFeatureType = null) {
        this.routeFeatureTypes.forEach(routeFeatureType =>
            this.app.fire('featureCollection-modified', { featureType: routeFeatureType })
        );
        this.equipmentFeatureTypes.forEach(equipmentFeatureType =>
            this.app.fire('featureCollection-modified', { featureType: equipmentFeatureType })
        );
        this.conduitFeatureTypes.forEach(conduitFeatureType =>
            this.app.fire('featureCollection-modified', { featureType: conduitFeatureType })
        );
        this.cableFeatureTypes.forEach(cableFeatureType =>
            this.app.fire('featureCollection-modified', { featureType: cableFeatureType })
        );
        this.circuitFeatureTypes.forEach(circuitFeatureType =>
            this.app.fire('featureCollection-modified', { featureType: circuitFeatureType })
        );
        if (structFeatureType)
            // handle if structures are in seperate layers
            this.app.fire('featureCollection-modified', { featureType: structFeatureType });
        this.app.fire('featureCollection-modified', { featureType: this.routeJunctionType });
    }

    // -----------------------------------------------------------------------
    //                               STRUCTURES
    // -----------------------------------------------------------------------

    /**
     * The equipment, cables etc housed within (or connected to) 'struct'
     *
     * Returns a StructContent
     */
    async structContent(struct, includeProposed = false) {
        const structInfo = await this.ds.comms.structContent(struct, includeProposed);
        return new StructContents(struct, structInfo);
    }

    /**
     * Returns structure at each given coordinate (or null if not found)
     * @param {array} coord
     */
    async getStructuresAtCoords(coords, featureTypes = null) {
        if (!coords) coords = [];

        const structs = coords.map(coord => this.getStructureAt(coord, featureTypes));
        return Promise.all(structs);
    }

    /**
     * Returns a structure at 'coord' (null if none found)
     * If multiple structures at 'coord' returns a random one
     * @param {array} coord
     */
    async getStructureAt(coord, featureTypes = null) {
        const features = await this.getStructuresAt(coord, featureTypes);
        return features.length && features[0];
    }

    /**
     * Returns all structures at 'coord'
     */
    async getStructuresAt(coord, featureTypes = null, tolerance = 0.1) {
        featureTypes = featureTypes || this.structureFeatureTypes;

        //const tolerance = 0.1; //0.00001; // in metres (workaround for Core bug 15606) TBR:
        const latlng = myw.latLng(coord[1], coord[0]);
        const features = await this.ds.getFeaturesAround(featureTypes, latlng, tolerance);
        return features.filter(f => featureTypes.includes(f.getType())); // ENH: Filter unnecessary?
    }

    // -----------------------------------------------------------------------
    //                               ROUTES
    // -----------------------------------------------------------------------

    /**
     * The cables and conduits housed within 'route'
     *
     * Returns a RouteContent
     */
    async routeContent(route, includeProposed = false) {
        const routeInfo = await this.ds.comms.routeContent(route, includeProposed);
        return new RouteContents(route, routeInfo);
    }

    /**
     * Ensure route can have conduits
     * @param  {Array} routes
     * @return {Boolean} returns true if all routes can have conduits
     */
    validateRoutesForConduit(routes, conduit) {
        const inValidRoutes = [];
        const housings = myw.config['mywcom.conduits'][conduit.type].housings;
        routes.forEach(route => {
            if (!housings.includes(route.type)) inValidRoutes.push(route.getTitle());
        });

        // ENH could return invalid route info
        return inValidRoutes.length > 0;
    }

    /**
     * Determines whether the specified feature is a structure type.
     *
     * @param {Feature} feature - The feature to check.
     * @returns {boolean} - True if the feature is a structure type, false otherwise.
     */
    isStructure(feature) {
        return this.structureFeatureTypes.includes(feature.getType());
    }

    /**
     * Determines whether the specified feature is a route type.
     *
     * @param {Feature} feature - The feature to check.
     * @returns {boolean} - True if the feature is a route type, false otherwise.
     */
    isRoute(feature) {
        return this.routeFeatureTypes.includes(feature.getType());
    }
}
