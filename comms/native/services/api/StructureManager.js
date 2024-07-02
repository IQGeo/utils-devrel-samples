// Copyright: IQGeo Limited 2010-2023

import geomUtils from '../base/GeomUtils';

import Manager from './Manager';

import myw, { FilterParser, MywError } from 'myWorld-base';

/**
 * Manager for maintaining structures
 *
 * Maintains structure network connectivity and containment
 */
/*eslint-disable no-await-in-loop*/
class StructureManager extends Manager {
    static {
        // Junction feature type
        this.prototype.junctionType = 'mywcom_route_junction';

        // Tolerance when scanning for routes
        this.prototype.route_tolerance = 0.1;

        // Tolerance when scanning for structures
        this.prototype.struct_tolerance = 1.0;
    }

    static registerTriggers(NetworkView) {
        NetworkView.registerTrigger('struct', 'pos_insert', this, 'structPosInsertTrigger');
        NetworkView.registerTrigger('struct', 'pos_update', this, 'structPosUpdateTrigger');
        NetworkView.registerTrigger('struct', 'pre_delete', this, 'structPreDeleteTrigger');

        NetworkView.registerTrigger('route', 'pos_insert', this, 'routePosInsertTrigger');
        NetworkView.registerTrigger('route', 'pos_update', this, 'routePosUpdateTrigger');
        NetworkView.registerTrigger('route', 'pre_delete', this, 'routePreDeleteTrigger');
    }

    // -----------------------------------------------------------------------
    //                             STRUCTURE MANAGEMENT
    // -----------------------------------------------------------------------

    /**
     * Called after STRUCT is inserted
     */
    // ENH: Prevent place structure on another structure
    async structPosInsertTrigger(struct) {
        // if replacing a structure, don't run this trigger method
        // (but we do want to invoke other trigger methods like the name manager)
        if (struct.isReplacing) {
            return;
        }
        this.progress(1, 'Adding', struct);

        let geom = struct.geometry;
        this.progress(1, 'Adding struct with geom', geom);

        const junct = await this.structureAt(geom.coordinates, [this.junctionType]);

        if (junct) {
            // Snapping might have occured in structureAt
            geom = junct.geometry;
            struct.geometry = geom;

            await this.replaceStructure(junct, struct);
            await this.deleteRecord(junct);
        } else {
            await this.splitRoutesWith(struct);
        }

        // Update circuits
        const segs = await this.nw_view.cable_mgr.segmentsAt(struct);
        await this.nw_view.circuit_mgr.updateCircuitsAtStruct(segs, undefined, geom.coordinates);
    }

    /**
     * Called after STRUCT is updated
     */
    // ENH: Make name less confusing e.g. rename to stuctUpdateTrigger()
    async structPosUpdateTrigger(struct, preUpdateStruct = undefined) {
        this.progress(1, 'Updating', struct);

        // Do we want to reconnect structures at end points
        let updateGeoms = preUpdateStruct == undefined;

        let new_coord, original_coord;
        if (preUpdateStruct) {
            new_coord = struct.geometry.coordinates;
            original_coord = preUpdateStruct.geometry.coordinates;
            updateGeoms = !geomUtils.coordEqual(new_coord, original_coord);
        }

        if (!updateGeoms) {
            // Nothing more to do
            return;
        }

        // Update location of contained objects
        await this.nw_view.equip_mgr.updateEquipGeoms(struct);
        await this.nw_view.cable_mgr.updateInternalSegmentGeoms(struct);
        await this.nw_view.connection_mgr.updateConnGeoms(struct);
        await this.nw_view.loc_mgr.updateLOCGeomsAtStruct(struct);

        // Update ends of connected routes (and their contained objects)
        // ENH: Avoid duplicate rebuild of cable and circuit paths
        const routes = await this.routesOf(struct);
        for (const route of routes) {
            await this.updateRouteGeom(route, struct);
        }
        await this.nw_view.loc_mgr.updateLOCGeomsInRoutes(routes);

        // Split routes if necessary
        await this.splitRoutesWith(struct, routes);

        // Update circuits
        const segs = await this.nw_view.cable_mgr.segmentsAt(struct);
        await this.nw_view.circuit_mgr.updateCircuitsAtStruct(segs, original_coord, new_coord);
    }

