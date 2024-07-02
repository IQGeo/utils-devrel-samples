# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine
from myworldapp.modules.comms.server.base.geom_utils import GeomUtils

from .conn import Conn
from .manager import Manager
from .mywcom_error import DbConstraintError
from sqlalchemy.sql import null


class CableManager(Manager):
    """
    Engine for routing cables via structure network traces and general cable management
    """

    cable_offset_dis = 0.0000107  # distance between route and nearest offset cable
    cable_separation_dis = 0.0000067  # distance between offset cables
    tolerance = 1e-8

    @property
    def segment_types(self):
        """
        Feature types that are cable segments
        """

        return self.nw_view.segments

    # -----------------------------------------------------------------------
    #                             TRIGGERS
    # -----------------------------------------------------------------------

    @classmethod
    def registerTriggers(self, NetworkView):
        """
        Register self's trigger methods on NETWORKVIEW
        """

        NetworkView.registerTrigger("cable", "pos_insert", self, "posInsertTrigger")
        NetworkView.registerTrigger("cable", "pos_update", self, "posUpdateTrigger")
        NetworkView.registerTrigger("cable", "pre_delete", self, "preDeleteTrigger")

        # available TMF triggers are : pre_insert_api, pos_insert_api, pos_update_api, pre_delete_api
        NetworkView.registerTrigger("cable", "pos_get_api", self, "posGetTriggerApi")
        NetworkView.registerTrigger("cable", "pos_insert_api", self, "posInsertTriggerApi")

    def posInsertTrigger(self, cable):
        """
        Called after CABLE is inserted"""
         
        self.progress(2, "Running insert trigger", cable)

        if self._placementGeom(cable):
            self.routeCable(cable)
            if self.techFor(cable) == "coax":
                self.createCableOffsetGeom(cable)

    def posUpdateTrigger(self, cable, orig_cable):
        """
        Called after CABLE is updated

        ORIGCABLE is a pre-update clone of the cable"""

        self.progress(2, "Running update trigger", cable)

        if cable.directed != orig_cable.directed:
            self.updateCableSegments(cable)

        # Automatically re-route cable only if geometry changed (either primary or placement)
        self._rerouteIfGeomChanged(cable, orig_cable)

    def preDeleteTrigger(self, cable):
        """
        Called before CABLE is deleted"""

        self.progress(2, "Running delete trigger", cable)

        # Maintaining LOC needs to be done in two phases.
        loc_recs_for_ripple = self.nw_view.loc_mgr.handleCableDelete(cable)
     
        self.unrouteCable(cable)

        self.nw_view.loc_mgr.handleCableDeleteRipple(loc_recs_for_ripple)

    # -----------------------------------------------------------------------
    #                        TMF EXTERNAL API TRIGGERS
    # -----------------------------------------------------------------------

    def posGetTriggerApi(self, cable, *args):
        """
        Called on TMF API get
        """
        pass

    def posInsertTriggerApi(self, cable, *args):
        """
        Called on TMF API insert
        """
        pass
        

    # -----------------------------------------------------------------------
    #                             OFFSET CABLES
    # -----------------------------------------------------------------------

    def createCableOffsetGeom(self, cable):
        """
        Saves new offset cable in 'offset_geom' geometry
        """

        ordered_segs = self.orderedSegments(cable)

        # no offset geometry for internal cables
        if len(ordered_segs) == 1 and self.isInternalSegment(ordered_segs[0]):
            return

        offset_cable = self.newOffsetForCable(ordered_segs)

        cable._field("offset_geom").set(offset_cable)
        self.update(cable)
        return cable

    def newOffsetForCable(self, ordered_segs):
        """
        Creates a new offset cable. Always starts and ends at structures, the same locations as the route.
        If proposed offset line is too close to other offsets, it first trys the other side and then increases the offset distance.
        Line truncation distance is 1.5 times offset.
        """

        geoms_to_avoid = self.getRouteOffsets(ordered_segs)

        count = 0
        offset_distance = self.cable_offset_dis
        while count < 8:
            offset_distance = abs(offset_distance)
            trunc_distance = 1.5 * offset_distance

            if (count % 2) == 0:
                if count != 0:
                    # increment nonzero even number
                    offset_distance += self.cable_separation_dis
            else:
                # use same offset on opposite side
                offset_distance *= -1

            ordered_coords = []
            # offset each segment, with original endpoints
            for index, segment in enumerate(ordered_segs):
                segment_geom = segment._primary_geom_field.geom()
                offset_segment_geom = segment_geom.offset_curve(offset_distance, join_style="mitre")
                next_coords = list(offset_segment_geom.coords)
                if index == 0:
                    ordered_coords += next_coords
                else:
                    ordered_coords += next_coords[1:]

            # truncate start and end points to create angle to structure
            truncate_coords = self.truncateLine(ordered_coords, trunc_distance, trunc_distance)
            # add start and end points from original line
            first_segment_geom = ordered_segs[0]._primary_geom_field.geom()
            last_segment_geom = ordered_segs[-1]._primary_geom_field.geom()
            truncate_coords.insert(0, first_segment_geom.coords[0])
            truncate_coords.append(last_segment_geom.coords[-1])
            offset_geom = MywLineString(truncate_coords)

            if all(self.isValidOffset(offset_geom, other_geom) for other_geom in geoms_to_avoid):
                return MywLineString(offset_geom.coords)
            count += 1

        return None

    def isValidOffset(self, offset_geom, other_geom):
        """
        Compares the average distance of two linestrings
        """
        total = 0
        for coord in offset_geom.coords:
            total += other_geom.distance(MywPoint(coord))

        count = len(offset_geom.coords.xy[0])
        ave = total / count
        return ave > 1e-6

    def truncateLine(self, coords, start_trunc_dis=None, end_trunc_dis=None):
        """
        Shortens the line on each side using shapely interpolate
        Returns coords
        """
        geom = MywLineString(coords)

        if start_trunc_dis is not None:
            start = geom.interpolate(start_trunc_dis)
            coords[0] = list(start.coords)[0]

        if end_trunc_dis is not None:
            end = geom.interpolate(geom.length - end_trunc_dis)
            coords[-1] = list(end.coords)[0]

        return coords

    def getRouteOffsets(self, segments):
        """
        Queries the root_housing of the passed in segment
        Returns existing coax cables in the same housing
        """

        cable_offsets = {}
        for segment in segments:
            housing = segment._field("root_housing").rec()
            housing_segs = []
            if "cable_segments" in housing._descriptor.fields:
                housing_segs = housing._field("cable_segments").recs()
            segment_urn = segment._urn()
            for other_segment in housing_segs:
                if other_segment._urn() != segment_urn:
                    cable = other_segment._field("cable").rec()
                    if cable.feature_type == "coax_cable":
                        if cable._urn() not in cable_offsets:
                            offset_geom = cable._field("offset_geom").geom()
                            cable_offsets[cable._urn()] = MywLineString(offset_geom.coords)

        return cable_offsets.values()

    # -----------------------------------------------------------------------
    #                             ROUTING
    # -----------------------------------------------------------------------

    def findPath(self, structs, cable_type=None):
        """
        Find routes forming shortest path joining STRUCTS

        Returns an ordered list of (ROUTE,FORWARD) tuples"""

        # ENH: Make CABLE_TYPE mandatory

        self.progress(1, "Finding routes linking", structs)

        # Build network engine
        route_filters = self.routeFiltersFor(cable_type)
        network_engine = MywNetworkEngine.newFor(
            self.db_view,
            self.db.config_manager.networkDef("mywcom_routes"),
            extra_filters=route_filters,
        )

        # For each pair of structures .. find path
        routes = []
        for i in range(0, len(structs) - 1):
            routes += self.findPathBetween(structs[i], structs[i + 1], network_engine)

        return routes

    def route(self, cable, *routes):
        """
        'Enter' CABLE into ROUTES (a list of route,forward tuples)

        Builds join route <-> cable_seg <-> cable + sets CABLE geometry"""

        self.progress(1, "Routing", cable, "to", len(routes), "routes")

        seg_table = self.segmentTableFor(cable)

        # Create segments
        segs = []
        for route, forward in routes:
            seg = self.createDetachedSegment(seg_table, cable, route, forward)
            seg = seg_table.insert(seg)
            segs.append(seg)

        # Connect them
        for i, seg in enumerate(segs):
            if i > 0:
                seg.in_segment = segs[i - 1].id
            if i < len(segs) - 1:
                seg.out_segment = segs[i + 1].id

        # Set cable geometry
        self.buildGeometry(cable, routes)

    def update_route(self, cable, dry_run=False, *routes):
        """
        Update routing of CABLE to ROUTES (a list of route,forward tuples)

        Updates join route <-> cable_seg <-> cable + sets CABLE geometry.
        Also updates (or removes) connections at each structure the
        cable passes through.

        If DRY_RUN then no DB changes are made

        Returns dict with keys:
          add_routes                    Routes in which a segment has been added
          remove_routes                 Routes in which a segment has been deleted
          same_routes                   Routes in which a segment is unchanged
          connection_updates            Connection records that have been updated
          connection_deletes            Connection records that have been deleted
          affected_structures           Structures in which connections have been changed
          affected_structure_internals  Structures in which internal segments deleted
          total_disconnects             Total number of connections deleted
          total_disassociations         Total number of internal segments disassociated
        """

        self.progress(1, "Update Routing", cable, "to", len(routes), "routes", "dry_run=", dry_run)

        # Set of routes cable will now run along
        new_routes = set(r[0] for r in routes)

        # Current routes cable is in
        current_routes = set()

        current_segs = cable._field("cable_segments").recs()
        delete_segs_urns = []

        # Get current routes
        for seg in current_segs:

            # Gets the root housing as segment may be housed in a conduit
            # and we want the top level route. Could also be inside a structure (internal segment)
            if not self.isInternalSegment(seg):
                root_housing = seg._field("root_housing").rec()
                current_routes.add(root_housing)

        # Create new segments (where necessary)
        (new_segs, delete_segs) = self._updateSegments(cable, routes, current_segs, dry_run)

        # Connect them
        # ENH: Use linkSegment() helpers
        if not dry_run:
            for i, seg in enumerate(new_segs):

                # Determine 'in' segment
                if i == 0:
                    in_id = None
                    in_equip = None
                else:
                    in_id = new_segs[i - 1].id
                    in_equip = new_segs[i - 1].out_equipment

                # Determine 'out' segment
                if i == (len(new_segs) - 1):
                    out_id = None
                    out_equip = None
                else:
                    out_id = new_segs[i + 1].id
                    out_equip = new_segs[i + 1].in_equipment

                # Update record
                has_id = in_id or seg.in_segment
                new_id = seg.in_segment != str(in_id)
                if has_id and new_id:
                    self.assertSegmentNoCircuits(seg)
                    self.progress(3, "Updating segment", i, seg, "in_segment=", in_id)
                    seg.in_segment = in_id
                    seg.in_equipment = in_equip
                    self.update(seg)

                has_id = out_id or seg.out_segment
                new_id = seg.out_segment != str(out_id)
                if has_id and new_id:
                    self.assertSegmentNoCircuits(seg)
                    self.progress(3, "Updating segment", i, seg, "in_segment=", out_id)
                    seg.out_segment = out_id
                    seg.out_equipment = out_equip
                    self.update(seg)

        # Maintain connections
        (
            conn_updates,
            conn_deletes,
            n_disconnects,
            affected_structures,
        ) = self._updateConns(new_segs, delete_segs, dry_run)

        # Gather information on structures that house internal segments that will be deleted
        (
            n_disassociations,
            affected_structure_internals,
        ) = self.structuresContainingInternalSegments(delete_segs)

        if not dry_run:
            # Delete segments no longer required
            # Also takes care of delete related slack
            # Can safely delete these without reconnecting in/out segments as the remaining segments
            # have already been connected into an orderly path without these orphans
            for del_seg in delete_segs:
                delete_segs_urns.append(del_seg._urn())
                self.deleteSegment(del_seg, reconnect=False)

            # Set cable geometry
            self.buildGeometry(cable, routes)

        return {
            "connection_updates": conn_updates,
            "connection_deletes": conn_deletes,
            "add_routes": new_routes - current_routes,
            "remove_routes": current_routes - new_routes,
            "same_routes": new_routes.intersection(current_routes),
            "total_disconnects": n_disconnects,
            "total_disassociations": n_disassociations,
            "affected_structures": affected_structures,
            "affected_structure_internals": affected_structure_internals,
            "deleted_segs": delete_segs_urns,
        }

    def createSegForInternalCable(self, cable, structs):
        """
        Create child segment for internal cable
        """

        self.progress(1, "Routing internal", cable, "in", structs[0])

        housing = structs[0]
        housing_urn = housing._urn()

        seg_table = self.segmentTableFor(cable)
        seg = seg_table._new_detached()
        seg.cable = cable._urn()
        seg.directed = cable.directed
        seg.housing = housing_urn
        seg.root_housing = self.rootHousingUrn(housing)
        seg.forward = True
        seg.in_structure = housing_urn
        seg.out_structure = housing_urn

        # set the seg geom back to the cable gteom
        geom = cable._primary_geom_field.geom()
        seg._primary_geom_field.set(geom)
        seg = seg_table.insert(seg)

    def _updateSegments(self, cable, routes, current_segs=None, dry_run=False):
        """
        Find segments changes for re-routing CABLE to ROUTES (a list of routes)

        Unless dry run, also creates any new segments required (!!)

        Returns:
          segments         # New segment path
          drop_segments    # Segments no longer required"""

        table = self.segmentTableFor(cable)

        # Get current segments in path order
        current_segs = self.orderedSegments(cable, current_segs)

        # Get new segments in path order
        new_segs = []
        for route, forward in routes:
            new_seg = self.createDetachedSegment(table, cable, route, forward)
            new_segs.append(new_seg)

        segments = []
        matched_existing_segs = set()

        # Compare segments proposed for routes to existing segments
        # The proposed routes do not include internal segments, so these have special handling
        # during the comparision
        current_index = -1
        for detached_seg in new_segs:

            matched_existing_seg = False

            for check_index in range(current_index + 1, len(current_segs)):

                existing_seg = current_segs[check_index]
                internal_seg = self.isInternalSegment(existing_seg)

                if internal_seg:
                    if matched_existing_seg:
                        # We already have a match for the proposed new segment, and we have an existing internal segment,
                        if detached_seg.out_structure == existing_seg.out_structure:

                            # Looks like a good match at the end of the new segment, include it and carry on to look at the next segment
                            segments.append(existing_seg)
                            matched_existing_segs.add(existing_seg)
                            current_index = check_index
                            continue
                        else:
                            break
                    else:
                        # We do not have a match for the proposed new segment, and we have an existing internal segment
                        if detached_seg.in_structure == existing_seg.in_structure:

                            # Looks like a good match at the start of the new segment, include it and carry on to look at the next segment
                            segments.append(existing_seg)
                            matched_existing_segs.add(existing_seg)
                            current_index = check_index
                            continue

                if matched_existing_seg:
                    break

                if self._segmentsMatch(detached_seg,existing_seg):                    

                    # Got a good match
                    matched_existing_seg = True
                    segments.append(existing_seg)
                    matched_existing_segs.add(existing_seg)
                    current_index = check_index
                    continue

            if not matched_existing_seg:

                # Didn't find a match
                if not dry_run:
                    inserted_segment = table.insert(detached_seg)
                    segments.append(inserted_segment)
                else:
                    segments.append(detached_seg)

        # Build list of segments no longer required
        drop_segs = set(current_segs) - matched_existing_segs

        return segments, drop_segs

    def _updateConns(self, new_segs, drop_segs, dry_run=False):
        """
        Find connect records changes for a cable re-route to NEW_SEGS

        Unless dry_run is true, also make the changes

        Returns:
          conn_updates
          conn_deletes
          n_disconnects
          affected_structures"""

        # Build list of connection records to change
        conn_changes = self._connChanges(drop_segs, new_segs)

        # Init stats
        conn_updates = []
        conn_deletes = []
        n_disconnects = 0
        affected_structures = {}

        # For each change .. build database updates (and apply)
        for urn, conn_change in conn_changes.items():
            conn = conn_change["feature"]

            if (
                conn_change.get("in_object") == "dropped"
                or conn_change.get("out_object") == "dropped"
            ):

                # One or both sides of the connection are now dangling, so delete it
                conn_deletes.append(urn)

                # Get count of actual disconnects
                conn_disconnects = Conn(
                    conn
                ).to_pins.size  # Assumes from/to range sizes always match
                n_disconnects += conn_disconnects

                if not dry_run:
                    self.progress(2, "Deleting connection", conn)
                    self.deleteRecord(conn)

                # Update info about affected structures
                struct_urn = conn_change["feature"].root_housing
                struct_changes = affected_structures.get(struct_urn)
                if not struct_changes:
                    struct_changes = affected_structures[struct_urn] = {"disconnects": 0}
                struct_changes["disconnects"] += conn_disconnects

            else:
                conn_updates.append(urn)

                if not dry_run:

                    for prop in ["in_object", "out_object"]:
                        if prop in conn_change:
                            val = conn_change[prop]
                            self.progress(2, "Updating connection", conn, prop, val)
                            conn[prop] = val

                    self.update(conn)

        return conn_updates, conn_deletes, n_disconnects, affected_structures

    def _connChanges(self, old_segs, new_segs):
        """
        Find new properties for connections of OLD_SEGS (which are to be dropped)

        NEW_SEGS is a list of segment recs that will be added to the cable path

        Returns a dict of CONN_CHANGE objects (keyed by conn_rec URN). Each CONN_CHANGE has properties:
         feature     Connection record
         in_object   New value for 'in_object' field (None if no longer valid)
         out_object  New value for 'out_object' field (None if no longer valid)"""

        # Build lookup struct_urn -> new_seg
        struct_new_segs = {}
        for new_seg in new_segs:
            segs = struct_new_segs.get(new_seg.in_structure)
            if not segs:
                segs = {"in_segs": [], "out_segs": [], "int_segs": []}
                struct_new_segs[new_seg.in_structure] = segs

            segs = struct_new_segs.get(new_seg.out_structure)
            if not segs:
                segs = {"in_segs": [], "out_segs": [], "int_segs": []}
                struct_new_segs[new_seg.out_structure] = segs

            if new_seg.in_structure == new_seg.out_structure:
                struct_new_segs[new_seg.in_structure]["int_segs"].append(new_seg)
            else:
                struct_new_segs[new_seg.in_structure]["out_segs"].append(new_seg)
                struct_new_segs[new_seg.out_structure]["in_segs"].append(new_seg)

        # For each segment to be dropped .. find connection mappings
        conn_changes = {}
        for old_seg in old_segs:
            self._addConnChangesFor(old_seg, struct_new_segs, conn_changes)

        return conn_changes

    def _addConnChangesFor(self, old_seg, new_segs, conn_changes):
        """
        Find new properties for connections of OLD_SEGS (which are to be dropped)

        NEW_SEGS is a list of sets of new segments, keyed by structure URN"""

        self.progress(5, "Finding connection changes for", old_seg)

        # For each connection ..
        for conn_rec in self.segmentConnections(old_seg, ordered=True):
            self.progress(8, "Processing", conn_rec, "in structure", conn_rec.root_housing)

            conn_change = conn_changes.get(conn_rec._urn())

            if not conn_change:
                conn_change = conn_changes[conn_rec._urn()] = {"feature": conn_rec}

            if conn_rec.in_object == old_seg._urn():
                conn_change["in_object"] = self._newSegmentFor(old_seg, conn_rec.in_side, new_segs)

            if conn_rec.out_object == old_seg._urn():
                conn_change["out_object"] = self._newSegmentFor(
                    old_seg, conn_rec.out_side, new_segs
                )

        return conn_changes

    def _newSegmentFor(self, old_seg, side, new_segs):
        """
        Find segment of NEW_SEGS to connect to in place of SIDE of OLD_SEG

        NEW_SEGS is a list of lists of new segments, keyed by structure URN

        Returns a URN or None"""

        new_seg_urn = "dropped"

        if side == "in":
            struct_urn = old_seg.in_structure
            segs = new_segs.get(struct_urn, {}).get("out_segs")
            self.progress(8, old_seg, "Candidate new segs in", struct_urn, segs)
            if segs and len(segs) == 1:
                new_seg_urn = segs[0]._urn()

        if side == "out":
            struct_urn = old_seg.out_structure
            segs = new_segs.get(struct_urn, {}).get("in_segs")
            self.progress(8, old_seg, "Candidate new segs in", struct_urn, segs)
            if segs and len(segs) == 1:
                new_seg_urn = segs[0]._urn()

        self.progress(7, "Mapping", old_seg, "to", new_seg_urn)

        return new_seg_urn  # ENH: Return the segment

    def createDetachedSegment(self, table, cable, housing, forward):
        """
        Create a cable segment for CABLE in HOUSING

        FORWARD indicates if the segment is the
        same direction as housing or reversed"""

        self.progress(3, "Adding segment", cable, "->", housing, forward)

        # Determine in and out structures
        geom = housing._primary_geom_field.geom()
        if forward:
            in_structure_urn = housing.in_structure
            out_structure_urn = housing.out_structure
        else:
            in_structure_urn = housing.out_structure
            out_structure_urn = housing.in_structure
            geom = geom.reverse()  # Reverses geometry

        # Create join housing <-> cable_seg <-> cable
        seg = table._new_detached()
        seg.cable = cable._urn()
        seg.directed = cable.directed
        seg.housing = housing._urn()
        seg.root_housing = self.rootHousingUrn(housing)
        seg.forward = forward
        seg.in_structure = in_structure_urn
        seg.out_structure = out_structure_urn

        seg._primary_geom_field.set(geom)

        return seg

    def _segmentsMatch(self, seg1, seg2):
        """
        Check if two segments match topologically at the root housing level
        """
             
        return (seg1.in_structure == seg2.in_structure 
            and seg1.out_structure == seg2.out_structure 
            and seg1.root_housing == seg2.root_housing)

    def reBuildGeometries(self, segs):
        """
        Set geometry of all cables of SEGS
        """

        cables = {}
        for seg in segs:
            cable_rec = seg._field("cable").rec()
            if cable_rec.id not in cables:
                cables[cable_rec.id] = cable_rec

        # Update geometry of affected cables
        for id, cable in cables.items():
            self.reBuildGeometry(cable)

    def reBuildGeometry(self, cable):
        """
        Set the geometry for CABLE from its segments
        """

        self.progress(2, "Rebuilding primary geometry for", cable)

        ordered_segs = self.orderedSegments(cable)
        self.buildGeometry(cable, ordered_segs)

    def buildGeometry(self, cable, segs):
        """
        Set the geometry for CABLE from the geoms of SEGS
        """

        # Build geometry
        new_cable_geom = self.calcGeometry(segs)

        # If no new geometry and original geom is not none, set cable geom to none
        orig_cable_geom = cable._primary_geom_field.geom()
        if not new_cable_geom:
            if orig_cable_geom:
                primary_geom_name = cable._descriptor.primary_geom_name
                cable[primary_geom_name] = null()
                self.update(cable)
            return

        # Check for unchanged
        if GeomUtils.coordsEqual(orig_cable_geom, new_cable_geom):
            return

        # Set it
        cable._primary_geom_field.set(new_cable_geom)

        return self.update(cable)

    def calcGeometry(self, segs):
        """
        Construct geometry from SEGS

        SEGS is an ordered list of segments or (route,forward) pairs
        """
        # ENH: Duplicated with conduit manager and circuit manager?

        coords = []

        for seg in segs:

            if isinstance(seg, (tuple, list)):
                seg, forward = (seg[0], seg[1])
            else:
                forward = True

            seg_geom = seg._primary_geom_field.geom()

            step = 1 if forward else -1
            for c in seg_geom.coords[::step]:
                if coords and c == coords[-1]:
                    continue
                coords.append(c)

        # Prevent wrong geometry being built
        coords = self.fixupLineStringCoords(coords)
        if not coords:
            return None

        return MywLineString(coords)

    def reBuildPlacementGeometry(self, cable):
        """
        Sets the placement geometry for CABLE based on geometry of structs
        it passes though
        """

        structs = self.orderedStructs(cable)
        self.buildPlacementGeometry(cable, structs)

    def buildPlacementGeometry(self, cable, structs):
        """
        Sets the placement geometry for CABLE based on geometry of STRUCTS
        """

        self.progress(2, "Rebuilding placement geometry for", cable)

        # Build geometry
        coords = []

        for struct in structs:
            struct_geom = struct._primary_geom_field.geom()

            for c in struct_geom.coords:
                if coords and c == coords[-1]:
                    continue
                coords.append(c)

        coords = self.fixupLineStringCoords(coords)
        new_placement_geom = MywLineString(coords)
        orig_placement_geom = cable._field("placement_path").geom()

        # Set cable secondary geom to null if necesary
        if not coords:
            if orig_placement_geom:
                cable["placement_path"] = null()
                self.update(cable)
            return

        # Only perform update if geom has changed
        if GeomUtils.coordsEqual(orig_placement_geom, new_placement_geom):
            return cable

        # Set it on the object
        cable._field("placement_path").set(new_placement_geom)
        self.update(cable)
        return cable

    def findPathBetween(self, struct1, struct2, network_engine):
        """
        Find the structure path STRUCT1 -> STRUCT2

        Returns ordered list of (route,forward) tuples"""

        self.progress(3, "Finding path between", struct1, struct2)

        struct1_urn = struct1._urn()
        struct2_urn = struct2._urn()

        # Find path between them
        res = network_engine.shortestPath(struct1_urn, struct2_urn)

        if not res:
            raise MywError("no_path", struct1=struct1_urn, struct2=struct2_urn)

        # Flatten to ordered list
        recs = res.subTreeFeatures()

        # Extract routes
        prev_rec = None
        routes = []
        for rec in recs:
            self.progress(8, "Checking trace item", rec)

            if rec.feature_type in self.nw_view.routes:
                forward = rec.in_structure == prev_rec._urn()  # ENH: Yuck!
                routes.append((rec, forward))

                self.progress(6, "Found", rec, forward)

            prev_rec = rec

        self.progress(4, "Found", len(routes), "routes")

        # Check for not suitable for cable creation
        # ENH: Handle cable with degenerate linear geom?
        if not routes:
            raise MywError("No routes in path:", struct1_urn, "->", struct2_urn)

        return routes

    def deleteSegment(self, seg, reconnect=True, delete_slack=True):
        """
        Delete cable segment SEG

        Also deletes owning features if necesary

        If RECONNECT then reconnects segments either side of the segment
        If DELETE_SLACK and seg is owned by a slack then delete that slack"""

        self.progress(3, "Deleting segment", seg)

        if reconnect:
            self.disconnectSegment(seg)
        else:
            self.assertSegmentNoCircuits(seg)

        # Delete owning slack (if necessary)
        if delete_slack and self.isInternalSegment(seg):
            housing = seg._field("housing").rec()

            if housing and self.functionOf(housing) == "slack":
                self.deleteRecord(housing)

        # Delete segment
        self.deleteRecord(seg)

    def structuresContainingInternalSegments(self, segs):
        """
        Finds structures of internal segments of SEGS

        Returns:
          N_DISASSOCIATIONS  total number of disassociations
          STRUCTURES         dict of dicts of disassociation counts, keyed by structure URN"""

        structures = {}

        n_disassociations = 0

        for seg in segs:
            if self.isInternalSegment(seg):

                struct_urn = seg._field("root_housing").rec()._urn()

                struct_entry = structures.get(struct_urn)
                if not struct_entry:
                    struct_entry = structures[struct_urn] = {"disassociations": 0}
                struct_entry["disassociations"] += 1

                n_disassociations += 1

        return n_disassociations, structures

    # -------------------------------------------------------------------------
    #                                 CONFIG ACCESS
    # -------------------------------------------------------------------------

    def routeFiltersFor(self, cable_type):
        """
        Trace filter to exclude route types that cannot house CABLE_TYPE

        Returns dict of form:
          <route_type>: 'false'"""

        # Find types that can house feature type
        housing_types = self.configFor(cable_type).get("housings")
        if not housing_types:
            return {}

        # Build list of route types to exclude
        filters = {}
        for route_type in self.nw_view.routes:
            if not route_type in housing_types:
                filters[route_type] = "false"

        return filters

    def configFor(self, cable_type):
        """
        The configuration for CABLE_TYPE (a cable or conduit type)

        Returns dict"""

        for configs in [self.nw_view.cables, self.nw_view.conduits]:
            if cable_type in configs:
                return configs[cable_type]

        return {}

    # -----------------------------------------------------------------------
    #                             SPLITTING
    # -----------------------------------------------------------------------

    def splitSegmentsAt(self, struct, route, new_route, cnd_splits, proportion):
        """
        Split all segments of ROUTE at STRUCT, putting new bits in NEW_ROUTE

        CND_SPLITS is a list of (conduit,new_conduit) pairs, keyed by old conduit URNs

        Returns list of (segment,new_segment) pairs, keyed by urn of split segment"""

        # Build housing lookup
        splits = {}
        splits.update(cnd_splits)
        splits[route._urn()] = (route, new_route)

        # Split cable segments
        seg_splits = {}

        for seg_tab_name in self.segment_types:
            seg_table = self.db_view.table(seg_tab_name)
            segs = seg_table.filterOn("root_housing", route._urn())

            for seg in segs.orderBy("id"):
                (housing, new_housing) = splits[seg.housing]
                new_seg = self._splitSegmentAt(seg, struct, housing, new_housing, proportion)
                seg_splits[seg._urn()] = (seg, new_seg)

        return seg_splits

    def _splitSegmentAt(self, seg, struct, housing, new_housing, proportion):
        """
        Split SEG of HOUSING at STRUCT, putting new bit into NEW_HOUSING

        Returns segment created"""

        self.progress(2, "Splitting", seg, "at", struct)

        # Create new segment
        new_seg = self.insertCopy(seg)
        self.setHousing(new_seg, new_housing)

        # Set geometries
        self.setSegmentGeom(seg, housing)
        self.setSegmentGeom(new_seg, new_housing)

        # Set end structures and ticks
        if seg.forward:
            seg._field("out_structure").set([struct])
            seg.out_equipment = None
            seg.out_tick = None

            new_seg._field("in_structure").set([struct])
            new_seg.in_equipment = None
            new_seg.in_tick = None
        else:
            seg._field("in_structure").set([struct])
            seg.in_equipment = None
            seg.in_tick = None

            new_seg._field("out_structure").set([struct])
            new_seg.out_equipment = None
            new_seg.out_tick = None

        # Adjust lengths
        if seg._descriptor.fields.get("length") and seg.length:
            original_length = seg.length
            seg.length = original_length * proportion
            new_seg.length = original_length * (1 - proportion)

        self.update(seg)

        # Link new segment into chain
        if seg.forward:
            self.linkSegmentAfter(seg, new_seg)
        else:
            self.linkSegmentBefore(seg, new_seg)

        # Move connections
        if seg.forward:
            self.moveConnections(seg, new_seg, "out")
        else:
            self.moveConnections(seg, new_seg, "in")

        # Add circuit info
        new_seg.circuits = seg.circuits

        return new_seg

    def moveConnections(self, from_seg, to_seg, side):
        """
        Move connections on SIDE of FROM_SEG to TO_SEG

        Called after a segment is split"""

        # ENH: Delegate to ConnectionManager

        self.progress(2, "Moving", side, "connections from", from_seg, "to", to_seg)

        from_urn = from_seg._urn()
        to_urn = to_seg._urn()

        # For each connection record ..
        for conn_rec in self.segmentConnections(from_seg):

            if conn_rec.in_side == side and conn_rec.in_object == from_urn:
                conn_rec.in_object = to_urn
                self.update(conn_rec)

            if conn_rec.out_side == side and conn_rec.out_object == from_urn:
                conn_rec.out_object = to_urn
                self.update(conn_rec)

    def splitCableAt(self, cable, segment, forward, splice_housing=None):
        """
        Splits CABLE after SEGMENT (if FORWARD) or before SEGMENT (if not FORWARD).
        Optionally connect fibres that aren't already connected using SPLICE_HOUSING as container
        """

        self.progress(3, "Splitting cable ", cable, segment, forward, splice_housing)

        new_cable = self.insertCopy(cable)
        other_segment = self.transferSegments(segment, cable, new_cable, forward)

        # Update geometries on old cable and set them on new one.
        self.reBuildGeometry(cable)
        self.reBuildGeometry(new_cable)
        self.reBuildPlacementGeometry(cable)
        self.reBuildPlacementGeometry(new_cable)

        # Mainly doing this to ensure any name managers run.
        self.nw_view.runPosUpdateTriggers(new_cable, new_cable)

        if splice_housing:
            pin_count = self.pinCountFor(cable)
            self.nw_view.connection_mgr.spliceSegments(
                segment, other_segment, splice_housing, forward, pin_count
            )

        return new_cable

    def transferSegments(self, segment, cable, new_cable, forward):
        """
        Transfer segments from CABLE to NEW_CABLE after SEGMENT onwards (if FORWARD) or
        before SEGMENT backwards (if not FORWARD)
        """

        self.progress(3, "Transfer segments", segment, cable, new_cable, forward)

        ordered_segs = self.orderedSegments(cable)
        if not forward:
            ordered_segs = reversed(ordered_segs)

        transfer = False
        other_segment = None
        for seg in ordered_segs:

            if transfer:
                seg.cable = new_cable._urn()
                slack_type = self.slackTypeFor(cable)
                if seg.housing.startswith(slack_type):
                    slack = self.db_view.get(seg.housing)
                    slack.cable = new_cable._urn()
                    self.update(slack)

                self.update(seg)

                if not other_segment:
                    other_segment = seg

            if seg == segment:
                transfer = True

        self.progress(3, "Transfer segments other_segment=", other_segment)

        # Clear out/in segment refs at the split
        if forward:
            segment.out_segment = None
            other_segment.in_segment = None
        else:
            segment.in_segment = None
            other_segment.out_segment = None
        self.update(segment)
        self.update(other_segment)

        return other_segment

    # -----------------------------------------------------------------------
    #                             INTERNAL SEGMENTS
    # -----------------------------------------------------------------------

    def isInternalSegment(self, seg):
        """
        Returns true if segment feature is an internal segment
        """
        # ENH: Have a segment model

        return seg.in_structure == seg.out_structure

    def internalSegmentsOf(self, housing, root_housing=False):
        """
        Returns internal segments inside HOUSING
        """

        field_name = "housing"
        if root_housing:
            field_name = "root_housing"

        segs = []

        for seg_tab_name in self.segment_types:
            seg_table = self.db_view.table(seg_tab_name)

            for seg in seg_table.filterOn(field_name, housing._urn()):
                if self.isInternalSegment(seg):
                    segs.append(seg)
        return segs

    def splitSlack(self, slack, length):
        """
        Split SLACK at LENGTH

        Creates new slack with length of SLACK length - LENGTH
        Returns original slack and new slack"""

        orig_seg = self.internalSegmentsOf(slack)[0]
        feature_type = slack.feature_type
        det_slack = slack._clone()

        split_length = slack.length - length

        # Update old slack length
        slack.length = length
        self.update(slack)

        orig_seg.length = length
        self.update(orig_seg)

        # Update new slack length
        det_slack.length = split_length

        new_slack = self.addSlack(feature_type, det_slack, orig_seg._urn(), "out", True)

        return [slack, new_slack]

    def addSlack(self, feature_type, feature, seg_urn, side, after=False):
        """
        Create slack of FEATURE_TYPE from FEATURE (geoson.Feature or REC) at SIDE of SEGMENT
        Create interal segment housed in slack
        Update segment chain, tranfer connections

        If AFTER is True, it will force the new seg to link in after, instead of using SIDE (used for splitting slack)"""

        slack = self.createSlackFrom(feature_type, feature)
        seg = self.db_view.get(seg_urn)

        # Create new seg for slack
        # Update segment chain
        new_seg = self.createSlackSegment(slack, seg_urn, side, after)

        # Transfer connections if necessary
        prev_seg = new_seg._field("in_segment").rec()
        next_seg = new_seg._field("out_segment").rec()
        internal_segment = seg.in_structure == seg.out_structure
        connection_mgr = self.nw_view.connection_mgr

        # Case: internal cable
        if internal_segment:
            if prev_seg:
                connection_mgr.transferConnections(prev_seg, "out", new_seg, "out")
            if next_seg:
                connection_mgr.transferConnections(next_seg, "in", new_seg, "in")
        else:
            if prev_seg and side == "in":
                connection_mgr.transferConnections(prev_seg, "out", new_seg, "out")

            if next_seg and side == "out":
                connection_mgr.transferConnections(next_seg, "in", new_seg, "in")

        # Transfer loc information
        self.nw_view.loc_mgr.cloneLOCs(seg, new_seg)

        return slack

    def createSlackFrom(self, feature_type, feature):
        """
        create slack of FEATRE_TYPE from FEATURE (geojson.Feature)
        """

        return self.db_view.table(feature_type).insert(feature)

    def createSlackSegment(self, slack, seg_urn, side, after):
        """
        Create internal segment for SLACK
        """

        self.progress(3, "Creating slack internal segment", slack)

        cable = slack._field("cable").rec()

        seg = self.addInternalSegment(
            cable, slack, seg_urn, side, slack.length, after
        )  # Assumes field unit is meters

        return seg

    def updateSlackSegment(self, slack):
        """
        Update properties of the internal segment of slack
        """

        for seg in self.internalSegmentsOf(slack):
            self.progress(3, "Updating slack internal segment", slack)
            if seg.length != slack.length:
                seg.length = slack.length
                self.update(seg)

            if seg.in_structure != slack.housing:
                seg.in_structure = slack.housing
                self.update(seg)

            if seg.out_structure != slack.housing:
                seg.out_structure = slack.housing
                self.update(seg)

            if seg.root_housing != slack.root_housing:
                seg.root_housing = slack.root_housing
                self.update(seg)

    def deleteSlackSegment(self, slack):
        """
        Delete slack segment, maintain connections if they exist

        ENH: should be handled in deleteSegments()"""

        seg = self.internalSegmentsOf(slack)[0]

        self.progress(3, "Deleting slack internal segment", seg)
        prev_seg = seg._field("in_segment").rec()
        next_seg = seg._field("out_segment").rec()

        # Remove connections if no prev or next segments
        if not prev_seg and not next_seg:
            self.nw_view.connection_mgr.deleteConnections(slack)

        # Move upstream connections
        if prev_seg:
            self.nw_view.connection_mgr.transferConnections(seg, "out", prev_seg, "out")

        # Move downstream connections
        if next_seg:
            self.nw_view.connection_mgr.transferConnections(seg, "in", next_seg, "in")

        self.deleteSegment(seg, True, False)

    def addInternalSegment(self, cable, housing, seg_urn, side, length=0, after=False):
        """
        Add a new internal segment for cable inside housing

        Length is in meters"""

        self.progress(3, "Creating internal segment", cable, housing)

        root_housing_urn = self.rootHousingUrn(housing)
        ordered_segs = self.orderedSegments(cable)  # ENH: Just get the ones for root_housing

        seg = None

        for segment in ordered_segs:
            if segment._urn() == seg_urn:
                seg = segment

        if seg is None:
            raise MywError("Segment not in cable")

        # Build the new segment
        seg_table = self.segmentTableFor(cable)

        det_seg = seg_table._new_detached()

        det_seg.length = length
        det_seg.housing = housing._urn()
        det_seg.root_housing = root_housing_urn
        det_seg.in_structure = root_housing_urn
        det_seg.out_structure = root_housing_urn
        det_seg.in_segment = None
        det_seg.out_segment = None
        det_seg.cable = cable._urn()
        det_seg.directed = cable.directed
        det_seg._primary_geom_field.set(self._internalSegmentGeometryFor(housing))
        det_seg.circuits = seg.circuits

        new_seg = seg_table.insert(det_seg)

        internal_segment = seg.in_structure == seg.out_structure

        # Link in the new segment
        if after:  # Always after when splitting
            self.linkSegmentAfter(seg, new_seg)
        elif side == "in":
            if not internal_segment:
                self.linkSegmentAfter(seg, new_seg)
            else:
                self.linkSegmentBefore(seg, new_seg)
        elif side == "out":
            if not internal_segment:
                self.linkSegmentBefore(seg, new_seg)
            else:
                self.linkSegmentAfter(seg, new_seg)

        return new_seg

    def _internalSegmentGeometryFor(self, housing):
        """
        Returns suitable geometry for internal segments housed within a feature"""

        coord = housing._primary_geom_field.geom().coord

        return MywLineString([coord, coord])

    def deleteInternalSegments(self, housing, root_housing=False, keep_slack_segs=False):
        """
        Delete internal segments inside housing and any related connections
        """

        self.progress(4, "Deleting internal segments of", housing)

        segs = self.internalSegmentsOf(housing, root_housing)

        for seg in segs:

            # Delete connections
            for conn in self.segmentConnections(seg):
                self.deleteRecord(conn)

            # Keep slack segment if parent structure is deleted
            if keep_slack_segs and self.functionOf(seg._field("housing").rec()) == "slack":
                continue

            self.deleteSegment(seg, delete_slack=False)

            # Get parent cable
            cable = seg._field("cable").rec()

            # If parent cable is internal remove
            if cable and self.isCableInternal(cable._primary_geom_field.geom().coords):
                self.progress(4, "Deleting internal cables of", housing)
                self.deleteRecord(cable)

    def updateInternalSegmentGeoms(self, housing):
        """
        Updates geometry of internal segments housed within a feature to match the housing

        Also rebuilds geometry of owning cables

        """

        self.progress(3, "Updating internal cable and segment geom", housing)

        # Expected geometry for internal segment inside housing
        int_seg_geom = self._internalSegmentGeometryFor(housing)

        segs = self.internalSegmentsOf(housing, True)
        cables = set()

        for seg in segs:
            seg_geom = seg._primary_geom_field.geom()

            cable = seg._field("cable").rec()
            cables.add(cable)

            if not GeomUtils.coordsEqual(int_seg_geom, seg_geom):
                seg._primary_geom_field.set(int_seg_geom)
                self.update(seg)

        # Update geometry on affected cables
        for cable in cables:
            self.reBuildGeometry(cable)

    # -----------------------------------------------------------------------
    #                             MAINTENANCE
    # -----------------------------------------------------------------------

    def updateSegments(self, housing):
        """
        Update derived properties of segments in housing

        Also rebuilds geometry of owning cables

        Returns segments modified"""

        self.progress(3, "Update segments in", housing)

        segs = housing._field("cable_segments").recs()
        cables = set()

        for seg in segs:
            cable = seg._field("cable").rec()
            seg = self.updateSegment(seg)
            cables.add(cable)

        # Update geometry on affected cables
        for cable in cables:
            self.reBuildGeometry(cable)

        return segs

    def updateSegment(self, seg, housing=None):
        """
        Update derived properties of segment based on HOUSING

        If HOUSING not provided it will be queried for"""

        self.progress(4, "Update segment", seg)

        if not housing:
            housing = seg._field("housing").rec()

        self.setSegmentGeom(seg, housing)

        # Get derived properties (taking self's direction into account)
        derived_props = self.derivedPropsFor(seg, housing)

        seg.in_structure = derived_props["in_structure"]
        seg.out_structure = derived_props["out_structure"]

        seg = self.update(seg)

        return seg

    def updateSegmentGeoms(self, housing):
        """
        Update geometry of all segments in HOUSING (a route or conduit)

        Also rebuilds the geometry of owning cables

        Returns segments modified"""

        self.progress(3, "Update segment geoms", housing)

        segs = housing._field("cable_segments").recs()

        cables = {}

        for seg in segs:
            self.setSegmentGeom(seg, housing)

            cable_rec = seg._field("cable").rec()
            if cable_rec.id not in cables:
                cables[cable_rec.id] = cable_rec

        # Update geometry of affected cables
        for id, cable in cables.items():
            self.reBuildGeometry(cable)

        return segs

    def setSegmentGeom(self, seg, housing):
        """
        Update geometry of SEG to match HOUSING (a route or conduit)
        """

        self.progress(4, "Set segment geom", seg, housing)

        # Get geometry (taking direction into acocunt)
        geom = self.derivedGeomFor(seg, housing)

        # ENH: Only update if changed
        seg._primary_geom_field.set(geom)
        seg = self.update(seg)

        return seg

    def updateCableSegments(self, cable):
        """
        Update derived properties of segments in cable"""

        self.progress(4, "Update cable segment properties", cable)

        segs = cable._field("cable_segments").recs()

        for seg in segs:
            if seg.directed != cable.directed:
                seg.directed = cable.directed
                self.update(seg)

    def containsCable(self, housing):
        """
        Returns True if HOUSING directly contains a cable
        """

        return len(housing._field("cable_segments").recs()) > 0

    def rootHousingContainsCable(self, housing):
        """
        Returns True if the root housing of HOUSING contains any cable recursively
        """

        root_housing_urn = self.rootHousingUrn(housing)

        for seg_table_name in self.segment_types:
            seg_table = self.db_view.table(seg_table_name)

            if seg_table.filterOn("root_housing", root_housing_urn).count(1):
                return True

        return False

    def routeCable(self, cable):
        """
        Finds structures at CABLE placement geometry and routes the cable"""

        self.progress(2, "Route cable", cable)

        coords = self._placementGeom(cable).coords

        # Find the structures at the coords
        struct_mgr = self.nw_view.struct_mgr
        structs = struct_mgr.structuresAtCoords(coords, safe=True)

        # don't route internal cables, create child segment
        if self.isCableInternal(coords):
            self.createSegForInternalCable(cable, structs)
            return cable

        routes = self.findPath(structs, cable.feature_type)
        self.route(cable, *routes)
        cable = self.buildPlacementGeometry(cable, structs)

        return cable

    def rerouteCable(self, cable):
        """
        Finds structures at CABLE placement geometry and re-routes the cable"""

        self.progress(2, "Reroute cable", cable)

        coords = self._placementGeom(cable).coords

        # don't reroute internal cables
        if self.isCableInternal(coords):
            return cable

        # Find the structures at the coords
        struct_mgr = self.nw_view.struct_mgr
        structs = struct_mgr.structuresAtCoords(coords, safe=True)

        loc_info = self.nw_view.loc_mgr.locInfoFor(cable)

        routes = self.findPath(structs, cable.feature_type)
        changes = self.update_route(cable, False, *routes)
        cable = self.buildPlacementGeometry(cable, structs)

        self.nw_view.loc_mgr.handleRerouteCable(cable, changes, loc_info)

        return cable

    def _rerouteIfGeomChanged(self, cable, orig_cable):
        """
        Re-routes CABLE if its geometry no longer matches that of ORIG_CABLE
        """

        # Determine if placement geometry changed
        new_placement_geom = self._placementGeom(cable)
        orig_placement_geom = self._placementGeom(orig_cable)
        placement_matches = GeomUtils.coordsEqual(new_placement_geom, orig_placement_geom)

        # Determine if primary geometry changed
        new_primary_geom = cable._primary_geom_field.geom()
        orig_primary_geom = orig_cable._primary_geom_field.geom()
        primary_matches = GeomUtils.coordsEqual(new_primary_geom, orig_primary_geom)

        if placement_matches and primary_matches:
            # no need to reroute
            return cable

        if placement_matches and not primary_matches:
            # Going to use primary as the placement geometry
            # Set here so it is used in the re-route
            # ENH: Better way to do this?
            # ENH: Don't believe it will ever get here
            cable._field("placement_path").set(new_primary_geom)
            self.update(cable)

        if not placement_matches or not primary_matches:
            cable = self.rerouteCable(cable)
            # ** Do not update offset on cable update **
            # if self.techFor(cable) == "coax":
            #     cable = self.createCableOffsetGeom(cable)

        return cable

    def unrouteCable(self, cable):
        """
        Delete related segments, connections, slack
        """

        self.progress(2, "Unrouting cable", cable)

        segs = cable._field("cable_segments").recs()

        for seg in segs:

            # Delete connections
            for conn in self.segmentConnections(seg):
                self.deleteRecord(conn)

            # Delete segment (and any owning slack)
            self.deleteSegment(seg, reconnect=False)

    def _placementGeom(self, cable):
        """
        Returns placement geom for CABLE
        """

        placement_geom = cable._field("placement_path").geom()
        if placement_geom:
            return placement_geom

        # No specific placement geom, use primary geometry
        return cable._primary_geom_field.geom()

    # -----------------------------------------------------------------------
    #                             SEGMENT CHAIN
    # -----------------------------------------------------------------------

    def orderedSegments(self, cable, segments=None):
        """
        Walk segments related to CABLE and returns in order

        SEGMENTS can be provided to save a DB query"""

        if not segments:
            segments = cable._field("cable_segments").recs()

        # Build mapping from id -> segment
        segs = {}
        for seg in segments:
            segs[str(seg.id)] = seg

        # Find head of segments
        current_seg = None
        for seg in segments:
            if not segs.get(str(seg.in_segment)):
                current_seg = seg

        # Follow down in order from head
        ordered_segs = []
        while current_seg:
            ordered_segs.append(current_seg)
            current_seg = segs.get(str(current_seg.out_segment))

        return ordered_segs

    def linkSegmentBefore(self, seg, new_seg):
        """
        Insert NEW_SEG into the chain before SEG
        """

        self.progress(2, "Linking", new_seg, "before", seg)

        prev_seg = seg._field("in_segment").rec()

        # Link new_seg -> seg
        new_seg._field("out_segment").set(seg)
        new_seg.out_equipment = seg.in_equipment
        seg._field("in_segment").set(new_seg)
        self.update(seg)

        # Link prev_seg -> new_seg
        if prev_seg:
            prev_seg._field("out_segment").set(new_seg)
            new_seg._field("in_segment").set(prev_seg)
            new_seg.in_equipment = prev_seg.out_equipment
            self.update(prev_seg)
            self.update(new_seg)

    def linkSegmentAfter(self, seg, new_seg):
        """
        Insert NEW_SEG into the chain after SEG
        """

        self.progress(2, "Linking", new_seg, "after", seg)

        next_seg = seg._field("out_segment").rec()

        # Link seg -> new_seg
        seg._field("out_segment").set(new_seg)
        new_seg._field("in_segment").set(seg)
        new_seg.in_equipment = seg.out_equipment

        self.update(seg)

        # Link new_seg -> next_seg
        if next_seg:
            new_seg._field("out_segment").set(next_seg)
            new_seg.out_equipment = next_seg.in_equipment
            next_seg._field("in_segment").set(new_seg)
            self.update(new_seg)
            self.update(next_seg)

    def disconnectSegment(self, seg):
        """
        Disconnect segment SEG from chain
        """

        self.progress(4, "Disconnecting segment", seg)

        prev_seg = seg._field("in_segment").rec()
        next_seg = seg._field("out_segment").rec()

        # Update prev
        if prev_seg:
            if next_seg:
                prev_seg.out_segment = next_seg.id
            else:
                prev_seg.out_segment = None

            self.update(prev_seg)

        # Update next
        if next_seg:
            if prev_seg:
                next_seg.in_segment = prev_seg.id
            else:
                next_seg.in_segment = None

            self.update(next_seg)

    # -------------------------------------------------------------------------
    #                              CONNECTIONS
    # -------------------------------------------------------------------------

    def connectionsFor(self, cable, is_splice=None, sort=False):
        """
        All connection records for CABLE

        IS_SPLICE - None to get all connections, True to get splices only, False to get port connections only
        SORT      - True to return connections ordered by segment chain, False for random order (but faster)
        """

        # Get cable segments
        segs = cable._field("cable_segments").recs()
        if sort:
            segs = self.orderedSegments(cable, segs)

        # Get connections for each segment
        conn_field_name = self.networkFor(
            cable
        ).connections_field  # ENH: Replace by mgr.connsFor(seg)

        conns = []
        for seg in segs:
            seg_conns = seg._field(conn_field_name).recs()

            for conn in seg_conns:
                if is_splice is None or (conn.splice == is_splice):
                    conns.append(conn)

        return conns

    def highestConnectedPin(self, cable):
        """
        Returns the highest numbered pin of CABLE that is in use
        """

        segs = cable._field("cable_segments").recs()

        max_pin = 0

        # For each segment ..
        for seg in segs:
            seg_urn = seg._urn()

            # For each connection .. update high water mark
            for conn in self.segmentConnections(seg):
                if conn.in_object == seg_urn:
                    max_pin = max(max_pin, conn.in_high)
                if conn.out_object == seg_urn:
                    max_pin = max(max_pin, conn.out_high)

        return max_pin

    def moveToHousing(self, seg, housing):
        """
        Move SEG into housing

        For continuous conduits, the whole length of the segment's cable is moved into it"""

        conduit_mgr = self.nw_view.conduit_mgr
        continuous_conduit = conduit_mgr.continuousConduit(housing)

        self.progress(2, "Moving", seg, "to", housing, continuous_conduit)

        # If original housing was continuous conduit... move all segs out
        original_housing = seg._field("housing").rec()
        if conduit_mgr.continuousConduit(original_housing):
            self._moveCableOutOfContinuousConduitIntoRoute(seg, original_housing)

        # Move seg into continuous conduit
        if continuous_conduit:
            self._moveToContinuousConduit(seg, housing)

        # Move the cable segments that are in the same root_housing as self into the conduit
        # ENH: Just move seg?
        else:
            cable = seg._field("cable").rec()
            root_housing_urn = self.rootHousingUrn(housing)
            for seg in cable._field("cable_segments").recs():
                if self.rootHousingUrn(seg) != root_housing_urn:
                    continue
                self.setHousing(seg, housing)

    def _moveCableOutOfContinuousConduitIntoRoute(self, seg, cond):
        """
        Move each segment belonging to cable of SEG that is inside COND onto root_housing

        ENH: Share this code with self._moveToContinuousConduit"""

        self.progress(8, "Moving connected segs of", seg, "out of", cond)
        conduit_mgr = self.nw_view.conduit_mgr

        # Until at start of tube .. walk upstream
        while True:
            struct = seg._field("in_structure").rec()
            prev_seg = seg._field("in_segment").rec()
            prev_cond = conduit_mgr.connectedConduitAt(cond, struct)

            # Case: Reached start of cable
            if not prev_seg:
                break

            # Case: Reached start of tube
            if not prev_cond:
                break

            # Move upstream .. and try again
            seg = prev_seg
            cond = prev_cond
            self.progress(8, "Found upstream seg", seg)

        # Until at end of tube .. move segments out of it
        while True:
            # Move seg
            self.progress(8, "Moving seg", seg, "to", seg.root_housing)
            seg.housing = seg.root_housing
            self.update(seg)

            # Find downstream seg
            struct = seg._field("out_structure").rec()
            next_seg = seg._field("out_segment").rec()
            next_cond = conduit_mgr.connectedConduitAt(cond, struct)

            # Case: Reached end of cable
            if not next_seg:
                break

            # Case: Reached end of tube
            if not next_cond:
                break

            seg = next_seg
            cond = next_cond

    def _moveToContinuousConduit(self, seg, cond):
        """
        Moves all segments belonging to cable of segment SEG into continuous conduit CONDUNIT

        Will raise error if:
         Seg is not in same root housing as conduit
         Slack moved into conduit
         Cable leaves conduit part way through run"""

        if seg.root_housing != cond.root_housing:
            raise DbConstraintError("cable_not_in_conduit")

        # Until at start of tube .. walk upstream
        conduit_mgr = self.nw_view.conduit_mgr
        while True:
            struct = seg._field("in_structure").rec()
            prev_seg = seg._field("in_segment").rec()
            prev_cond = conduit_mgr.connectedConduitAt(cond, struct)
            self.progress(8, prev_seg, "Found prev conduit", prev_cond, "at", struct)

            # Case: Reached start of cable
            if not prev_seg:
                break

            # Case: Reached start of tube
            if not prev_cond:
                break

            # Case: Internal segment (slack)
            if self.isInternalSegment(prev_seg):
                raise DbConstraintError("cable_has_slack")

            # Case: Cable and tube have diverged
            if prev_seg.root_housing != prev_cond.root_housing:
                raise DbConstraintError("conduit_path_not_suitable")

            # Move upstream .. and try again
            seg = prev_seg
            cond = prev_cond
            self.progress(8, "Found upstream seg", seg, cond)

        self._moveSegsIntoContinuousConduit(seg, cond)

    def _moveSegsIntoContinuousConduit(self, seg, cond):
        """
        Iterates over segs in cable belonging to SEG and moves into continuous conduit COND if possible
        Moves downstream starting at SEG
        """

        self.progress(8, "Moving connected segs of", seg, "to continuous conduit", cond)

        conduit_mgr = self.nw_view.conduit_mgr
        connection_mgr = self.nw_view.connection_mgr

        # Until at end of tube .. move segments into it
        while True:
            self.progress(8, "Updating housing of", seg, "to", cond)
            seg.housing = cond._urn()
            self.update(seg)

            struct = seg._field("out_structure").rec()
            next_seg = seg._field("out_segment").rec()
            next_cond = conduit_mgr.connectedConduitAt(cond, struct)
            self.progress(8, next_seg, "Found next conduit", next_cond, "at", struct)

            # Case: Reached end of cable
            if not next_seg:
                break

            # Case: Reached end of tube
            if not next_cond:
                break

            # Case: Internal segment (slack)
            if self.isInternalSegment(next_seg):
                raise DbConstraintError("cable_has_slack")

            # Case: Connections at structure
            if connection_mgr.connectionsAt(seg, struct):
                raise DbConstraintError("conduit_path_not_suitable")
            if connection_mgr.connectionsAt(next_seg, struct):
                raise DbConstraintError("conduit_path_not_suitable")

            # Case: Cable and tube have diverged
            if next_seg.root_housing != next_cond.root_housing:
                raise DbConstraintError("conduit_path_not_suitable")

            seg = next_seg
            cond = next_cond

    # -----------------------------------------------------------------------
    #                            CONTAINMENT
    # -----------------------------------------------------------------------

    def segmentsAt(self, struct, include_proposed=False):
        """
        Cable segments in or connected to STRUCT
        """

        struct_urn = struct._urn()

        segs = []

        for feature_type in self.segment_types:
            tab = self.db_view.table(feature_type)
            pred = (tab.field("in_structure") == struct_urn) | (
                tab.field("out_structure") == struct_urn
            )

            segs += self.nw_view.getRecs(tab, pred, include_proposed)

        return segs

    def segmentsIn(self, route, include_proposed=False):
        """
        Cable segments inside ROUTE
        """

        route_urn = route._urn()

        segs = []

        for feature_type in self.segment_types:
            tab = self.db_view.table(feature_type)
            pred = tab.field("root_housing") == route_urn

            segs += self.nw_view.getRecs(tab, pred, include_proposed)

        return segs

    def cablesFor(self, segs):
        """
        Returns cables records for SEGS
        """

        return self.nw_view.referencedRecs(segs, "cable")

    def removeSegmentsFrom(self, equip):
        """
        Remove segment containment relationships to EQUIP

        Called before EQUIP is deleted. Returns list of segments modified
        """

        equip_urn = equip._urn()
        changed_segs = set()

        for seg_ft in self.segment_types:
            seg_tab = self.db_view.table(seg_ft)

            for seg in seg_tab.filterOn("in_equipment", equip_urn):
                seg.in_equipment = None
                self.update(seg)
                changed_segs.add(seg)

            for seg in seg_tab.filterOn("out_equipment", equip_urn):
                seg.out_equipment = None
                self.update(seg)
                changed_segs.add(seg)

        return changed_segs

    # -------------------------------------------------------------------------
    #                              OTHER
    # -------------------------------------------------------------------------

    def orderedStructs(self, cable):
        """
        Returns structs that CABLE passes through in order
        """

        ordered_segs = self.orderedSegments(cable)
        structs = [self.db_view.get(ordered_segs[0].in_structure)]
        for seg in ordered_segs:
            structs.append(self.db_view.get(seg.out_structure))

        return structs

    def isCable(self, rec):
        """
        True if REC is a type of cable
        """

        return self.nw_view.cables.get(rec.feature_type) is not None

    def isSegment(self, rec):
        """
        True if REC is a type of cable segment
        """

        return rec.feature_type in self.segment_types

    def segmentConnections(self, seg, ordered=False):
        """
        Connection records for SEG
        """

        conn_field_name = self.segment_types[seg.feature_type].connections_field

        return seg._field(conn_field_name).recs(ordered=ordered)

    def segmentTableFor(self, cable):
        """
        Returns segment table for CABLE
        """

        return self.db_view.table(self.segmentTypeFor(cable))

    def segmentTypeFor(self, cable):
        """
        Returns name of segment table for CABLe
        """

        network = self.networkFor(cable)
        return network.segment_type

    def slackTypeFor(self, cable):
        """
        Returns slack table for CABLE
        """

        network = self.networkFor(cable)
        return network.slack_type

    def pinCountFor(self, cable):
        """
        Returns number of fibers or pairs the cable has
        """

        network = self.networkFor(cable)
        return getattr(cable, network.cable_n_pins_field)

    def networkFor(self, cable):
        """
        Returns network definition for CABLE (a Network)
        """
        tech = self.techFor(cable)
        return self.nw_view.networks[tech]

    def techFor(self, cable):
        """
        Returns defined tech on CABLE
        """
        tech = self.configFor(cable.feature_type).get("tech")
        return tech

    def assertSegmentNoCircuits(self, seg):
        """
        Raises DbConstraintError if cable segment SEG has circuits on it

        Used to prevent corruption of circuit paths on cable re-route etc"""

        # ENH: Handle circuit re-routing and remove this

        if self.nw_view.circuit_mgr.segmentHasCircuits(seg):
            raise DbConstraintError("cable_has_circuit", feature=seg)

    def assertSegmentsNoConnections(self, housing):
        """
        Raises DbConstraintError if any seg in HOUSING has no next segment or structure, or has connections
        """

        segs = self.segmentsIn(housing)
        for seg in segs:
            # Throw error if segment would disconnect cable
            derived_props = self.derivedPropsFor(seg, housing)
            if seg.in_structure != derived_props["in_structure"]:
                self.assertSegmentNoConnections(seg, derived_props["in_structure"], "in")

            if seg.out_structure != derived_props["out_structure"]:
                self.assertSegmentNoConnections(seg, derived_props["out_structure"], "out")

    def assertSegmentNoConnections(self, seg, new_structure, side):
        """
        Raises DbConstraintError if cable segment SEG has no next segment or structure, or has connections

        Used to prevent corruption of cable paths on route update"""

        next_segment = seg.in_segment if side == "in" else seg.out_segment
        if new_structure is None or next_segment:
            raise DbConstraintError("route_has_cable")

        tech = self.nw_view.networkFor(seg)
        conns = self.nw_view.connection_mgr.connectionsOf(seg, side=side, tech=tech).limit(1).all()
        if conns:
            raise DbConstraintError("cable_has_connection")

    def isCableInternal(self, coords):
        """
        Returns true if cable coords are coincident (therefor internal)
        """

        is_internal = False
        if len(coords) == 2:
            if coords[0] == coords[1]:
                return True

        return is_internal
