# Create cables and route them through the structure network

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.conn_set import ConnSet
from myworldapp.modules.comms.server.api.network_view import NetworkView


class DevDBConnPoint(object):
    """
    A connection point specification

    Provides facilities for parsing dev db strings, computing ranges, .."""

    def __init__(self, spec, cable_type="fiber_cable"):
        """
        Init slots of self from string representation

         SPEC is a string of the form:
           <cable_name>#<side>:<low_fiber>:<high_fiber>
           <equipment_name>#<side>:<port>
           <equipment_name>#<side>:<low_port>:<high_port>"""

        self.spec = spec

        (self.feature, pin_range) = spec.split("#")
        self.pins = PinRange.parse(pin_range)
        self.cable_type = cable_type

    def __str__(self):
        """
        String representation of self
        """

        return "{}({})".format(self.__class__.__name__, self.spec)

    def isCable(self):
        """
        True if self is a reference to a cable
        """
        # Assumes DevDB naming scheme

        if "-CC-" in self.feature:
            return True
        if "-CA-" in self.feature:
            return True

        if "-FCB-" in self.feature:
            return True
        if "RISER-" in self.feature:
            return True
        if "DROP-" in self.feature:
            return True
        if "-INT-" in self.feature:
            return True

        return False


class SpliceEngine(object):
    """
    Engine for connecting cables to equipment and to one another

    Understands comms dev db naming scheme"""

    def __init__(self, db, trace_level, cable_type="fiber_cable", delta=""):
        """
        Init slots of self

        DB is a MywDatabase"""

        if not delta:
            self.db_view = db.view()
        else:
            self.db_view = db.view(delta)
        self.progress = MywSimpleProgressHandler(trace_level)
        self.cable_type = cable_type

        nw_view = NetworkView(self.db_view, self.progress)
        self.equip_mgr = nw_view.equip_mgr

        tech = cable_type.split("_")[0]
        self.cable_segment = f"mywcom_{tech}_segment"
        self.cable_connection = f"mywcom_{tech}_connection"

    # ==============================================================================
    #                                 DROP CABLE CONNECTION
    # ==============================================================================

    def connectPonDrop(self, cable_name):
        """
        Connect PON drop cable CABLE_NAME

        Connects upstream end to next free splitter port
        """

        with self.progress.operation("Connecting PON drop cable", cable_name):

            fiber_in_spec = cable_name + "#in:1"
            fiber_out_spec = cable_name + "#out:1"
            in_port_spec = None
            out_port_spec = None

            # Find cable to connect
            cable = self.findCable(cable_name)
            seg = cable._field("cable_segments").recs(ordered=True)[0]  # Assumes single segment

            # Find upstream port
            struct = seg._field("in_structure").rec()
            self.progress(3, "Finding free splitter port in", struct.name)

            for spl in self.equipsIn(struct, "fiber_splitter"):
                self.progress(4, "Checking:", spl.name)
                port = self.findFreeOutPortSpl(spl)
                if port:
                    in_port_spec = "{}#out:{}".format(spl.name, port)
                    break

            if not in_port_spec:
                self.progress(2, "No free splitter port for drop cable", cable_name)
                return

            # Find downstream port
            struct = seg._field("out_structure").rec()
            self.progress(3, "Finding free terminal in", struct.name)

            for term in self.equipsIn(struct, "fiber_ont"):
                if not term._field("fiber_connections").recs(ordered=True):
                    out_port_spec = "{}#in:1".format(term.name)

            if not out_port_spec:
                self.progress(2, "Cannot find a free terminal for drop cable", cable_name)
                return

            # Do connection
            self.connect(in_port_spec, fiber_in_spec)
            self.connect(fiber_out_spec, out_port_spec)

    def connectDirectDrop(self, feeder_spec, wall_box_name, drop_low_pin=1, slack_seg=False):
        """
        Connect direct-feed FTTH drop cable for WALL_BOX_NAME

        Splices upstream end to cable pins FEEDER_SPEC
        """

        with self.progress.operation("Connecting direct-feed FTTH drop cable for", wall_box_name):

            # Find drop cable to connect
            wall_box = self.findStruct(wall_box_name)
            out_seg = (
                self.db_view.table(self.cable_segment)
                .filterOn("out_structure", wall_box._urn())
                .first()
            )
            cable = out_seg._field("cable").rec()
            segs = cable._field("cable_segments").recs(ordered=True)

            # Init connection info
            n_fibers = DevDBConnPoint(feeder_spec).pins.size
            drop_high_pin = drop_low_pin + n_fibers - 1
            fiber_in_spec = cable.name + "#in:{}:{}".format(drop_low_pin, drop_high_pin)
            fiber_out_spec = cable.name + "#out:{}:{}".format(drop_low_pin, drop_high_pin)
            out_port_spec = None

            # Find downstream port
            self.progress(3, "Finding free ONT port in", wall_box.name)
            for equip in self.equipsIn(wall_box, "fiber_ont"):
                if not equip._field("fiber_connections").recs():
                    out_port_spec = "{}#in:1:{}".format(
                        equip.name, n_fibers
                    )  # TODO: Check for more fibres than ports
                    break

            if not out_port_spec:
                self.progress(2, "Cannot find a free terminal for drop cable", cable.name)
                return

            # Find upstream splice closure
            struct = segs[0]._field("in_structure").rec()
            self.progress(3, "Finding splice closure in", struct.name)
            scs = self.equipsIn(struct, "splice_closure")

            if not scs:
                self.progress(2, "Cannot find a splice closure in", struct.name)
                return
            sc = scs[0]

            # Do connection
            self.connect(feeder_spec, fiber_in_spec, sc.name, slack_seg)
            self.connect(fiber_out_spec, out_port_spec)

    def connectAfter(self, spec1, spec2, slack, sc_name=None):
        """
        Connect cable CONN1 to CONN2 in splice closure SC_NAME after SLACK

        TODO: duplicates splice() for most part"""

        conn1 = DevDBConnPoint(spec1)
        conn2 = DevDBConnPoint(spec2)

        with self.progress.operation("Splicing", conn1.spec, "->", conn2.spec, "in", sc_name):

            # Find objects
            sc = self.findEnclosure(sc_name)
            struct = self.structFor(sc)
            cable1 = self.findCable(conn1.feature)
            cable2 = self.findCable(conn2.feature)
            # Check pair ranges
            if conn1.pins.size != conn2.pins.size:
                raise MywError(
                    "Pair range mismatch:",
                    cable1.name,
                    cable2.name,
                    conn1.pins.size,
                    conn2.pins.size,
                )

            # Find segments to connect

            seg1 = self.findSlackSegment(struct, cable1, slack, conn1.pins.side)
            seg2 = self.findSegment(struct, cable2, conn2.pins.side)

            # Make connections
            self.progress(1, "Connecting", seg1, "->", seg2, "at", sc)
            self.addConnection(sc, seg1, conn1.pins, seg2, conn2.pins, True)

    def equipsIn(self, rec, equip_type):
        """
        The equipment of type EQUIP_TYPE housed under REC
        """

        equip_recs = self.equip_mgr.allEquipmentIn(rec)
        equips = []

        for equip in equip_recs:
            if equip.feature_type == equip_type:
                equips.append(equip)

        sort_key = lambda equip: equip._urn()
        equips.sort(key=sort_key)

        return equips

    def findFreeOutPortSpl(self, splitter):
        """
        Returns first unconnected out port on SPLITTER (if any)
        """

        conns = ConnSet(splitter, "fiber", "out")
        ports = PinRange("out", 1, splitter.n_fiber_out_ports)

        for port in ports.range():
            if not conns.connFor(port):
                return port

        return None

    # ==============================================================================
    #                                BASIC SPLICING ETC
    # ==============================================================================

    def connect(self, spec1, spec2, sc_name=None, slack_seg=False, trays=[]):
        """
        Connect SPEC1 -> SPEC2
        """

        conn1 = DevDBConnPoint(spec1, cable_type=self.cable_type)
        conn2 = DevDBConnPoint(spec2, cable_type=self.cable_type)

        if conn1.isCable() and conn2.isCable():
            return self.splice(conn1, conn2, sc_name, slack_seg, trays)
        if conn1.isCable():
            return self.connectCableToPort(conn1, conn2, slack_seg)
        if conn2.isCable():
            return self.connectPortToCable(conn1, conn2, slack_seg)
        return self.connectPortToPort(conn1, conn2)

    def splice(self, conn1, conn2, sc_name, slack_seg=False, tray_nos=[]):
        """
        Connect cable CONN1 to CONN2 in splice closure SC_NAME

        Optional TRAY_NOS is a list of tray numbers to hold the splice"""

        with self.progress.operation("Splicing", conn1.spec, "->", conn2.spec, "in", sc_name):

            # Find objects
            sc = self.findEnclosure(sc_name)
            struct = self.structFor(sc)
            cable1 = self.findCable(conn1.feature)
            cable2 = self.findCable(conn2.feature)

            # Check pair ranges
            if conn1.pins.size != conn2.pins.size:
                raise MywError(
                    "Pair range mismatch:",
                    cable1.__ident__(),
                    cable2.__ident__(),
                    conn1.pins.size,
                    conn2.pins.size,
                )

            # Find segments to connect
            seg1 = self.findSegment(struct, cable1, conn1.pins.side, slack_seg)
            seg2 = self.findSegment(struct, cable2, conn2.pins.side, slack_seg)

            # Make connections (splitting across trays if necessary)
            if tray_nos:
                trays = self.spliceTraysIn(sc, tray_nos)
                for (tray, seg1_pins, seg2_pins) in self.spliceTraysFor(
                    trays.values(), conn1.pins, conn2.pins
                ):
                    self.addConnection(tray, seg1, seg1_pins, seg2, seg2_pins, True)
            else:
                self.addConnection(sc, seg1, conn1.pins, seg2, conn2.pins, True)

    def connectPortToCable(self, port_conn, cable_conn, slack_seg=False):
        """
        Connect PORT to CABLE
        """
        # ENH: Mereg with above (provide a ConPoint() object?)

        with self.progress.operation("Connecting port", port_conn.spec, "->", cable_conn.spec):

            # Check pair ranges
            if port_conn.pins.size != cable_conn.pins.size:
                raise MywError(
                    "Pair range mismatch:",
                    port_conn.spec,
                    cable_conn.spec,
                    port_conn.pins.size,
                    cable_conn.pins.size,
                )

            # Find objects
            equip = self.findEquip(port_conn.feature)
            cable = self.findCable(cable_conn.feature)

            # Find cable segment to connect
            struct = self.structFor(equip)
            seg = self.findSegment(struct, cable, cable_conn.pins.side, slack_seg)

            # Make connection
            self.addConnection(equip, equip, port_conn.pins, seg, cable_conn.pins, False)

    def connectCableToPort(self, cable_conn, port_conn, slack_seg=False):
        """
        Connect CABLE to PORT
        """

        with self.progress.operation("Connecting cable", cable_conn.spec, "->", port_conn.spec):

            # Check pair ranges
            if port_conn.pins.size != cable_conn.pins.size:
                raise MywError(
                    "Pair range mismatch:",
                    port_conn.spec,
                    cable_conn.spec,
                    port_conn.pins.size,
                    cable_conn.pins.size,
                )

            # Find objects
            cable = self.findCable(cable_conn.feature)
            equip = self.findEquip(port_conn.feature)

            # Find cable segment to connect
            struct = self.structFor(equip)
            seg = self.findSegment(struct, cable, cable_conn.pins.side, slack_seg)

            # Make connection
            self.progress(1, "Connecting", seg, "->", equip, "in", struct)
            self.addConnection(equip, seg, cable_conn.pins, equip, port_conn.pins, False)

    def connectPortToPort(self, conn1, conn2):
        """
        Connect PORT1 to PORT2
        """

        with self.progress.operation("Connecting ports", conn1.spec, "->", conn2.spec):

            # Find objects
            equip1 = self.findEquip(conn1.feature)
            equip2 = self.findEquip(conn2.feature)

            # Check pair ranges
            if conn1.pins.size != conn2.pins.size:
                raise MywError(
                    "Pair range mismatch:", conn1, conn2, conn1.pins.size, conn2.pins.size
                )

            # Make connections
            self.progress(1, "Connecting", equip1, "->", equip2)
            self.addConnection(equip1, equip1, conn1.pins, equip2, conn2.pins, False)

    def addConnection(self, housing, ftr1, ftr1_pins, ftr2, ftr2_pins, splice, tech=None):
        """
        Add a connection FTR1 -> FTR2
        """
        tech = tech if tech else self.cable_connection

        self.progress(1, "Connecting", ftr1_pins, "->", ftr2_pins, "in", housing, tech)

        table = self.db_view.table(tech)

        # Create record
        rec = table.insertWith(
            housing=housing._urn(),
            in_object=ftr1._urn(),
            in_side=ftr1_pins.side,
            in_low=ftr1_pins.low,
            in_high=ftr1_pins.high,
            out_object=ftr2._urn(),
            out_side=ftr2_pins.side,
            out_low=ftr2_pins.low,
            out_high=ftr2_pins.high,
            splice=splice,
        )

        # Set derived fields
        rec._primary_geom_field.set(housing._field("location").geom())

        if "root_housing" in housing._descriptor.fields:
            rec.root_housing = housing.root_housing
        else:
            rec.root_housing = rec.housing

    # ==============================================================================
    #                               SEGMENT CONTAINMENT
    # ==============================================================================

    def setInternalSegmentContainment(self, equip1_name, equip2_name, cable_name):
        """
        Route internal cable EQUIP1_NAME -> EQUIP2_NAME.
        """

        self.setSegmentContainment(equip1_name, cable_name, "in")
        self.setSegmentContainment(equip2_name, cable_name, "out")

    def setSegmentContainment(self, equip_name, cable_name, side):
        """
        Put a segment of CABLE into EQUIP.
        SIDE determines which side of segment to set (for passthrough cables)
        """

        self.progress(1, equip_name, ":", "Adding cable", cable_name, "side=", side)

        # Find cable and equip
        cable = self.findCable(cable_name)
        equip = self.findEquip(equip_name)

        # Find segment to modify
        struct = self.structFor(equip)
        seg = self.findSegment(struct, cable, side)
        self.progress(1, cable, seg, equip)

        # Modify it
        self.setSegmentEquipField(seg, side, equip)

        # Mofidy adjacent segment (if there is one)
        if side == "in":
            prev_seg = seg._field("in_segment").rec()
            if prev_seg:
                self.setSegmentEquipField(prev_seg, "out", equip)

        if side == "out":
            next_seg = seg._field("out_segment").rec()
            if next_seg:
                self.setSegmentEquipField(next_seg, "in", equip)

    def setSegmentEquipField(self, seg, side, equip):
        """
        Put a segment of CABLE into EQUIP.
        SIDE determines which side of segment to set (for passthrough cables)
        """

        # Update segment
        fld = side + "_equipment"
        seg[fld] = equip._urn()

        self.update(seg)

    # ==============================================================================
    #                                HELPERS
    # ==============================================================================

    def structFor(self, equip):
        """
        The structure in which EQUIP is housed

        Recursively climbs the housing tree"""
        # ENH: Just use root_housing

        housing = equip

        while hasattr(housing, "housing"):
            housing = housing._field("housing").rec()

        return housing

    def findStruct(self, name):
        """
        Returns the structure identified by NAME
        """

        for feature_type in ("building", "mdu", "manhole", "cabinet", "pole", "wall_box"):
            table = self.db_view.table(feature_type)
            rec = table.filterOn("name", name).first()

            if rec:
                return rec

        raise MywError("Cannot find structure:", name)

    def findSegment(self, struct, cable, side, slack_seg=False, segment_type=None):
        """
        Returns the segment of CABLE entering STRUCT from SIDE
        """

        struct_fields = {"in": "in_structure", "out": "out_structure"}

        table = self.db_view.table(segment_type if segment_type else self.cable_segment)
        struct_field = struct_fields[side]

        pred = (table.field("cable") == cable._urn()) & (table.field(struct_field) == struct._urn())

        query = table.filter(pred)
        segs = query.all()

        if not segs:
            raise MywError(struct.name, ": No", side, "cable", cable.name)

        if len(segs) > 1:
            if slack_seg:
                for seg in segs:
                    seg_housing_type = seg.housing.split("/")[0]
                    if seg_housing_type == "mywcom_fiber_slack":
                        return seg
            else:
                return sorted(segs, key=lambda rec: rec.id, reverse=True)[0]
        return sorted(segs, key=lambda rec: rec.id)[0]

    def findSlackSegment(self, struct, cable, slack, side):
        """
        Returns the segment of CABLE entering STRUCT from SIDE
        """

        struct_fields = {"in": "in_structure", "out": "out_structure"}

        table = self.db_view.table(self.cable_segment)
        struct_field = struct_fields[side]

        pred = (
            (table.field("cable") == cable._urn())
            & (table.field(struct_field) == struct._urn())
            & (table.field("housing") == slack)
        )

        query = table.filter(pred)

        seg = query.first()

        return seg

    def findCable(self, name):
        """
        Returns the cable identified by NAME
        """

        table = self.db_view.table(self.cable_type)
        rec = table.filterOn("name", name).first()

        if not rec:
            raise MywError("Cannot find cable:", name)

        return rec

    def spliceTraysIn(self, sc, tray_nos):
        """
        The splice trays housed directly in EQUIP, by tray name

        Returns a list of features, keyed by tray number"""

        # Build list, keyed by tray number
        all_trays = {}
        for equip in self.equip_mgr.equipmentOf(sc):
            if equip.feature_type != "fiber_splice_tray":
                continue

            tray_no = int(equip.name.split("-")[-1])

            all_trays[tray_no] = equip  # ENH: Check for duplicate

        # Find selected trays (in order)
        trays = {}
        for tray_no in tray_nos:
            trays[tray_no] = all_trays[tray_no]

        return trays

    def spliceTraysFor(self, trays, from_pins, to_pins):
        """
        Find splice trays to hold splice FORM_PINS -> TO_PINS

        Yields:
          TRAY
          TRAY_FROM_PINS
          TRAY_TO_PINS"""

        start_pin = from_pins.low
        offset = to_pins.low - from_pins.low

        for tray in trays:
            n_pins = tray.slots

            # Build from range
            end_pin = start_pin + tray.slots - 1
            if end_pin > from_pins.high:
                end_pin = from_pins.high
            tray_from_pins = PinRange(from_pins.side, start_pin, end_pin)

            # Build to range
            tray_to_pins = PinRange(to_pins.side, offset + start_pin, offset + end_pin)

            # Yield tray info
            yield tray, tray_from_pins, tray_to_pins

            # Next pin
            start_pin += tray.slots
            if start_pin > from_pins.high:
                return

        raise MywError("Not enough tray to house splice:", from_pins, trays)

    def findEquip(self, name):
        """
        Returns the equipment object identified by NAME
        """

        for feature_type in [
            "fiber_patch_panel",
            "rack",
            "fiber_shelf",
            "fiber_olt",
            "fiber_splitter",
            "fiber_mux",
            "fiber_tap",
            "fiber_ont",
            "splice_closure",
            "fiber_splice_tray",
            "copper_dslam",
            "copper_splice_closure",
            "copper_terminal",
            "copper_load_coil",
            "optical_node",
            "optical_node_closure",
            "coax_tap",
            "coax_terminator",
            "inline_equalizer",
            "two_way_splitter",
            "three_way_splitter",
            "coax_amplifier",
        ]:
            table = self.db_view.table(feature_type)
            rec = table.filterOn("name", name).first()

            if rec:
                return rec

        raise MywError("Cannot find equipment:", name)

    def findEnclosure(self, name):
        """
        Returns the enclosure object identified by NAME
        """

        # ENH: Loop over features with function 'enclosure'
        for feature_type in ["cabinet", "splice_closure", "copper_splice_closure"]:
            table = self.db_view.table(feature_type)
            rec = table.filterOn("name", name).first()

            if rec:
                return rec

        raise MywError("Cannot find equipment:", name)

    def update(self, rec, **vals):
        """
        Set fields of rec and send to DB
        """

        for fld, val in vals.items():
            rec[fld] = val

        tab = rec._view.table(rec.feature_type)
        tab.update(rec)