    /**
     * Called before STRUCT is removed
     */
    // ENH: Prevent place structure on another structure
    async structPreDeleteTrigger(struct) {
        this.progress(1, 'Removing', struct);

        // Delete all contained equipment
        await this.nw_view.equip_mgr.deleteEquipmentInStructure(struct);

        if (struct.getType() == this.junctionType) {
            // Already a junction, nothing more to do
            return;
        }

        const routes = await this.routesOf(struct);

        if (routes.length == 0) {
            // No related routes, nothing more to do
            return;
        }

        // Create junction to support routes
        const coord = struct.geometry.coordinates;
        const junct = await this.placeJunctionAt(coord);
        await this.replaceStructure(struct, junct);
    }

    /**
     * Used when editing an existing structure and want to change structure types
     * @param {Object} feature the object from this.getChanges(this.feature)
     * @param {String} featureType i.e. 'cabinet'
     * @param {Number} id i.e. 6000
     * @param {String} newFeature i.e. 'manhole'
     * @returns record of newly created feature in the db
     */
    async replaceStructureWith(feature, featureType, id, newFeature) {
        const oldFeatTable = await this.db_view.table(featureType);
        const ogFeature = await oldFeatTable.get(id);
        const geom = ogFeature.geometry;
        const newFeatureTable = await this.db_view.table(newFeature);

        let newCreatedFeature;
        try {
            newCreatedFeature = await newFeatureTable.insert(feature);
        } catch (error) {
            return new myw.Error('unable_to_insert');
        }

        const newFeatureRec = await newFeatureTable.get(newCreatedFeature);
        newFeatureRec.geometry = geom;

        await this.replaceStructure(ogFeature, newFeatureRec);

        await this.updateInternalSegmentsOf(ogFeature, newFeatureRec);
        await this.updateEquipmentFor(ogFeature, newFeatureRec);
        await this.updateConnectionsFor(ogFeature, newFeatureRec);

        await oldFeatTable.delete(ogFeature.id);

        newFeatureRec.isReplacing = true;
        await this.nw_view.runPosInsertTriggers(newFeatureRec);
        delete newFeatureRec.isReplacing;

        return newFeatureRec;
    }

    /**
     * Reconnect routes to new structure
     * @param {Object} struct object of structure from db
     * @param {Object} newStruct object of newly created structure in db
     */
    async replaceStructure(struct, newStruct) {
        this.progress(4, 'Replacing', struct, newStruct);

        const structUrn = struct.getUrn();

        const routes = await this.routesOf(struct);

        for (const route of routes) {
            // ENH: Use connectRoute()
            if (route.properties.in_structure == structUrn) {
                route.properties.in_structure = newStruct.getUrn();
            }

            if (route.properties.out_structure == structUrn) {
                route.properties.out_structure = newStruct.getUrn();
            }

            await this.update(route);

            // Update cable segments (which also updates cable geometry)
            await this.nw_view.cable_mgr.updateSegments(route);

            // Update conduits
            await this.nw_view.conduit_mgr.updateConduits(route);
        }

        // Update slacks
        for (const slack of await this.nw_view.equip_mgr.slacksIn(struct)) {
            if (slack.properties.root_housing == structUrn)
                slack.properties.root_housing = newStruct.getUrn();
            if (slack.properties.housing == structUrn)
                slack.properties.housing = newStruct.getUrn();

            await this.update(slack);
            await this.nw_view.cable_mgr.updateSlackSegment(slack);
        }
    }

