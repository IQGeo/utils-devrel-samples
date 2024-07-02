"""
Convert street OSM into underground and manholes.

For each street:
    Put down manhole at the ends of each street geometry

For each street:
    Create ug route using API. Hopefully manholes present at connections will split route
    and give route between each manhole.

"""

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

from myworldapp.modules.comms_dev_db.utils.circuit_routing_engine import CircuitRoutingEngine

import os

utils_dir = os.path.dirname(os.path.dirname(__file__))
addprioritysitedir(utils_dir)

# from myworldapp.modules.comms_dev_db.utils.comms_build_dev_db import CommsDevDbBuilder


class CommsBuildRoutesFromOSM:
    def __init__(self, db, delta, options):

        self.trace_level = 1
        self.progress = MywSimpleProgressHandler(self.trace_level)
        self.progress.show_time = True

        self.db_view = db.view(delta)
        self.db = db

        self.manhole_recs = []

        self.network_view = NetworkView(self.db_view)
        self.struct_mgr = self.network_view.struct_mgr

        for name, value in options.items():
            setattr(self, name, value)

    def cleanup_design(self):
        for feature_type in self.db.dd.featureTypes("myworld", versioned_only=True, sort=True):

            table = self.db_view[feature_type]
            n_recs = table.truncate()
            self.progress(2, "Table {} Deleted {}".format(feature_type, n_recs))

    def create_manholes(self):
        """
        Add manhole to each end of a street if there isn't one already there
        """
        streets = self.db_view.table("streets_osm").recs()
        cnt = 0
        for rec in streets:
            geom = rec._primary_geom_field.geom()
            for c in [geom.coords[0], geom.coords[-1]]:
                struct = self.struct_mgr.structureAt(c)
                if not struct:
                    det_rec = self.db_view.table("manhole")._new_detached()
                    det_rec._primary_geom_field.set(MywPoint(c))
                    rec = self.db_view.table("manhole").insert(det_rec)
                    self.manhole_recs.append(rec)
                cnt += 1
                if cnt % 100 == 0:
                    print("Created manhole ", cnt)

    def create_routes(self):
        """
        Create route from street geometry.
        """

        streets = self.db_view.table("streets_osm").recs()
        cnt = 0
        for rec in streets:
            geom = rec._primary_geom_field.geom()
            det_rec = self.db_view.table("ug_route")._new_detached()
            det_rec._primary_geom_field.set(geom)
            ug_rec = self.db_view.table("ug_route").insert(det_rec)
            self.struct_mgr.routePosInsertTrigger(ug_rec)
            cnt += 1
            if cnt % 100 == 0:
                print("Created ", ug_rec, cnt)

    def split_routes(self):
        """
        For each manhole and each route that ends/begins, update the route geom
        to ensure routes are split by manholes correctly.
        """
        cnt = 0
        print("split")
        for mh in self.manhole_recs:

            # Update ends of connected routes (and their contained objects)
            # ENH: Avoid duplicate rebuild of cable and circuit paths
            routes = self.struct_mgr.routesOf(mh)
            for route in routes:
                self.struct_mgr.updateRouteGeom(route, mh)

            # Split routes if necessary
            self.struct_mgr.splitRoutesWith(mh, routes)

            cnt += 1
            if cnt % 100 == 0:
                print("Created ", mh, cnt)


if __name__ in ["builtins", "__main__"]:

    delta = ""
    builder = CommsBuildRoutesFromOSM(db, delta, {})
    if delta:
        builder.cleanup_design()
    builder.create_manholes()
    builder.create_routes()
    builder.split_routes()
