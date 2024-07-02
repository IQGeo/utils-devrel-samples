// Copyright: IQGeo Limited 2010-2023

//import {MywLineString} from 'myWorld-native-services'
import myw, { FilterParser } from 'myWorld-base';
import { NetworkEngine } from 'myWorld-native-services';
import geomUtils from '../base/GeomUtils';
import Conn from '../../services/api/Conn';
import { along, length, pointToLineDistance, lineOffset } from '@turf/turf';

//import Conn from './Conn'
import Manager from './Manager';

//import DbConstraintError from './MywcomError'

/**
 * Engine for routing cables via structure network traces and general cable management
 */
/*eslint-disable no-await-in-loop*/
class CableManager extends Manager {
    static {
        this.prototype.units = { units: 'degrees' };
        this.prototype.cable_offset_dis = 0.0000107; // distance between route and nearest offset cable
        this.prototype.cable_separation_dis = 0.0000067; // distance between offset cables
        this.prototype.tolerance = 1e-8;
    }

    //@property
    /**
     * Feature types that are cable segments
     */
    _segment_types() {
        return this.nw_view.segments;
    }

    static registerTriggers(NetworkView) {
        NetworkView.registerTrigger('cable', 'pos_insert', this, 'posInsertTrigger');
        NetworkView.registerTrigger('cable', 'pos_update', this, 'posUpdateTrigger');
        NetworkView.registerTrigger('cable', 'pre_delete', this, 'preDeleteTrigger');
    }

    /**
     * Called after CABLE is inserted
     */
    async posInsertTrigger(cable) {
        this.progress(2, 'Running insert trigger', cable);
        if (this._placementGeom(cable)) {
            await this.routeCable(cable);
            if (this.techFor(cable) == 'coax') {
                await this.createCableOffsetGeom(cable);
            }
        }
    }

    /**
     * Called after CABLE is updated
     *
     * ORIGCABLE is a pre-update clone of the cable
     */
    async posUpdateTrigger(cable, orig_cable) {
        this.progress(2, 'Running update trigger', cable);

        if (cable.properties.directed != orig_cable.properties.directed) {
            await this.updateCableSegments(cable);
        }

        // Automatically re-route cable only if geometry changed (either primary or placement)
        await this._rerouteIfGeomChanged(cable, orig_cable);
    }

    /**
     * Called before CABLE is deleted
     */
    async preDeleteTrigger(cable) {
        this.progress(2, 'Running delete trigger', cable);
        const loc_recs_for_ripple = await this.nw_view.loc_mgr.handleCableDelete(cable);
        await this.unrouteCable(cable);
        await this.nw_view.loc_mgr.handleCableDeleteRipple(loc_recs_for_ripple);
    }

    // -----------------------------------------------------------------------
    //                             OFFSET CABLES
    // -----------------------------------------------------------------------

    /**
     * Saves new offset cable in 'offset_cable' geometry
     * @param {*} cable
     * @returns
     */
    async createCableOffsetGeom(cable) {
        const ordered_segs = await this.orderedSegments(cable);

        // no offset geometry for internal cables
        if (ordered_segs.length == 1 && this.isInternalSegment(ordered_segs[0])) {
            return;
        }

        const offset_cable = await this.newOffsetForCable(ordered_segs);

        cable.secondary_geometries.offset_geom = offset_cable;
        this.update(cable);
        return cable;
    }

    /**
     * Creates a new offset cable. Always starts and ends at structures, the same locations as the route.
        If proposed offset line is too close to other offsets, it first trys the other side and then increases the offset distance.
        Line truncation distance is 1.5 times offset.
     */
    async newOffsetForCable(ordered_segs) {
        const geoms_to_avoid = await this.getRouteOffsets(ordered_segs);

        let count = 0;
        let offset_distance = this.cable_offset_dis;
        while (count < 8) {
            offset_distance = Math.abs(offset_distance);
            const trunc_distance = 1.5 * offset_distance;

            if (count % 2 === 0) {
                if (count != 0) {
                    // increment nonzero even number
                    offset_distance += this.cable_separation_dis;
                }
            } else {
                // use same offset on opposite side
                offset_distance *= -1;
            }

            let ordered_coords = [];
            // offset each segment, with original endpoints
            for (const index in ordered_segs) {
                const segment_geom = ordered_segs[index].geometry;

                // reverse sign of offset_distance to match shapely behavior in offset_curve
                const offset_segment_geom = lineOffset(
                    segment_geom,
                    -offset_distance,
                    this.units
                ).geometry;

                const next_coords = offset_segment_geom.coordinates;
                ordered_coords.push(...next_coords);
            }

            // truncate start and end points to create angle to structure
            const truncate_coords = this.truncateLine(
                ordered_coords,
                trunc_distance,
                trunc_distance
            );
            // add start and end points from original line
            const first_segment_geom = ordered_segs[0].geometry;
            const last_segment_geom = ordered_segs[ordered_segs.length - 1].geometry;
            truncate_coords.unshift(first_segment_geom.coordinates[0]);
            truncate_coords.push(
                last_segment_geom.coordinates[last_segment_geom.coordinates.length - 1]
            );
            const offset_geom = myw.geometry.lineString(truncate_coords);

            if (geoms_to_avoid.every(other_geom => this.isValidOffset(offset_geom, other_geom))) {
                return offset_geom;
            }
            count += 1;
        }

        return null;
    }

    /**
     * Compares the average distance of two lines
     *
     * @param {*} offset_geom
     * @param {*} other_geom
     * @returns
     */
    isValidOffset(offset_geom, other_geom) {
        let total = 0;
        for (const coord of offset_geom.coordinates) {
            total += pointToLineDistance(myw.geometry.point(coord), other_geom, this.units);
        }

        const count = offset_geom.coordinates.length;
        const ave = total / count;
        return ave > 1e-6;
    }

    /**
     *  Shortens the line on each side using the 'along' turf function
     *
     * @param {*} coords
     * @param {*} start_trunc_dis
     * @param {*} end_trunc_dis
     * @returns
     */
    truncateLine(coords, start_trunc_dis, end_trunc_dis) {
        const geom = myw.geometry.lineString(coords);

        if (start_trunc_dis) {
            const start = along(geom, start_trunc_dis, this.units);
            coords[0] = start.geometry.coordinates;
        }
        if (end_trunc_dis) {
            const offsetLength = length(geom, this.units);
            const end = along(geom, offsetLength - end_trunc_dis, this.units);
            coords[coords.length - 1] = end.geometry.coordinates;
        }

        return coords;
    }
    /**
     *  Queries the root_housing of the passed in segment
        Returns existing coax cables in the same housing
     * @param {*} segments 
     * @returns array of cable segments
     */
    async getRouteOffsets(segments) {
        const cable_offsets = new Map();

        for (const segment of segments) {
            const housing = await segment.followRef('root_housing');
            const housing_segs = await housing.followRefSet('cable_segments');
            const segment_urn = segment.getUrn();

            for (const other_segment of housing_segs) {
                if (other_segment.getUrn() != segment_urn) {
                    const cable = await other_segment.followRef('cable');
                    if (cable.getType() == 'coax_cable') {
                        if (!cable_offsets.has(cable.getUrn())) {
                            const offset_geom = cable.secondary_geometries.offset_geom;
                            cable_offsets.set(cable.getUrn(), offset_geom);
                        }
                    }
                }
            }
        }

        return Array.from(cable_offsets.values());
    }

    /**
     *  Simple utility function to view the coordinates at the same precision as python.shapely
     */
    roundCoords(geom) {
        const rounded_coords = geom.coordinates.map((coord, index) => {
            const new_coord = [];
            new_coord[0] = Math.round(coord[0] * 1e8) / 1e8;
            new_coord[1] = Math.round(coord[1] * 1e8) / 1e8;
            return new_coord;
        });
        return rounded_coords;
    }

    // -----------------------------------------------------------------------
    //                             ROUTING
    // -----------------------------------------------------------------------

    /**
     * Find routes forming shortest path joining STRUCTS
     *
     * Returns an ordered list of (ROUTE,FORWARD) tuples
     */
    async findPath(structs, cable_type = undefined) {
        // ENH: Make CABLE_TYPE mandatory

        this.progress(1, 'Finding routes linking', structs);

        // Build network engine
        const route_filters = this.routeFiltersFor(cable_type);
        const networkRec = await this.db_view.db.cachedTable('network').get('mywcom_routes');
        await networkRec.setFeatureItems();
        const network_engine = NetworkEngine.newFor(this.db_view, networkRec, route_filters);

        // For each pair of structures .. find path
        const routes = [];
        for (let i = 0; i < structs.length - 1; i++) {
            const paths = await this.findPathBetween(structs[i], structs[i + 1], network_engine);
            routes.push(...paths);
        }

        return routes;
    }

    /**
     * 'Enter' CABLE into ROUTES (a list of route,forward tuples)
     *
     * Builds join route <-> cable_seg <-> cable + sets CABLE geometry
     */
    async route(cable, routes) {
        this.progress(1, 'Routing', cable, 'to', routes.length, 'routes');

        const seg_table = await this.segmentTableFor(cable);

        // Create segments
        const segs = [];
        for (let i = 0; i < routes.length; i++) {
            const route = routes[i][0];
            const forward = routes[i][1];
            let seg = this.createDetachedSegment(seg_table, cable, route, forward);
            const inserted_seg_id = await seg_table.insert(seg);
            const inserted_segment = await seg_table.get(inserted_seg_id);
            segs.push(inserted_segment);
        }

        // Connect them
        for (let i = 0; i < segs.length; i++) {
            const seg = segs[i];
            if (i > 0) seg.properties.in_segment = segs[i - 1].id;
            if (i < segs.length - 1) seg.properties.out_segment = segs[i + 1].id;
            await this.update(seg);
        }
        // Set cable geometry
        await this.buildGeometry(cable, routes);
    }

