"""
Utility to build small/medium/large fibre rings into existing database and a design.
Can be used to populate designs with different sizes of network areas to test
performance of design related commands.
Purpose is to provide data that is representative of customer datasizes against which to 
test.

Currently run this as:

myw_db <database> run comms_build_fiber_rings.py --commit


Centre of world for data.
Create an exchange at centre
Start with creating primary node.
Naming convention to help find things and tie things together

FEXnnn-PNnnn-SNnnn - fex building, manholes,cabinets, poles where splitters are, splitter names at nodes
FEXnnn-SCnnn-SCnnn - Cables between splice closures on ring
FEXnnn-SCnnn - splice closure on ring

In terms of geometry, each layers alternate running left-right or top-bottom:
FEX - Runs east
PN  - Runs south
SN  - Runs east

 ---- PN-001  --------- PN-002  ------ PN-003 ---
 |      |                |              |       |
 |      | SN-01 ---                             |
 |      | SN-02                                 |
FEX                                             |
 |                                              |
 ------PN-004  --------- PN-005  ------ PN-006 ---
        |                |              |
        | SN-01 ---
        | SN-02 ---

TODO:
1. At the moment all PN splitters are feed from cables running clockwise.
Improvement would be to light 1st / odd PN splitters from clockwise cables (ODF-1) and others from anti (ODF-2)

2. Consider including different architectures (?)
       Single layer - 32 splitter
       Splitter in FEX/Central office 1:2 and then out to 1:16 splitters

"""

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.validation.data_validator import DataValidator
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

from myworldapp.modules.comms_dev_db.utils.circuit_routing_engine import CircuitRoutingEngine

import os

utils_dir = os.path.dirname(os.path.dirname(__file__))
addprioritysitedir(utils_dir)

# from myworldapp.modules.comms_dev_db.utils.comms_build_dev_db import CommsDevDbBuilder


