from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine
from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.modules.comms.server.api.network_view import NetworkView

# Import name manager and register triggers
from myworldapp.modules.comms_dev_db.server.dev_db_name_manager import DevDbNameManager


class CommsDevDBConduitManager(object):
    """
    Engine for routing conduits from a list of structure names

    Understands DevDB naming scheme."""

    route_feature_types = ["ug_route"]

    def __init__(self, db_view, trace_level):
        """
        Init slots of self

        DB_VIEW is a MywFeatureView"""

        self.db_view = db_view
        self.progress = MywSimpleProgressHandler(trace_level)

        self.network_engine = MywNetworkEngine.newFor(
            self.db_view, self.db_view.db.config_manager.networkDef("mywcom_routes")
        )

        self.nw_view = NetworkView(self.db_view, self.progress)
        self.cnd_mgr = self.nw_view.conduit_mgr
        self.cable_mgr = self.nw_view.cable_mgr

    # ------------------------------------------------------------------------------
    #                              BLOWN FIBER TUBES
    # ------------------------------------------------------------------------------

    def createBfTubesAlong(self, count, props, *struct_names):
        """
        Create COUNT blown fiber tubes along path identified by STRUCT_NAMES

        Finds shortest patch between named structures and enters conduit"""

        with self.progress.operation("Creating", count, "BF tubes:", " -> ".join(struct_names)):

            # Find structures from their names
            structs = []
            for struct_name in struct_names:
                structs.append(self.findStruct(struct_name))

            # Find shortest path between them
            # ENH: Restrict to underground routes
            return self.cnd_mgr.routeConduit("blown_fiber_tube", props, structs, count)

    def createBfDropRoute(self, feeder_struct_name, struct_name, props):
        """
        Create blown fiber tube route for drop cable terminsting at STRUCT_NAME (a wall box)
        """

        with self.progress.operation("Creating blown fiber route to", struct_name):

            # Find structures
            feeder_struct = self.findStruct(feeder_struct_name)
            struct = self.findStruct(struct_name)

            # Build tube route
            tubes = self.ensureBfTubePath(feeder_struct, struct, props)
            self.buildBfTubeRoute(feeder_struct, struct, tubes)

            # Find drop cable segment (if there is one)
            # ENH: Find a cleaner way to exclude internal cables
            struct_urn = struct._urn()
            seg_tab = self.db_view["mywcom_fiber_segment"]
            pred = (seg_tab.field("out_structure") == struct_urn) & (
                seg_tab.field("in_structure") != struct_urn
            )
            cable_seg = self.db_view["mywcom_fiber_segment"].filter(pred).first()
            if not cable_seg:
                return

            # Find tube segment in same route
            for tube in tubes:
                if tube.root_housing == cable_seg.root_housing:
                    seg_tube = tube
                    break

            # Move cable into tube route
            seg_tube = self.db_view.get(seg_tube._urn())  # Ensure have latest properties
            self.cable_mgr.moveToHousing(cable_seg, seg_tube)

    def ensureBfTubePath(self, feeder_struct, struct, props):
        """
        Find BF tube path from FEEDER_STRUCT to STRUCT (creating tubes if necessary)
        """

        # Find path (downstream, to ensure we pick a free tube later)
        # ENH: Replace by tube network bulk trace (with penalty for swapping tubes)
        routes = self.findPathBetween(feeder_struct, struct)

        # Find tubes
        tubes = []
        prev_tube = None
        for route in routes:
            tube = self.freeBfTubeIn(route, prev_tube)

            # If no free tube .. add one (for drop routes)
            if not tube:
                self.progress(1, "Creating blown fiber tube in", route)
                struct1 = route._field("in_structure").rec()
                struct2 = route._field("out_structure").rec()
                tube = self.cnd_mgr.routeConduit("blown_fiber_tube", props, [struct1, struct2], 1)[
                    0
                ]

            tubes.append(tube)
            prev_tube = tube

        return tubes

    def freeBfTubeIn(self, route, prev_tube=None):
        """
        The blown fibre tubes in ROUTE that do not contain a cable

        If PREV_TUBE is set, prefer tubes from same run"""

        # Find all free tubes
        free_tubes = []
        for tube in route._field("blown_fiber_tubes").recs(ordered=True):
            cable_segs = tube._field("cable_segments").recs()
            if not cable_segs:
                free_tubes.append(tube)

        if not free_tubes:
            return None

        # Check for one from same run
        if prev_tube:
            for tube in free_tubes:
                if tube.conduit_run == prev_tube.conduit_run:
                    return tube

        return free_tubes[0]

    def buildBfTubeRoute(self, from_struct, to_struct, tubes):
        """
        Connect TUBES to form a single conduit run
        """

        # Cut start and end
        self.cnd_mgr.disconnectConduitAt(tubes[0], from_struct)
        self.cnd_mgr.disconnectConduitAt(tubes[-1], to_struct)

        # Join the chain
        prev_tube = None
        for tube in tubes:

            if prev_tube:
                self.connectBfTubes(prev_tube, tube)

            prev_tube = tube

    def connectBfTubes(self, tube1, tube2):
        """
        Connect TUBE1 to TUBE2 in their shared structure
        """

        # Ensure tubes reflect latest state
        tube1 = self.db_view.get(tube1._urn())
        tube2 = self.db_view.get(tube2._urn())

        # Case: Already connected
        if tube1.conduit_run == tube2.conduit_run:
            return

        # Find shared structure
        # ENH: Get this when finding route
        if tube1.in_structure == tube2.in_structure:
            struct = tube1._field("in_structure").rec()
        if tube1.in_structure == tube2.out_structure:
            struct = tube1._field("in_structure").rec()
        if tube1.out_structure == tube2.in_structure:
            struct = tube1._field("out_structure").rec()
        if tube1.out_structure == tube2.out_structure:
            struct = tube1._field("out_structure").rec()

        # Ensure both disconnected
        self.cnd_mgr.disconnectConduitAt(tube1, struct)
        self.cnd_mgr.disconnectConduitAt(tube2, struct)
        self.cnd_mgr.connect(struct, tube1, tube2)

    # ------------------------------------------------------------------------------
    #                                    CONDUITS
    # ------------------------------------------------------------------------------

    def createAlong(self, type, count, props, *struct_names):
        """
        Create COUNT conduits along path identified by STRUCT_NAMES

        TYPE is one of 'outer', 'inner'

        Finds shortest patch between named structures and enters conduit"""

        with self.progress.operation(
            "Creating", count, type, "conduits:", " -> ".join(struct_names)
        ):

            # Find structures from their names
            structs = []
            for struct_name in struct_names:
                structs.append(self.findStruct(struct_name))

            # Find shortest path between them
            # ENH: Restrict to underground routes
            routes = self.findPath(structs)

            # Add a conduit in each route (skipping return routes)
            housing_urns = set()
            for route in routes:

                # Handle inner conduits
                housing = route
                if type == "inner":
                    housing = self.bestConduitIn(housing)
                    if not housing:
                        raise MywError("Cannot create inner conduit: No conduit in", route)

                # Check for already done
                housing_urn = housing._urn()
                if housing_urn in housing_urns:
                    continue
                housing_urns.add(housing_urn)

                # Create conduits
                self.progress(3, "Adding conduits in", route)
                for i in range(0, count):
                    self.create(type, props, housing)

    def create(self, type, props, housing):
        """
        Create a conduit in HOUSING (an route or conduit)
        """

        table = self.db_view.table("conduit")
        rec = table.insertWith(**props)

        rec.housing = housing._urn()
        rec.root_housing = self.rootHousingOf(housing)
        rec.path = housing.path
        rec.in_structure = housing.in_structure
        rec.out_structure = housing.out_structure

        if type == "inner":
            rec.name = "WH-CND-I-{:03}".format(rec.id)
        else:
            rec.name = "WH-CND-{:03}".format(rec.id)

        self.progress(4, "Added conduit", rec.name)

        return rec

    def rootHousingOf(self, housing):
        """
        URN of the root housing of HOUSING (a route or conduit)
        """

        if "root_housing" in housing._descriptor.fields:
            return housing.root_housing

        return housing._urn()

    def findPath(self, structs):
        """
        Find routes forming shortest path joining STRUCTS

        Returns an ordered list of (ROUTE,FORWARD) tuples"""

        self.progress(1, "Finding routes linking", structs)

        # For each pair of structures .. find path
        routes = []
        for i in range(0, len(structs) - 1):
            routes += self.findPathBetween(structs[i], structs[i + 1])

        return routes

    def findPathBetween(self, struct1, struct2):
        """
        Find the structure path STRUCT1 -> STRUCT2

        Returns ordered list of routes"""

        struct1_urn = struct1._urn()
        struct2_urn = struct2._urn()

        # Find path between them
        res = self.network_engine.shortestPath(struct1_urn, struct2_urn)

        if not res:
            raise MywError("Cannot find path:", struct1_urn, "->", struct2_urn)

        # Flatten to ordered list
        recs = res.subTreeFeatures()

        # Extract routes
        routes = []
        for rec in recs:
            self.progress(8, "Checking trace item", rec)

            if rec.feature_type in self.route_feature_types:
                routes.append(rec)

                self.progress(6, "Found", rec)

        self.progress(4, "Found", len(routes), "routes")

        # Check for not suitable for conduit creation
        # ENH: Handle cable with degenerate linear geom
        if not routes:
            raise MywError("No routes in path:", struct1_urn, "->", struct2_urn)

        return routes

    def findStruct(self, name):
        """
        Returns the structure identified by NAME
        """

        # Try name
        for feature_type in ("building", "mdu", "manhole", "cabinet", "pole", "wall_box"):
            table = self.db_view.table(feature_type)
            rec = table.filterOn("name", name).first()

            if rec:
                return rec

        # Try URN
        ref = MywReference.parseUrn(name)
        if ref:
            rec = self.db_view.get(ref)
            if rec:
                return rec

        raise MywError("Cannot find structure:", name)

    def moveIntoConduits(self, cable):
        """
        Move segments of CABLE INTO a free conduit (if there is one)
        """

        self.progress(1, "Attempting to move into conduits:", cable)

        segs = cable._field("cable_segments").recs()

        for seg in segs:
            self.moveIntoConduit(seg)

    def moveIntoConduit(self, seg):
        """
        Move cable segment SEG into a free conduit (if there is one)

        Returns new housing (if changed)"""

        self.progress(4, "Attempting to move into conduit:", seg)

        # Find current container
        housing = seg._field("housing").rec()
        if not housing.feature_type in ["ug_route", "conduit"]:
            return None

        # Pick a conduit inside it
        conduit = self.bestConduitIn(housing)
        if not conduit:
            return None

        # Move cable into it
        self.progress(2, "Moving", seg, "into", conduit)
        seg._field("housing").set([conduit])
        seg._view.table(seg.feature_type).update(seg)

        return conduit

    def bestConduitIn(self, housing):
        """
        Returns a conduit inside HOUSING (if there is one)
        """
        # Picks least used conduit

        # Find all conduits, order them (for repeatability)
        conduits = housing._field("conduits").recs(ordered=True)
        if not conduits:
            return None

        self.progress(4, "Found", len(conduits), "conduits")

        # Find best one to use
        # ENH: Could be more interesting here
        best_n_cables = 9999
        for conduit in conduits:
            n_cables = len(conduit._field("cable_segments").recs())  # ENH: Provide .n_recs()

            if n_cables < best_n_cables:
                best_conduit = conduit
                best_n_cables = n_cables

        return best_conduit
