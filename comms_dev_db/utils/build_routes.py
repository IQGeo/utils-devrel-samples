# Build connectivity based on spatial coincidence

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.geom.myw_point import MywPoint


class ConnectivityBuilder:
    """
    Builds connections for comms structure data
    """

    snap_tol = 0.15  # Snap jitter tolerance (in metres)

    def __init__(self, db, trace_level):
        """
        Init slots of self

        DB is a MywDatabase"""

        self.db = db
        self.progress = MywSimpleProgressHandler(trace_level)

        self.structs = {}  # Keyed by coord # ENH: Replace by spatial scan

    def run(self):
        """
        Build topology
        """

        self.progress(1, "Adding structures")

        for rec in self.db.tables["building"].orderBy("id"):
            self.add_structure(rec)

        for rec in self.db.tables["mdu"].orderBy("id"):
            self.add_structure(rec)

        for rec in self.db.tables["manhole"].orderBy("id"):
            self.add_structure(rec)

        for rec in self.db.tables["cabinet"].orderBy("id"):
            self.add_structure(rec)

        for rec in self.db.tables["pole"].orderBy("id"):
            self.add_structure(rec)

        for rec in self.db.tables["wall_box"].orderBy("id"):
            self.add_structure(rec)

        for rec in self.db.tables["drop_point"].orderBy("id"):
            self.add_structure(rec)

        self.progress(1, "Adding routes")
        for rec in self.db.tables["ug_route"].orderBy("id"):
            geom = rec._primary_geom_field.geom()
            self.ensure_struct_at(geom.coords[0], "mywcom_route_junction")
            self.ensure_struct_at(geom.coords[-1], "mywcom_route_junction")

        for rec in self.db.tables["oh_route"].orderBy("id"):
            geom = rec._primary_geom_field.geom()
            self.ensure_struct_at(geom.coords[0], "wall_box")
            self.ensure_struct_at(geom.coords[-1], "wall_box")

        self.progress(1, "Splitting routes")
        for coord, struct in self.structs.items():
            self.split_routes_at(struct)

        self.progress(1, "Connecting routes")

        table = self.db.tables["ug_route"]
        for rec in table.orderBy("id"):
            self.connect_route(rec)
            table.update(rec)

        table = self.db.tables["oh_route"]
        for rec in table.orderBy("id"):
            self.connect_route(rec)
            table.update(rec)

        self.add_bare_routes()

    def add_structure(self, rec):
        """
        Add a structure struct to the network
        """

        self.progress(2, "Adding struct for", rec)
        coord = rec._primary_geom_field.geom().coords[0]

        self.structs[coord] = rec

    def ensure_struct_at(self, coord, feature_type):
        """
        Add a struct at COORD (if necessary)

        Returns struct object"""

        from shapely.geometry import Point

        # Find or create struct
        struct = self.struct_at(coord)
        if struct:
            self.progress(7, "Struct already exists struct at", coord)

        else:
            self.progress(3, "Adding", feature_type, "at", coord)

            struct = self.db.tables[feature_type].insertWith()
            struct._primary_geom_field.set(Point(coord))

            self.db.session.add(struct)
            self.structs[coord] = struct

            self.progress(5, "Created", struct)

        return struct

    def split_routes_at(self, struct):
        """
        Split any routes that pass through coord
        """

        # Find routes
        tab = self.db.tables["ug_route"]
        pnt = struct._primary_geom_field.geom()
        routes = tab.filter(tab.field("path").geomWithinDist(pnt, self.snap_tol))

        # Split them
        for route in routes.orderBy("id"):
            self.split_route_at(route, pnt.coord, struct)

    def split_route_at(self, route, coord, struct):
        """
        Split ROUTE at COORD and update connectivity

        Returns newly created route"""

        self.progress(4, "Checking ", route, "at", struct, coord)

        tab = self.db.tables["ug_route"]

        # Construct route geometries
        geom = route._primary_geom_field.geom()
        geoms = geom.geoSplitNearCoord(coord)

        if not geoms:
            return
        (geom1, geom2) = geoms

        if not self.should_split(geom1):
            return

        if not self.should_split(geom2):
            return

        self.progress(2, "Splitting ", route, "at", struct, coord)
        self.progress(5, "geom1", list(geom1.coords))
        self.progress(5, "geom2", list(geom2.coords))

        # Adjust existing route
        route._primary_geom_field.set(geom1)
        tab.update(route)

        # Add new route
        route2 = tab.insertWith()
        route2._primary_geom_field.set(geom2)

        self.progress(2, "Created route", route2)

        return route2

    def connect_route(self, route):
        """
        Create a route and end structs for feature ROUTE
        """

        from myworldapp.core.server.base.geom.myw_line_string import MywLineString

        geom = route._primary_geom_field.geom()

        # Create structs (if necessary)
        struct1 = self.struct_at(geom.coords[0])
        struct2 = self.struct_at(geom.coords[-1])

        # Connect ends
        self.connect(route, "in_structure", struct1)
        self.connect(route, "out_structure", struct2)

        # Move endpoints onto structures (required by struct JS triggers)
        coords = []
        coords.append(struct1._primary_geom_field.geom().coords[0])
        coords += geom.coords[1:-1]
        coords.append(struct2._primary_geom_field.geom().coords[0])

        geom = MywLineString(coords)
        route._primary_geom_field.set(geom)

    def connect(self, route, fld, struct):
        """
        Connect ROUTE to STRUCT
        """

        route[fld] = struct._urn()

    def struct_at(self, coord):
        """
        The structure at COORD (if there is one)

        Applies tolerance to handle snap jitter"""

        # ENH: Use a spatial scan instead

        for struct in self.structs.values():
            struct_geom = struct._primary_geom_field.geom()
            if struct_geom.geoDistanceTo(coord) < self.snap_tol:
                return struct

    def within_dist(self, coord1, coord2, tol):
        """
        Distance between COORD1 and COORD2
        """

        dx = coord2[0] - coord1[0]
        dy = coord2[1] - coord1[1]

        return ((dx * dx) + (dy * dy)) < (tol * tol)

    def add_bare_routes(self):
        """
        Add routes with bare ends
        """

        for side in ["start", "end"]:
            self._add_bare_route(side)

    def _add_bare_route(self, side):
        """
        add route with 'bare' SIDE
        """

        from myworldapp.core.server.base.geom.myw_line_string import MywLineString

        self.progress(1, "Adding route with bare", side)

        if side == "start":
            struct_coords = [0.1412411034107, 52.2234048109304]  # XX-M-119
            struct_fld = "out_structure"
        else:
            struct_coords = [0.1423890888691, 52.2240345164722]  # XX-M-121
            struct_fld = "in_structure"

        route = self.db.tables["ug_route"].insertWith()
        struct = self.struct_at(struct_coords)
        self.connect(route, struct_fld, struct)

        geom = route._primary_geom_field.geom()

        coords = []

        if side == "start":
            coords.append([0.1410256, 52.2235484])
            coords.append(struct._primary_geom_field.geom().coords[0])
        else:
            coords.append(struct._primary_geom_field.geom().coords[0])
            coords.append([0.1428326, 52.2237627])

        geom = MywLineString(coords)
        route._primary_geom_field.set(geom)

    def should_split(self, geom):
        """
        returns True if struct at start and end of GEOM is different, else returns False
        """

        if len(geom.coords) > 2:
            return True

        new_struct_1 = self.struct_at(geom.coords[0])
        new_struct_2 = self.struct_at(geom.coords[-1])
        if new_struct_1._urn() == new_struct_2._urn():
            return False

        return True


# ==============================================================================
#
# ==============================================================================
# pylint: disable=undefined-variable
ConnectivityBuilder(db, 1).run()