    /**
     * Update routing of CABLE to ROUTES (a list of route,forward tuples)
     *
     * Updates join route <-> cable_seg <-> cable + sets CABLE geometry.
     * Also updates (or removes) connections at each structure the
     * cable passes through.
     *
     * If DRY_RUN then no DB changes are made
     *
     * Returns dict with keys:
     *   add_routes                    Routes in which a segment has been added
     *   remove_routes                 Routes in which a segment has been deleted
     *   same_routes                   Routes in which a segment is unchanged
     *   connection_updates            Connection records that have been updated
     *   connection_deletes            Connection records that have been deleted
     *   affected_structures           Structures in which connections have been changed
     *   affected_structure_internals  Structures in which internal segments deleted
     *   total_disconnects             Total number of connections deleted
     *   total_disassociations         Total number of internal segments disassociated
     */
    async update_route(cable, dry_run = false, routes) {
        this.progress(
            1,
            'Update Routing',
            cable,
            'to',
            routes.length,
            'routes',
            '/*dry_run=*/',
            dry_run
        );

        // Set of routes cable will now run along
        const new_routes = new Set(routes.map(route => route[0]));

        // Current routes cable is in
        const current_routes = new Set();

        const current_segs = await cable.followRefSet('cable_segments');
        const delete_segs_urns = [];

        // Get current routes
        for (const seg of current_segs) {
            // Gets the root housing as segment may be housed in a conduit
            // and we want the top level route. Could also be inside a structure (internal segment)
            if (!this.isInternalSegment(seg)) {
                const root_housing = await seg.followRef('root_housing');
                current_routes.add(root_housing);
            }
        }

        // Create new segments (where necessary)
        const [new_segs, delete_segs] = await this._updateSegments(
            cable,
            routes,
            current_segs,
            dry_run
        );

        // Connect them
        // ENH: Use linkSegment() helpers
        if (!dry_run) {
            for (let i = 0; i < new_segs.length; i++) {
                const seg = new_segs[i];
                // Determine 'in' segment
                let in_id;
                let out_id;
                let in_equip = null;
                let out_equip = null;
                if (i == 0) {
                    in_id = null;
                } else {
                    in_id = new_segs[i - 1].id;
                    in_equip = new_segs[i - 1].properties.out_equipment;
                }

                // Determine 'out' segment
                if (i == new_segs.length - 1) {
                    out_id = null;
                } else {
                    out_id = new_segs[i + 1].id;
                    out_equip = new_segs[i + 1].properties.in_equipment;
                }

                // Update record
                let has_id = !!in_id || !!seg.properties.in_segment;
                let new_id = seg.properties.in_segment != in_id;
                if (has_id && new_id) {
                    await this.assertSegmentNoCircuits(seg);
                    this.progress(3, 'Updating segment', i, seg, '/*in_segment=*/', in_id);
                    seg.properties.in_segment = in_id;
                    seg.properties.in_equipment = in_equip;
                    await this.update(seg);
                }

                has_id = !!out_id || !!seg.properties.out_segment;
                new_id = seg.properties.out_segment != out_id;
                if (has_id && new_id) {
                    await this.assertSegmentNoCircuits(seg);
                    this.progress(3, 'Updating segment', i, seg, '/*in_segment=*/', out_id);
                    seg.properties.out_segment = out_id;
                    seg.properties.out_equipment = out_equip;
                    await this.update(seg);
                }
            }
        }

        // Maintain connections
        const { conn_updates, conn_deletes, n_disconnects, affected_structures } =
            await this._updateConns(new_segs, delete_segs, dry_run);

        // Gather information on structures that house internal segments that will be deleted
        const { n_disassociations, affected_structure_internals } =
            await this.structuresContainingInternalSegments(delete_segs);

        if (!dry_run) {
            // Delete segments no longer required
            // Also takes care of delete related slack
            // Can safely delete these without reconnecting in/out segments as the remaining segments
            // have already been connected into an orderly path without these orphans
            for (const del_seg of delete_segs) {
                delete_segs_urns.push(del_seg.getUrn());
                await this.deleteSegment(del_seg, /*reconnect=*/ false);
            }

            // Set cable geometry
            await this.buildGeometry(cable, routes);
        }
        const current_route_ids = [...current_routes].map(route => route.id);
        const new_route_ids = [...new_routes].map(route => route.id);

        return {
            connection_updates: conn_updates,
            connection_deletes: conn_deletes,
            add_routes: new Set([...new_routes].filter(x => !current_route_ids.includes(x.id))), //new_routes - current_routes
            remove_routes: new Set([...current_routes].filter(x => !new_route_ids.includes(x.id))), //current_routes - new_routes
            same_routes: new Set([...current_routes].filter(x => new_route_ids.includes(x.id))), //new_routes intersection current routes
            total_disconnects: n_disconnects,
            total_disassociations: n_disassociations,
            affected_structures: affected_structures,
            affected_structure_internals: affected_structure_internals,
            deleted_segs: delete_segs_urns
        };
    }

    /**
     * Create child segment for internal cable
     */
    async createSegForInternalCable(cable, structs) {
        this.progress(1, 'Routing internal', cable, 'in', structs[0]);

        const housing = structs[0];
        const housing_urn = housing.getUrn();

        const seg_table = await this.segmentTableFor(cable);
        const seg = this._new_detached(seg_table);
        seg.properties.cable = cable.getUrn();
        seg.properties.directed = cable.properties.directed;
        seg.properties.housing = housing_urn;
        seg.properties.root_housing = this.rootHousingUrn(housing);
        seg.properties.forward = true;
        seg.properties.in_structure = housing_urn;
        seg.properties.out_structure = housing_urn;

        // set the seg geom back to the cable geom
        const geom = cable.geometry;
        seg.geometry = geom;
        await seg_table.insert(seg);
    }

    /**
     * Find segments changes for re-routing CABLE to ROUTES (a list of routes)
     *
     * Unless dry run, also creates any new segments required (!!)
     *
     * Returns:
     *   segments         # New segment path
     *   drop_segments    # Segments no longer required
     */
    async _updateSegments(cable, routes, current_segs = undefined, dry_run = false) {
        const table = await this.segmentTableFor(cable);

        // Get current segments in path order
        current_segs = await this.orderedSegments(cable, current_segs);

        // Get new segments in path order
        const new_segs = [];
        for (let i = 0; i < routes.length; i++) {
            const route = routes[i][0];
            const forward = routes[i][1];
            const new_seg = this.createDetachedSegment(table, cable, route, forward);
            new_segs.push(new_seg);
        }

        const segments = [];
        const matched_existing_segs = new Set();

        // Compare segments proposed for routes to existing segments
        // The proposed routes do not include internal segments, so these have special handling
        // during the comparision
        let current_index = -1;
        for (const detached_seg of new_segs) {
            let matched_existing_seg = false;

            for (
                let check_index = current_index + 1;
                check_index < current_segs.length;
                check_index++
            ) {
                const existing_seg = current_segs[check_index];
                const internal_seg = this.isInternalSegment(existing_seg);

                if (internal_seg) {
                    if (matched_existing_seg) {
                        // We already have a match for the proposed new segment, and we have an existing internal segment,
                        if (
                            detached_seg.properties.out_structure ==
                            existing_seg.properties.out_structure
                        ) {
                            // Looks like a good match at the end of the new segment, include it and carry on to look at the next segment
                            segments.push(existing_seg);
                            matched_existing_segs.add(existing_seg);
                            current_index = check_index;
                            continue;
                        } else {
                            break;
                        }
                    } else {
                        // We do not have a match for the proposed new segment, and we have an existing internal segment
                        if (
                            detached_seg.properties.in_structure ==
                            existing_seg.properties.in_structure
                        ) {
                            // Looks like a good match at the start of the new segment, include it and carry on to look at the next segment
                            segments.push(existing_seg);
                            matched_existing_segs.add(existing_seg);
                            current_index = check_index;
                            continue;
                        }
                    }
                }

                if (matched_existing_seg) {
                    break;
                }

                if (this._segmentsMatch(detached_seg, existing_seg)) {
                    // Got a good match
                    matched_existing_seg = true;
                    segments.push(existing_seg);
                    matched_existing_segs.add(existing_seg);
                    current_index = check_index;
                    continue;
                }
            }

            if (!matched_existing_seg) {
                // Didn't find a match
                if (!dry_run) {
                    const inserted_segment_id = await table.insert(detached_seg);
                    const inserted_segment = await table.get(inserted_segment_id);
                    segments.push(inserted_segment);
                } else {
                    segments.push(detached_seg);
                }
            }
        }

        // Build list of segments no longer required
        const matched_existing_seg_ids = [...matched_existing_segs].map(route => route.id);
        const drop_segs = [...current_segs].filter(x => !matched_existing_seg_ids.includes(x.id)); //current_routes - new_routes
        return [segments, drop_segs];
    }

    /**
     *  Check if two segments match topologically at the root housing level
     *
     * @param {MywFeature} seg1
     * @param {MywFeature} seg2
     * @returns boolean
     */
    _segmentsMatch(seg1, seg2) {
        return (
            seg1.properties.in_structure == seg2.properties.in_structure &&
            seg1.properties.out_structure == seg2.properties.out_structure &&
            seg1.properties.root_housing == seg2.properties.root_housing
        );
    }

