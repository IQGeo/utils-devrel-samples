"""
Script to create large network grid for testing path finder.
"""

import os, sys
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_polygon import MywPolygon
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.validation.delta_manager import DeltaManager
from myw_batch_utility import MywBatchUtility
from myworldapp.core.server.base.system.myw_product import MywProduct


class PFGridNetwork(MywBatchUtility):
    def __init__(self, db, delta_name, step_count):

        super().__init__(0, True)

        self.data_dir = MywProduct().moduleOf(os.path.realpath(__file__)).file("data")
        self.db_name = "iqg_comms_dev"

        delta = f"design/{delta_name}"
        delta_rec = db.view().get(delta)
        self.db_view = db.view(delta)
        self.db = db

        if delta_rec:
            for feature_type in self.db.dd.featureTypes("myworld", versioned_only=True):
                table = self.db_view.table(feature_type)
                table._delta_recs.delete()
                table._base_recs.delete()
        else:
            table = self.db_view.table("design")
            delta_rec = table._new_detached()
            delta_rec.name = delta_name
            delta_rec.state = "Designing"
            delta_rec = table.insert(delta_rec)

        self.delta_rec = delta_rec

        self.step_count = step_count
        self.nw_view = NetworkView(self.db_view)

    def translate(self, coord, de, dn):
        from math import atan2, cos, pi, radians, sin, sqrt
        from myworldapp.core.server.base.geom.myw_geo_utils import earth_radius

        lat = coord.y
        lon = coord.x
        dLat = dn / earth_radius
        dLon = de / (earth_radius * cos(pi * lat / 180))

        latO = lat + dLat * 180 / pi
        lonO = lon + dLon * 180 / pi
        return MywPoint(lonO, latO)

    def create_rec(self, table_name, geom):
        table = self.db_view.table(table_name)
        rec = table._new_detached()

        if table_name == "fiber_cable":
            rec.fiber_count = 4
            rec.directed = True
            rec.name = "F"
        elif table_name == "fiber_patch_panel":
            rec.n_fiber_ports = 10

        rec = table.insert(rec)
        rec._primary_geom_field.set(geom)
        table.update(rec)

        if table_name == "fiber_cable":
            self.nw_view.cable_mgr.routeCable(rec)
        elif table_name == "ug_route":
            self.nw_view.struct_mgr.routePosInsertTrigger(rec)
        elif table_name == "fiber_patch_panel":
            self.nw_view.equip_mgr.posInsertTrigger(rec)

        return rec

    def connect(self, cab, pp, cable, out):

        if out:
            in_range = PinRange("out", 1, 4)
            out_range = PinRange("in", 1, 4)
            seg = self.nw_view.cable_mgr.segmentsAt(cab)[0]

            self.nw_view.connection_mgr.connect("fiber", pp, pp, in_range, seg, out_range)
        else:
            in_range = PinRange("out", 1, 4)
            out_range = PinRange("in", 1, 4)
            seg = self.nw_view.cable_mgr.segmentsAt(cab)[0]

            self.nw_view.connection_mgr.connect("fiber", pp, seg, in_range, pp, out_range)

    def create_cabinets(self, start_coord, step_distance):

        coord = self.translate(start_coord, -step_distance, -step_distance)
        cab = self.create_rec("cabinet", coord)
        self.create_rec("ug_route", MywLineString([coord, start_coord]))
        cable = self.create_rec("fiber_cable", MywLineString([coord, start_coord]))
        pp = self.create_rec("fiber_patch_panel", coord)
        self.nw_view.equip_mgr.setHousing(pp, cab)
        self.connect(cab, pp, cable, True)

        coord = self.translate(
            start_coord, self.step_count * step_distance, self.step_count * step_distance
        )
        coord2 = self.translate(coord, -step_distance, -step_distance)
        cab = self.create_rec("cabinet", coord)
        self.create_rec("ug_route", MywLineString([coord, coord2]))
        cable = self.create_rec("fiber_cable", MywLineString([coord2, coord]))
        pp = self.create_rec("fiber_patch_panel", coord)
        self.nw_view.equip_mgr.setHousing(pp, cab)
        self.connect(cab, pp, cable, False)

    def run(self):

        # bottom left of grid
        start_coord = MywPoint(0.14101509292319075, 52.23936080310662)
        step_distance = 10

        size = self.step_count

        for x in range(size):
            for y in range(size):
                coord = self.translate(start_coord, y * step_distance, x * step_distance)
                geom = MywPoint(coord)

                self.create_rec("manhole", geom)

        for x in range(size):
            for y in range(size):
                coord1 = self.translate(start_coord, y * step_distance, x * step_distance)

                if x < size - 1:
                    coord2 = self.translate(start_coord, y * step_distance, (x + 1) * step_distance)
                    line = MywLineString([coord1, coord2])
                    self.create_rec("ug_route", line)
                    self.create_rec("fiber_cable", line)

                if y < size - 1:
                    coord2 = self.translate(start_coord, (y + 1) * step_distance, x * step_distance)
                    line = MywLineString([coord1, coord2])
                    self.create_rec("ug_route", line)
                    self.create_rec("fiber_cable", line)

        self.create_cabinets(start_coord, step_distance)

        dm = DeltaManager(self.db_view)
        bounds = dm.bounds()["geometry"]
        bounds = MywPolygon(bounds)

        self.delta_rec._primary_geom_field.set(bounds)
        self.db_view.table(self.delta_rec.feature_type).update(self.delta_rec)

    def save(self, filename):

        filename = os.path.join(self.data_dir, "path_finder", filename)

        self.os_engine.remove_if_exists(filename)

        self.run_subprocess(
            "comms_db",
            self.db_name,
            "export",
            filename,
            "--delta",
            self.delta_rec._urn(),
            "--area",
            self.delta_rec._urn(),
        )

    def run_subprocess(self, *cmd, **opts):
        """
        Run a shell command, showing output
        """
        opts["stream"] = sys.stdout

        res = self.os_engine.run(*cmd, **opts)

        sys.stdout.flush()

        return res


# pylint: disable=undefined-variable
pf = PFGridNetwork(db, "GridNetworkBuild3", 3)
pf.run()
db.commit()
pf.save("GridNetwork3x3.zip")

pf = PFGridNetwork(db, "GridNetworkBuild5", 5)
pf.run()
db.commit()
pf.save("GridNetwork5x5.zip")

pf = PFGridNetwork(db, "GridNetworkBuild10", 10)
pf.run()
db.commit()
pf.save("GridNetwork10x10.zip")