    /**
     * If a structure has internal cables, update its references from struct to newStruct
     * @param {MywFeature} struct
     * @param {MywFeature} newStruct
     */
    async updateInternalSegmentsOf(struct, newStruct) {
        const newStructUrn = newStruct.getUrn();
        for (const seg of await this.nw_view.cable_mgr.internalSegmentsOf(struct, true)) {
            seg.properties.root_housing = newStructUrn;
            seg.properties.housing = newStructUrn;
            seg.properties.in_structure = newStructUrn;
            seg.properties.out_structure = newStructUrn;
            await this.update(seg);
        }
    }

    /**
     * Updates connections from old struct to newStruct
     * @param {Object} struct object of structure from db
     * @param {Object} newStruct object of newly created structure in db
     */
    async updateConnectionsFor(struct, newStruct) {
        for (const connection of await this.nw_view.connection_mgr.connectionsIn(struct)) {
            this.updateHousingsFor(struct, newStruct, connection);
        }
    }

    /**
     * Updates equipment from old struct to newStruct
     * @param {Object} struct object of structure from db
     * @param {Object} newStruct object of newly created structure in db
     */
    async updateEquipmentFor(struct, newStruct) {
        for (const equip of await this.nw_view.equip_mgr.equipsIn(struct)) {
            this.updateHousingsFor(struct, newStruct, equip);
        }
    }

    /**
     * Updates housings from old struct to newStruct
     * @param {Object} struct object of structure from db
     * @param {Object} newStruct object of newly created structure in db
     * @param {Object} featureRec item of current feature to make update within
     */
    async updateHousingsFor(struct, newStruct, featureRec) {
        const structUrn = struct.getUrn();

        if (featureRec.properties.root_housing == structUrn) {
            this.progress(3, 'Updating', featureRec, 'setting housings to', newStruct);
            featureRec.properties.root_housing = newStruct.getUrn();

            if (featureRec.properties.housing == structUrn) {
                featureRec.properties.housing = newStruct.getUrn();
            }

            await this.update(featureRec);
        }
    }

    /**
     * Create a route junction at ends of 'route' (if necessary)
     *
     * Also ensures endpoints of route snapped to structures
     *
     * May result in splitting of other routes
     */
    async ensureStructuresFor(route) {
        // ENH: Rename as setRouteStructures()

        let geom = route.geometry;

        // Split existing routes at end points
        const first_coord = geom.coordinates[0];
        const last_coord = geom.coordinates[geom.coordinates.length - 1];
        const in_struct = await this.ensureStructureAt(first_coord, [route]);
        const out_struct = await this.ensureStructureAt(last_coord, [route]);

        // Connect route to structures and snap geom
        let geom_updated = false;
        if (in_struct) {
            route.properties.in_structure = in_struct.getUrn();
            const in_coord = in_struct.geometry.coordinates;

            if (!geomUtils.coordEqual(first_coord, in_coord)) {
                geom = geomUtils.setVertex(geom, 0, in_coord);
                geom_updated = true;
            }
        }

        if (out_struct) {
            route.properties.out_structure = out_struct.getUrn();
            const out_coord = out_struct.geometry.coordinates;

            if (!geomUtils.coordEqual(last_coord, out_coord)) {
                geom = geomUtils.setVertex(geom, -1, out_coord);
                geom_updated = true;
            }
        }

        if (geom_updated) {
            route.geometry = geom;
        }

        route = await this.update(route);
        return route;
    }

    /**
     * Create a route junction at COORD (if necessary)
     *
     * Splits any existing routes at COORD (except IGNORE_ROUTES)
     */
    async ensureStructureAt(coord, ignore_routes = undefined) {
        // Check for structure already present
        const struct = await this.structureAt(coord);
        if (struct) {
            return struct;
        }

        // Don't create junction if no other routes
        // ENH: Get rid of this
        const route = await this.routeAt(coord, ignore_routes);
        if (!route) {
            return undefined;
        }

        // Split existing routes and connect to structure
        const junct = await this.placeJunctionAt(coord);
        await this.splitRoutesWith(junct, ignore_routes);

        return junct;
    }