    /**
     * Find connect records changes for a cable re-route to NEW_SEGS
     *
     * Unless dry_run is true, also make the changes
     *
     * Returns:
     *   conn_updates
     *   conn_deletes
     *   n_disconnects
     *   affected_structures
     */
    async _updateConns(new_segs, drop_segs, dry_run = false) {
        // Build list of connection records to change
        const conn_changes = await this._connChanges(drop_segs, new_segs);

        // Init stats
        const conn_updates = [];
        const conn_deletes = [];
        let n_disconnects = 0;
        const affected_structures = {};

        // For each change .. build database updates (and apply)
        if (!Object.keys(conn_changes).length)
            return { conn_updates, conn_deletes, n_disconnects, affected_structures };

        for (const conn_change_key in conn_changes) {
            const conn_change = conn_changes[conn_change_key];
            const conn = conn_change['feature'];
            const urn = conn_change_key;

            if (conn_change.in_object == 'dropped' || conn_change.out_object == 'dropped') {
                // One or both sides of the connection are now dangling, so delete it
                conn_deletes.push(urn);

                // Get count of actual disconnects
                const conn_disconnects = new Conn(conn).to_pins.size; // Assumes from/to range sizes always match
                n_disconnects += conn_disconnects;

                if (!dry_run) {
                    this.progress(2, 'Deleting connection', conn);
                    await this.deleteRecord(conn);
                }

                // Update info about affected structures
                const struct_urn = conn_change['feature'].properties.root_housing;
                let struct_changes = affected_structures[struct_urn];
                if (!struct_changes) {
                    struct_changes = affected_structures[struct_urn] = { disconnects: 0 };
                }
                struct_changes['disconnects'] += conn_disconnects;
            } else {
                conn_updates.push(urn);

                if (!dry_run) {
                    for (const prop of ['in_object', 'out_object']) {
                        if (prop in conn_change) {
                            const val = conn_change[prop];
                            this.progress(2, 'Updating connection', conn, prop, val);
                            conn.properties[prop] = val;
                        }
                    }

                    await this.update(conn);
                }
            }
        }

        return { conn_updates, conn_deletes, n_disconnects, affected_structures };
    }

    /**
     * Find new properties for connections of OLD_SEGS (which are to be dropped)
     *
     * NEW_SEGS is a list of segment recs that will be added to the cable path
     *
     * Returns a dict of CONN_CHANGE objects (keyed by conn_rec URN). Each CONN_CHANGE has properties:
     *  feature     Connection record
     *  in_object   New value for 'in_object' field (None if no longer valid)
     *  out_object  New value for 'out_object' field (None if no longer valid)
     */
    async _connChanges(old_segs, new_segs) {
        // Build lookup struct_urn -> new_seg
        const struct_new_segs = {};
        for (const new_seg of new_segs) {
            let segs = struct_new_segs[new_seg.properties.in_structure];
            if (!segs) {
                segs = { in_segs: [], out_segs: [], int_segs: [] };
                struct_new_segs[new_seg.properties.in_structure] = segs;
            }

            segs = struct_new_segs[new_seg.properties.out_structure];
            if (!segs) {
                segs = { in_segs: [], out_segs: [], int_segs: [] };
                struct_new_segs[new_seg.properties.out_structure] = segs;
            }

            if (new_seg.properties.in_structure == new_seg.properties.out_structure) {
                struct_new_segs[new_seg.properties.in_structure]['int_segs'].push(new_seg);
            } else {
                struct_new_segs[new_seg.properties.in_structure]['out_segs'].push(new_seg);
                struct_new_segs[new_seg.properties.out_structure]['in_segs'].push(new_seg);
            }
        }

        // For each segment to be dropped .. find connection mappings
        const conn_changes = {};
        for (const old_seg of old_segs) {
            await this._addConnChangesFor(old_seg, struct_new_segs, conn_changes);
        }

        return conn_changes;
    }

    /**
     * Find new properties for connections of OLD_SEGS (which are to be dropped)
     *
     * NEW_SEGS is a list of sets of new segments, keyed by structure URN
     */
    async _addConnChangesFor(old_seg, new_segs, conn_changes) {
        this.progress(5, 'Finding connection changes for', old_seg);

        // For each connection ..
        const segment_connections = await this.segmentConnections(old_seg, true);
        for (let i = 0; i < segment_connections.length; i++) {
            const conn_rec = segment_connections[i];
            this.progress(
                8,
                'Processing',
                conn_rec,
                'in structure',
                conn_rec.properties.root_housing
            );

            let conn_change = conn_changes[conn_rec.getUrn()];

            if (!conn_change) {
                conn_change = conn_changes[conn_rec.getUrn()] = { feature: conn_rec };
            }

            if (conn_rec.properties.in_object == old_seg.getUrn()) {
                conn_change['in_object'] = this._newSegmentFor(
                    old_seg,
                    conn_rec.properties.in_side,
                    new_segs
                );
            }

            if (conn_rec.properties.out_object == old_seg.getUrn()) {
                conn_change['out_object'] = this._newSegmentFor(
                    old_seg,
                    conn_rec.properties.out_side,
                    new_segs
                );
            }
        }

        return conn_changes;
    }

    /**
     * Find segment of NEW_SEGS to connect to in place of SIDE of OLD_SEG
     *
     * NEW_SEGS is a list of lists of new segments, keyed by structure URN
     *
     * Returns a URN or None
     */
    _newSegmentFor(old_seg, side, new_segs) {
        let new_seg_urn = 'dropped';

        if (side == 'in') {
            const struct_urn = old_seg.properties.in_structure;
            const segs = new_segs[struct_urn]?.out_segs;
            this.progress(8, old_seg, 'Candidate new segs in', struct_urn, segs);
            if (segs && segs.length == 1) {
                new_seg_urn = segs[0].getUrn();
            }
        }

        if (side == 'out') {
            const struct_urn = old_seg.properties.out_structure;
            const segs = new_segs[struct_urn]?.in_segs;
            this.progress(8, old_seg, 'Candidate new segs in', struct_urn, segs);
            if (segs && segs.length == 1) {
                new_seg_urn = segs[0].getUrn();
            }
        }

        this.progress(7, 'Mapping', old_seg, 'to', new_seg_urn);

        return new_seg_urn; // ENH: Return the segment
    }

    /**
     * Create a cable segment for CABLE in HOUSING
     *
     * FORWARD indicates if the segment is the
     * same direction as housing or reversed
     */
    createDetachedSegment(table, cable, housing, forward) {
        this.progress(3, 'Adding segment', cable, '->', housing, forward);

        // Determine in and out structures
        const geom = JSON.parse(JSON.stringify(housing.geometry));
        let in_structure_urn;
        let out_structure_urn;
        if (forward) {
            in_structure_urn = housing.properties.in_structure;
            out_structure_urn = housing.properties.out_structure;
        } else {
            in_structure_urn = housing.properties.out_structure;
            out_structure_urn = housing.properties.in_structure;
            geom.coordinates = geom.coordinates.reverse();
        }

        // Create join housing <-> cable_seg <-> cable
        const seg = {};
        seg.geometry = geom;
        seg.properties = {};
        seg.properties.cable = cable.getUrn();
        seg.properties.directed = cable.properties.directed;
        seg.properties.housing = housing.getUrn();
        seg.properties.root_housing = this.rootHousingUrn(housing);
        seg.properties.forward = forward;
        seg.properties.in_structure = in_structure_urn;
        seg.properties.out_structure = out_structure_urn;
        seg.id = seg.properties.id = undefined;

        return seg;
    }

    /**
     * Set geometry of all cables of SEGS
     */
    async reBuildGeometries(segs) {
        const cables = {};
        for (const seg of segs) {
            const cable_rec = await seg.followRef('cable');
            if (!(cable_rec.id in cables)) {
                cables[cable_rec.id] = cable_rec;
            }
        }

        // Update geometry of affected cables
        for (const cable of Object.values(cables)) {
            await this.reBuildGeometry(cable);
        }
    }

    /**
     * Set the geometry for CABLE from its segments
     */
    async reBuildGeometry(cable) {
        this.progress(2, 'Rebuilding primary geometry for', cable);

        const ordered_segs = await this.orderedSegments(cable);
        await this.buildGeometry(cable, ordered_segs);
    }

    /**
     * Set the geometry for CABLE from the geoms of SEGS
     */
    async buildGeometry(cable, segs) {
        // Build geometry
        const new_cable_geom = this.calcGeometry(segs);
        const orig_cable_geom = cable.geometry;

        // If no new geometry and original geom is not none, set cable geom to none
        if (!new_cable_geom) {
            if (orig_cable_geom) {
                cable.geometry = null;
                await this.update(cable);
            }
            return;
        }

        // Check for unchanged
        if (geomUtils.geomCoordsEqual(orig_cable_geom, new_cable_geom)) {
            return;
        }

        // Set it
        cable.geometry = {
            type: new_cable_geom.getType(),
            coordinates: new_cable_geom.getCoordinates()
        };
        return this.update(cable);
    }

    /**
     * Construct geometry from SEGS
     *
     * SEGS is an ordered list of segments or (route,forward) pairs
     */
    // ENH: Duplicated with conduit manager and circuit manager?
    calcGeometry(segs) {
        let coords = [];
        let forward;

        for (let i = 0; i < segs.length; i++) {
            const seg_data = segs[i];
            let seg;
            if (Array.isArray(seg_data)) {
                seg = seg_data[0];
                forward = seg_data[1];
            } else {
                seg = seg_data;
                forward = true;
            }

            const seg_geom = JSON.parse(JSON.stringify(seg.geometry)); //Copy to avoid modifying segement coords

            const segCoords = forward ? seg_geom.coordinates : seg_geom.coordinates.reverse();
            for (const c of segCoords) {
                if (coords.length && geomUtils.coordEqual(c, coords[coords.length - 1])) {
                    continue;
                }
                coords.push(c);
            }
        }

        coords = this.fixupLineStringCoords(coords);
        if (!coords) return undefined;

        return myw.geometry.lineString(coords);
    }