class CommsBuildFiberRings:

    db_centre = 0
    skip_drops = False
    create_circuits_opt = False

    # Takes ~2.5hours
    large = {
        "num_primaries": 16,
        "num_primary_splitters": 16,
        "num_secondary_splitters": 4,
        "primary_splitter_out_ports": 4,
        "secondary_splitter_out_ports": 8,
        "main_cable_size": 288,
        "create_circuits_opt": False,
        "skip_drops": True,
        # Brum
        "start_coord": MywPoint(-1.9386791, 52.5004313),
    }

    medium = {
        "num_primaries": 8,
        "num_primary_splitters": 4,
        "num_secondary_splitters": 2,
        "primary_splitter_out_ports": 4,
        "secondary_splitter_out_ports": 8,
        "main_cable_size": 144,
        "create_circuits_opt": True,
        # London
        "start_coord": MywPoint(-0.23689154877142088, 51.5264076482176),
    }

    small = {
        "num_primaries": 4,
        "num_primary_splitters": 2,
        "num_secondary_splitters": 1,
        "primary_splitter_out_ports": 4,
        "secondary_splitter_out_ports": 4,
        "main_cable_size": 144,
        "create_circuits": False,
        # Glassgow
        "start_coord": MywPoint(-4.3497145, 55.8469045),
    }

    tiny = {
        "num_primaries": 2,
        "num_primary_splitters": 2,
        "num_secondary_splitters": 2,
        "primary_splitter_out_ports": 2,
        "secondary_splitter_out_ports": 4,
        "create_circuits_opt": True,
        # Glassgow
        "start_coord": MywPoint(-4.3497145, 55.8469045),
        "main_cable_size": 144 * 2,
        "skip_drops": True,
    }

    cable_specs = {
        4: "O-004-CA-8W-F04NS",
        12: "NETCONNECT 12 Count OM4",
        48: "O-048-CN-5L-F12NS",
        96: "D-096-LA-8W-F12NS",
        144: "D-144-LA-8W-F12NS",
        288: "D-288-LA-8W-F12NS",
    }

    def __init__(self, db, delta, options):

        self.trace_level = 1
        self.progress = MywSimpleProgressHandler(self.trace_level)
        self.progress.show_time = True

        self.db_view = db.view(delta)
        self.db = db

        self.network_view = NetworkView(self.db_view)

        self.circuit_engine = CircuitRoutingEngine(db, self.trace_level, delta)

        self.data_validator = DataValidator(self.db_view)

        for name, value in options.items():
            setattr(self, name, value)

    def cleanup_design(self):
        for feature_type in self.db.dd.featureTypes("myworld", versioned_only=True, sort=True):

            table = self.db_view[feature_type]
            n_recs = table.truncate()
            self.progress(2, "Table {} Deleted {}".format(feature_type, n_recs))

    def create_fex(self, fex_name):
        """
        Creates building with racks, OLTs, ODFs
        """

        self.progress(1, "Creating FEX ", fex_name)
        self.fex_rec = self.create_structure("building", fex_name, self.start_coord)

        self.create_olt_racks(fex_name)
        self.create_odfs(fex_name)
        self.connect_olt_odf(fex_name)

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

    def create_structure(self, type, name, coord):

        self.progress(2, "create_structure type={} name={} coord={}".format(type, name, coord))
        table = self.db_view.table(type)
        det_rec = table._new_detached()
        det_rec.name = name
        det_rec._primary_geom_field.set(coord)
        new_rec = table.insert(det_rec)

        return new_rec

    def create_route(self, type, coord):
        self.progress(2, "create_route type={} coord={}".format(type, coord))
        table = self.db_view.table(type)
        det_rec = table._new_detached()
        det_rec._primary_geom_field.set(coord)
        new_rec = table.insert(det_rec)

        self.network_view.struct_mgr.ensureStructuresFor(new_rec)

        return new_rec

    def create_cable(self, name, size, struct_coords, spec=None):

        if not spec:
            spec = self.cable_specs[size]

        table = self.db_view.table("fiber_cable")
        det_rec = table._new_detached()
        det_rec.name = name
        det_rec.fiber_count = size
        det_rec.directed = True
        det_rec.specification = spec
        new_rec = table.insert(det_rec)
        new_rec._field("placement_path").set(MywLineString(struct_coords))
        table.update(new_rec)

        self.network_view.cable_mgr.routeCable(new_rec)
        return new_rec

    def create_olt_racks(self, fex_name):
        # 2_rack x 3_shelf x 4_olt x 12_port = 144 x 2 for each ring
        # internals cables x  (48 or 96) fibre connect each shelf to ODF

        self.progress(1, "Create OLT Racks for ", fex_name)

        fex_rec = self.find_rec("building", fex_name)
        if fex_rec is None:
            self.progress(1, "Missing building for fex")
            return

        num_racks = 2
        num_shelfs = 3
        num_olts = 4 if self.main_cable_size == 144 else 8
        num_ports = 12

        for r_num in range(num_racks):
            rack_name = "{}-R{:02d}".format(fex_name, r_num + 1)
            self.progress(1, "Create Rack ", rack_name)
            rack = self.create_equip("rack", rack_name, fex_rec)
            for s_num in range(num_shelfs):
                self.progress(2, " create shelf")
                shelf = self.create_equip("fiber_shelf", "", rack)
                for o_num in range(num_olts):
                    self.progress(2, "   create olt")
                    olt = self.create_equip(
                        "fiber_olt",
                        "{}-R{}-O{:03d}".format(fex_name, r_num + 1, s_num * num_olts + o_num + 1),
                        shelf,
                        n_fiber_out_ports=num_ports,
                    )

    def create_equip(self, type, name, housing, **props):
        table = self.db_view.table(type)
        new_rec = table.insertWith(name=name, **props)
        self.network_view.equip_mgr.setHousing(new_rec, housing)
        return new_rec

    def create_odfs(self, fex_name):
        fex_rec = self.find_rec("building", fex_name)
        for r_num in range(2):
            rack = self.create_equip(
                "fiber_patch_panel",
                "{}-ODF{:02d}".format(fex_name, r_num + 1),
                fex_rec,
                n_fiber_ports=self.main_cable_size,
            )

    def connect_olt_odf(self, fex_name):
        # Use 48 or 96 fibre cables from each olt ports on a shelf to ODF
        fex_rec = self.find_rec("building", fex_name)

        num_racks = 2
        num_shelfs = 3
        num_olts = 4 if self.main_cable_size == 144 else 8
        num_ports = 12

        for r_num in range(num_racks):
            pp_name = "{}-ODF{:02d}".format(fex_name, r_num + 1)
            odf_rec = self.find_rec("fiber_patch_panel", pp_name)

            if not odf_rec:
                raise MywError(f"Cannot find patch_panel {pp_name}")

            for s_num in range(num_shelfs):
                # Create 48 or 96 fibre internal cable for eachshelf
                self.progress(
                    2, "New INT cable {}-R{:02d}-S{:02d}".format(fex_name, r_num + 1, s_num + 1)
                )
                int_seg = self.add_internal_cable(
                    "fiber_cable",
                    "{}-R{:02d}-S{:02d}".format(fex_name, r_num + 1, s_num + 1),
                    fex_rec,
                    fiber_count=num_olts * num_ports,
                    directed=False,
                    specification="O-048-CN-5L-F12NS",
                )

                for o_num in range(num_olts):
                    olt_rec = self.find_rec(
                        "fiber_olt",
                        "{}-R{}-O{:03d}".format(fex_name, r_num + 1, s_num * num_olts + o_num + 1),
                    )
                    # Setup pins
                    # Calc cable pins
                    low = o_num * num_ports + 1
                    high = low + (num_ports - 1)
                    self.progress(2, "Connect OLT-INT {}-{} {}:{}".format(r_num, s_num, low, high))
                    pins1 = PinRange("out", 1, num_ports)
                    pins2 = PinRange("in", low, high)
                    self.connect("fiber", olt_rec, olt_rec, pins1, int_seg.ref, pins2)

                # Calc pins on cable and ODF
                # Connect Cable-ODF
                low = s_num * (num_olts * num_ports) + 1
                high = low + (num_olts * num_ports - 1)

                if True:
                    pins1 = PinRange("out", 1, num_olts * num_ports)
                    pins2 = PinRange("in", low, high)
                    print("CONNECT ODF ", odf_rec, odf_rec.name, int_seg.ref)
                    self.connect("fiber", odf_rec, int_seg.ref, pins1, odf_rec, pins2)

                else:
                    pins1 = PinRange("out", 1, 48)
                    pins2 = PinRange("int", low, high)
                    self.connect("fiber", odf_rec, odf_rec, pins2, int_seg.ref, pins1)

            self.progress(1, "Connect INT-ODF {}-{} {}:{}".format(r_num, s_num, low, high))

    def connect(self, tech, housing, ftr1, pins1, ftr2, pins2, debug=None):
        rec = self.network_view.connection_mgr.connect(tech, housing, ftr1, pins1, ftr2, pins2)
        if debug:
            print("Connecting ", housing, ftr1, pins1, ftr2, pins2, rec)
        self.data_validator.check_connection(rec)
        return rec

    def add_internal_cable(self, type, name, housing, **props):
        ##
        # Add an internal cable in HOUSING
        ##

        self.progress(2, "Adding", type, name, "in", housing)

        tab = self.db_view.table(type)

        if hasattr(housing, "root_housing"):
            struct = housing._field("root_housing").rec()
        else:
            struct = housing

        coord = struct._field("location").geom().coord
        geom = MywLineString([coord, coord])
        cable = tab.insertWith(name=name, **props)

        cable._field("path").set(geom)
        tab.update(cable)

        self.network_view.cable_mgr.createSegForInternalCable(cable, [housing])

        return self.getSegmentAt(struct, cable)

    def create_ring(self, fex_name):

        (w, h) = self.sizeof_primary()

        pn_coords = []
        pn_structs = []

        # First create primary nodes which will place the PN manhole
        for pn in range(1, self.num_primaries + 1):
            coord = self.translate(self.start_coord, w * pn, h)
            pn_coords.append(coord)
            pn_name = "{}-PN{:03d}".format(fex_name, pn)
            self.progress(1, "Create PN", pn_name, "of", self.num_primaries)
            rec = self.create_primary(pn_name, coord)
            pn_structs.append(rec)

        # Now place the routes between the FEX and PN manholes
        start_row = self.translate(self.start_coord, 0, h)
        line = MywLineString([self.start_coord, start_row, pn_coords[0]])
        self.create_route("ug_route", line)

        for i in range(0, len(pn_coords) - 1):
            line = MywLineString([pn_coords[i], pn_coords[i + 1]])
            self.create_route("ug_route", line)

        bottom_row1 = self.translate(pn_coords[-1], w, 0)
        bottom_row2 = self.translate(pn_coords[-1], w, -h)
        line = MywLineString([pn_coords[-1], bottom_row1, bottom_row2, self.start_coord])

        self.create_route("ug_route", line)
        rec = self.create_structure("manhole", "MH-CORNER", bottom_row2)
        self.network_view.struct_mgr.structPosInsertTrigger(rec)
        self.create_ring_civils(fex_name)

        self.create_ring_cables(fex_name, self.start_coord, pn_coords, pn_structs, bottom_row2)
        self.connect_ring_cables_to_fex(fex_name, pn_structs)
        self.connect_ring_cables(fex_name, pn_structs)

    def connect_ring_cables_to_fex(self, fex_name, pn_structs):

        fex_struct = self.find_rec("building", fex_name)
        pp_out = self.find_rec("fiber_patch_panel", "{}-ODF{:02d}".format(fex_name, 1))
        pp_in = self.find_rec("fiber_patch_panel", "{}-ODF{:02d}".format(fex_name, 2))

        out_cable = self.find_rec("fiber_cable", "{}/{}".format(fex_name, pn_structs[0].name))
        in_cable = self.find_rec("fiber_cable", "{}/{}".format(pn_structs[-1].name, fex_name))

        out_cable_seg = self.getSegmentAt(fex_struct, out_cable, side="in")
        in_cable_seg = self.getSegmentAt(fex_struct, in_cable, side="out")

        pins1 = PinRange("out", 1, self.main_cable_size)
        pins2 = PinRange("in", 1, self.main_cable_size)
        self.connect("fiber", pp_out, pp_out, pins1, out_cable_seg.ref, pins2)

        self.connect("fiber", pp_in, pp_in, pins1, in_cable_seg.ref, pins1)

    def create_ring_cables(self, fex_name, fex_coord, pn_coords, pn_structs, corner_coord):
        ##
        # Create cables around the ring.

        # ENH: Include intermediate splices

        cable_name = "{}/{}".format(fex_name, pn_structs[0].name)
        self.create_cable(cable_name, self.main_cable_size, [fex_coord, pn_coords[0]])
        for i in range(0, len(pn_coords) - 1):
            cable_name = "{}/{}".format(pn_structs[i].name, pn_structs[i + 1].name)
            cable = self.create_cable(
                cable_name, self.main_cable_size, [pn_coords[i], pn_coords[i + 1]]
            )

        # Return cable from last PN to FEX
        cable_name = "{}/{}".format(pn_structs[-1].name, fex_name)
        cable = self.create_cable(
            cable_name, self.main_cable_size, [pn_coords[-1], corner_coord, fex_coord]
        )

    def connect_ring_cables(self, fex_name, pn_structs):
        """
        Connect ring cables to each other to form ring and splitters in primary nodes

        At PN1
           Connect n fibres of FEX / PN 1 to splitters
           Connect rest to PN 1 / PN 2

        At PN-x
           Connect next n fibres of PN-{x-1} to splitters
           Connect rest to PN-x to PN-{x+1}
        """
        fex_struct = self.find_rec("building", fex_name)

        for i in range(0, len(pn_structs)):

            self.progress(4, "Connecting PN splitters to ring", pn_structs[i].name)

            from_struct = fex_struct if i == 0 else pn_structs[i - 1]
            this_struct = pn_structs[i]
            to_struct = fex_struct if i == (len(pn_structs) - 1) else pn_structs[i + 1]
            pn_name = this_struct.name

            from_cable = self.find_rec(
                "fiber_cable", "{}/{}".format(from_struct.name, this_struct.name)
            )
            to_cable = self.find_rec(
                "fiber_cable", "{}/{}".format(this_struct.name, to_struct.name)
            )

            sp_start = i * self.num_primary_splitters + 1
            pass_start = (i + 1) * self.num_primary_splitters + 1
            pass_end = self.main_cable_size  # (i+1) * self.num_primary_splitters

            if from_cable and to_cable:
                self.connect_cables(
                    this_struct, from_cable, pass_start, pass_end, to_cable, pass_start, pass_end
                )

            for sp in range(self.num_primary_splitters):
                pp_name = f"{pn_name}-ODF01"
                pp_rec = self.find_rec("fiber_patch_panel", pp_name)
                fseg = self.getSegmentAt(this_struct, from_cable, side="out")

                self.connect(
                    "fiber",
                    pp_rec,
                    fseg.ref,
                    PinRange("out", sp_start + sp, sp_start + sp),
                    pp_rec,
                    PinRange("in", sp + 1, sp + 1),
                )

                # sp_name = "{}-SP{:03d}".format(pn_name, sp+1 )
                # self.progress(4,"Connecting in-side of PNI splitter ", sp_name)
                # sp_rec = self.find_rec('fiber_splitter', sp_name)
                # self.connect_splitter_in(sp_rec, from_cable, sp_start + sp)

    def create_circuit_at_ont(self, ont_rec):
        self.progress(4, "Create circuit for ", ont_rec)
        # Create circuit
        tab = self.db_view.table("ftth_circuit")
        circuit = tab.insertWith(customer="", service_type="PON1", status="New")

        # Set name
        circuit.name = "FTTH-{}".format(ont_rec.name)

        # Set termination port
        out_pins = PinRange("in", 1)
        circuit._field("out_feature").set([ont_rec])
        circuit.out_pins = out_pins.spec

        # Set OLT and path (if we can)
        self.circuit_engine.routeCircuit(circuit, ont_rec, out_pins)

    @property
    def num_secondary_per_primary(self):
        return int(
            (self.num_primary_splitters * self.primary_splitter_out_ports)
            / self.num_secondary_splitters
        )

    @property
    def num_ont_per_sn_splitter(self):
        return self.secondary_splitter_out_ports

    def create_circuits(self, fex_name):
        ##
        ## Create the circuits for FEX
        ##

        for pn_num in range(self.num_primaries):
            pn_name = "{}-PN{:03d}".format(fex_name, pn_num + 1)
            self.progress(1, "Create circuits for PN", pn_name, "of", self.num_primaries)
            for sn_num in range(self.num_secondary_per_primary):
                sn_name = "{}-SN{:03d}".format(pn_name, sn_num + 1)
                self.progress(
                    1, "Create circuits for SN", sn_name, "of", self.num_secondary_per_primary
                )
                for sp_num in range(self.num_secondary_splitters):
                    for ont_num in range(self.num_ont_per_sn_splitter):
                        ont_name = "{}-{:03d}-{:03d}".format(sn_name, sp_num + 1, ont_num + 1)
                        ont_rec = self.find_rec("fiber_ont", ont_name)
                        if ont_rec:
                            self.create_circuit_at_ont(ont_rec)

    def connect_cables(self, struct, from_cable, from_start, from_end, to_cable, to_start, to_end):
        ##
        ## Connect two cables at a struct with provided ranges
        ##

        self.progress(4, "connect_cable", from_cable, to_cable)

        sc = self.create_equip("splice_closure", "", struct)
        in_fseg = self.getSegmentAt(struct, from_cable, side="out")
        out_fseg = self.getSegmentAt(struct, to_cable, side="in")

        pins1 = PinRange("out", from_start, from_end)
        pins2 = PinRange("in", to_start, to_end)
        self.connect("fiber", sc, in_fseg.ref, pins1, out_fseg.ref, pins2)

    def create_ring_civils(self, fex_name):
        ##
        # Manholes, routes, conduits
        ##
        pass

    def create_primary(self, pn_name, pn_coord):

        # self.progress(1, "create_primary {}".format(pn_name))

        pn_rec = self.create_primary_civils(pn_name, pn_coord)

        (w, h) = self.sizeof_secondary()

        # Create SN
        sn_coords = []
        for sn in range(1, self.num_secondary_per_primary + 1):

            coord = self.translate(pn_coord, 0, sn * -h)
            sn_coords.append(coord)

            sn_name = "{}-SN{:03d}".format(pn_name, sn)
            self.progress(1, "Create SN", sn_name, "of", self.num_secondary_per_primary)
            sn_rec = self.create_secondary(sn_name, coord)

        # Create routes to SN
        self.create_route("ug_route", MywLineString([pn_coord, sn_coords[0]]))
        for i in range(0, len(sn_coords) - 1):
            line = MywLineString([sn_coords[i], sn_coords[i + 1]])
            self.create_route("ug_route", line)

        # Create cables to SN and connect to SN splitters
        sn_cables = []
        for sn in range(1, self.num_secondary_per_primary + 1):
            sn_name = "{}-SN{:03d}".format(pn_name, sn)
            cable_name = "{}/{}".format(pn_name, sn_name)
            cable_rec = self.create_cable(cable_name, 12, [pn_coord, sn_coords[sn - 1]])

            sn_cables.append(cable_rec)

            for sp_num in range(self.num_secondary_splitters):
                sp_name = "{}_SP{}".format(sn_name, sp_num)
                sp_rec = self.find_rec("fiber_splitter", sp_name)
                if sp_rec is None:
                    print("CAnnot find spitter {}".format(sp_name))
                else:
                    self.connect_splitter_in(sp_rec, cable_rec, sp_num + 1)

        self.create_primary_equipment(pn_name, pn_rec, pn_coord, sn_cables)

        return pn_rec

    def find_rec(self, type, name):

        table = self.db_view.table(type)
        rec = table.filterOn("name", name).first()
        return rec

    def create_primary_civils(self, pn_name, coord):
        ##
        # Manholes, routes, conduits
        ##
        rec = self.create_structure("cabinet", pn_name, coord)
        return rec

    def create_primary_equipment(self, pn_name, pn_struct, coord, sn_cables):
        """
        Create patch-panels and splitters
        """
        num_in = self.num_primary_splitters
        num_out = self.num_primary_splitters * self.primary_splitter_out_ports

        pp_in = self.create_equip(
            "fiber_patch_panel", "{}-ODF01".format(pn_name), pn_struct, n_fiber_ports=num_in
        )
        pp_out = self.create_equip(
            "fiber_patch_panel", "{}-ODF02".format(pn_name), pn_struct, n_fiber_ports=num_out
        )

        sp_recs = []
        for sp_num in range(1, self.num_primary_splitters + 1):
            sp_name = "{}-SP{:03d}".format(pn_name, sp_num)
            sp_rec = self.create_splitter(sp_name, coord, self.primary_splitter_out_ports)
            self.progress(2, "create primary splitter {}".format(sp_name))
            sp_recs.append(sp_rec)

            self.connect(
                "fiber", pp_in, pp_in, PinRange("out", sp_num, sp_num), sp_rec, PinRange("in", 1, 1)
            )

            start_pp = (sp_num - 1) * int(self.primary_splitter_out_ports) + 1
            end_pp = sp_num * int(self.primary_splitter_out_ports)
            self.connect(
                "fiber",
                pp_out,
                sp_rec,
                PinRange("out", 1, self.primary_splitter_out_ports),
                pp_out,
                PinRange("in", start_pp, end_pp),
            )

            start = (sp_num - 1) * int(
                self.primary_splitter_out_ports / self.num_secondary_splitters
            )
            end = sp_num * int(self.primary_splitter_out_ports / self.num_secondary_splitters)

            # Connect out-ports of patch panel to cables going to SN.
            for cable in sn_cables[start:end]:
                fseg = self.getSegmentAt(pn_struct, cable, side="in")
                self.connect(
                    "fiber",
                    pp_out,
                    pp_out,
                    PinRange("out", start_pp, end_pp),
                    fseg.ref,
                    PinRange("in", 1, self.num_secondary_splitters),
                )

            # self.connect_splitter_out(pn_struct, sp_rec, sn_cables[start:end], self.num_secondary_splitters)

    def skip_drop(self, sn_name, sp_num):
        return self.skip_drops and sp_num == 0

    def create_secondary(self, sn_name, coord):
        """
        Create SN network

        """

        self.progress(2, "create_secondary {}".format(sn_name))

        # for n in range(1, self.num_secondary_splitters+1):
        #    sp_name = "{}-SP{:03d}".format(sn_name, n)
        #    self.create_secondary_splitter(sp_name)

        sn_struct = self.create_structure("manhole", sn_name, coord)

        drop_coords = [coord]
        wb_coords = [
            None for i in range(self.num_secondary_splitters * self.num_ont_per_sn_splitter)
        ]
        drop_cables = []

        # Create drops
        for sp_num in range(self.num_secondary_splitters):

            if self.skip_drop(sn_name, sp_num):
                continue

            drop_cables.append([])
            for ont_num in range(self.num_ont_per_sn_splitter):
                wb_num = ont_num + sp_num * self.num_ont_per_sn_splitter
                drop_coord = self.translate(coord, 10 * (wb_num + 1), 0)
                self.create_structure("manhole", "", drop_coord)
                drop_coords.append(drop_coord)
                wb_coord = self.translate(drop_coord, 0, 10)
                self.create_structure("wall_box", "", wb_coord)
                self.create_route("ug_route", MywLineString([drop_coord, wb_coord]))
                wb_coords[sp_num * self.num_ont_per_sn_splitter + ont_num] = wb_coord

        for i in range(0, len(drop_coords) - 1):
            self.create_route("ug_route", MywLineString([drop_coords[i], drop_coords[i + 1]]))

        # Create drop cables, splitters and connect to drop cables
        for sp_num in range(self.num_secondary_splitters):
            sp_rec = self.create_splitter(
                "{}_SP{}".format(sn_name, sp_num), coord, self.secondary_splitter_out_ports
            )

            if self.skip_drop(sn_name, sp_num):
                continue
            drop_cables = []
            for ont_num in range(self.num_ont_per_sn_splitter):
                wb_num = ont_num + sp_num * self.num_ont_per_sn_splitter
                cable_rec = self.create_cable(
                    "DROP{}".format(wb_num + 1), 4, [coord, wb_coords[wb_num]]
                )
                drop_cables.append(cable_rec)

                ont_name = "{}-{:03d}-{:03d}".format(sn_name, sp_num + 1, ont_num + 1)
                self.create_ont(wb_coords[wb_num], cable_rec, ont_name)

            self.connect_splitter_out(sn_struct, sp_rec, drop_cables)

    def create_ont(self, coord, cable_rec, ont_name):
        """
        Create ONT and connect to cable
        """

        table = self.db_view.table("fiber_ont")
        det_rec = table._new_detached()
        det_rec.n_fiber_in_ports = 4
        det_rec.name = ont_name
        det_rec._primary_geom_field.set(coord)
        new_rec = table.insert(det_rec)

        housing = self.network_view.struct_mgr.ensureStructureAt(coord)
        self.network_view.equip_mgr.setHousing(new_rec, housing)

        struct = self.network_view.connection_mgr.rootHousing(new_rec)
        fseg = self.getSegmentAt(struct, cable_rec)
        pins1 = PinRange("out", 1, 1)
        pins2 = PinRange("in", 1, 1)
        self.connect("fiber", new_rec, fseg.ref, pins1, new_rec, pins2)

        return new_rec

    def create_splitter(self, name, coord, out_ports):
        """
        Create splitter
        """
        table = self.db_view.table("fiber_splitter")
        det_rec = table._new_detached()
        det_rec.name = name
        det_rec.n_fiber_in_ports = 1
        det_rec.n_fiber_out_ports = out_ports
        det_rec._primary_geom_field.set(coord)
        new_rec = table.insert(det_rec)

        housing = self.network_view.struct_mgr.ensureStructureAt(coord)
        self.network_view.equip_mgr.setHousing(new_rec, housing)
        return new_rec

    def getSegmentAt(self, struct, cable, side=None):

        import collections

        SegInfo = collections.namedtuple("SegInfo", ["ref", "side"])

        segs = self.network_view.cable_mgr.orderedSegments(cable)

        seg = segs[0]
        struct = struct._urn()

        at_struct = []
        for s in segs:
            if s.in_structure == struct or s.out_structure == struct:
                at_struct.append(s)

        if seg.in_structure == struct and (side == "in" or side == None):
            return SegInfo(seg, "in")
        seg = segs[-1]
        if seg.out_structure == struct and (side == "out" or side == None):
            return SegInfo(seg, "out")

        raise Exception(f"getSegmentAt failed {struct} {cable} {cable.name} {side}")

    def connect_splitter_in(self, rec, cable_rec, fiber_num):
        """
        Connect the IN-side of a splitted REC
        """

        # print("CONNECT SPLITTER IN-side",rec,cable_rec,fiber_num)

        struct = self.network_view.connection_mgr.rootHousing(rec)
        fseg = self.getSegmentAt(struct, cable_rec, side="out")
        pins1 = PinRange("out", fiber_num, fiber_num)
        pins2 = PinRange("in", 1, 1)
        self.connect("fiber", rec, fseg.ref, pins1, rec, pins2)

        self.data_validator.check_segment(fseg.ref)

    def connect_splitter_out(self, struct, rec, cables, fibres_per_cable=1):
        """
        Connect the OUT-side of splitter REC to CABLES
        """

        for i, cable in enumerate(cables):
            fseg = self.getSegmentAt(struct, cable, side="in")
            out_start = i * fibres_per_cable + 1
            out_end = (i + 1) * fibres_per_cable
            pins1 = PinRange("out", out_start, out_end)
            pins2 = PinRange("in", 1, fibres_per_cable)
            self.connect("fiber", rec, rec, pins1, fseg.ref, pins2)

            self.data_validator.check_segment(fseg.ref)

    def sizeof_primary(self):
        (w, h) = self.sizeof_secondary()
        return (w, (self.num_secondary_per_primary + 1) * h)

    def sizeof_secondary(self):
        return (10 + 100 * (self.num_ont_per_sn_splitter / 2), 100)


if __name__ in ["builtins", "__main__"]:
    designs = [
        ("master", CommsBuildFiberRings.large, "FEX-BHM-01"),
        ("perf_medium", CommsBuildFiberRings.medium, "FEX-LDN-01"),
        ("perf_small", CommsBuildFiberRings.small, "FEX-GLW-01"),
        ("perf_tiny", CommsBuildFiberRings.tiny, "FEX-GLW-02"),
    ]

    # designs = [('perf_tiny', CommsBuildFiberRings.tiny, 'FEX-GLW-02')]

    for d in designs:
        print(f"*** Building network {d} ***")
        if d[0] == "master":
            delta = ""
        else:
            delta = "design/" + d[0]
        builder = CommsBuildFiberRings(db, delta, d[1])
        if delta:
            builder.cleanup_design()
        fex_name = d[2]
        builder.create_fex(fex_name)
        builder.create_ring(fex_name)
        if builder.create_circuits_opt:
            builder.create_circuits(fex_name)