    /**
     * Create a route junction at COORD
     */
    async placeJunctionAt(coord) {
        this.progress(4, 'Placing route junction', coord);

        const tab = await this.db_view.table(this.junctionType);
        const det_rec = this._new_detached(tab);
        const rec_id = await tab.insert(det_rec);
        const rec = await tab.get(rec_id);
        rec.geometry = myw.geometry.Point(coord);
        await this.update(rec);

        return rec;
    }

    // -----------------------------------------------------------------------
    //                                 ROUTE MANAGEMENT
    // -----------------------------------------------------------------------

    /**
     * Called after ROUTE is inserted
     */
    async routePosInsertTrigger(route) {
        this.progress(1, 'Adding', route);
        await this.ensureStructuresFor(route);
    }

    /**
     * Called after ROUTE is updated
     */
    async routePosUpdateTrigger(route, pre_update_route = undefined) {
        this.progress(1, 'Updating', route);

        // Do we want to reconnect structures at end points
        let reconnect = !pre_update_route;

        let new_geom, original_geom;
        if (pre_update_route) {
            new_geom = route.geometry;
            original_geom = pre_update_route.geometry;

            // Coordinates equal, so nothing more to do
            if (geomUtils.geomCoordsEqual(new_geom, original_geom)) return;
            // Reconnect to structure if ends changed
            const new_coords = new_geom.coordinates;
            const original_coords = original_geom.coordinates;

            reconnect =
                !geomUtils.coordEqual(new_coords[0], original_coords[0]) ||
                !geomUtils.coordEqual(
                    new_coords[new_coords.length - 1],
                    original_coords[original_coords.length - 1]
                );
        }

        if (reconnect) {
            await this.reconnectRoute(route);
        }

        // If update would disconnect connections throw error
        await this.nw_view.cable_mgr.assertSegmentsNoConnections(route);

        // Update cable segments (and cable geometry)
        // ENH: Get rid of recursion in these ... use root_housing instead
        const cable_segs = await this.nw_view.cable_mgr.updateSegments(route, true);

        // Update conduits (and cable segments they contain)
        const conduit_segs = await this.nw_view.conduit_mgr.updateConduits(route);
        cable_segs.push(...conduit_segs);

        // Update circuit geometry for all circuits passing through cable_segs
        await this.nw_view.circuit_mgr.updateCircuitsInRoute(cable_segs, new_geom, original_geom);

        await this.nw_view.loc_mgr.updateLOCGeomsInRoutes([route]);
    }

    /**
     * Called before ROUTE is deleted
     */
    async routePreDeleteTrigger(route) {
        this.progress(1, 'Deleting', route);

        // Avoid creating dijoint cables
        if (await this.nw_view.cable_mgr.containsCable(route)) {
            throw new Error('route_has_cable', /*feature=*/ route);
        }

        // Delete contained objects
        await this.nw_view.conduit_mgr.deleteConduitsIn(route);

        // Remove any junctions that will be left hanging once the route is gone
        await this.cleanupOrphanJunctions(route, true);
    }

    /**
     * Deletes any orphan route junctions at the ends of ROUTE
     *
     * If route_removed then it means the ROUTE is about to be removed
     * so remove any dangling route junctions it would leave
     */
    async cleanupOrphanJunctions(route, route_removed = false) {
        this.progress(3, 'Cleanup orphan junctions', route, route_removed);

        const in_struct = await route.followRef('in_structure');
        const out_struct = await route.followRef('out_structure');

        let removed_route = undefined;
        if (route_removed) {
            removed_route = route;
        }

        await this.cleanupOrphanJunction(in_struct, removed_route);
        await this.cleanupOrphanJunction(out_struct, removed_route);
    }