    /**
     * Sets the placement geometry for CABLE based on geometry of structs
     * it passes though
     */
    async reBuildPlacementGeometry(cable) {
        const structs = await this.orderedStructs(cable);
        await this.buildPlacementGeometry(cable, structs);
    }

    /**
     * Sets the placement geometry for CABLE based on geometry of STRUCTS
     */
    async buildPlacementGeometry(cable, structs) {
        this.progress(2, 'Rebuilding placement geometry for', cable);

        // Build geometry
        let coords = [];

        for (const struct of structs) {
            const struct_geom = struct.geometry;

            const coord = struct_geom.getCoordinates();
            if (coords && coord == coords[-1]) {
                continue;
            }
            coords.push(coord);
        }

        coords = this.fixupLineStringCoords(coords);
        const new_placement_geom = myw.geometry.lineString(coords);
        const orig_placement_geom = cable.secondary_geometries.placement_path;

        //  Set cable secondary geom to null if necesary
        if (!coords) {
            if (orig_placement_geom) {
                cable.secondary_geometries.placement_path = null;
                await this.update(cable);
            }
            return;
        }

        // Only perform update if geom has changed
        if (geomUtils.geomCoordsEqual(orig_placement_geom, new_placement_geom)) return;

        // Set it on the object
        cable.secondary_geometries.placement_path = new_placement_geom;

        await this.update(cable);
        return cable;
    }

    /**
     * Find the structure path STRUCT1 -> STRUCT2
     *
     * Returns ordered list of (route,forward) tuples
     */
    async findPathBetween(struct1, struct2, network_engine) {
        this.progress(3, 'Finding path between', struct1, struct2);

        const struct1_urn = struct1.getUrn();
        const struct2_urn = struct2.getUrn();

        // Find path between them
        const res = await network_engine.shortestPath(struct1_urn, struct2_urn);

        if (!res) {
            throw new Error('no_path', {
                struct1: struct1_urn,
                struct2: struct2_urn
            });
        }

        // Flatten to ordered list
        const recs = res.subTreeFeatures();

        // Extract routes
        let prev_rec;
        const routes = [];
        for (const rec of recs) {
            this.progress(8, 'Checking trace item', rec);

            if (rec.getType() in this.nw_view.routes) {
                const forward = prev_rec && rec.properties.in_structure == prev_rec.getUrn(); // ENH: Yuck!
                routes.push([rec, forward]);

                this.progress(6, 'Found', rec, forward);
            }

            prev_rec = rec;
        }

        this.progress(4, 'Found', routes.length, 'routes');

        // Check for not suitable for cable creation
        // ENH: Handle cable with degenerate linear geom?
        if (!routes) {
            throw new Error('No routes in path:', struct1_urn, '->', struct2_urn);
        }

        return routes;
    }

    /**
     * Delete cable segment SEG
     *
     * Also deletes owning features if necesary
     *
     * If RECONNECT then reconnects segments either side of the segment
     * If DELETE_SLACK and seg is owned by a slack then delete that slack
     */
    async deleteSegment(seg, reconnect = true, delete_slack = true) {
        this.progress(3, 'Deleting segment', seg);

        if (reconnect) {
            await this.disconnectSegment(seg);
        } else {
            await this.assertSegmentNoCircuits(seg);
        }

        // Delete owning slack (if necessary)
        if (delete_slack && this.isInternalSegment(seg)) {
            const housing = await seg.followRef('housing');

            if (housing && this.functionOf(housing) == 'slack') {
                await this.deleteRecord(housing);
            }
        }

        // Delete segment
        await this.deleteRecord(seg);
    }

    /**
     * Finds structures of internal segments of SEGS
     *
     * Returns:
     *   N_DISASSOCIATIONS  total number of disassociations
     *   STRUCTURES         dict of dicts of disassociation counts, keyed by structure URN
     */
    async structuresContainingInternalSegments(segs) {
        const structures = {};

        let n_disassociations = 0;

        for (const seg of segs) {
            if (this.isInternalSegment(seg)) {
                const struct_ref = await seg.followRef('root_housing');
                const struct_urn = struct_ref.getUrn();

                let struct_entry = structures[struct_urn];
                if (!struct_entry) {
                    struct_entry = structures[struct_urn] = { disassociations: 0 };
                }
                struct_entry['disassociations'] += 1;

                n_disassociations += 1;
            }
        }

        return { n_disassociations, affected_structure_internals: structures };
    }

    // -------------------------------------------------------------------------
    //                                 CONFIG ACCESS
    // -------------------------------------------------------------------------

    /**
     * Trace filter to exclude route types that cannot house CABLE_TYPE
     *
     * Returns dict of form:
     *   <route_type>: 'false'
     */
    routeFiltersFor(cable_type) {
        // Find types that can house feature type
        const housing_types = this.configFor(cable_type).housings;
        if (!housing_types) {
            return {};
        }

        // Build list of route types to exclude
        const filters = {};
        for (const route_type of Object.keys(this.nw_view.routes)) {
            if (!housing_types.includes(route_type)) {
                filters[route_type] = 'false';
            }
        }

        return filters;
    }

    /**
     * The configuration for CABLE_TYPE (a cable or conduit type)
     *
     * Returns dict
     */
    configFor(cable_type) {
        for (const configs of [this.nw_view.cables, this.nw_view.conduits]) {
            if (cable_type in configs) {
                return configs[cable_type];
            }
        }

        return {};
    }

    // -----------------------------------------------------------------------
    //                             SPLITTING
    // -----------------------------------------------------------------------

    /**
     * Split all segments of ROUTE at STRUCT, putting new bits in NEW_ROUTE
     *
     * CND_SPLITS is a list of (conduit,new_conduit) pairs, keyed by old conduit URNs
     *
     * Returns list of (segment,new_segment) pairs, keyed by urn of split segment
     */
    async splitSegmentsAt(struct, route, new_route, cnd_splits, proportion) {
        // Build housing lookup
        let splits = {};
        splits = Object.assign(splits, cnd_splits);
        splits[route.getUrn()] = [route, new_route];

        // Split cable segments
        const seg_splits = {};

        for (const seg_tab_name in this.segment_types) {
            const seg_table = await this.db_view.table(seg_tab_name);
            const filter = `[root_housing] = '${route.getUrn()}'`;
            const pred = new FilterParser(filter).parse();
            const segs = await seg_table.query().filter([pred]).orderBy('id').all();

            for (const seg of segs) {
                const housing = splits[seg.properties.housing][0];
                const new_housing = splits[seg.properties.housing][1];
                const new_seg = await this._splitSegmentAt(
                    seg,
                    struct,
                    housing,
                    new_housing,
                    proportion
                );
                seg_splits[seg.getUrn()] = [seg, new_seg];
            }
        }

        return seg_splits;
    }

    /**
     * Split SEG of HOUSING at STRUCT, putting new bit into NEW_HOUSING
     *
     * Returns segment created
     */
    async _splitSegmentAt(seg, struct, housing, new_housing, proportion) {
        this.progress(2, 'Splitting', seg, 'at', struct);

        // Create new segment
        const new_seg = await this.insertCopy(seg);
        await this.setHousing(new_seg, new_housing);

        // Set geometries
        await this.setSegmentGeom(seg, housing);
        await this.setSegmentGeom(new_seg, new_housing);

        // Set end structures and ticks
        if (seg.properties.forward) {
            seg.properties.out_structure = struct.getUrn();
            seg.properties.out_equipment = null;
            seg.properties.out_tick = null;

            new_seg.properties.in_structure = struct.getUrn();
            new_seg.properties.in_equipment = null;
            new_seg.properties.in_tick = null;
        } else {
            seg.properties.in_structure = struct.getUrn();
            seg.properties.in_equipment = null;
            seg.properties.in_tick = null;

            new_seg.properties.out_structure = struct.getUrn();
            new_seg.properties.out_equipment = null;
            new_seg.properties.out_tick = null;
        }

        // Adjust lengths
        if (seg.properties.length) {
            const original_length = seg.properties.length;
            seg.properties.length = original_length * proportion;
            new_seg.properties.length = original_length * (1 - proportion);
        }

        await this.update(seg);

        // Link new segment into chain
        // Note: Circuit segments updated later by call from structure manager
        if (seg.properties.forward) {
            await this.linkSegmentAfter(seg, new_seg);
        } else {
            await this.linkSegmentBefore(seg, new_seg);
        }

        // Move connections
        if (seg.properties.forward) {
            await this.moveConnections(seg, new_seg, 'out');
        } else {
            await this.moveConnections(seg, new_seg, 'in');
        }

        // Add circuit info
        new_seg.properties.circuits = seg.properties.circuits;
        await this.update(new_seg);

        return new_seg;
    }

    /**
     * Move connections on SIDE of FROM_SEG to TO_SEG
     *
     * Called after a segment is split
     */
    async moveConnections(from_seg, to_seg, side) {
        // ENH: Delegate to ConnectionManager

        this.progress(2, 'Moving', side, 'connections from', from_seg, 'to', to_seg);

        const from_urn = from_seg.getUrn();
        const to_urn = to_seg.getUrn();

        // For each connection record ..
        for (const conn_rec of await this.segmentConnections(from_seg)) {
            if (conn_rec.properties.in_side == side && conn_rec.properties.in_object == from_urn) {
                conn_rec.properties.in_object = to_urn;
                await this.update(conn_rec);
            }

            if (
                conn_rec.properties.out_side == side &&
                conn_rec.properties.out_object == from_urn
            ) {
                conn_rec.properties.out_object = to_urn;
                await this.update(conn_rec);
            }
        }
    }

