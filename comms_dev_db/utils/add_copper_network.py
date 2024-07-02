################################################################################
# Script for adding copper network
################################################################################
# Copyright: IQGeo Limited 2010-2023

import json

# Create cables and route them through the structure network
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.modules.comms_dev_db.utils.comms_dev_db_cable_manager import CommsDevDBCableManager
from myworldapp.modules.comms_dev_db.utils.splice_engine import SpliceEngine
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.validation.data_validator import DataValidator
import myworldapp.core.server.controllers.base.myw_globals as myw_globals

# This houldnt be necessary here as this script is run through myw_db which does this but ...
# TBR: Workaround for PLAT-8642: Core should configure GeoJSON precision
from myworldapp.core.server.startup import myw_python_mods

from myworldapp.modules.comms_dev_db.server.dev_db_name_manager import DevDbNameManager

myw_python_mods.configure_geojson_lib()

# ENH: Inherit from design builder
class CommsDevDBCopperBuilder:
    def __init__(self, db, trace_level):

        db_view = db.view()
        myw_globals.db = db
        self.copper_engine = CommsDevDBCableManager(db_view, 1, cable_type="copper_cable")
        self.sp_engine = SpliceEngine(db, 1, cable_type="copper_cable")
        self.progress = self.copper_engine.progress
        self.db_view = db_view
        self.nw_view = NetworkView(self.db_view, progress=self.progress)

        self.name_mgr = DevDbNameManager(self.nw_view.cable_mgr, self.progress)

    def linestring(self, geom):
        """
        Build a MywLineString geometry from GEOM (a list of xys, coords, etc)
        """

        if isinstance(geom, list):
            # Convert xys -> coords
            if isinstance(geom[0], (int, float)):
                geom = [(geom[i], geom[i + 1]) for i in range(0, len(geom), 2)]

            # Convert coords -> geom
            if isinstance(geom[0], (list, tuple)):
                geom = MywLineString(geom)

        return geom

    def insert(self, feature_type, **props):
        """
        Insert a record (handling geometry conversions)
        """

        tab = self.db_view.table(feature_type)

        rec = tab.insertWith()

        for fld_name, val in props.items():
            fld = rec._field(fld_name)

            if fld.desc.type == "point":
                fld.set(MywPoint(val))
            elif fld.desc.type == "linestring":
                fld.set(self.linestring(val))
            else:
                rec[fld_name] = val

        self.nw_view.runPosInsertTriggers(rec)

        return rec

    def add_equipment_in(self, type, housing, **kwargs):
        """
        Add equipment
        """

        with self.progress.operation("Adding equipment", type):
            rec = self.insert(type, **kwargs)

            if isinstance(housing, str):
                housing = self.find_struct(housing)

            self.nw_view.equip_mgr.setHousing(rec, housing)
            self.name_mgr.setNameFor(rec)
            print("REC ", rec.name)
            return rec

    def add_splice_closure_in(self, housing, name, spec=None):
        """
        Create a splice_closure in HOUSING
        """

        if isinstance(housing, str):
            housing = self.find_struct(housing)

        with self.progress.operation("Adding splice closure", name):
            rec = self.insert("copper_splice_closure", name=name, specification=spec)

            self.nw_view.equip_mgr.setHousing(rec, housing)

            return rec

    def find_by_name(self, category, feature_types, name):
        """
        Returns the structure identified by NAME
        """

        for feature_type in feature_types:
            tab = self.db_view.table(feature_type)
            if not "name" in tab.descriptor.fields:
                continue

            rec = tab.filterOn("name", name).first()
            if rec:
                return rec

        raise MywError("Cannot find ", category, ":", name)

    def find_struct(self, name):
        return self.find_by_name("structure", self.nw_view.structs, name)

    def find_cable(self, name):
        return self.find_by_name("cable", self.nw_view.cables, name)

    def connect(self, ftr1, pins1, ftr2, pins2, housing, tech="mywcom_copper_connection"):

        pins1 = PinRange.parse(pins1)
        pins2 = PinRange.parse(pins2)
        self.sp_engine.addConnection(housing, ftr1, pins1, ftr2, pins2, False, tech=tech)

    def validate(self):

        dv = DataValidator(self.db_view)
        errors = dv.run(["segments", "connections", "equipment", "cables"])
        print("Errors", errors)

    def add_cable(self, count, *struct_names):
        rec = self.copper_engine.create(count, specification="100-19-ASPICF", gauge=19)
        self.copper_engine.route(rec, *struct_names)
        self.name_mgr.setNameFor(rec)
        return rec

    def run(self):
        """
        Creates copper network from Woodhead hub
        """

        self.add_pot()
        self.add_fttc()
        self.add_bt()      
        self.validate()         

    def add_pot(self):
        """
        Create POTS network.
        Cables run from WH along Woodhead Drive with a branch down 'The Beeches'
        """

        # Create cables
        c1 = self.add_cable(100, "Woodhead Hub", "WH-C-01", "WH-M-12")
        c2 = self.add_cable(100, "WH-M-12", "WH-M-11", "WH-M-10", "WH-M-07")
        c3 = self.add_cable(100, "WH-M-11", "WH-M-08", "WH-M-09")
        c4 = self.add_cable(100, "WH-M-07", "WH-M-04")
        c5 = self.add_cable(100, "WH-M-04", "WH-M-14", "WH-M-49")

        whub = self.find_struct("Woodhead Hub")

        # Connect up the cables
        self.add_splice_closure_in("WH-M-12", "WH-CS-01")
        self.add_splice_closure_in("WH-M-11", "WH-CS-02")
        self.add_splice_closure_in("WH-M-07", "WH-CS-03")
        self.add_splice_closure_in("WH-M-04", "WH-CS-04")

        # Cables after 'The Beeches' are mostly fully connected even though 25 have been cut out
        # upstream.
        self.sp_engine.connect(f"{c1.name}#out:1:100", f"{c2.name}#in:1:100", "WH-CS-01")
        self.sp_engine.connect(f"{c2.name}#out:1:25", f"{c3.name}#in:1:25", "WH-CS-02")
        self.sp_engine.connect(f"{c2.name}#out:1:29", f"{c4.name}#in:1:29", "WH-CS-03")
        self.sp_engine.connect(f"{c2.name}#out:34:100", f"{c4.name}#in:34:100", "WH-CS-03")
        self.sp_engine.connect(f"{c4.name}#out:1:100", f"{c5.name}#in:1:100", "WH-CS-04")

        # Add shelf and copper terminals
        rack = self.add_equipment_in("rack", "Woodhead Hub", name="WH-R-05")
        shelf = self.add_equipment_in(
            "copper_shelf", rack, name="S-1", n_copper_in_ports=0, n_copper_out_ports=100
        )
        seg = self.sp_engine.findSegment(whub, c1, "in", False)
        self.connect(shelf, "out:1:100", seg, "in:1:100", shelf)

        for (mh_name, cable, pairs) in [
            ["WH-M-09", c3, "1:4"],
            ["WH-M-10", c2, "26:29"],
            ["WH-M-07", c2, "30:33"],
        ]:
            self.add_terminal(mh_name, cable, pairs)

        # Add some line equipment
        # ENH Add these to name manager
        for (mh_name, cable, count, type) in [
            ["WH-M-10", c2, 100, "copper_load_coil"],
            ["WH-M-08", c3, 25, "copper_load_coil"],
            ["WH-M-14", c5, 100, "copper_capacitor"],
        ]:
            equip = self.add_equipment_in(type, mh_name, n_copper_ports=count)

            if mh_name == "WH-M-10":
                continue
            mh = self.find_struct(mh_name)
            seg_out = self.sp_engine.findSegment(mh, cable, "out", False)
            seg_in = self.sp_engine.findSegment(mh, cable, "in", False)
            self.connect(seg_out, f"out:1:{count}", equip, f"in:1:{count}", equip)
            self.connect(equip, f"out:1:{count}", seg_in, f"in:1:{count}", equip)

        self.add_splice_closure_in("Woodhead Hub", "WH-SC-05")
        c6 = self.add_cable(100, "WH-M-32", "Woodhead Hub")
        c7 = self.add_cable(100, "Woodhead Hub", "WH-C-01")
        self.sp_engine.connect(f"{c6.name}#out:1:100", f"{c7.name}#in:1:100", "WH-SC-05")

    def add_terminal(self, mh_name, cable, pairs):

        term = self.add_equipment_in("copper_terminal", mh_name, n_copper_in_ports=4)
        mh = self.find_struct(mh_name)
        seg_out = self.sp_engine.findSegment(mh, cable, "out", False)
        self.connect(seg_out, f"out:{pairs}", term, "in:1:4", term)

    def add_fttc(self):
        f1 = self.find_cable("WH-FCB-223")

        # Add DSLAM to cabinet
        dslam_rack = self.add_equipment_in("rack", "WH-C-05", name="R-1")
        dslam = self.add_equipment_in(
            "copper_dslam", dslam_rack, name="WH-DSLAM-1", n_fiber_in_ports=4, n_copper_out_ports=25
        )
        cab = self.find_struct("WH-C-05")
        seg = self.sp_engine.findSegment(cab, f1, "out", False, "mywcom_fiber_segment")
        self.connect(seg, "out:1:4", dslam, "in:1:4", dslam, "mywcom_fiber_connection")

        c1 = self.add_cable(100, "WH-C-05", "WH-M-57", "WH-M-49", "WH-M-58")
        seg = self.sp_engine.findSegment(cab, c1, "in", False, "mywcom_copper_segment")
        self.connect(dslam, "out:1:25", seg, "in:1:25", dslam)

        for (mh_name, cable, pairs) in [
            ["WH-M-57", c1, "1:4"],
            ["WH-M-49", c1, "5:8"],
            ["WH-M-58", c1, "9:12"],
        ]:
            self.add_terminal(mh_name, cable, pairs)

    def add_bt(self):
        c4 = self.find_cable("WH-CC-004")
        c6 = self.add_cable(100, "WH-M-06", "WH-M-278")
        
        # Add bridge tap
        bt = self.add_equipment_in("copper_bridge_tap","WH-M-06", n_copper_in_ports=10, n_copper_out_ports=20, specification='BT-10')
        mh = self.find_struct("WH-M-06")
        seg_in = self.sp_engine.findSegment(mh, c4, "out", False)
        seg_out1 = self.sp_engine.findSegment(mh, c4, "in", False)
        seg_out2 = self.sp_engine.findSegment(mh, c6, "in", False)
        self.connect(bt, "in:1:10", seg_in, "out:34:43", bt)
        self.connect(bt, "out:1:10", seg_out1, "in:34:43", bt)
        self.connect(bt, "out:11:20", seg_out2, "in:1:10", bt)


builder = CommsDevDBCopperBuilder(db, 1)
builder.run()