    /**
     * Deletes STRUCT if it is a route junction and it is no longer associated
     * to a route or is only associated to removed_route
     */
    async cleanupOrphanJunction(struct, removed_route = undefined) {
        if (!struct) {
            return;
        }

        if (struct.getType() != this.junctionType) {
            return;
        }

        const routes = await this.routesOf(struct);

        if (routes.length == 0) {
            this.progress(4, 'Cleanup orphan junction', struct);
            await this.deleteRecord(struct);
        } else if (routes.length == 1 && routes[0].getUrn() == removed_route.getUrn()) {
            this.progress(4, 'Cleanup orphan junction', struct);
            await this.deleteRecord(struct);
        }
    }

    /**
     * Split ROUTE at every struct on its inner coordinates
     */
    async splitRoute(route) {
        const coords = [...route.geometry.coordinates]; // Dont need to split at start or end of route
        const inner_coords = coords.slice(1, coords.length - 1);

        let current_route = route;
        const structsAlongRoute = await this.structuresAtCoords(inner_coords);
        const split_routes = [current_route];

        // For struct along route's verticies ..split
        for (const struct of structsAlongRoute) {
            if (struct) {
                current_route = await this.splitRouteWith(current_route, struct);
                if (current_route) {
                    split_routes.push(current_route);
                }
            }
        }

        return split_routes;
    }

    /**
     * Split any routes at STRUCT and connect them to it
     */
    async splitRoutesWith(struct, ignore_routes = undefined) {
        // Find route to split
        // ENH: Handle multiple routes
        const coord = struct.geometry.coordinates;
        const route = await this.routeAt(coord, ignore_routes);

        if (!route) {
            return;
        }

        // Split its geometry
        await this.splitRouteWith(route, struct);
    }

    /**
     * Split ROUTE at STRUCT (if necessary)
     *
     * Returns new route created (if there is one)
     */
    async splitRouteWith(route, struct) {
        this.progress(3, 'Splitting', route, 'at', struct);

        // Split geometry
        const coord = struct.geometry.coordinates;
        const geoms = geomUtils.splitAt(route.geometry, coord);
        if (!geoms) {
            await this.connectRouteTo(route, struct);
            return undefined;
        }

        // Create new route
        const new_route = await this.insertCopy(route);
        new_route.properties.in_structure = struct.getUrn();
        new_route.geometry = geoms[1];

        // Update old route
        route.properties.out_structure = struct.getUrn();
        route.geometry = geoms[0];

        // Get proportion
        const length1 = geoms[0].length();
        const length2 = geoms[1].length();
        const proportion = length1 / (length1 + length2);

        // Set measured length field
        if (route.properties.length) {
            const original_length = route.properties.length;
            route.properties.length = original_length * proportion;
            new_route.properties.length = original_length * (1 - proportion);
        }

        await this.update(route);
        await this.update(new_route);

        // Split contained objects
        const cnd_splits = await this.nw_view.conduit_mgr.splitConduitsAt(
            struct,
            route,
            new_route,
            proportion
        );
        const seg_splits = await this.nw_view.cable_mgr.splitSegmentsAt(
            struct,
            route,
            new_route,
            cnd_splits,
            proportion
        );

        await this.nw_view.loc_mgr.splitLOCs(seg_splits);

        // Rebuild cable geometry
        const segs = [];
        for (const seg_split of Object.values(seg_splits)) {
            segs.push(seg_split[1]);
        }
        await this.nw_view.cable_mgr.reBuildGeometries(segs);

        return new_route;
    }

    /**
     * Connect ROUTE to STRUCT
     */
    async connectRouteTo(route, struct) {
        this.progress(3, 'Connecting route to structure', route, struct);

        const coord = struct.geometry.coordinates;
        const route_geom = route.geometry;

        const firstCoord = route_geom.coordinates[0];
        const lastCoord = route_geom.coordinates[route_geom.coordinates.length - 1];
        if (geomUtils.coordEqual(firstCoord, coord))
            route.properties.in_structure = struct.getUrn();
        if (geomUtils.coordEqual(lastCoord, coord))
            route.properties.out_structure = struct.getUrn();
        await this.update(route);
    }