    /**
     *  Splits CABLE after SEGMENT (if FORWARD) or before SEGMENT (if not FORWARD).
     *  Optionally connect fibres that aren't already connected using SPLICE_HOUSING as container
     * @param {*} cable
     * @param {*} segment
     * @param {*} forward
     * @param {*} splice_housing
     */
    async splitCableAt(cable, segment, forward, splice_housing) {
        const new_cable = await this.insertCopy(cable);
        const other_segment = await this.transferSegments(segment, cable, new_cable, forward);

        // Update geometries on old cable and set them on new one.
        await this.reBuildGeometry(cable);
        await this.reBuildGeometry(new_cable);
        await this.reBuildPlacementGeometry(cable);
        await this.reBuildPlacementGeometry(new_cable);

        // Mainly doing this to ensure any name managers run.
        await this.nw_view.runPosUpdateTriggers(new_cable, new_cable);

        if (splice_housing) {
            const pin_count = this.pinCountFor(cable);
            await this.nw_view.connection_mgr.spliceSegments(
                segment,
                other_segment,
                splice_housing,
                forward,
                pin_count
            );
        }

        return new_cable;
    }

    /**
     * Transfer segments from CABLE to NEW_CABLE after SEGMENT onwards (if FORWARD) or
     * before SEGMENT backwards (if not FORWARD)
     * @param {*} segment
     * @param {*} cable
     * @param {*} new_cable
     * @param {*} forward
     */
    async transferSegments(segment, cable, new_cable, forward) {
        let ordered_segs = await this.orderedSegments(cable);

        if (!forward) {
            ordered_segs = ordered_segs.reverse();
        }

        let transfer = false;
        let other_segment = undefined;
        for (const seg of ordered_segs) {
            if (transfer) {
                seg.properties.cable = new_cable.getUrn();
                const slack_type = this.slackTypeFor(cable);
                await this.update(seg);
                if (seg.properties.housing.startsWith(slack_type)) {
                    const slack = await this.db_view.get(seg.properties.housing);
                    slack.properties.cable = new_cable.getUrn();
                    await this.update(slack);
                }

                if (!other_segment) {
                    other_segment = seg;
                }
            }

            if (seg.getUrn() == segment.getUrn()) {
                transfer = true;
            }
        }

        // Clear out/in segment refs at the split
        if (forward) {
            segment.properties.out_segment = null;
            other_segment.properties.in_segment = null;
        } else {
            segment.properties.in_segment = null;
            other_segment.properties.out_segment = null;
        }
        await this.update(segment);
        await this.update(other_segment);

        return other_segment;
    }

    // -----------------------------------------------------------------------
    //                             INTERNAL SEGMENTS
    // -----------------------------------------------------------------------

    /**
     * Returns true if segment feature is an internal segment
     */
    // ENH: Have a segment model
    isInternalSegment(seg) {
        return seg.properties.in_structure == seg.properties.out_structure;
    }

    /**
     * Returns internal segments inside HOUSING
     */
    async internalSegmentsOf(housing, root_housing = false) {
        let field_name = 'housing';
        if (root_housing) {
            field_name = 'root_housing';
        }

        const segs = [];

        for (const seg_tab_name in this.segment_types) {
            const seg_table = await this.db_view.table(seg_tab_name);

            const filter = `[${field_name}] = '${housing.getUrn()}'`;
            const pred = new FilterParser(filter).parse();

            const seg_recs = await seg_table.query().filter([pred]).all();

            for (const seg of seg_recs) {
                if (this.isInternalSegment(seg)) {
                    segs.push(seg);
                }
            }
        }

        return segs;
    }

    /**
     * Split SLACK at LENGTH
     * Creates new slack with length of SLACK length - LENGTH
     * Returns original slack and new slack
     */

    async splitSlack(slack, length) {
        const orig_segs = await this.internalSegmentsOf(slack);
        const orig_seg = orig_segs[0];
        const feature_type = slack.getType();
        // Get copy of slack
        const det_slack = JSON.parse(JSON.stringify(await slack.asGeojsonFeature()));
        det_slack.id = det_slack.properties.id = undefined;

        const split_length = slack.properties.length - length;

        // Update old slack length
        slack.properties.length = length;
        await this.update(slack);

        orig_seg.properties.length = length;
        await this.update(orig_seg);

        // Update new slack length
        det_slack.properties.length = split_length;

        const new_slack = await this.addSlack(
            feature_type,
            det_slack,
            orig_seg.getUrn(),
            'out',
            true
        );

        return [slack, new_slack];
    }

    /**
     * Create slack of FEATURE_TYPE from FEATURE (geoson.Feature or REC) at SIDE of SEGMENT
     * Create interal segment housed in slack
     * Update segment chain, tranfer connections
     * If AFTER is True, it will force the new seg to link in after, instead of using SIDE (used for splitting slack)
     */
    async addSlack(feature_type, feature, seg_urn, side, after = false) {
        const slack = await this.createSlackFrom(feature_type, feature);
        const seg = await this.db_view.get(seg_urn);

        // Create new seg for slack
        // Update segment chain
        const new_seg = await this.createSlackSegment(slack, seg_urn, side, after);

        // Transfer connections if necessary
        const prev_seg = await new_seg.followRef('in_segment');
        const next_seg = await new_seg.followRef('out_segment');
        const internal_segment = seg.properties.in_structure == seg.properties.out_structure;
        const connection_mgr = this.nw_view.connection_mgr;

        if (internal_segment) {
            if (prev_seg) await connection_mgr.transferConnections(prev_seg, 'out', new_seg, 'out');
            if (next_seg) await connection_mgr.transferConnections(next_seg, 'in', new_seg, 'in');
        } else {
            if (prev_seg && side == 'in')
                await connection_mgr.transferConnections(prev_seg, 'out', new_seg, 'out');

            if (next_seg && side == 'out')
                await connection_mgr.transferConnections(next_seg, 'in', new_seg, 'in');
        }

        // Transfer loc information
        await this.nw_view.loc_mgr.cloneLOCs(seg, new_seg);

        return slack;
    }

    /**
     * create slack of FEATRE_TYPE from FEATURE (geojson.Feature)
     */
    async createSlackFrom(feature_type, feature) {
        const table = await this.db_view.table(feature_type);
        const inserted_slack_id = await table.insert(feature);
        const slack = await table.get(inserted_slack_id);
        return slack;
    }

    /**
     * Create internal segment for SLACK
     */
    async createSlackSegment(slack, seg_urn, side, after) {
        this.progress(3, 'Creating slack internal segment', slack);

        const cable = await slack.followRef('cable');

        const seg = await this.addInternalSegment(
            cable,
            slack,
            seg_urn,
            side,
            slack.properties.length,
            after
        ); // Assumes field unit === meters

        return seg;
    }

    /**
     * Update properties of the internal segment of slack
     */
    async updateSlackSegment(slack) {
        for (const seg of await this.internalSegmentsOf(slack)) {
            this.progress(3, 'Updating slack internal segment', slack);
            if (seg.properties.length != slack.properties.length) {
                seg.properties.length = slack.properties.length;
                await this.update(seg);
            }

            if (seg.properties.in_structure != slack.properties.housing) {
                seg.properties.in_structure = slack.properties.housing;
                await this.update(seg);
            }

            if (seg.properties.out_structure != slack.properties.housing) {
                seg.properties.out_structure = slack.properties.housing;
                await this.update(seg);
            }

            if (seg.properties.root_housing != slack.properties.root_housing) {
                seg.properties.root_housing = slack.properties.root_housing;
                await this.update(seg);
            }
        }
    }

    /**
     *  Delete slack segment, maintain connections if they exist
     */
    async deleteSlackSegment(slack) {
        // ENH: should be handled in deleteSegments()
        const segs = await this.internalSegmentsOf(slack);
        const seg = segs[0];

        this.progress(3, 'Deleting slack internal segment', seg);
        const prev_seg = await seg.followRef('in_segment');
        const next_seg = await seg.followRef('out_segment');

        // Remove connections if no prev or next segments
        if (!prev_seg && !next_seg) await this.nw_view.connection_mgr.deleteConnections(slack);

        // Move upstream connections
        if (prev_seg)
            await this.nw_view.connection_mgr.transferConnections(seg, 'out', prev_seg, 'out');

        // Move downstream connections
        if (next_seg)
            await this.nw_view.connection_mgr.transferConnections(seg, 'in', next_seg, 'in');

        await this.deleteSegment(seg, true, false);
    }

