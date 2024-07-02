import json
import os, base64
from datetime import datetime
from fnmatch import fnmatch
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_polygon import MywPolygon
from myworldapp.core.server.base.system.myw_product import MywProduct

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.network_view import NetworkView

from myworldapp.modules.comms.server.data_import.file_feature_package import FileFeaturePackage
from myworldapp.modules.comms.server.data_import.cdif_data_importer import CdifDataImporter
from myworldapp.modules.comms_dev_db.utils.comms_dev_db_cable_manager import CommsDevDBCableManager
from myworldapp.modules.comms_dev_db.utils.comms_dev_db_conduit_manager import (
    CommsDevDBConduitManager,
)
from myworldapp.modules.comms_dev_db.utils.line_of_count_engine import LineOfCountEngine

from myworldapp.modules.comms_dev_db.utils.splice_engine import SpliceEngine

# Import name manager and register triggers
from myworldapp.modules.comms_dev_db.server.dev_db_name_manager import DevDbNameManager
from myworldapp.modules.comms_dev_db.utils.circuit_routing_engine import CircuitRoutingEngine


class CommsDevDBDesignBuilder(object):
    """
    Engine to create DevDB designs
    """

    # Scenarios (in apply order)
    scenarios = {
        "build_kings_hedges": {"delta": "comsof_design/kings_hedges", "seq": 3000},
        "build_arbury": {"delta": "comsof_design/arbury", "seq": 3800},
        "build_chesterfield": {"delta": "comsof_design/chesterfield", "seq": 3850},
        "build_comsof_errors": {"delta": "systest/comsof_errors", "seq": 3950},
        "build_nb046": {"delta": "design/NB046", "seq": 4000},
        "build_nb120": {"delta": "design/NB120", "seq": 4200},
        "build_cc5462": {"delta": "design/CC5462", "seq": 4400},
        "build_cc4827": {"delta": "design/CC4827", "seq": 4600},
        "build_nb301": {"delta": "design/NB301", "seq": 4800},
        "build_nu23": {"delta": "design/NU23", "seq": 5000},
        "build_nb335": {"delta": "design/NB335", "seq": 5200},
        "build_conflicts1": {"delta": "systest/conflicts1", "seq": 5400},
        "build_cc4970": {"delta": "design/CC4970", "seq": 5600},
        "build_cc4975": {"delta": "design/CC4975", "seq": 5800},
        "build_verrors1": {"delta": "systest/verrors1", "seq": 5900},
        "build_nb236": {"delta": "design/NB236", "seq": 6000},
        "build_conflict_networks": {"delta": "", "seq": 6100},
        "build_nmc3205": {"delta": "design/NMC3205", "seq": 6200},
        "build_nmc1753": {"delta": "design/NMC1753", "seq": 6300},
        "build_nmc3206": {"delta": "design/NMC3206", "seq": 6400},
        "build_nmc3208": {"delta": "design/NMC3208", "seq": 6500},
        "build_nmc2623": {"delta": "design/NMC2623", "seq": 6600},
        "build_nmc2818": {"delta": "design/NMC2818", "seq": 6700},
        "build_master": {"delta": "", "seq": 50_000},
    }

    connections = {
        "fiber": "mywcom_fiber_connection",
        "copper": "mywcom_copper_connection",
        "coax": "mywcom_coax_connection",
    }

    # Master ID sequence range for managed features including those created
    # by tests
    final_seq = 100_000

    @staticmethod
    def deltas():
        """
        Names of the deltas self builds
        """

        for scenario_def in CommsDevDBDesignBuilder.scenarios.values():
            delta = scenario_def.get("delta")
            if delta:
                yield delta

    def __init__(self, db, trace_level=0):
        """
        Init slots of self

        DB is a MywDatabase"""

        self.db = db
        self.trace_level = trace_level
        self.progress = MywSimpleProgressHandler(trace_level)
        self.data_dir = MywProduct().moduleOf(__file__).file("data")

    def run(self, spec="*"):
        """
        Run scenarios matching SPEC
        """

        # Build selected scenarios
        for scenario_name, props in self.scenarios.items():
            if fnmatch(scenario_name, "build_" + spec):
                self.run_scenario(scenario_name, props["delta"], props["seq"])

        # Reset sequences to their default state
        self.set_sequences(self.final_seq, True)

    def run_scenario(self, scenario_name, delta, seq):
        """
        Run method SCENARIO_NAME(SEQ) in DELTA
        """

        # Init view and engines
        self.db_view = self.db.view(delta)
        self.nw_view = NetworkView(self.db_view, self.progress)
        self.dev_db_cable_mgr = CommsDevDBCableManager(
            self.db_view, self.trace_level - 1
        )  # ENH: pass in progress instead
        self.dev_db_conduit_mgr = CommsDevDBConduitManager(
            self.db_view, self.trace_level - 1
        )  # ENH: pass in progress instead

        self.cable_engines = {
            "copper": CommsDevDBCableManager(self.db_view, 1, cable_type="copper_cable"),
            "fiber": CommsDevDBCableManager(self.db_view, 1, cable_type="fiber_cable"),
            "coax": CommsDevDBCableManager(self.db_view, 1, cable_type="coax_cable"),
        }
        self.name_mgr = DevDbNameManager(self.nw_view.cable_mgr, self.progress)
        self.sp_engines = {
            "fiber": SpliceEngine(self.db, 1, cable_type="fiber_cable", delta=delta),
            "copper": SpliceEngine(self.db, 1, cable_type="copper_cable", delta=delta),
            "coax": SpliceEngine(self.db, 1, cable_type="coax_cable", delta=delta),
        }

        with self.progress.operation("Running", scenario_name, "in", self.db_view, "with IDs", seq):
            # Reset sequences
            self.set_sequences(seq)

            # Run scenario
            meth = getattr(self, scenario_name)
            meth()

    # ==============================================================================
    #                                  COMSOF DESIGNS
    # ==============================================================================

    def build_kings_hedges(self):
        """
        Load Kings Kedges delta (sample import from Comsof)
        """
        self._load_comsof_cdif("comsof", "deltas", "kings_hedges")

    def build_arbury(self):
        """
        Load Arbury delta (central office location)
        """
        self._load_comsof_cdif("comsof", "deltas", "arbury")

    def build_chesterfield(self):
        """
        Load Kings Kedges delta (sample import from Comsof)
        """
        self._load_comsof_cdif("comsof", "deltas", "chesterfield")

    def build_comsof_errors(self):
        """
        Load systest delta (for testing error handling)
        """
        self._load_comsof_cdif("comsof", "deltas", "comsof_errors")

    def _load_comsof_cdif(self, *path):
        """
        Load data from a CDIF dump
        """

        self.clear_delta()

        data_path = os.path.join(self.data_dir, *path)
        feature_pkg = FileFeaturePackage(data_path, file_specs=["*.csv"], progress=self.progress)

        engine = CdifDataImporter(self.db_view, feature_pkg, progress=self.progress)
        engine.run()

    # ==============================================================================
    #                                  SCENARIOS
    # ==============================================================================

    def build_nb046(self):
        """
        Build network spur with cable north of exchange

        Splits existing route, includes equipment and cable"""

        self.clear_delta()

        mh1_coord = (0.1363447, 52.224641)  # End of spur
        mh2_coord = (0.1366769, 52.224504)  # Mid of spur

        route1_coords = [mh1_coord, (0.1365002, 52.224547), mh2_coord]

        route2_coords = [
            mh2_coord,
            (0.1367014, 52.224498),
            (0.1368033, 52.224462),
            (0.13687597, 52.2244098),
        ]  # On UG Route 9

        # Add manholes
        mh1 = self.add_manhole("WH-M-D46:1", mh1_coord, 140, "FPM-CCANN-MCX")
        mh2 = self.add_manhole("WH-M-D46:2", mh2_coord, 122, "FPM-CCANN-J4")

        # Add routes
        route1 = self.add_ug_route(1, route1_coords, "Mixed", "trench_dig")
        route2 = self.add_ug_route(2, route2_coords, labor_costs="trench_dig,site_manager")

        # Add splice closure and splitter in D46:1
        sc1 = self.add_splice_closure_in(mh1, "WH-SC-D46:1")
        sp1 = self.add_fiber_splitter_in(sc1, "WH-SPL-D46:1", n_ports=8)

        # Route cables
        cab1 = self.add_fiber_cable("WH-FCB-NB046:1", 24, ["WH-M-35", mh2.name])
        cab2 = self.add_fiber_cable("WH-FCB-NB046:2", 12, [mh2.name, mh1.name])

        # TODO: Connect splitter in port
        # TODO: Splice cables in MH2
        # TODO: Connect cable in WH-M-35

    def build_nb120(self):
        """
        Build network spurs East and West of Downham's lane

        Splits existing routes with conduits, cables and connections"""

        self.clear_delta()

        mh1_coord = (0.1370005309581757, 52.22373547933747)  # End of west spur
        mh2_coord = (0.1377072930335999, 52.22412981359751)  # End of east spur

        # Add manhole
        mh1 = self.add_manhole("WH-M-D20:1", mh1_coord, 0, "FPM-CCANN-MCX")
        mh2 = self.add_manhole("WH-M-D20:2", mh2_coord, 0, "FPM-CCANN-J4")

        # Add routes
        route1 = self.add_ug_route(
            1, [mh1_coord, (0.13732071, 52.2238680)], "Brick", "sidewalk_re-lay"
        )  # West spur
        route2 = self.add_ug_route(
            2, [mh2_coord, (0.13736092, 52.2239459)], labor_costs="sidewalk_re-lay"
        )  # East spur

    def build_nb301(self):
        """
        Extends network spur west of exchange (for conflict testing)

        Adds new route + equipment and cable in existing objects"""

        self.clear_delta()

        route88 = self.db_view.table("ug_route").get(88)
        feeder_cable = self.find_cable("WH-FCB-001")
        tab = self.db_view.table("pedestal_area")
        pedestal_area = tab.filterOn("name", "WH-PA-01").first()
        self.update(pedestal_area, name="WH-PA-03")
        mh07 = self.find_struct("WH-M-07")
        mh75 = self.find_struct("WH-M-75")

        mh75_coord = mh75._primary_geom_field.geom().coord

        mh1_coord = (0.13309121, 52.2235021)
        mh2_coord = (0.13329237, 52.2233353)

        route1_coords = [mh1_coord, (0.1331770, 52.223544), (0.1333259, 52.223558), mh75_coord]

        route2_coords = [
            mh75_coord,
            (0.13346403, 52.223507),
            (0.13343185, 52.223431),
            (0.13335943, 52.223361),
            mh2_coord,
        ]

        # Add manholes
        mh1 = self.add_manhole("WH-M-D301:1", mh1_coord, 45, "FPM-CCANN-J4")
        mh2 = self.add_manhole("WH-M-D301:2", mh2_coord, 50, "FPM-CCANN-J4")

        # Add routes
        route1 = self.add_ug_route(1, route1_coords, "Brick", "cherry_picker")
        route2 = self.add_ug_route(2, route2_coords, "Brick", "cherry_picker,trench_dig")

        # Modify existing route
        self.update(route88, cover_type="Brick")

        # Add equipment
        sc1 = self.add_splice_closure_in(mh07, "WH-SC-D301:1", spec="CS-FOSC450-D6-6-36-1-N0V")

        # Add conduits
        cnds1 = self.add_conduits("outer", 1, {"diameter": 200}, ["WH-M-75", "WH-M-D301:1"])
        cnds2 = self.add_conduits("outer", 1, {"diameter": 200}, ["WH-M-75", "WH-M-D301:2"])

        # Add cables
        cable1 = self.add_fiber_cable("WH-FCB-NB301:1", 12, ["WH-M-07", mh1.name], True)
        cable2 = self.add_fiber_cable("WH-FCB-NB301:2", 4, ["WH-M-07", mh2.name], False)

        # Add slacks on cable 1
        self._add_slack_at(mh75, cable1, "mywcom_fiber_segment/4801", 13, "out")
        self._add_slack_at(mh1, cable1, "mywcom_fiber_segment/4801", 51, "in")

        # Splice cables to main feeder
        self.connect_cables(feeder_cable, "out:20:27", cable1, "in:1:8", sc1)
        self.connect_cables(feeder_cable, "out:30:33", cable2, "in:1:4", sc1)

    def build_cc5462(self):
        """
        Build a direct FTTH connection using blown fibre

        Creates port connection conflict at cabinet WH-C-11"""

        self.clear_delta()

        drop_junct_coord = [0.1365626, 52.2254978]

        # Add ONT
        wb = self.find_struct("WH-0151")  # 69 Galdeside
        ont = self.add_ont_in(wb, "WH-ONT-5462", 4, "FPM-CCANN-ONT1")

        # Build route
        wb_coord = wb._primary_geom_field.geom().coord
        self.insert("drop_point", location=drop_junct_coord)
        drop_route = self.add_ug_route(
            "DROP", [drop_junct_coord, wb_coord], labor_costs="cherry_picker"
        )

        # Add drop cable and tube
        drop_cable = self.add_fiber_cable(
            "DROP-5462", 4, ["WH-C-11", wb.name], spec="O-004-CA-8W-F04NS"
        )
        self.dev_db_conduit_mgr.createBfDropRoute("WH-C-11", wb.name, {})

        # Connect upstream
        feeder_cable = self.find_cable("WH-FCB-009")
        sc = self.find_equip("WH-SC-039")
        self.connect_cables(
            feeder_cable, "out:10:13", drop_cable, "in:1:4", sc
        )  # IN:11 and 13 are conflicts

        # Connect downstream
        self.connect_equip(ont, "in:1:4", drop_cable, "out:1:4", "out")

        # Route circuit
        circuit = self.add_ftth_circuit("direct")  # ENH: Added customer and address
        self.route_circuit_to(circuit, ont, "in:1:2")

    def build_cc4827(self):
        """
        Build a direct FTTH connection using existing blown fibre

        Used for testing circuit fixup after data correction"""

        self.clear_delta()

        # Find drop cable
        drop_cable = self.find_cable("DROP-147")  # Runs from WH-C-11 to 25 George Nuttall Cl

        # Connect upstream
        feeder_cable = self.find_cable("WH-FCB-009")
        sc = self.find_equip("WH-SC-039")
        self.connect_cables(feeder_cable, "out:7:8", drop_cable, "in:1:2", sc)

        # Connect downstream
        ont = self.find_equip("WH-ONT-147")
        self.connect_equip(ont, "in:1:2", drop_cable, "out:1:2", "out")

        # Route circuit
        circuit = self.add_ftth_circuit("direct")  # ENH: Added customer and address
        self.route_circuit_to(circuit, ont, "in:1:2")

    def build_nu23(self):
        """
        Backbone network upgrade

        Adds new equipment in SP hub and move BB circuits to it (for conflict testing)"""

        self.clear_delta()

        # Add new equipment
        rack = self.find_equip("SP-BB-01")
        new_shelf1 = self.add_shelf_in(rack, 10, 10)
        new_shelf2 = self.add_shelf_in(rack, 8, 10)

        # Connect it
        cable = self.find_cable("BB-FCB-016")
        self.connect_equip(
            new_shelf1, "in:1:2", cable, "out:23:24", "out"
        )  # Runs to WH-S-014#out:5:6
        self.connect_equip(
            new_shelf1, "out:1:2", cable, "out:15:16", "out"
        )  # Runs to WH-S-014#in:5:6
        self.connect_equip(new_shelf2, "in:1", cable, "in:15", "in")
        self.connect_equip(new_shelf2, "out:1", cable, "in:23", "in")

        # Find circuits to modify
        circuit1 = self.find_circuit("BB-0001")
        circuit2 = self.find_circuit("BB-0002")
        circuit3 = self.add_bb_circuit()

        # Modify circuits
        self.delete_circuit(circuit1)
        self.route_circuit_to(
            circuit2, self.find_equip("WH-S-014"), "in:5:6"
        )  # ENH: Support routing from service port
        self.route_circuit_to(circuit3, new_shelf1, "in:1:2")

        # Change some MUX connections (for testing change detection)
        mux20 = self.find_equip("SP-MUX-020")
        cable = self.find_cable("BB-FCB-020")
        self.disconnect(mux20, "in:1")
        self.disconnect(mux20, "in:6")
        self.disconnect(mux20, "in:3:4")  # Splits a connection record
        self.connect_equip(mux20, "in:3", cable, "in:56")

        # Change some cable connections (for testing change detection)
        hub = self.find_struct("Science Park Hub")
        cable = self.find_cable("BB-FCB-019")
        seg = self.find_cable_seg(cable, hub, "in")
        self.disconnect(seg, "in:30")  # On Mux 21 IN:1
        self.disconnect(seg, "in:32")  # On Mux 21 IN:3
        self.disconnect(seg, "in:35")  # On Mux 21 IN:6
        self.connect_equip(mux20, "in:6:8", cable, "out:35:37")

    def build_nb335(self):
        """
        Adds blown fiber tube with a cable
        Changes manhole 54 attributes to create attribute conflicts
        Changes fiber cable 12 placement path to create geometry conflicts with master
        """

        self.clear_delta()

        props = {"diameter": 17}

        mh54 = self.find_struct("WH-M-54")
        mh55 = self.find_struct("WH-M-55")
        mh56 = self.find_struct("WH-M-56")
        mh38 = self.find_struct("WH-M-38")
        rj52 = self.db_view.table("mywcom_route_junction").get(52)
        rj51 = self.db_view.table("mywcom_route_junction").get(51)
        mdu_gp = self.find_struct("Gladeside Park")
        wb0144 = self.find_struct("WH-0144")
        fiber_cable_12 = self.find_cable("WH-FCB-012")

        # Feeder tube from manhole 54 -> manhole 56
        self.dev_db_conduit_mgr.ensureBfTubePath(mh54, mh56, props)

        # Connect tube from feeder --> wall box 0144 at route juntion 52
        self.dev_db_conduit_mgr.ensureBfTubePath(rj52, wb0144, props)

        # Connect tube from feeder --> MDU GladesidePark at route juntion 51
        self.dev_db_conduit_mgr.ensureBfTubePath(rj51, mdu_gp, props)

        # Add cable drop cable from manhole 54 -> wall box 0141, add to blown fiber t
        self.add_fiber_cable("WH-FCB-NB335:1", 4, [mh54.name, "Gladeside Park"])
        self.dev_db_conduit_mgr.createBfDropRoute(mh54.name, mdu_gp.name, props)

        # Modify attributes of mh54
        spec = "FPM-CCANN-C2"
        self.setSpec(mh54, "manhole_spec", spec)
        spec_rec = self.db_view.table("manhole_spec").get(spec)
        update_fields = {
            "specification": spec_rec,
            "installation_date": "2006-01-03",
            "lockable": True,
            "location": MywPoint(0.1377824590031292, 52.22542308965285),
        }
        self.update(mh54, **update_fields)

        # Delete mh55
        manhole_table = self.db_view.table("manhole")
        manhole_table.delete(mh55)

        # Modify placement_path of fiber_cable_12
        line_geom = MywLineString(
            [[0.1383533015752, 52.2252524147687], [0.1371371776175, 52.225681649208695]]
        )
        self.update(fiber_cable_12, placement_path=line_geom)

        # Delete mh33
        self.nw_view.struct_mgr.structPreDeleteTrigger(mh38)  # ENH: add delete triggers
        manhole_table.delete(mh38)

        # Delete route 67
        ug_route_table = self.db_view.table("ug_route")
        ug_route = ug_route_table.get(67)
        self.nw_view.struct_mgr.routePreDeleteTrigger(ug_route)
        ug_route_table.delete(ug_route)

        # Add slack to fiber_cable_12 at rj51
        self._add_slack_at(rj51, fiber_cable_12, "mywcom_fiber_segment/104", 43, "in")

    def build_cc4975(self):
        """
        Build circuits generating conflicts.
        """

        # Build circuit in delta
        engine = CircuitRoutingEngine(self.db, 1, "design/CC4975")
        engine.addFtthCircuit("WH-0071", "Direct", "")

        # Build circuit in master
        engine = CircuitRoutingEngine(self.db, 1)
        engine.addFtthCircuit("WH-0066", "Direct", "")

    def build_nb236(self):
        """
        Build network assignment design. Assign line of count to fibers arriving at DSLAM-1
        """

        loc_engine = LineOfCountEngine(self.db_view, self.nw_view)

        props = {
            "name": "WH-1-DSL",
            "label": "WH-1-DSL [1-4] Active",
            "low_logical": 1,
            "low_physical": 1,
            "high_logical": 4,
            "high_physical": 4,
            "status": "Active",
            "deleted": False,
            "origin": "mywcom_fiber_segment/596",
        }
        loc_rec = loc_engine.add_loc_rec(props)

        segs = [("WH-FCB-223", None, range(1, 5))]

        for (name, seg_range, mapping_range) in segs:
            loc_engine.add_loc_for_cable(name, seg_range, mapping_range, loc_rec)

        equips = [
            ("copper_dslam/1?side=in", range(1, 4), range(1, 4)),
        ]
        for (urn, mapping_domain, mapping_range) in equips:
            loc_engine.add_loc_for_equip(urn, mapping_domain, mapping_range, loc_rec)

    def add_change_detail(
        self, delta, change_type, feature, user, time, fields=[], original_feature=None
    ):
        """
        Add change detail record
        """

        table = self.db_view.table("mywcom_change_detail")
        det_rec = table._new_detached()
        det_rec.delta = delta
        det_rec.change_type = change_type
        det_rec.feature = feature._urn()
        det_rec.feature_title = feature._title()
        det_rec.change_user = user
        det_rec.change_time = time
        det_rec.fields = json.dumps(fields)
        det_rec.orig_feature = str(original_feature) if original_feature else None
        table.insert(det_rec)

    def build_cc4970(self):
        """
        Build a customer connection. Include user design change detail
        tracking and design markup.

        Scenario is that some tool/backend creates customer drop.
        Users then add cable, modify wall box and drop."""

        self.clear_delta()

        delta = "design/CC4970"
        wb_coord = [0.13751025776552153, 52.22270074867461]
        drop_junct_coord = [0.13730077373799862, 52.222820899630335]
        wb2_coord = [0.1373970089222584, 52.222641414307276]

        # Add wall box and route (splitting conduit runs)
        wb = self.add_wall_box(wb_coord, 45)
        drop_route = self.add_ug_route(
            "DROP", [drop_junct_coord, wb_coord], labor_costs="site_manager"
        )
        wb2 = self.add_wall_box(wb2_coord, 45)
        junct = drop_route._field("out_structure").rec()

        # Alice moves wall box
        wb_json = wb.asGeojsonFeature()
        self.update(wb, location=MywPoint(0.13746853455055855, 52.22268249196816))
        self.add_change_detail(
            delta,
            "update",
            wb,
            "Alice",
            datetime(2021, 4, 5, 12, 0),
            [
                "location",
            ],
            wb_json,
        )

        # Bob adds cable
        cable = self.add_fiber_cable("DROP2", 2, ["WH-M-29", wb.name], spec="O-004-CA-8W-F04NS")
        self.add_change_detail(delta, "insert", cable, "Bob", datetime(2021, 4, 5, 13, 0))

        # Alice modifies route
        drop_json = drop_route.asGeojsonFeature()
        self.update(drop_route, cover_type="Grass")
        self.add_change_detail(
            delta,
            "update",
            drop_route,
            "Alice",
            datetime(2021, 4, 5, 15, 0),
            ["cover_type"],
            drop_json,
        )

        # Alice deletes other wallbox
        wb_json = wb2.asGeojsonFeature()
        wb_table = self.db_view.table("wall_box")
        wb_table.delete(wb2)
        self.add_change_detail(
            delta, "delete", wb2, "Alice", datetime(2021, 4, 5, 16, 0), [], wb_json
        )

        # Markup data
        line_geom = [
            [0.13730077373799862, 52.222820899630335],
            [0.13754119086116237, 52.222729895838455],
        ]
        self.add_markup(
            delta,
            "iqgapp_markup_line",
            line_geom,
            line_style=' {"color":"#ff0000","width":5,"widthUnit":"px","lineStyle":"shortdash","startStyle":"","endStyle":"","arrowLength":5,"minArrowLength":2,"opacity":1}',
        )

        text_style = '{"textProp":"text","orientationProp":"myw_orientation_location","color":"#ff0000","size":20,"sizeUnit":"px","vAlign":"middle","hAlign":"center","vOffset":0,"hOffset":0,"placement":"point","fontFamily":"Arial","minSize":4}'
        text_geom = [0.13746474790423796, 52.22276604410996]
        self.add_markup(
            delta,
            "iqgapp_markup_text",
            text_geom,
            text="Alternative route. Protected tree in original path.",
            text_style=text_style,
            offset_width='{"dx":34,"dy":-97,"width":0}',
        )

        point_style = '{"symbol":"cross","color":"#ff0000","size":3,"sizeUnit":"m","borderColor":"","isSymbolPicker":true,"iconUrl":null}'
        point_geom = [0.137543873070177, 52.222728663510566]
        self.add_markup(delta, "iqgapp_markup_point", point_geom, point_style=point_style)

        fill_style = '{"color":"#ff0000","opacity":0.16}'
        line_style = '{"color":"#ff0000","width":1,"widthUnit":"px","lineStyle":"solid","startStyle":"","endStyle":"","arrowLength":5,"minArrowLength":2}'
        poly_geom = [
            [0.137326614139971, 52.2227771350511],
            [0.137358130095896, 52.222791101417386],
            [0.137452007411417, 52.222711410915565],
            [0.137422503112253, 52.22269662297171],
            [0.137326614139971, 52.2227771350511],
        ]
        self.add_markup(
            delta, "iqgapp_markup_polygon", poly_geom, poly_style=[line_style, fill_style]
        )

        # Photo with location.
        table = self.db_view.table("iqgapp_markup_photo")
        det_rec = table._new_detached()
        det_rec.owner = delta
        photo_rec = table.insert(det_rec)
        photo_rec._primary_geom_field.set(MywPoint([0.13731253254264267, 52.22272578807855]))
        table.update(photo_rec)

        # Photo item with photo of tree
        table = self.db_view.table("iqgapp_markup_photo_item")
        det_rec = table._new_detached()
        det_rec.photo = self.loadMarkupPhoto("tree.jpg")
        det_rec.owner = photo_rec._urn()
        table.insert(det_rec)

    def build_conflict_networks(self):
        
        ## 3205 ##
        self.build_test_network("3205",(0.1306606362184272, 52.224871520881436),(0.131093223165754, 52.22507137803833),(0.1314767790548836, 52.22527511171381))
        
        ## 1753 ##
        self.build_test_network("1753",(0.1307927233740813, 52.224753120019386),(0.131237970070553, 52.22495028306855),(0.1316671235129363, 52.225145802227786))
        
        ## 3206 ##
        self.build_test_network("3206",(0.1309773036844264, 52.22458541304792),(0.1314225503808986, 52.22479407803607),(0.1318973013765346, 52.225002742043614))
        
        ## 3208 ##
        dn_number = '3208'
        coord1 = (0.1311898687488567, 52.22440621003622)
        coord2 = (0.1318074473745357, 52.22468621521591)
        mh1 = self.add_manhole(f"WH-M-{dn_number}:1", coord1, 0, "FPM-CCANN-C2")
        mh2 = self.add_manhole(f"WH-M-{dn_number}:2", coord2, 0, "FPM-CCANN-C2")
        self.add_ug_route(1, [coord1, coord2])
        self.add_fiber_cable(f"WH-FCB-{dn_number}:1", 12, struct_names=[mh1.name, mh2.name], spec="D-144-LA-5L-F12NS")

        ## 2623 ##
        route1_coords = [(0.1314433945692459, 52.22423586845619), (0.1319284134697608, 52.22446918652847)]
        self.add_ug_route(1, route1_coords)

        ## 2818 ## 
        self.build_test_network("2818",(0.1316966014311223, 52.22539604871233),(0.1320529230837327, 52.22557209602573),(0.1324315267012029, 52.22575915139183))
        

    def build_test_network(self, dn_number, coord1, coord2, coord3):
        route1_coords = [coord1, coord2]
        route2_coords = [coord2, coord3]

        # Add manholes
        mh1 = self.add_manhole(f"WH-M-{dn_number}:1", coord1, 0, "FPM-CCANN-C2")
        mh2 = self.add_manhole(f"WH-M-{dn_number}:2", coord2, 0, "FPM-CCANN-C2")
        mh3 = self.add_manhole(f"WH-M-{dn_number}:3", coord3, 0, "FPM-CCANN-C2")

        # Add routes
        route1 = self.add_ug_route(1, route1_coords)
        route2 = self.add_ug_route(2, route2_coords)

        # Add cables
        cable1 = self.add_fiber_cable(f"WH-FCB-{dn_number}:1", 12, struct_names=[mh1.name, mh2.name], spec="D-144-LA-5L-F12NS")
        cable2 = self.add_fiber_cable(f"WH-FCB-{dn_number}:2", 12, struct_names=[mh2.name, mh3.name], spec="D-144-LA-5L-F12NS")

        sc1 = self.add_splice_closure_in(mh2, f"WH-SC-{dn_number}:1", spec="CS-FOSC450-D6-6-36-1-N0V")

    def build_nmc3205(self):
        """
        Add connection to design
        In master, adds manhole to split upstream, causes conflict on cable segment 
        """

        splice_closure = self.find_equip("WH-SC-3205:1")
        cable1 = self.find_cable("WH-FCB-3205:1")
        cable2 = self.find_cable("WH-FCB-3205:2")
        self.connect_cables(cable1, "out:1:1", cable2, "in:4:4",splice_closure)

    def build_nmc1753(self):
        """
        Add connection info to manhole in design
        In master, changes structure type, causes conflict on splice closure root housing record
        """

        splice_closure = self.find_equip("WH-SC-1753:1")
        cable1 = self.find_cable("WH-FCB-1753:1")
        cable2 = self.find_cable("WH-FCB-1753:2")
        self.connect_cables(cable1, "out:1:12", cable2, "in:1:12",splice_closure)

    def build_nmc3206(self):
        """
        Add connection info to manhole in design
        In master, deletes one of the fiber cables, causes conflict where cable segment is missing for the connections
        """

        splice_closure = self.find_equip("WH-SC-3206:1")
        cable1 = self.find_cable("WH-FCB-3206:1")
        cable2 = self.find_cable("WH-FCB-3206:2")
        self.connect_cables(cable1, "out:1:12", cable2, "in:1:12",splice_closure)

    def build_nmc3208(self):
        """
        Add slack at 2nd manhole
        In master, delete fiber cable
        """
        mh2 = self.find_struct("WH-M-3208:2")
        cable1 = self.find_cable("WH-FCB-3208:1")
        # Add slack
        self._add_slack_at(mh2, cable1, "mywcom_fiber_segment/6106", 15.24, "in")

    def build_nmc2623(self):
        """
        Add manhole at end of route
        In master, add another route
        """
        self.add_manhole("WH-M-2623:1", (0.1319284134697608, 52.22446918652847), 0, "FPM-CCANN-C2")

    def build_nmc2818(self):
        """
        Add route and manhole from middle manhole
        In master, delete middle manhole
        """
        mh2 = self.find_struct("WH-M-2818:2")
        mh2_coord = (0.1320529230837327, 52.22557209602573)
        mh4_coord = (0.1322038008249679, 52.22546875363105)
        mh4 = self.add_manhole("WH-M-2818:4", mh4_coord, 0, "FPM-CCANN-C2")

        route1 = self.add_ug_route(1, [mh2_coord,mh4_coord])
        cable3 = self.add_fiber_cable("WH-FCB-2818:3", 12, struct_names=[mh2.name, mh4.name], spec="D-144-LA-5L-F12NS")
        cable1 = self.find_cable("WH-FCB-2818:1")
        splice_closure = self.find_equip("WH-SC-2818:1")
        self.connect_cables(cable1, "out:1:12", cable3, "in:1:12", splice_closure)
        
    def loadMarkupPhoto(self, filename):
        file_path = os.path.join(self.data_dir, "markup", filename)
        with open(file_path, "rb") as strm:
            data = strm.read()
            return base64.b64encode(data).decode()

    def add_markup(
        self,
        delta,
        feature_type,
        geom_coords,
        line_style=None,
        text_style=None,
        text=None,
        poly_style=[],
        point_style=None,
        offset_width=None,
    ):
        """
        Add a markup feature
        """

        table = self.db_view.table(feature_type)
        det_rec = table._new_detached()
        det_rec.owner = delta

        if line_style:
            det_rec.line_style = line_style
            geom = MywLineString(geom_coords)
        if text_style:
            det_rec.text_style = text_style
            det_rec.text = text
            det_rec.offset_width = offset_width
            det_rec.leaderline = True
            geom = MywPoint(geom_coords)
        if point_style:
            det_rec.point_style = point_style
            geom = MywPoint(geom_coords)
        if poly_style:
            det_rec.line_style = poly_style[0]
            det_rec.fill_style = poly_style[1]
            geom = MywPolygon(geom_coords)

        new_rec = table.insert(det_rec)

        new_rec._primary_geom_field.set(geom)
        table.update(new_rec)

    # ==============================================================================
    #                                  SYSTEM TESTS
    # ==============================================================================

    def build_conflicts1(self):
        """
        build design with invalid data to test data validation
        """

        self.clear_delta()

        self._break_route()
        self._break_conduit()
        self._break_conduit_run()
        self._break_equip()
        self._break_cable()
        self._break_cable_segment()
        self._break_connection()

        # ENH: In future release, restore validation tests for circuits
        # self._break_circuit()
        # self._break_circuit_segment()
        # self._break_circuit_port()

    def _break_route(self):
        """
        Test check_routes method on data_validator
        """

        # Set ug route ends off structure to invalidiate path matching end structure
        ug_route_table = self.db_view.table("ug_route")
        ug_route = ug_route_table.get(89)
        line_geom = MywLineString(
            [
                [0.1366963, 52.2265398],
                [0.1367390155, 52.226573786],
                [0.1371198892, 52.226314197],
                [0.1371467113, 52.22627312],
                [0.1371172070, 52.22623369],
                [0.1368194818, 52.226072680],
                [0.136156976, 52.225714509],
                [0.1361677050, 52.225699722],
                [0.1361207664, 52.225671791],
                [0.1362320780, 52.225588819],
                [0.1362135, 52.2255836],
            ]
        )
        self.update(ug_route, path=line_geom, triggers=False)

    def _break_conduit(self):
        """
        Test check_conduits method on data_validator
        """

        # Change out conduit to give broken chain
        conduit73 = self.find_conduit("WH-BF-73 : 1")
        conduit48 = self.find_conduit("WH-BF-48 : 2")
        conduit43 = self.find_conduit("WH-BF-43 : 1")
        line_geom = MywLineString([[0.1366507, 52.2266047], [0.1361854, 52.2255877]])
        self.update(
            conduit73,
            path=line_geom,
            out_conduit=[conduit48],
            in_conduit=[conduit43],
            triggers=False,
        )

    def _break_conduit_run(self):
        """
        Test check_conduit_run method on data_validator
        """

        conduit = self.find_conduit("WH-BF-73 : 1")
        conduit_run = conduit._field("conduit_run").rec()
        line_geom = MywLineString([[0.1366507, 52.2266048], [0.1361855, 52.2255877]])
        self.update(conduit_run, path=line_geom, triggers=False)

    def _break_equip(self):
        """
        Test check_equip method on data_validator
        """

        ont147 = self.find_equip("WH-ONT-147")
        ug_route_table = self.db_view.table("ug_route")
        ug_route = ug_route_table.get(89)
        self.update(ont147, housing=[ug_route])

    def _break_cable(self):
        """
        Test check_cable method on data_validator
        """

        cable = self.find_cable("WH-FCB-009")
        self.update(cable, directed=None)

    def _break_cable_segment(self):
        """
        Test check_segment method on data_validator
        """

        cable = self.find_cable("WH-FCB-009")
        segs = cable._field("cable_segments").recs()

        for seg in segs:
            if seg.housing == "ug_route/14":  # ENH: Find a better way
                self.update(seg, in_segment=seg)

            # Set invalid tick mark to test validation
            if seg.housing == "ug_route/89":
                self.update(seg, out_tick=450)

    def _break_connection(self):
        """
        Test check_connection method on data_validator
        """

        sc39 = self.find_equip("WH-SC-039")
        splices = sc39._field("fiber_splices").recs(ordered=True)
        splice176 = splices[0]  # Test bad_pin_range on in and out and pin_range_mismatch
        self.update(splice176, in_low=80, out_low=35)

        # Create duplicate connection
        splice191 = splices[1]
        self.update(splice191, in_low=13, in_high=13)

        # This is for problems with coincident structures where routes and segments
        # get associated to the wrong structure.
        pole8 = self.find_struct("WH-P-008")

        # Don't want triggers to be run
        tab = self.db_view.table("mywcom_route_junction")
        rj = tab.insertWith()
        rj._primary_geom_field.set(pole8._primary_geom_field.geom())
        rj = tab.update(rj)

        cable57 = self.find_cable("DROP-057")
        seg = self.find_cable_seg(cable57, pole8, "in")
        self.update(seg, in_structure=[rj])
        route = seg._field("root_housing").rec()
        self.update(route, in_structure=[rj])

    def _break_circuit(self):
        """
        Test check_circuit method on data_validator
        """

        ftth29 = self.find_circuit("WH-FTTH-029")
        ont147 = self.find_equip("WH-ONT-147")
        self.update(ftth29, out_feature=[ont147], out_pins="in:90", triggers=False)

    def _break_circuit_segment(self):
        """
        Tests check_circuit_segment method on data_validator
        """

        ftth29 = self.find_circuit("WH-FTTH-029")
        circ_segment496 = ftth29._field("circuit_segments").recs(ordered=True)[0]
        self.update(circ_segment496, in_segment=[circ_segment496], in_structure=[circ_segment496])

    def _break_circuit_port(self):
        """
        Tests check_circuit_port method on data_valdiator
        """

        ftth29 = self.find_circuit("WH-FTTH-029")
        circ_port_163 = ftth29._field("circuit_ports").recs(ordered=True)[0]
        self.update(circ_port_163, root_housing=[circ_port_163], triggers=False)

    def build_verrors1(self):
        """
        Build design that will break when changes made in master. This is to simulate 'design on design'
        errors. Currently used to check that feature trees will display data but flag that validation needs to be run
        """

        self.clear_delta()

        # Add splice at WH-M-63 and connect cable
        struct = self.find_struct("WH-M-63")
        sc1 = self.add_splice_closure_in(struct, "WH-SC-D302:1", spec="CS-FOSC450-D6-6-36-1-N0V")

        cable1 = self.find_cable("WH-FCB-018")
        cable2 = self.find_cable("WH-FCB-197")
        self.connect_cables(cable1, "out:1:10", cable2, "in:1:10", sc1)

        # Connect cable to shelf WH-S-020 at WH-C-10
        shelf = self.find_equip("WH-S-020")
        self.connect_equip(shelf, "in:1:4", cable2, "out:1:4", "out")

        # Built to trigger the data validator on copper connections
        # Placed in systest/verror1 desgin

        m69 = self.find_struct("WH-M-69")

        c1 = self.add_cable(
            100,
            "WH-M-69",
            "WH-M-70",
            tech="copper",
            specification="100-19-ASPICF",
            gauge=19,
        )
        c2 = self.add_cable(
            100,
            "WH-M-70",
            "WH-M-71",
            tech="copper",
            specification="100-19-ASPICF",
            gauge=19,
        )

        self.add_copper_splice_closure_in("WH-M-69", "WH-CS-50")
        self.add_copper_splice_closure_in("WH-M-70", "WH-CS-51")
        self.add_copper_splice_closure_in("WH-M-71", "WH-CS-52")

        self.sp_engines["copper"].connect(f"{c1.name}#out:1:100", f"{c2.name}#in:1:100", "WH-CS-51")

        rack = self.add_equipment_in("rack", "WH-M-69", name="R-7")
        shelf = self.add_equipment_in(
            "copper_shelf", rack, name="S-7", n_copper_in_ports=0, n_copper_out_ports=100
        )

        seg = self.sp_engines["copper"].findSegment(m69, c1, "in", False)
        self.connect(shelf, "out:1:100", seg, "in:1:100", shelf, tech="copper")

    def build_master(self):
        """
        Update master to create conflicts
        """

        ug_route_table = self.db_view.table("ug_route")

        # Add data corrections causing technical conflicts in NB301
        # --------------------------------------------------------
        # Move manhole 07 to correct position
        mh07 = self.find_struct("WH-M-07")
        self.update(mh07, location=MywPoint(0.1336176, 52.2236381))

        # Move manhole 75 to correct position
        mh75 = self.find_struct("WH-M-75")
        self.update(mh75, location=MywPoint(0.1334522, 52.2235447))

        # Change attribute and path on route that joins them
        route88 = ug_route_table.get(88)
        coords = route88._field("path").geom().coords
        new_coords = [coords[0], [0.1335876, 52.2236144], coords[-1]]
        self.update(
            route88, path=MywLineString(new_coords), cover_type="Brick"
        )  # Matches change in NB301

        # Add data corrections causing technical conflicts in NB120 and NU23
        # ------------------------------------------------------------------
        # Move manhole 27 to correct position
        mh27 = self.find_struct("WH-M-27")
        self.update(
            mh27,
            location=MywPoint(0.13741057366132413, 52.223911903275292),
            myw_orientation_location=142.460556369668,
        )

        # Adjust route lengths
        # ENH: Do this in struct manager?
        route3 = ug_route_table.get(3)
        route4 = ug_route_table.get(4)
        self.update_ug_route_length(route3, 68.34)
        self.update_ug_route_length(route4, 78.47)

        # Split route causing technical conflicts in CC5462
        # -------------------------------------------------
        wb_coord = [0.1359560, 52.2255685]  # 62 Alice Bell Cl
        drop_junct_coord = [0.1359339, 52.2255569]

        # Add wall box and route (splitting conduit runs)
        wb = self.add_wall_box(wb_coord, 45)
        drop_route = self.add_ug_route(
            "DROP", [drop_junct_coord, wb_coord], labor_costs="site_manager"
        )

        # Move wall box causing technical conflicts in CC4827
        # ---------------------------------------------------
        wb = self.find_struct("WH-0147")
        ug_route = self.nw_view.struct_mgr.routesOf(wb)[0]
        junct = ug_route._field("out_structure").rec()

        # Move wall box
        self.update(wb, location=MywPoint(0.1365777, 52.2257170))

        # Move other end of drop route
        self.update(
            junct,
            location=MywPoint(
                0.1365358,
                52.2257432,
            ),
        )

        # Change manhole attributes causing conflicts in NB335
        # Change fiber cable placement path to cause conflict in NB335
        # Change spec of mh55 to cause delete/update conflict in NB335
        # Delete mh38 causing delete/delete conflict in NB335
        # ---------------------------------------------------
        mh54 = self.find_struct("WH-M-54")
        spec = "FPM-CCANN-MCX"
        self.setSpec(mh54, "manhole_spec", spec)
        spec_rec = self.db_view.table("manhole_spec").get(spec)
        update_fields = {
            "specification": spec_rec,
            "installation_date": "2006-01-03",
            "location": MywPoint(0.13772277985254783, 52.2254584142305),
        }
        self.update(mh54, **update_fields)

        # Modify placement path of fiber cable 12
        fiber_cable_12 = self.find_cable("WH-FCB-012")
        line_geom = MywLineString(
            [[0.1383533015752, 52.2252524147687], [0.1371371776175, 52.225681649208695]]
        )
        self.update(fiber_cable_12, placement_path=line_geom)

        # Update spec of manhole 55
        mh55 = self.find_struct("WH-M-55")
        spec = "FPM-CCANN-J4"
        self.setSpec(mh55, "manhole_spec", spec)
        spec_rec = self.db_view.table("manhole_spec").get(spec)
        update_fields = {"specification": spec_rec, "installation_date": "2006-01-03"}
        self.update(mh55, **update_fields)

        # Delete mh33
        manhole_table = self.db_view.table("manhole")
        mh38 = self.find_struct("WH-M-38")
        self.nw_view.struct_mgr.structPreDeleteTrigger(mh38)  # ENH: add delete triggers
        manhole_table.delete(mh38)

        # Update route 67
        ug_route_table = self.db_view.table("ug_route")
        ug_route = ug_route_table.get(67)
        self.update(ug_route, cover_type="Brick")

        # Update pedestal area 1
        tab = self.db_view.table("pedestal_area")
        pedestal_area = tab.filterOn("name", "WH-PA-01").first()
        self.update(pedestal_area, name="WH-PA-02")

        # For verrors1, split route and delete shelf that has connections
        mh_coord = [0.1398195326328, 52.2266008952275]
        self.add_manhole(None, mh_coord, 0.0)

        shelf = self.find_equip("WH-S-020")
        shelf_table = self.db_view.table("fiber_shelf")
        shelf_table.delete(shelf)

        # nmc3205 - add structure that splits
        mh_coord2 = [0.1308959191171638, 52.2249802227731]
        self.add_manhole(None, mh_coord2, 0.0)

        # nmc1753 - change structure type
        mh2 = self.find_struct('WH-M-1753:2')
        newStructure = self.nw_view.struct_mgr.replaceStructureWith(mh2, "manhole", 6104, "pole")

        # nmc3206 - delete fiber cable
        cable1 = self.find_cable("WH-FCB-3206:1")
        self.nw_view.cable_mgr.preDeleteTrigger(cable1)  
        cable_table = self.db_view.table("fiber_cable")
        cable_table.delete(cable1)

        # nmc3208 - delete fiber cable connected to slack
        cable1 = self.find_cable("WH-FCB-3208:1")
        self.nw_view.cable_mgr.preDeleteTrigger(cable1)  
        cable_table = self.db_view.table("fiber_cable")
        cable_table.delete(cable1)

        # nmc2623 - add extra route at in design manhole location
        route1_coords = [(0.1319284134697608, 52.22446918652847),(0.1323894847418509, 52.22468945618661)]  
        self.add_ug_route(1, route1_coords)     

        # nmc2818 - delete manhole
        mh2 = self.find_struct("WH-M-2818:2")         
        self.nw_view.struct_mgr.structPreDeleteTrigger(mh2)    
        manhole_table = self.db_view.table("manhole")      
        manhole_table.delete(mh2)
    
    # ==============================================================================
    #                                  FEATURE HELPERS
    # ==============================================================================

    def add_manhole(self, name, coord, orientation, spec=None):
        """
        Create a manhole and add it to network
        """

        with self.progress.operation("Adding manhole", name):
            # Insert record
            rec = self.insert(
                "manhole",
                name=name,
                location=coord,
                myw_orientation_location=orientation,
                specification=spec,
            )

            if spec:
                self.setSpec(rec, "manhole_spec", spec)

            return rec

    def add_wall_box(self, coord, orientation):
        """
        Create a wall box
        """

        with self.progress.operation("Adding wall box at", coord):
            rec = self.insert("wall_box", location=coord, myw_orientation_location=orientation)

            rec.name = "WH-{:04}".format(rec.id)
            self.update(rec)

            return rec

    def add_ug_route(self, name, coords, cover_type=None, labor_costs=None):
        """
        Create a route and add it to network

        COORDS is anything accepted by self.linestring()
        NAME is for debug info only"""

        with self.progress.operation("Adding ug route", name):
            rec = self.insert(
                "ug_route", path=coords, cover_type=cover_type, labor_costs=labor_costs
            )

            return rec

    def update_ug_route_length(self, route, length):
        """
        Set length of ROUTE and the conduits it contains
        """

        # Update contained conduits (if lengths match)
        # ENH: Handle nested conduits
        for cnd in route._field("conduits").recs(ordered=True):
            if cnd.length == route.length:
                self.update(cnd, length=length)

        # Update route
        self.update(route, length=length)

    def add_splice_closure_in(self, housing, name, spec=None):
        """
        Create a splice_closure in HOUSING
        """

        with self.progress.operation("Adding splice closure", name):
            rec = self.insert("splice_closure", name=name, specification=spec)

            self.nw_view.equip_mgr.setHousing(rec, housing)

            return rec

    def add_fiber_splitter_in(self, housing, name, n_ports=None, spec=None):
        """
        Create a splitter in HOUSING
        """

        with self.progress.operation("Adding splitter", name):
            rec = self.insert(
                "fiber_splitter",
                name=name,
                n_fiber_in_ports=1,
                n_fiber_out_ports=n_ports,
                specification=spec,
            )

            self.nw_view.equip_mgr.setHousing(rec, housing)

            return rec

    def add_ont_in(self, housing, name, n_ports=None, spec=None):
        """
        Create an ONT in HOUSING
        """

        with self.progress.operation("Adding ONT", name):
            rec = self.insert("fiber_ont", name=name, n_fiber_in_ports=n_ports, specification=spec)

            self.nw_view.equip_mgr.setHousing(rec, housing)

            return rec

    def add_shelf_in(self, housing, n_fiber_in_ports=None, n_fiber_out_ports=None):
        """
        Create a shelf in HOUSING
        """

        with self.progress.operation("Adding fiber shelf"):
            rec = self.insert(
                "fiber_shelf",
                n_fiber_in_ports=n_fiber_in_ports,
                n_fiber_out_ports=n_fiber_out_ports,
            )

            orig_rec = rec._clone()
            self.nw_view.equip_mgr.setHousing(rec, housing)

            self.nw_view.runPosUpdateTriggers(rec, orig_rec)

            return rec

    def add_conduits(self, type, count, props, struct_names):
        """
        Create conduits between STRUCT_NAMES
        """

        with self.progress.operation("Adding conduits along", *struct_names):
            # pylint: disable=assignment-from-no-return
            recs = self.dev_db_conduit_mgr.createAlong(type, count, props, *struct_names)

            return recs

    def add_fiber_cable(self, name, count, struct_names, in_conduit=False, spec=None):
        """
        Create a cable and route it between STRUCT_NAMES
        """

        with self.progress.operation("Adding cable", name):
            rec = self.insert(
                "fiber_cable", name=name, directed=True, fiber_count=count, specification=spec
            )

            self.dev_db_cable_mgr.route(rec, *struct_names)

            if in_conduit:
                self.dev_db_conduit_mgr.moveIntoConduits(rec)

            return rec

    def connect_equip(self, equip, equip_pins_spec, cable, cable_pins_spec, cable_side=None):
        """
        Connect CABLE to EQUIP

        CABLE_SIDE identifies the segment to use (for bi-directional cables)"""
        # ENH: Dupicated with devdb connection builder

        with self.progress.operation(
            "Connecting", equip, equip_pins_spec, "->", cable, cable_pins_spec
        ):
            # Build pin ranges
            equip_pins = PinRange.parse(equip_pins_spec)
            cable_pins = PinRange.parse(cable_pins_spec)

            # Find segment to connect to
            struct = equip._field("root_housing").rec()
            seg_side = cable_side or cable_pins.otherSide()
            seg = self.find_cable_seg(cable, struct, seg_side)

            # Do connection
            return self.nw_view.connection_mgr.connect(
                "fiber", equip, equip, equip_pins, seg, cable_pins
            )

    def connect_cables(self, out_cable, out_cable_pins_spec, in_cable, in_cable_pins_spec, housing):
        """
        Connect CABLE to EQUIP

        CABLE_SIDE identifies the segment to use (for bi-directional cables)"""
        # ENH: Dupicated with devdb connection builder

        with self.progress.operation(
            "Connecting", out_cable, out_cable_pins_spec, "->", in_cable, in_cable_pins_spec
        ):
            # Build pin ranges
            out_cable_pins = PinRange.parse(out_cable_pins_spec)
            in_cable_pins = PinRange.parse(in_cable_pins_spec)

            # Find containing structure
            struct = housing._field("root_housing").rec()

            # Find out segment
            out_seg_side = out_cable_pins.side
            out_seg = self.find_cable_seg(out_cable, struct, out_seg_side)

            # Find in segment
            in_seg_side = in_cable_pins.side
            in_seg = self.find_cable_seg(in_cable, struct, in_seg_side)

            # Do connection
            return self.nw_view.connection_mgr.connect(
                "fiber", housing, out_seg, out_cable_pins, in_seg, in_cable_pins
            )

    def disconnect(self, feature, pins_spec):
        """
        Connect pins of an equip or cable
        """

        with self.progress.operation("Disconnecting", feature, pins_spec):
            # Build pin range
            pins = PinRange.parse(pins_spec)

            # Do disconnection
            return self.nw_view.connection_mgr.disconnect("fiber", feature, pins)

    def find_cable_seg(self, cable, struct, side):
        """
        Returns segment of CABLE at SIDE of STRUCT
        """
        # ENH: Doesn't handle internal segs

        tab = self.db_view.table("mywcom_fiber_segment")
        seg_struct_field = side + "_structure"

        seg = tab.filterOn("cable", cable._urn()).filterOn(seg_struct_field, struct._urn()).first()

        if not seg:
            raise MywError("Cannot find", side, "cable segment at", struct, cable)

        return seg

    def add_ftth_circuit(self, service_type):
        """
        Add a FTTH circuit
        """

        with self.progress.operation("Adding ftth circuit"):
            # Create circuit record
            tab = self.db_view.table("ftth_circuit")
            circuit = tab.insertWith(service_type=service_type, status="New")

            # Set its name
            circuit.name = "{}-{:03}".format("WH-FTTH-", circuit.id)

        return circuit

    def add_bb_circuit(self):
        """
        Add a backbone circuit
        """

        with self.progress.operation("Adding backbone circuit"):
            # Create circuit record
            tab = self.db_view.table("bb_circuit")
            circuit = tab.insertWith(status="New")

            # Set its name
            circuit.name = "{}-{:04}".format("BB", circuit.id)

        return circuit

    def route_circuit_to(self, circuit, equip, port_spec):
        """
        Route (or re-route) CIRCUIT to termination port PORT_SPEC
        """

        with self.progress.operation("Routing", circuit, "to", equip, port_spec):
            # Build pin range
            pins = PinRange.parse(port_spec)

            # Set termination port
            circuit.out_feature = equip._urn()
            circuit.out_pins = port_spec

            # Find service port and set route
            in_node = self.nw_view.circuit_mgr.findPathTo(equip, pins, "fiber")
            self.nw_view.circuit_mgr.route(circuit, in_node)

        return circuit

    def delete_circuit(self, circuit):
        """
        Add a circuit
        """

        with self.progress.operation("Deleting", circuit):
            tab = self.db_view.table(circuit.feature_type)

            self.nw_view.circuit_mgr.unroute(circuit, "fiber")  # ENH: Add circuit triggers
            tab.delete(circuit)

    # ==============================================================================
    #                                  HELPERS
    # ==============================================================================

    def find_struct(self, name):
        return self.find_by_name("structure", self.nw_view.structs, name)

    def find_equip(self, name):
        return self.find_by_name("equipment", self.nw_view.equips, name)

    def find_cable(self, name):
        return self.find_by_name("cable", self.nw_view.cables, name)

    def find_circuit(self, name):
        return self.find_by_name("circuit", self.nw_view.circuits, name)

    def find_conduit(self, name):
        return self.find_by_name("conduit", self.nw_view.conduits, name)

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

    def update(self, rec, **props):
        """
        Update a record (handling geometry conversions) and run triggers
        """

        orig_rec = rec._clone(True)

        triggers = True
        if props.get("triggers") == False:
            triggers = False
            del props["triggers"]

        # Set fields
        for fld_name, val in props.items():
            fld = rec._field(fld_name)
            if hasattr(fld, "set"):  # TBR: Workaround for core issue 17733
                fld.set(val)
            else:
                rec[fld_name] = val

        # Update database
        tab = self.db_view.table(rec.feature_type)
        rec = tab.update(rec)

        # Update substructure etc
        if triggers:
            self.nw_view.runPosUpdateTriggers(rec, orig_rec)

    def setSpec(self, rec, spec_table, spec):
        """
        Set specification for REC to SPEC (and populate physical fields)
        """

        self.progress(2, "Setting", rec, "spec to", spec)

        spec_rec = self.db_view.table(spec_table).get(spec)

        if not spec_rec:
            raise MywError("No such spec:", spec)

        for field in spec_rec._descriptor.fields:
            if not field in rec._descriptor.fields:
                continue

            if field in ["name", "specification"]:
                continue

            rec[field] = spec_rec[field]

    def linestring(self, geom):
        """
        Build a MywLinseString geometry from GEOM (a list of xys, coords, etc)
        """

        if isinstance(geom, list):
            # Convert xys -> coords
            if isinstance(geom[0], (int, float)):
                geom = [(geom[i], geom[i + 1]) for i in range(0, len(geom), 2)]

            # Convert coords -> geom
            if isinstance(geom[0], (list, tuple)):
                geom = MywLineString(geom)

        return geom

    def clear_delta(self):
        """
        Remove all data from current view
        """

        self.progress(1, "Clearing", self.db_view)

        feature_types = self.db.dd.featureTypes("myworld", versioned_only=True)

        for feature_type in feature_types:
            self.db_view.table(feature_type).truncate()

        # ENH Need to clear markup and change details owned by a design ?

    def set_sequences(self, value, preserve_hwm=False):
        """
        Set the next value for all network object ID generators to VALUE

        If PRESERVE_HWM is True, use high water mark for each table if greater than VALUE

        Permits changes to test data without destablising other test results"""

        self.progress(1, "Setting sequences to", value)

        nw_view = NetworkView(self.db.view(), self.progress)

        # Remove non-versioned features
        mywcom_features = self.db.dd.featureTypes("myworld", "mywcom_*")
        mywcom_features.remove("mywcom_labor_cost")
        mywcom_features.remove("mywcom_change_detail")

        feature_types = (
            mywcom_features
            + list(nw_view.structs.keys())
            + list(nw_view.routes.keys())
            + list(nw_view.equips.keys())
            + list(nw_view.conduits.keys())
            + list(nw_view.cables.keys())
            + list(nw_view.circuits.keys())
        )

        self._set_sequences(feature_types, value, preserve_hwm)

    def _set_sequences(self, feature_types, value, preserve_hwm):
        """
        Set the next value for feature types FEATURE_TYPES generators to VALUE

        If PRESERVE_HWM is True, use high water mark for each table if greater than VALUE"""

        for feature_type in feature_types:
            feature_rec = self.db.dd.featureTypeRec("myworld", feature_type)
            desc = self.db.dd.featureTypeDescriptor(feature_rec)

            if not ("id" in desc.fields and desc.fields["id"].generator):
                self.progress(7, "Skipping", feature_type, "(no id field)")
                continue

            if preserve_hwm:
                tab_hwm = self.max_value_for(feature_type, "id") or 0
                tab_value = max(value, tab_hwm + 1)
            else:
                tab_value = value

            self.progress(7, "Setting sequence for", feature_type, "to", tab_value)
            self.db.db_driver.setSequenceValue("data", feature_type, "id", tab_value)

    def max_value_for(self, feature_type, field_name):
        """
        The highest ID so far used by FEATURE_TYPE
        """
        # ENH: Provide a core function to get this

        from sqlalchemy import func

        tab = self.db.view("dummy").table(feature_type)

        master_hwm = self.db.session.query(func.max(tab.model.__table__.c[field_name])).scalar()
        delta_hwm = self.db.session.query(
            func.max(tab.delta_model.__table__.c[field_name])
        ).scalar()

        if master_hwm is None:
            master_hwm = 0
        if delta_hwm is None:
            delta_hwm = 0

        return max(master_hwm, delta_hwm)

    def add_cable(self, count, *struct_names, tech="fiber", **kwargs):
        rec = self.cable_engines[tech].create(count, **kwargs)
        self.cable_engines[tech].route(rec, *struct_names)
        self.name_mgr.setNameFor(rec)
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

    def add_copper_splice_closure_in(self, housing, name, spec=None):
        """
        Create a splice_closure in HOUSING
        """

        if isinstance(housing, str):
            housing = self.find_struct(housing)

        with self.progress.operation("Adding copper splice closure", name):
            rec = self.insert("copper_splice_closure", name=name, specification=spec)

            self.nw_view.equip_mgr.setHousing(rec, housing)

            return rec

    def connect(self, ftr1, pins1, ftr2, pins2, housing, tech="fiber", splice=False):

        connection_type = self.connections[tech]
        pins1 = PinRange.parse(pins1)
        pins2 = PinRange.parse(pins2)
        self.sp_engines[tech].addConnection(
            housing, ftr1, pins1, ftr2, pins2, splice, tech=connection_type
        )

    def _add_slack_at(self, feature, cable, segment_urn, length, side):
        """
        Adds slack to CABLE in FEATURE at SIDE of SEGMENT_URN
        """
        feature_type = "mywcom_fiber_slack"
        table = self.db_view.table(feature_type)
        det_slack = table._new_detached()
        det_slack.housing = feature._urn()
        det_slack.root_housing = feature._urn()
        det_slack.location = feature.location
        det_slack.length = length
        det_slack.cable = cable._urn()
        self.nw_view.cable_mgr.addSlack("mywcom_fiber_slack", det_slack, segment_urn, side)