    /**
     * Update geometry of ROUTE to start/end at STRUCT
     */
    async updateRouteGeom(route, struct) {
        const coord = struct.geometry.coordinates;
        const route_geom = route.geometry;

        // Build updated geomery
        let geom = route_geom;
        if (route.properties.in_structure == struct.getUrn())
            geom = geomUtils.setVertex(geom, 0, coord);
        if (route.properties.out_structure == struct.getUrn())
            geom = geomUtils.setVertex(geom, -1, coord);

        if (geomUtils.geomCoordsEqual(geom, route_geom)) {
            return;
        }

        // Update route
        this.progress(1, 'Adjusting', route, 'at', struct);
        route.geometry = geom;

        await this.update(route);

        // Update directly contained cables
        const cable_segs = await this.nw_view.cable_mgr.updateSegmentGeoms(route);

        // Update contained conduits (and the cables they contain)
        const conduit_segs = await this.nw_view.conduit_mgr.updateConduitGeoms(route);
        cable_segs.push(...conduit_segs);
    }

    /**
     * Disconnect route from structures and then connect to structures
     */
    async reconnectRoute(route) {
        await this.disconnectRoute(route);
        await this.ensureStructuresFor(route);
    }

    // -----------------------------------------------------------------------
    //                                 HELPERS
    // -----------------------------------------------------------------------

    /**
     * Returns structure each coord in COORDS
     *
     * If safe then will throw error if structures not found at all coords
     */
    async structuresAtCoords(coords, featureTypes = undefined, safe = false) {
        const structs = [];

        for (const coord of coords) {
            const struct = await this.structureAt(coord, featureTypes);
            structs.push(struct);
        }

        if (safe) {
            const bad = [];
            for (const idx in structs) {
                const struct = structs[idx];
                if (!struct) {
                    bad.push(idx + 1);
                }
            }

            if (bad.length > 0) {
                throw new MywError('No structure at points:', ','.join(bad));
            }
        }

        return structs;
    }

    /**
     * The structure at COORD (if there is one)
     *
     * If more than one structure, returns random one
     */
    async structureAt(coord, feature_types = undefined) {
        // Deal with defaults
        if (!feature_types) {
            feature_types = Object.keys(this.nw_view.structs);
        }
        // Find structures
        const structs = await this.featuresAt(
            coord,
            feature_types,
            undefined,
            this.struct_tolerance
        );
        return structs.length ? structs[0] : undefined;
    }

    /**
     * Returns a route thats passes through (or has end at) COORD
     */
    async routeAt(coord, ignore_routes = undefined) {
        const feature_types = Object.keys(this.nw_view.routes);

        // Find routes
        const routes = await this.featuresAt(
            coord,
            feature_types,
            undefined,
            /*tolerance=*/ this.route_tolerance
        );

        if (!ignore_routes) {
            return routes.length ? routes[0] : undefined;
        }

        // Determine URNs to ignore
        const ignore_urns = ignore_routes.map(r => r.getUrn());

        for (const route of routes) {
            if (!ignore_urns.includes(route.getUrn())) {
                return route;
            }
        }

        return undefined;
    }

    /**
     * Returns routes connected to REC
     */
    async routesOf(rec, include_proposed = false) {
        const rec_urn = rec.getUrn();
        const routes = [];
        const feature_types = Object.keys(this.nw_view.routes);

        for (const feature_type of feature_types) {
            const tab = this.db_view.table(feature_type);
            const filter = `[in_structure] = '${rec_urn}' | [out_structure] = '${rec_urn}'`;
            const pred = new FilterParser(filter).parse();

            const recs = await this.nw_view.getRecs(tab, pred, include_proposed);
            routes.push(...recs);
        }

        return routes;
    }

    /**
     * Disconnect ROUTE from its structures
     */
    async disconnectRoute(route) {
        await this.cleanupOrphanJunctions(route, true);

        route.properties.in_structure = null;
        route.properties.out_structure = null;

        route = await this.update(route);

        return route;
    }
}

export default StructureManager;