    /**
     * Add a new internal segment for cable inside housing
     *
     * Length is in meters
     */
    async addInternalSegment(cable, housing, seg_urn, side, length = 0, after = false) {
        this.progress(3, 'Creating internal segment', cable, housing);

        const root_housing_urn = this.rootHousingUrn(housing);
        const ordered_segs = await this.orderedSegments(cable); // ENH: Just get the ones for root_housing

        let seg = undefined;
        for (const segment of ordered_segs) {
            if (segment.getUrn() == seg_urn) {
                seg = segment;
            }
        }

        if (!seg) {
            throw new Error('Segment not in cable');
        }
        // Build the new segment
        const seg_table = await this.segmentTableFor(cable);

        const det_seg = this._new_detached(seg_table);

        det_seg.properties.length = length;
        det_seg.properties.housing = housing.getUrn();
        det_seg.properties.root_housing = root_housing_urn;
        det_seg.properties.in_structure = root_housing_urn;
        det_seg.properties.out_structure = root_housing_urn;
        det_seg.properties.in_segment = null;
        det_seg.properties.out_segment = null;
        det_seg.properties.cable = cable.getUrn();
        det_seg.properties.directed = cable.properties.directed;
        det_seg.geometry = this._internalSegmentGeometryFor(housing);
        det_seg.properties.circuits = seg.properties.circuits;

        const new_seg_id = await seg_table.insert(det_seg);
        const new_seg = await seg_table.get(new_seg_id);

        const internal_segment = seg.properties.in_structure == seg.properties.out_structure;
        // Link in the new segment
        if (after) {
            // Always after when splitting
            await this.linkSegmentAfter(seg, new_seg);
        } else if (side == 'in') {
            if (!internal_segment) {
                await this.linkSegmentAfter(seg, new_seg);
            } else {
                await this.linkSegmentBefore(seg, new_seg);
            }
        } else if (side == 'out') {
            if (!internal_segment) {
                await this.linkSegmentBefore(seg, new_seg);
            } else {
                await this.linkSegmentAfter(seg, new_seg);
            }
        }
        return new_seg;
    }

    /**
     * Returns suitable geometry for internal segments housed within a feature
     */
    _internalSegmentGeometryFor(housing) {
        const coord = housing.geometry.coordinates;

        return myw.geometry.lineString([coord, coord]);
    }

    /**
     * Delete internal segments inside housing and any related connections
     */
    async deleteInternalSegments(housing, root_housing = false, keep_slack_segs = false) {
        this.progress(4, 'Deleting internal segments of', housing);

        const segs = await this.internalSegmentsOf(housing, root_housing);

        for (const seg of segs) {
            // Delete connections
            const conns = await this.segmentConnections(seg);
            for (const conn of conns) {
                await this.deleteRecord(conn);
            }

            // Keep slack segment if parent structure is deleted
            if (keep_slack_segs && this.functionOf(await seg.followRef('housing')) == 'slack')
                continue;

            await this.deleteSegment(seg, true, false); //delete slack = false

            // Get parent cable
            const cable = await seg.followRef('cable');

            // If parent cable is internal remove
            if (cable && this.isCableInternal(cable.geometry.coordinates)) {
                this.progress(4, 'Deleting internal cables of', housing);
                //TODO: Currently will fail for cables with no placement_path due to core bug 19622
                await this.deleteRecord(cable);
            }
        }
    }

    /**
     * Updates geometry of internal segments housed within a feature to match the housing
     */
    async updateInternalSegmentGeoms(housing) {
        this.progress(3, 'Updating internal segment and cable geom', housing);

        // Expected geometry for internal segment inside housing
        const int_seg_geom = this._internalSegmentGeometryFor(housing);

        const segs = await this.internalSegmentsOf(housing, true);
        const cables = new Set();

        for (const seg of segs) {
            const seg_geom = seg.geometry;
            const cable = await seg.followRef('cable');
            cables.add(cable);

            if (!geomUtils.geomCoordsEqual(int_seg_geom, seg_geom)) {
                seg.geometry = int_seg_geom;
                await this.update(seg);
            }
        }

        // Update geometry on affected cables
        for (const cable of cables) {
            await this.reBuildGeometry(cable);
        }
    }

    // -----------------------------------------------------------------------
    //                             MAINTENANCE
    // -----------------------------------------------------------------------

    /**
     * Update derived properties of segments in housing
     *
     * Also rebuilds geometry of owning cables
     *
     * Returns segments modified
     */
    async updateSegments(housing) {
        this.progress(3, 'Update segments in', housing);

        const segs = await housing.followRefSet('cable_segments');
        const cables = new Set();

        for (let seg of segs) {
            const cable = await seg.followRef('cable');
            seg = await this.updateSegment(seg);
            cables.add(cable);
        }

        // Update geometry on affected cables
        for (const cable of cables) {
            await this.reBuildGeometry(cable);
        }

        return segs;
    }

    /**
     * Update derived properties of segment based on HOUSING
     *
     * If HOUSING not provided it will be queried for
     */
    async updateSegment(seg, housing = undefined) {
        this.progress(4, 'Update segment', seg);

        if (!housing) {
            housing = await seg.followRef('housing');
        }

        await this.setSegmentGeom(seg, housing);

        // Get derived properties (taking self's direction into account)
        const derived_props = this.derivedPropsFor(seg, housing);

        seg.properties.in_structure = derived_props['in_structure'];
        seg.properties.out_structure = derived_props['out_structure'];

        seg = await this.update(seg);

        return seg;
    }

    /**
     * Update geometry of all segments in HOUSING (a route or conduit)
     *
     * Also rebuilds the geometry of owning cables
     *
     * Returns segments modified
     */
    async updateSegmentGeoms(housing) {
        this.progress(3, 'Update segment geoms', housing);

        const segs = await housing.followRefSet('cable_segments');

        const cables = {};

        for (const seg of segs) {
            await this.setSegmentGeom(seg, housing);

            const cable_rec = await seg.followRef('cable');
            if (!cables[cable_rec.id]) {
                cables[cable_rec.id] = cable_rec;
            }
        }

        // Update geometry of affected cables
        for (const cable of Object.values(cables)) {
            await this.reBuildGeometry(cable);
        }

        return segs;
    }

    /**
     * Update geometry of SEG to match HOUSING (a route or conduit)
     */
    async setSegmentGeom(seg, housing) {
        this.progress(4, 'Set segment geom', seg, housing);

        // Get geometry (taking direction into account)
        const geom = this.derivedGeomFor(seg, housing);

        // ENH: Only update if changed
        seg.geometry = geom;
        seg = await this.update(seg);

        return seg;
    }

    /**
     * Update derived properties of segments in cable
     */
    async updateCableSegments(cable) {
        this.progress(4, 'Update cable segment properties', cable);

        const segs = await cable.followRefSet('cable_segments');

        for (const seg of segs) {
            if (seg.properties.directed != cable.properties.directed) {
                seg.properties.directed = cable.properties.directed;
                await this.update(seg);
            }
        }
    }

    /**
     * Returns True if HOUSING directly contains a cable
     */
    async containsCable(housing) {
        const cable_recs = await housing.followRefSet('cable_segments');
        return cable_recs.length > 0;
    }

    /**
     * Returns True if the root housing of HOUSING contains any cable recursively
     */
    async rootHousingContainsCable(housing) {
        const root_housing_urn = this.rootHousingUrn(housing);

        for (const seg_table_name in this.segment_types) {
            const seg_table = await this.db_view.table(seg_table_name);

            const filter = `[root_housing] = '${root_housing_urn}'`;
            const pred = new FilterParser(filter).parse();
            const seg = await seg_table.query().filter([pred]).count(1);

            if (seg) {
                return true;
            }
        }

        return false;
    }

    /**
     * Finds structures at CABLE placement geometry and routes the cable
     */
    async routeCable(cable) {
        this.progress(2, 'Route cable', cable);

        const coords = this._placementGeom(cable).coordinates;

        // Find the structures at the coords
        const struct_mgr = this.nw_view.struct_mgr;
        const structs = await struct_mgr.structuresAtCoords(
            coords,
            /*featureTypes=*/ undefined,
            /*safe=*/ true
        );

        const loc_info = await this.nw_view.loc_mgr.locInfoFor(cable);

        // don't route internal cables, create child segment
        if (this.isCableInternal(coords)) {
            await this.createSegForInternalCable(cable, structs);
            return cable;
        }

        const routes = await this.findPath(structs, cable.getType());
        const changes = await this.route(cable, routes);
        await this.buildPlacementGeometry(cable, structs);

        await this.nw_view.loc_mgr.handleRerouteCable(cable, changes, loc_info);

        return cable;
    }

    /**
     * Finds structures at CABLE placement geometry and re-routes the cable
     */
    async rerouteCable(cable) {
        this.progress(2, 'Reroute cable', cable);

        const coords = this._placementGeom(cable).coordinates;

        // don't reroute internal cables
        if (this.isCableInternal(coords)) return cable;

        // Find the structures at the coords
        const struct_mgr = this.nw_view.struct_mgr;
        const structs = await struct_mgr.structuresAtCoords(coords, undefined, true);

        const routes = await this.findPath(structs, cable.getType());
        await this.update_route(cable, false, routes);
        cable = await this.buildPlacementGeometry(cable, structs);

        return cable;
    }

    /**
     * Re-routes CABLE if its geometry no longer matches that of ORIG_CABLE
     */
    async _rerouteIfGeomChanged(cable, orig_cable) {
        // Determine if placement geometry changed
        const new_placement_geom = this._placementGeom(cable);
        const orig_placement_geom = this._placementGeom(orig_cable);
        const placement_matches = geomUtils.geomCoordsEqual(
            new_placement_geom,
            orig_placement_geom
        );

        // Determine if primary geometry changed
        const new_primary_geom = cable.geometry;
        const orig_primary_geom = orig_cable.geometry;
        const primary_matches = geomUtils.geomCoordsEqual(new_primary_geom, orig_primary_geom);

        if (placement_matches && primary_matches) return cable;

        if (placement_matches && !primary_matches) {
            // Going to use primary as the placement geometry
            // Set here so it is used in the re-route
            // ENH: Better way to do this?
            // ENH: Don't believe it will ever get here
            cable.secondary_geometries.placement_path = new_primary_geom;
            await this.update(cable);
        }

        if (!placement_matches || !primary_matches) {
            cable = await this.rerouteCable(cable);
        }

        return cable;
    }

