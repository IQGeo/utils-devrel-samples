# Copyright: IQGeo Limited 2010-2023
import sys
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.modules.comms.server.base.geom_utils import GeomUtils
from myworldapp.core.server.base.core.myw_error import MywError

from .mywcom_error import DbConstraintError
from .manager import Manager


class StructureManager(Manager):
    """
    Manager for maintaining structures

    Maintains structure network connectivity and containment"""

    # Junction feature type
    junctionType = "mywcom_route_junction"

    # Tolerance when scanning for routes
    route_tolerance = 0.1

    # Tolerance when scanning for structures
    struct_tolerance = 1.0

    # -----------------------------------------------------------------------
    #                             TRIGGERS
    # -----------------------------------------------------------------------

    @classmethod
    def registerTriggers(self, NetworkView):
        """
        Register self's trigger methods on NETWORKVIEW
        """

        NetworkView.registerTrigger("struct", "pos_insert", self, "structPosInsertTrigger")
        NetworkView.registerTrigger("struct", "pos_update", self, "structPosUpdateTrigger")
        NetworkView.registerTrigger("struct", "pre_delete", self, "structPreDeleteTrigger")

        NetworkView.registerTrigger("route", "pos_insert", self, "routePosInsertTrigger")
        NetworkView.registerTrigger("route", "pos_update", self, "routePosUpdateTrigger")
        NetworkView.registerTrigger("route", "pre_delete", self, "routePreDeleteTrigger")

    # -----------------------------------------------------------------------
    #                             STRUCTURE MANAGEMENT
    # -----------------------------------------------------------------------

    def structPosInsertTrigger(self, struct):
        """
        Called after STRUCT is inserted
        """
        # ENH: Prevent place structure on another structure

        # if replacing a structure, don't run this trigger method
        # (but we do want to invoke other trigger methods like the name manager)
        if hasattr(struct, "isReplacing"):
            return

        self.progress(1, "Adding", struct)

        geom = struct._primary_geom_field.geom()
        junct = self.structureAt(geom.coord, [self.junctionType])

        if junct:

            # Snapping might have occured in structureAt
            geom = junct._primary_geom_field.geom()
            struct._primary_geom_field.set(geom)

            self.replaceStructure(junct, struct)
            self.deleteRecord(junct)
        else:
            self.splitRoutesWith(struct)

        # Update circuits
        segs = self.nw_view.cable_mgr.segmentsAt(struct)
        self.nw_view.circuit_mgr.updateCircuitsAtStruct(segs, None, geom.coord)

    def structPosUpdateTrigger(self, struct, preUpdateStruct=None):
        """
        Called after STRUCT is updated
        """

        self.progress(1, "Updating", struct)

        # Do we want to reconnect structures at end points
        updateGeoms = preUpdateStruct is None

        if preUpdateStruct:
            new_coord = struct._primary_geom_field.geom().coord
            original_coord = preUpdateStruct._primary_geom_field.geom().coord
            updateGeoms = new_coord != original_coord

        if not updateGeoms:
            # Nothing more to do
            return

        # Update location of contained objects
        self.nw_view.equip_mgr.updateEquipGeoms(struct)
        self.nw_view.cable_mgr.updateInternalSegmentGeoms(struct)
        self.nw_view.connection_mgr.updateConnGeoms(struct)
        self.nw_view.loc_mgr.updateLOCGeomsAtStruct(struct)

        # Update ends of connected routes (and their contained objects)
        # ENH: Avoid duplicate rebuild of cable and circuit paths
        routes = self.routesOf(struct)
        for route in routes:
            self.updateRouteGeom(route, struct)
        self.nw_view.loc_mgr.updateLOCGeomsInRoutes(routes)

        # Split routes if necessary
        self.splitRoutesWith(struct, routes)

        # Update circuits
        segs = self.nw_view.cable_mgr.segmentsAt(struct)
        self.nw_view.circuit_mgr.updateCircuitsAtStruct(segs, original_coord, new_coord)

    def structPreDeleteTrigger(self, struct):
        """
        Called before STRUCT is removed
        """

        self.progress(1, "Removing", struct)

        # Delete all contained equipment
        self.nw_view.equip_mgr.deleteEquipmentInStructure(struct)

        if struct.feature_type == self.junctionType:
            # Already a junction, nothing more to do
            return

        routes = self.routesOf(struct)

        if len(routes) == 0:
            # No related routes, nothing more to do
            return

        # Create junction to support routes
        coord = struct._primary_geom_field.geom().coord
        junct = self.placeJunctionAt(coord)
        self.replaceStructure(struct, junct)

    # Have a new method on structure manager that takes in everything from the api
    def replaceStructureWith(self, feature, featureType, id, newFeature):

        """
        create slack of FEATRE_TYPE from FEATURE (geojson.Feature)
        """
        # create your new strutcure

        oldFeatTable = self.db_view.table(featureType)
        ogFeature = oldFeatTable.get(id)
        geom = ogFeature._primary_geom_field.geom()

        newFeatureTable = self.db_view.table(newFeature)
        try:
            newCreatedFeature = newFeatureTable.insert(feature)
        except:
            raise MywError("unable_to_insert")

        newCreatedFeature._primary_geom_field.set(geom)

        self.replaceStructure(ogFeature, newCreatedFeature)
        self.updateInternalSegmentsFor(ogFeature, newCreatedFeature)

        self.updateEquipmentFor(ogFeature, newCreatedFeature)
        self.updateConnectionsFor(ogFeature, newCreatedFeature)

        oldFeatTable.delete(ogFeature)

        newCreatedFeature.isReplacing = True
        self.nw_view.runPosInsertTriggers(newCreatedFeature)

        return newCreatedFeature

    def replaceStructure(self, struct, newStruct):
        """
        Reconnect routes to new structure
        """

        self.progress(4, "Replacing", struct, newStruct)

        structUrn = struct._urn()

        routes = self.routesOf(struct)

        for route in routes:

            # ENH: Use connectRoute()
            if route.in_structure == structUrn:
                route._field("in_structure").set([newStruct])

            if route.out_structure == structUrn:
                route._field("out_structure").set([newStruct])

            self.update(route)

            # Update cable segments (which also updates cable geometry)
            self.nw_view.cable_mgr.updateSegments(route)

            # Update conduits
            self.nw_view.conduit_mgr.updateConduits(route)

        # Update slacks
        for slack in self.nw_view.equip_mgr.slacksIn(struct):

            if slack.root_housing == structUrn:
                slack._field("root_housing").set([newStruct])

            if slack.housing == structUrn:
                slack._field("housing").set([newStruct])

            self.update(slack)

            self.nw_view.cable_mgr.updateSlackSegment(slack)

    def updateInternalSegmentsFor(self, struct, newStruct):
        """Updates internal segment references"""
        for seg in self.nw_view.cable_mgr.internalSegmentsOf(struct, root_housing=True):
            seg._field("root_housing").set([newStruct])
            seg._field("housing").set([newStruct])
            seg._field("in_structure").set([newStruct])
            seg._field("out_structure").set([newStruct])
            self.update(seg)

    def updateConnectionsFor(self, struct, newStruct):
        """
        Updates connection housings
        """
        for connection in self.nw_view.connection_mgr.connectionsIn(struct):
            self._updateHousingsFor(struct, newStruct, connection)

    def updateEquipmentFor(self, struct, newStruct):
        """
        Updates Equipment Housings
        """

        for equip in self.nw_view.equip_mgr.equipsIn(struct):
            self._updateHousingsFor(struct, newStruct, equip)

    def _updateHousingsFor(self, struct, newStruct, featureRec):
        """Updates featureRec housing and root housing from struct to newStruct"""
        structUrn = struct._urn()

        if featureRec.root_housing == structUrn:
            self.progress(3, "Updating", featureRec, "setting housings to", newStruct)

            featureRec._field("root_housing").set([newStruct])
            if featureRec.housing == structUrn:
                featureRec._field("housing").set([newStruct])

            self.update(featureRec)

    def ensureStructuresFor(self, route):
        """
        Create a route junction at ends of 'route' (if necessary)at end

        Also ensures endpoints of route snapped to structures

        May result in splitting of other routes"""

        # ENH: Rename as setRouteStructures()

        geom = route.primaryGeometry()

        # Split existing routes at end points
        in_struct = self.ensureStructureAt(geom.coords[0], [route])
        out_struct = self.ensureStructureAt(geom.coords[-1], [route])

        # Connect route to structures and snap geom
        geom_updated = False
        if in_struct:
            route._field("in_structure").set([in_struct])
            in_coord = in_struct._primary_geom_field.geom().coord

            if geom.coords[0] != in_coord:
                geom = GeomUtils.setVertex(geom, 0, in_coord)
                geom_updated = True

        if out_struct:
            route._field("out_structure").set([out_struct])
            out_coord = out_struct._primary_geom_field.geom().coord

            if geom.coords[-1] != out_coord:
                geom = GeomUtils.setVertex(geom, -1, out_coord)
                geom_updated = True

        if geom_updated:
            route._primary_geom_field.set(geom)

        route = self.update(route)
        return route

    def ensureStructureAt(self, coord, ignore_routes=None):
        """
        Create a route junction at COORD (if necessary)

        Splits any existing routes at COORD (except IGNORE_ROUTES)"""

        # Check for structure already present
        struct = self.structureAt(coord)
        if struct:
            return struct

        # Don't create junction if no other routes
        # ENH: Get rid of this
        route = self.routeAt(coord, ignore_routes)
        if not route:
            return None

        # Split existing routes and connect to structure
        junct = self.placeJunctionAt(coord)
        self.splitRoutesWith(junct, ignore_routes)

        return junct

    def placeJunctionAt(self, coord):
        """
        Create a route junction at COORD
        """

        self.progress(4, "Placing route junction", coord)

        tab = self.db_view.table(self.junctionType)
        rec = tab.insertWith()
        rec._primary_geom_field.set(MywPoint(coord))

        return rec

    # -----------------------------------------------------------------------
    #                                 ROUTE MANAGEMENT
    # -----------------------------------------------------------------------

    def routePosInsertTrigger(self, route):
        """
        Called after ROUTE is inserted
        """

        self.progress(1, "Adding", route)
        self.ensureStructuresFor(route)

    def routePosUpdateTrigger(self, route, pre_update_route=None):
        """
        Called after ROUTE is updated
        """

        self.progress(1, "Updating", route)

        # Do we want to reconnect structures at end points
        reconnect = pre_update_route is None

        if pre_update_route:
            new_geom = pre_update_route._primary_geom_field.geom()
            original_geom = route._primary_geom_field.geom()

            # Geometries equal, so nothing more to do
            if GeomUtils.coordsEqual(new_geom, original_geom):
                return

            # Reconnect to structure if ends changed
            new_coords = new_geom.coords
            original_coords = original_geom.coords

            reconnect = (new_coords[0] != original_coords[0]) or (
                new_coords[-1] != original_coords[-1]
            )

        if reconnect:
            self.reconnectRoute(route)

        # If update would disconnect connections throw error
        self.nw_view.cable_mgr.assertSegmentsNoConnections(route)

        # Update cable segments (and cable geometry)
        # ENH: Get rid of recursion in these ... use root_housing instead
        cable_segs = self.nw_view.cable_mgr.updateSegments(route)

        # Update conduits (and cable segments they contain)
        cable_segs += self.nw_view.conduit_mgr.updateConduits(route)

        # Update circuit geometry for all circuits passing through cable_segs
        # FIXME new/original wrong way round above!
        self.nw_view.circuit_mgr.updateCircuitsInRoute(cable_segs, original_geom, new_geom)

        self.nw_view.loc_mgr.updateLOCGeomsInRoutes([route])

    def routePreDeleteTrigger(self, route):
        """
        Called before ROUTE is deleted
        """

        self.progress(1, "Deleting", route)

        # Avoid creating dijoint cables
        if self.nw_view.cable_mgr.containsCable(route):
            raise DbConstraintError("route_has_cable", feature=route)

        # Delete contained objects
        self.nw_view.conduit_mgr.deleteConduitsIn(route)

        # Remove any junctions that will be left hanging once the route is gone
        self.cleanupOrphanJunctions(route, True)

    def cleanupOrphanJunctions(self, route, route_removed=False):
        """
        Deletes any orphan route junctions at the ends of ROUTE

        If route_removed then it means the ROUTE is about to be removed
        so remove any dangling route junctions it would leave
        """

        self.progress(3, "Cleanup orphan junctions", route, route_removed)

        in_struct = route._field("in_structure").rec()
        out_struct = route._field("out_structure").rec()

        removed_route = None
        if route_removed:
            removed_route = route

        self.cleanupOrphanJunction(in_struct, removed_route)
        self.cleanupOrphanJunction(out_struct, removed_route)

        return route

    def cleanupOrphanJunction(self, struct, removed_route=None):
        """
        Deletes STRUCT if it is a route junction and it is no longer associated
        to a route or is only associated to removed_route
        """

        if not struct:
            return

        if struct.feature_type != self.junctionType:
            return

        routes = self.routesOf(struct)

        if len(routes) == 0:
            self.progress(4, "Cleanup orphan junction", struct)
            self.deleteRecord(struct)

        elif len(routes) == 1 and routes[0] == removed_route:
            self.progress(4, "Cleanup orphan junction", struct)
            self.deleteRecord(struct)

    def splitRoute(self, route):
        """
        Split ROUTE at every struct on its inner coordinates
        """

        inner_coords = route._primary_geom_field.geom().coords[
            1:-1
        ]  # Dont need to split at start or end of route

        current_route = route
        structsAlongRoute = self.structuresAtCoords(inner_coords)
        split_routes = [route]

        """For struct along route's verticies ..split"""
        for struct in structsAlongRoute:
            if struct is not None:
                current_route = self.splitRouteWith(current_route, struct)
                if current_route:
                    split_routes.append(current_route)

        return split_routes

    def splitRoutesWith(self, struct, ignore_routes=None):
        """
        Split any routes at STRUCT and connect them to it
        """

        # Find route to split
        # ENH: Handle multiple routes
        coord = struct._primary_geom_field.geom().coord
        route = self.routeAt(coord, ignore_routes)

        if not route:
            return

        # Split its geometry
        self.splitRouteWith(route, struct)

    def splitRouteWith(self, route, struct):
        """
        Split ROUTE at STRUCT (if necessary)

        Returns new route created (if there is one)"""

        self.progress(3, "Splitting", route, "at", struct)

        # Split geometry
        coord = struct._primary_geom_field.geom().coord
        geoms = GeomUtils.splitAt(route._primary_geom_field.geom(), coord)
        if not geoms:
            self.connectRouteTo(route, struct)
            return None

        # Create new route
        new_route = self.insertCopy(route)  # In/out structures get set later
        new_route.in_structure = struct._urn()
        new_route._primary_geom_field.set(geoms[1])

        # Update old route
        route.out_structure = struct._urn()
        route._primary_geom_field.set(geoms[0])

        # Get proportion
        length1 = geoms[0].geoLength()
        length2 = geoms[1].geoLength()
        proportion = length1 / (length1 + length2)

        # Set measured length field
        if route.length:
            original_length = route.length
            route.length = original_length * proportion
            new_route.length = original_length * (1 - proportion)

        self.update(route)

        # Split contained objects
        cnd_splits = self.nw_view.conduit_mgr.splitConduitsAt(struct, route, new_route, proportion)
        seg_splits = self.nw_view.cable_mgr.splitSegmentsAt(
            struct, route, new_route, cnd_splits, proportion
        )

        self.nw_view.loc_mgr.splitLOCs(seg_splits)

        # Rebuild cable geometry
        segs = []
        for seg_split in seg_splits.values():
            segs.append(seg_split[1])
        self.nw_view.cable_mgr.reBuildGeometries(segs)

        return new_route

    def connectRouteTo(self, route, struct):
        """
        Connect ROUTE to STRUCT
        """

        self.progress(3, "Connecting route to structure", route, struct)

        coord = struct._primary_geom_field.geom().coord
        route_geom = route._primary_geom_field.geom()

        if route_geom.coords[0] == coord:
            route._field("in_structure").set([struct])
        if route_geom.coords[-1] == coord:
            route._field("out_structure").set([struct])
        self.update(route)

    def updateRouteGeom(self, route, struct):
        """
        Update geometry of ROUTE to start/end at STRUCT
        """

        coord = struct._primary_geom_field.geom().coord
        route_geom = route._primary_geom_field.geom()

        # Build updated geomery
        geom = route_geom
        if route.in_structure == struct._urn():
            geom = GeomUtils.setVertex(geom, 0, coord)
        if route.out_structure == struct._urn():
            geom = GeomUtils.setVertex(geom, -1, coord)

        if geom.coords == route_geom.coords:
            return

        # Update route
        self.progress(1, "Adjusting", route, "at", struct)
        route._primary_geom_field.set(geom)

        self.update(route)

        # Update directly contained cables
        cable_segs = self.nw_view.cable_mgr.updateSegmentGeoms(route)

        # Update contained conduits (and the cables they contain)
        cable_segs += self.nw_view.conduit_mgr.updateConduitGeoms(route)

    def reconnectRoute(self, route):
        """
        Disconnect route from structures and then connect to structures
        """

        self.disconnectRoute(route)
        self.ensureStructuresFor(route)

    # -----------------------------------------------------------------------
    #                                 HELPERS
    # -----------------------------------------------------------------------

    def structuresAtCoords(self, coords, featureTypes=None, safe=False):
        """
        Returns structure at each coord in COORDS

        If SAFE then throw MywError if structure not found
        """

        structs = []

        for coord in coords:
            struct = self.structureAt(coord, featureTypes)
            structs.append(struct)

        if safe:
            bad = []
            for idx, struct in enumerate(structs, start=1):
                if not struct:
                    bad.append(idx)

            if len(bad) > 0:
                raise MywError("No structure at points:", ",".join(bad))

        return structs

    def structureAt(self, coord, feature_types=None):
        """
        The structure at COORD (if there is one)

        If more than one structure, returns random one"""

        # Deal with defaults
        if not feature_types:
            feature_types = self.nw_view.structs

        # Find structures
        structs = self.featuresAt(coord, feature_types, tolerance=self.struct_tolerance)
        return structs[0] if structs else None

    def routeAt(self, coord, ignore_routes=[]):
        """
        Returns a route that passes through (or has end at) COORD
        """

        routes = self.routesAt(coord, ignore_routes)

        if not routes:
            return None

        return routes[0]

    def routesAt(self, coord, ignore_routes=[]):
        """
        Returns all routes that pass through (or end at) COORD
        """

        feature_types = self.nw_view.routes

        # Find routes
        routes = self.featuresAt(coord, feature_types, tolerance=self.route_tolerance)

        self.progress(10, "Routes within", self.route_tolerance, "of", coord, ":", routes)

        if ignore_routes:
            ignore_urns = [r._urn() for r in ignore_routes]
            filter_proc = lambda r: not r._urn() in ignore_urns
            routes = list(filter(filter_proc, routes))

        return routes

    def routesOf(self, rec, include_proposed=False):
        """
        Returns routes connected to REC
        """

        rec_urn = rec._urn()
        routes = []

        for feature_type in self.nw_view.routes:
            tab = self.db_view.table(feature_type)
            pred = (tab.field("in_structure") == rec_urn) | (tab.field("out_structure") == rec_urn)
            routes += self.nw_view.getRecs(tab, pred, include_proposed)

        return routes

    def disconnectRoute(self, route):
        """
        Disconnect ROUTE from its structures
        """

        self.cleanupOrphanJunctions(route, True)

        route.in_structure = None
        route.out_structure = None

        route = self.update(route)

        return route
