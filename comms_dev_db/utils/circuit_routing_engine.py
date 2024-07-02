# Create and route circuits
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.geom.myw_line_string import MywLineString

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.network_view import NetworkView


class CircuitRoutingEngine(object):
    ##
    ## Engine for creating and routing circuits
    ##

    def __init__(self, db, trace_level, delta=None):
        ##
        ## Init slots of self
        ##
        ## DB is a MywDatabase

        self.db_view = db.view(delta)
        self.progress = MywSimpleProgressHandler(0)

        nw_view = NetworkView(self.db_view, self.progress)
        self.circuit_mgr = nw_view.circuit_mgr
        self.equip_mgr = nw_view.equip_mgr

    def addFtthCircuit(self, struct_name, circuit_type, customer_name, ont_port_no=1, ont_no=1):
        ##
        ## Route an FTTH service to ONT_PORT in STRUCT_NAME
        ##
        ## Creates circuit and set termination port. Also sets service port and path (if path exists)

        with self.progress.operation(
            "Adding FTTH circuit for", struct_name, "ONT port", ont_port_no
        ):

            # Find address record
            struct = self.findStruct(struct_name)
            address = self.addressNearest(struct)

            # Create circuit
            tab = self.db_view.table("ftth_circuit")
            circuit = tab.insertWith(
                customer=customer_name,
                address=address.id if address else "",
                service_type=circuit_type,
                status="New",
            )

            # Set name
            circuit.name = "{}-FTTH-{:03}".format("WH", circuit.id)

            # Set termination port
            out_feature = self.equipIn(struct, "fiber_ont", ont_no)
            out_pins = PinRange("in", ont_port_no)
            circuit._field("out_feature").set([out_feature])
            circuit.out_pins = out_pins.spec

            # Set OLT and path (if we can)
            self.routeCircuit(circuit, out_feature, out_pins)

    def addBbCircuit(self, in_spec, out_spec):
        ##
        ## Route an backbone service to PINs
        ##
        ## Creates circuit and sets ports and path

        with self.progress.operation("Adding backbone circuit", in_spec, "->", out_spec):

            # Find equipment
            (in_feature, in_pins) = self.parseSpec(in_spec)
            (out_feature, out_pins) = self.parseSpec(out_spec)

            # Create circuit
            tab = self.db_view.table("bb_circuit")
            circuit = tab.insertWith(status="New")

            # Set name
            circuit.name = "{}-{:04}".format("BB", circuit.id)

            # Set termination port
            circuit._field("out_feature").set([out_feature])
            circuit.out_pins = out_pins.spec

            # Set service port and path (if we can)
            self.routeCircuit(circuit, out_feature, out_pins)

    def routeCircuit(self, circuit, out_feature, out_pins):
        ##
        ## Set ports and path for CIRCUIT
        ##

        # Do trace
        in_node = self.circuit_mgr.findPathTo(out_feature, out_pins, "fiber")

        # Check we reached an appropriate service port
        config = self.circuit_mgr.nw_view.circuits[circuit.feature_type]

        if not in_node.feature.feature_type in config["inEquips"]:
            self.progress(
                2, "Path does not reach service port:", circuit, in_node.feature, config["inEquips"]
            )
            return

        # Set route
        self.circuit_mgr.route(circuit, in_node)
        circuit.status = "In Service"

    def addressNearest(self, struct, max_dist=50):
        ##
        ## Returns address record nearest to STRUCT
        ##
        # ENH: Provide proper search in CORE

        # Find nearby addresses
        tab = self.db_view.table("address")
        geom = struct._field("location").geom()
        recs = tab.filter(tab.field("location").geomWithinDist(geom, max_dist))

        if not recs:
            MywError("Cannot find address for", struct)

        # Find nearest one
        best_dist = 1.0e20
        best_rec = None

        for rec in recs:
            dist = rec._field("location").geom().geoDistanceTo(geom.coord)
            if best_dist > dist:
                best_dist = dist
                best_rec = rec

        self.progress(1, "Found address for", struct, ":", best_rec)

        return best_rec

    def findStruct(self, name):
        ##
        ## Returns the structure identified by NAME
        ##

        for feature_type in ("wall_box", "building", "mdu", "manhole", "cabinet", "pole", "room"):
            table = self.db_view.table(feature_type)
            rec = table.filterOn("name", name).first()

            if rec:
                return rec

        raise MywError("Cannot find structure:", name)

    def equipIn(self, struct, equip_type, equip_no=1):
        ##
        ## The equipment of type EQUIP_TYPE housed in STRUCT
        ##

        struct_equips = self.equip_mgr.allEquipmentIn(struct)
        equips = []
        for equip in struct_equips:
            if equip.feature_type == equip_type:
                equips.append(equip)

        sort_key = lambda equip: equip._urn()
        equips.sort(key=sort_key)

        if not equips:
            raise MywError("Cannot find", equip_type, "in", struct)

        if len(equips) < equip_no:
            raise MywError("Cannot find", equip_type, equip_no, "in", struct)

        return equips[equip_no - 1]

    def parseSpec(self, spec):
        ##
        ## Parse a pin specified of the form: <equip_name>#<pins>
        ##

        (equip_name, pin_spec) = spec.split("#")

        return self.findEquip(equip_name), PinRange.parse(pin_spec)

    def findEquip(self, name):
        ##
        ## Returns the equipment object identified by NAME
        ##

        for feature_type in [
            "fiber_patch_panel",
            "fiber_shelf",
            "fiber_olt",
            "fiber_splitter",
            "fiber_mux",
            "fiber_tap",
            "fiber_ont",
            "splice_closure",
            "fiber_splice_tray",
        ]:
            table = self.db_view.table(feature_type)
            rec = table.filterOn("name", name).first()

            if rec:
                return rec

        raise MywError("Cannot find equipment:", name)