    /**
     * Delete related segments, connections, slack
     */
    async unrouteCable(cable) {
        this.progress(2, 'Unrouting cable', cable);

        const segs = await cable.followRefSet('cable_segments');

        for (const seg of segs) {
            // Delete connections
            const conns = await this.segmentConnections(seg);
            for (const conn of conns) {
                await this.deleteRecord(conn);
            }

            // Delete segment (and any owning slack)
            await this.deleteSegment(seg, /*reconnect=*/ false);
        }
    }

    /**
     * Returns placement geom for CABLE
     */
    _placementGeom(cable) {
        const placement_geom = cable.secondary_geometries.placement_path;
        if (placement_geom) {
            return placement_geom;
        }

        // No specific placement geom, use primary geometry
        return cable.geometry;
    }

    // -----------------------------------------------------------------------
    //                             SEGMENT CHAIN
    // -----------------------------------------------------------------------

    /**
     * Walk segments related to CABLE and returns in order
     *
     * SEGMENTS can be provided to save a DB query
     */
    async orderedSegments(cable, segments = undefined) {
        if (!segments) {
            segments = await cable.followRefSet('cable_segments');
        }

        // Build mapping from id -> segment
        const segs = {};
        for (const seg of segments) {
            segs[seg.id.toString()] = seg;
        }

        // Find head of segments
        let current_seg = undefined;
        for (const seg of segments) {
            if (!segs[seg.properties.in_segment]) {
                current_seg = seg;
            }
        }

        // Follow down in order from head
        const ordered_segs = [];
        while (current_seg) {
            ordered_segs.push(current_seg);
            current_seg = segs[current_seg.properties.out_segment];
        }

        return ordered_segs;
    }

    /**
     * Insert NEW_SEG into the chain before SEG
     */
    async linkSegmentBefore(seg, new_seg) {
        this.progress(2, 'Linking', new_seg, 'before', seg);

        const prev_seg = await seg.followRef('in_segment');

        // Link new_seg -> seg
        new_seg.properties.out_segment = seg.id;
        new_seg.properties.out_equipment = seg.properties.out_equipment;
        seg.properties.in_segment = new_seg.id;
        await this.update(seg);
        await this.update(new_seg);

        // Link prev_seg -> new_seg
        if (prev_seg) {
            prev_seg.properties.out_segment = new_seg.id;
            new_seg.properties.in_segment = prev_seg.id;
            new_seg.properties.in_equipment = prev_seg.properties.out_equipment;

            await this.update(prev_seg);
            await this.update(new_seg);
        }
    }

    /**
     * Insert NEW_SEG into the chain after SEG
     */
    async linkSegmentAfter(seg, new_seg) {
        this.progress(2, 'Linking', new_seg, 'after', seg);

        const next_seg = await seg.followRef('out_segment');

        // Link seg -> new_seg
        seg.properties.out_segment = new_seg.id;
        new_seg.properties.in_segment = seg.id;
        new_seg.properties.in_equipment = seg.properties.out_equipment;
        await this.update(seg);
        await this.update(new_seg);

        // Link new_seg -> next_seg
        if (next_seg) {
            new_seg.properties.out_segment = next_seg.id;
            new_seg.properties.out_equipment = next_seg.properties.in_equipment;
            next_seg.properties.in_segment = new_seg.id;
            await this.update(new_seg);
            await this.update(next_seg);
        }
    }

    /**
     * Disconnect segment SEG from chain
     */
    async disconnectSegment(seg) {
        this.progress(4, 'Disconnecting segment', seg);

        const prev_seg = await seg.followRef('in_segment');
        const next_seg = await seg.followRef('out_segment');

        // Update prev
        if (prev_seg) {
            if (next_seg) {
                prev_seg.properties.out_segment = next_seg.id;
            } else {
                prev_seg.properties.out_segment = null;
            }

            await this.update(prev_seg);
        }

        // Update next
        if (next_seg) {
            if (prev_seg) {
                next_seg.properties.in_segment = prev_seg.id;
            } else {
                next_seg.properties.in_segment = null;
            }

            await this.update(next_seg);
        }
    }

    // -------------------------------------------------------------------------
    //                              CONNECTIONS
    // -------------------------------------------------------------------------

    /**
     * All connection records for CABLE
     *
     * IS_SPLICE - None to get all connections, True to get splices only, False to get port connections only
     * SORT      - True to return connections ordered by segment chain, False for random order (but faster)
     */
    async connectionsFor(cable, is_splice = undefined, sort = false) {
        // Get cable segments
        let segs = await cable.followRefSet('cable_segments');
        if (sort) {
            segs = await this.orderedSegments(cable, segs);
        }

        // Get connections for each segment
        const conn_field_name = this.networkFor(cable).connections_field; // ENH: Replace by mgr.connsFor(seg)

        const conns = [];
        for (const seg of segs) {
            const seg_conns = await seg.followRefSet(conn_field_name);

            for (const conn of seg_conns) {
                if (is_splice == undefined || conn.properties.splice == is_splice) {
                    conns.push(conn);
                }
            }
        }

        return conns;
    }

    /**
     * Returns the highest numbered pin of CABLE that is in use
     */
    async highestConnectedPin(cable) {
        const segs = await cable.followRefSet('cable_segments');

        let max_pin = 0;

        // For each segment ..
        for (const seg of segs) {
            const seg_urn = seg.getUrn();

            // For each connection .. update high water mark
            const conns = await this.segmentConnections(seg);
            for (const conn of conns) {
                if (conn.properties.in_object == seg_urn)
                    max_pin = Math.max(max_pin, conn.properties.in_high);
                if (conn.properties.out_object == seg_urn)
                    max_pin = Math.max(max_pin, conn.properties.out_high);
            }
        }
        return max_pin;
    }

    /**
     * Move RECORD into HOUSING
     *
     * For continuous conduits, the whole length of cable is moved into it
     */
    async moveToHousing(seg, housing) {
        const conduit_mgr = this.nw_view.conduit_mgr;
        const continuous_conduit = conduit_mgr.continuousConduit(housing);

        this.progress(2, 'Moving', seg, 'to', housing, continuous_conduit);

        // If original housing was continuous conduit... move all segs out
        const original_housing = await seg.followRef('housing');
        if (conduit_mgr.continuousConduit(original_housing)) {
            await this._moveCableOutOfContinuousConduitIntoRoute(seg, original_housing);
        }

        // Move seg into continuous conduit
        if (continuous_conduit) {
            await this._moveToContinuousConduit(seg, housing);
        }

        // Move the cable segments that are in the same root housing as self into the housing
        // ENH: Just move seg?
        else {
            const cable = await seg.followRef('cable');
            const root_housing_urn = this.rootHousingUrn(housing);
            const segs = await cable.followRefSet('cable_segments');
            for (const seg of segs) {
                if (this.rootHousingUrn(seg) != root_housing_urn) {
                    continue;
                }
                this.setHousing(seg, housing);
            }
        }
    }

    /**
     *  Move each segment belonging to cable of SEG that is inside COND onto root_housing
     */
    // ENH: Share this code with self._moveToContinuousConduit
    async _moveCableOutOfContinuousConduitIntoRoute(seg, cond) {
        this.progress(8, 'Moving connected segs of', seg, 'out of', cond);
        const conduit_mgr = this.nw_view.conduit_mgr;

        // Until at start of tube .. walk upstream
        let atStart = false;
        while (!atStart) {
            const struct = await seg.followRef('in_structure');
            const prev_seg = await seg.followRef('in_segment');
            const prev_cond = await conduit_mgr.connectedConduitAt(cond, struct);

            // Case: Reached start of cable
            if (!prev_seg) {
                atStart = true;
                break;
            }

            // Case: Reached start of tube
            if (!prev_cond) {
                atStart = true;
                break;
            }

            // Move upstream .. and try again
            seg = prev_seg;
            cond = prev_cond;
            this.progress(8, 'Found upstream seg', seg);
        }

        // Until at end of tube .. move segments out of it
        let atEnd = false;
        while (!atEnd) {
            // Move seg
            this.progress(8, 'Moving seg', seg, 'to', seg.properties.root_housing);
            seg.properties.housing = seg.properties.root_housing;
            await this.update(seg);

            // Find downstream seg
            const struct = await seg.followRef('out_structure');
            const next_seg = await seg.followRef('out_segment');
            const next_cond = await conduit_mgr.connectedConduitAt(cond, struct);

            // Case: Reached end of cable
            if (!next_seg) {
                atEnd = true;
                break;
            }

            // Case: Reached end of tube
            if (!next_cond) {
                atEnd = true;
                break;
            }

            seg = next_seg;
            cond = next_cond;
        }
    }

    /**
     * Moves all segments belonging to cable of segment SEG into continuous conduit CONDUNIT
     *
     * Will raise error if:
     *   Seg is not in same root housing as conduit
     *   Slack moved into conduit
     *   Cable leaves conduit part way through run
     */
    async _moveToContinuousConduit(seg, cond) {
        if (seg.properties.root_housing != cond.properties.root_housing) {
            throw new Error('cable_not_in_conduit');
        }

        // Until at start of tube .. walk upstream
        const conduit_mgr = this.nw_view.conduit_mgr;
        let atStart = false;
        while (!atStart) {
            const struct = await seg.followRef('in_structure');
            const prev_seg = await seg.followRef('in_segment');
            const prev_cond = await conduit_mgr.connectedConduitAt(cond, struct);
            this.progress(8, prev_seg, 'Found prev conduit', prev_cond, 'at', struct);

            // Case: Reached start of cable
            if (!prev_seg) {
                atStart = true;
                break;
            }

            // Case: Reached start of tube
            if (!prev_cond) {
                atStart = true;
                break;
            }

            // Case: Internal segment (slack)
            if (this.isInternalSegment(prev_seg)) throw new Error('cable_has_slack');

            // Case: Cable and tube have diverged
            if (prev_seg.properties.root_housing != prev_cond.properties.root_housing)
                throw new Error('conduit_path_not_suitable');

            // Move upstream .. and try again
            seg = prev_seg;
            cond = prev_cond;
            this.progress(8, 'Found upstream seg', seg, cond);
        }

        await this._moveSegsIntoContinuousConduit(seg, cond);
    }

    /**
     *  Iterates over segs in cable belonging to SEG and moves into continuous conduit COND if possible
        Moves downstream starting at SEG
    */
    async _moveSegsIntoContinuousConduit(seg, cond) {
        this.progress(8, 'Moving connected segs of', seg, 'to continuous conduit', cond);

        const conduit_mgr = this.nw_view.conduit_mgr;
        const connection_mgr = this.nw_view.connection_mgr;

        // Until at end of tube .. move segments into it
        let atEnd = false;
        while (!atEnd) {
            this.progress(8, 'Updating housing of', seg, 'to', cond);
            seg.properties.housing = cond.getUrn();
            await this.update(seg);

            const struct = await seg.followRef('out_structure');
            const next_seg = await seg.followRef('out_segment');
            const next_cond = await conduit_mgr.connectedConduitAt(cond, struct);
            this.progress(8, next_seg, 'Found next conduit', next_cond, 'at', struct);

            // Case: Reached end of cable
            if (!next_seg) {
                atEnd = true;
                break;
            }

            // Case: Reached end of tube
            if (!next_cond) {
                atEnd = true;
                break;
            }

            // Case: Internal segment (slack)
            if (this.isInternalSegment(next_seg)) throw new Error('cable_has_slack');

            // Case: Connections at structure
            if (await connection_mgr.connectionsAt(seg, struct).length)
                throw new Error('conduit_path_not_suitable');
            if (await connection_mgr.connectionsAt(next_seg, struct).length)
                throw new Error('conduit_path_not_suitable');

            // Case: Cable and tube have diverged
            if (next_seg.properties.root_housing != next_cond.properties.root_housing)
                throw new Error('conduit_path_not_suitable');

            seg = next_seg;
            cond = next_cond;
        }
    }

    // -----------------------------------------------------------------------
    //                            CONTAINMENT
    // -----------------------------------------------------------------------

    /**
     * Cable segments in or connected to STRUCT
     */
    async segmentsAt(struct, include_proposed = false) {
        const struct_urn = struct.getUrn();

        let segs = [];

        for (const feature_type in this.segment_types) {
            const tab = await this.db_view.table(feature_type);
            const filter = `[in_structure] = '${struct_urn}' | [out_structure] = '${struct_urn}'`;
            const pred = new FilterParser(filter).parse();
            const ft_segs = await this.nw_view.getRecs(tab, pred, include_proposed);
            segs = [...segs, ...ft_segs];
        }

        return segs;
    }

    /**
     * Cable segments inside ROUTE
     */
    async segmentsIn(route, include_proposed = false) {
        const route_urn = route.getUrn();

        let segs = [];

        for (const feature_type in this.segment_types) {
            const tab = await this.db_view.table(feature_type);
            const filter = `[root_housing] = '${route_urn}'`;
            const pred = new FilterParser(filter).parse();
            const feature_type_segs = await this.nw_view.getRecs(tab, pred, include_proposed);
            segs = [...segs, ...feature_type_segs];
        }

        return segs;
    }

    /**
     * Returns cables records for SEGS
     */
    async cablesFor(segs) {
        // ENH: Support proposed rec in nw_view.referencedRecs
        // return await this.nw_view.referencedRecs(segs, 'cable');
        const cables = {};
        for (const seg of segs) {
            let cable = await this.db_view.get(seg.properties.cable);
            if (!cable) cable = await seg.view.get(seg.properties.cable);
            cables[cable.myw.delta + '/' + cable.getUrn()] = cable;
        }

        return Object.values(cables);
    }

    /*
     * Remove segment containment relationships to EQUIP
     *
     * Called before EQUIP deleted. Returns list of segments modified
     */
    async removeSegmentsFrom(equip) {
        const equip_urn = equip.getUrn();
        const changed_segs = new Set();

        for (const seg_ft in this.segment_types) {
            const seg_tab = await this.db_view.table(seg_ft);

            let filter, pred, segs;
            filter = `[in_equipment] = '${equip_urn}'`;
            pred = new FilterParser(filter).parse();
            segs = await seg_tab.query().filter([pred]).all();

            for (const seg of segs) {
                seg.properties.in_equipment = undefined;
                this.update(seg);
                changed_segs.add(seg);
            }

            filter = `[out_equipment] = '${equip_urn}'`;
            pred = new FilterParser(filter).parse();
            segs = await seg_tab.query().filter([pred]).all();

            for (const seg of segs) {
                seg.properties.out_equipment = undefined;
                this.update(seg);
                changed_segs.add(seg);
            }
        }

        return changed_segs;
    }

    // -------------------------------------------------------------------------
    //                              OTHER
    // -------------------------------------------------------------------------

    async orderedStructs(cable) {
        /*
        Returns structs that CABLE passes through in order
        */

        const ordered_segs = await this.orderedSegments(cable);
        const in_struct = await this.db_view.get(ordered_segs[0].properties.in_structure);
        const structs = [in_struct];
        for (const seg of ordered_segs) {
            const outseg = await this.db_view.get(seg.properties.out_structure);
            const found = structs.find(struct => struct.getUrn() === seg.properties.out_structure);
            if (!found) {
                structs.push(outseg);
            }
        }

        return structs;
    }

    /**
     * True if REC is a type of cable
     */
    isCable(rec) {
        return !!this.nw_view.cables[rec.getType()];
    }

    /**
     * True if REC is a type of cable segment
     */
    isSegment(rec) {
        return Object.keys(this.segment_types).includes(rec.getType());
    }

    /**
     * Connection records for SEG
     */
    async segmentConnections(seg, ordered = false) {
        const conn_field_name = this.segment_types[seg.getType()].connections_field;

        return seg.followRefSet(conn_field_name, ordered);
    }

    /**
     * Returns segment table for CABLE
     */
    async segmentTableFor(cable) {
        return this.db_view.table(this.segmentTypeFor(cable));
    }

    /**
     * Returns name of segment table for CABLE
     */
    segmentTypeFor(cable) {
        const network = this.networkFor(cable);
        return network.segment_type;
    }

    /**
     * Returns slack table for CABLE
     */
    slackTypeFor(cable) {
        const network = this.networkFor(cable);
        return network.slack_type;
    }
    /* eslint-disable no-prototype-builtins */
    /**
     * Returns number of fibers or pairs the cable has
     */
    pinCountFor(cable) {
        const network = this.networkFor(cable);
        const network_pins_field = network.cable_n_pins_field;
        if (cable.properties[network_pins_field]) {
            return cable.properties[network_pins_field];
        } else {
            return undefined;
        }
    }
    /* eslint-enable no-prototype-builtins */

    /**
     * Returns network definition for CABLE (a Network)
     */
    networkFor(cable) {
        const tech = this.techFor(cable);
        return this.nw_view.networks[tech];
    }

    /**
     * Returns defined tech on CABLE
     */
    techFor(cable) {
        const tech = this.configFor(cable.getType()).tech;
        return tech;
    }

    /**
     * Raises DbConstraintError if cable segment SEG has circuits on it
     *
     * Used to prevent corruption of circuit paths on cable re-route etc
     */
    async assertSegmentNoCircuits(seg) {
        // ENH: Handle circuit re-routing and remove this
        const segmentHasCircuits = await this.nw_view.circuit_mgr.segmentHasCircuits(seg);
        if (segmentHasCircuits) {
            throw new Error('cable_has_circuit', seg);
        }
    }

    /**
     * Raises DbConstraintError if any seg in HOUSING has no next segment or structure, or has connections
     */
    async assertSegmentsNoConnections(housing) {
        const segs = await this.segmentsIn(housing);
        for (const seg of segs) {
            const derived_props = this.derivedPropsFor(seg, housing);
            if (seg.properties.in_structure != derived_props['in_structure']) {
                await this.assertSegmentNoConnections(seg, derived_props['in_structure'], 'in');
            }

            if (seg.properties.out_structure != derived_props['out_structure']) {
                await this.assertSegmentNoConnections(seg, derived_props['out_structure'], 'out');
            }
        }
    }

    /**
     * Raises DbConstraintError if cable segment SEG has no next segment or has connections
     * Used to prevent corruption of cable paths on route update
     */
    async assertSegmentNoConnections(seg, new_structure, side) {
        const next_segment = side == 'in' ? seg.properties.in_segment : seg.properties.out_segment;
        if (!new_structure || next_segment) throw new Error('route_has_cable');
        const tech = this.nw_view.networkFor(seg);
        const conns = await this.nw_view.connection_mgr.connectionsOf(
            seg,
            undefined,
            undefined,
            side,
            tech
        );

        if (conns.length) throw new Error('cable_has_connection');
    }

    /**
     * Returns true if cable coords are coincident (therefore internal)
     */
    isCableInternal(coords) {
        const is_internal = false;
        if (coords.length == 2) {
            if (geomUtils.coordEqual(coords[0], coords[1])) return true;
        }

        return is_internal;
    }
}

Object.defineProperty(CableManager.prototype, 'segment_types', {
    get() {
        return this._segment_types();
    }
});

export default CableManager;
