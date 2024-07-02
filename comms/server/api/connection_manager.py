# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler

from .mywcom_error import DbConstraintError
from .pin_range import PinRange
from .conn import Conn
from .conn_set import ConnSet
from .manager import Manager


class ConnectionManager(Manager):
    """
    Engine for managing pin-level connectivity
    """

    # -----------------------------------------------------------------------
    #                             CONNECT/ DISCONNECT
    # -----------------------------------------------------------------------

    def connect(self, tech, housing, ftr1, pins1, ftr2, pins2):
        """
        Add a connection between features FTR1 and FTR2

        PINS1 and PINS2 are PinRanges. HOUSING is the
        feature in which the connection sits."""

        self.progress(4, "Connecting", ftr1, "to", ftr2, "in", housing)
        self.progress(6, "  IN ", ftr1, pins1)
        self.progress(6, "  OUT", ftr2, pins2)

        network = self.nw_view.networks[tech]
        table = self.connTableFor(tech)

        # Create record
        rec = table._new_detached()

        rec.root_housing = self.rootHousingUrn(housing)
        rec.housing = housing._urn()
        rec.in_object = ftr1._urn()
        rec.in_side = pins1.side
        rec.in_low = pins1.low
        rec.in_high = pins1.high
        rec.out_object = ftr2._urn()
        rec.out_side = pins2.side
        rec.out_low = pins2.low
        rec.out_high = pins2.high
        rec.splice = network.isSegment(ftr1) and network.isSegment(ftr2)

        # Set geometry
        rec._primary_geom_field.set(housing._primary_geom_field.geom())

        return table.insert(rec)

    def disconnect(self, tech, ftr, pins):
        """
        Disconnect PINS of FTR

        PINS is a PinRange"""

        network = self.nw_view.networks[tech]

        # Prevent corruption of circuit paths
        if self.nw_view.circuit_mgr.pinsHaveCircuits(ftr, pins):
            raise DbConstraintError("pins_have_circuit", feature=ftr, pins=pins)

        # Do disconnect
        if ftr.feature_type == network.connection_type:
            conn = Conn(ftr, pins.side == "out")
            self._disconnect(conn, pins)

        else:
            conns = ConnSet(ftr, tech, pins.side)

            for conn in conns:
                if conn.from_pins.intersect(pins):
                    self._disconnect(conn, pins)

    def _disconnect(self, conn, pins):
        """
        Disconnect PINS of connection CONN
        """

        # Add new connection records
        tab = conn.db_view.table(conn.conn_rec.feature_type)
        for from_pins in conn.from_pins.subtract(pins):
            to_pins = conn.toPinsFor(from_pins)

            rec = conn.conn_rec._clone()

            if conn.forward:
                rec.in_low = from_pins.low
                rec.in_high = from_pins.high
                rec.out_low = to_pins.low
                rec.out_high = to_pins.high
            else:
                rec.in_low = to_pins.low
                rec.in_high = to_pins.high
                rec.out_low = from_pins.low
                rec.out_high = from_pins.high

            tab.insert(rec)

        # Delete old one
        tab.delete(conn.conn_rec)

    # -----------------------------------------------------------------------
    #                            CONNECTION MAINTENANCE
    # -----------------------------------------------------------------------

    def updateConnGeoms(self, struct):
        """
        Update location of all fiber connections contained within given structure
        """

        point = struct._primary_geom_field.geom()

        for tech in self.nw_view.networks.keys():
            conn_tab = self.connTableFor(tech)

            for conn in conn_tab.filterOn("root_housing", struct._urn()):
                conn._primary_geom_field.set(point)
                conn_tab.update(conn)

    def deleteConnections(self, equip):
        """
        Delete connections of equip and all contained equipment
        """

        self.progress(3, "Deleting connections of", equip)

        for rec in self.connectionsOfAll(equip):
            self.deleteRecord(rec)

    def transferConnections(self, old_feature, old_side, new_feature, new_side):
        """
        Replaces references to FEATURE on SIDE of connections with NEW_FEATURE

        ENH: query for conns directly"""

        for conn in self.connectionsOfAll(old_feature):
            self.transferConnection(conn, old_feature, old_side, new_feature, new_side)

    def transferConnection(self, conn, old_feature, old_side, new_feature, new_side):
        """
        Replaces references to OLD_FEATURE on on OLD_SIDE of CONN with NEW_FEATURE
        """

        old_urn = old_feature._urn()
        new_urn = new_feature._urn()

        if conn.in_object == old_urn and conn.in_side == old_side:
            self.progress(
                3,
                "Replace",
                old_feature,
                "with",
                new_feature,
                "on in side",
                new_side,
                "of",
                conn,
            )
            conn.in_object = new_urn
            conn.in_side = new_side
            self.update(conn)

        if conn.out_object == old_urn and conn.out_side == old_side:
            self.progress(
                3,
                "Replace",
                old_feature,
                "with",
                new_feature,
                "on out side",
                new_side,
                "of",
                conn,
            )
            conn.out_object = new_urn
            conn.out_side = new_side
            self.update(conn)

    def connectionsOf(
        self, feature, housing_field="housing", splices=None, side=None, tech="fiber"
    ):
        """
        Returns query yielding connection records relating to FEATURE

        FIELD is the field used to determine ownership('housing' or 'root_housing')
        SPLICES can be used to limit records returned"""

        urn = feature._urn()

        # TODO: Remove hardcoded tech
        conn_tab = self.connTableFor(tech)

        # Find direct connections
        if side:
            pred = (
                (conn_tab.field("in_object") == urn)
                & (conn_tab.field("in_side") == side)
            ) | (
                (conn_tab.field("out_object") == urn)
                & (conn_tab.field("out_side") == side)
            )

        else:
            pred = (conn_tab.field("in_object") == urn) | (
                conn_tab.field("out_object") == urn
            )

        # For splice holders
        pred |= conn_tab.field(housing_field) == urn

        # Apply splice filter
        if splices != None:
            pred &= conn_tab.field("splice") == splices

        return conn_tab.filter(pred)

    def connectionsOfAll(
        self, feature, housing_field="housing", splices=None, side=None
    ):
        """
        Returns list of all connections associated to FEATURE
        """

        networks = self.nw_view.networks.keys()
        conns = []
        for network_name in networks:
            conns += self.connectionsOf(
                feature, housing_field, splices, side, tech=network_name
            )

        return conns

    def spliceSegments(
        self, old_segment, new_segment, splice_housing, forward, pin_count
    ):
        """
        Create connections between unconnected fibres in OLD_SEGMENT and NEW_SEGMENT housed inside SPLICE_HOUSING.
        """

        tech = self.nw_view.networkFor(old_segment)
        old_side = "out" if forward else "in"
        new_side = "in" if forward else "out"
        cable_conns = self.connectionsOf(old_segment, side=old_side, tech=tech)
        new_cable_conns = self.connectionsOf(new_segment, side=new_side, tech=tech)

        # Find existing connections
        connected_ranges = []
        for c in cable_conns:
            connected_ranges.append(PinRange("out", c.in_low, c.in_high))
        for c in new_cable_conns:
            connected_ranges.append(PinRange("out", c.in_low, c.in_high))

        # Subtract them from complete range for cable to find free ranges that we will
        # connected across.
        ranges = [PinRange("out", 1, pin_count)]
        for c1 in connected_ranges:
            new_current = []
            for c2 in ranges:
                new_current = new_current + c2.subtract(c1)
            ranges = new_current

        # Now make the connections
        conns = []
        for in_range in ranges:
            out_range = PinRange("in", in_range.low, in_range.high)

            if forward:
                new_conn = self.connect(
                    tech,
                    splice_housing,
                    old_segment,
                    in_range,
                    new_segment,
                    out_range,
                )
            else:
                new_conn = self.connect(
                    tech,
                    splice_housing,
                    new_segment,
                    in_range,
                    old_segment,
                    out_range,
                )

            conns.append(new_conn)

        return conns

    # -----------------------------------------------------------------------
    #                                CONTENTS
    # -----------------------------------------------------------------------

    def connectionsIn(self, struct, include_proposed=False):
        """
        Returns connections inside STRUCT
        """

        struct_urn = struct._urn()

        conns = []

        for feature_type in self.nw_view.connections:
            tab = self.db_view.table(feature_type)
            pred = tab.field("root_housing") == struct_urn

            conns += self.nw_view.getRecs(tab, pred, include_proposed)

        return conns

    def connectionsAt(self, feature, struct, include_proposed=False):
        """
        Returns connections relating to FEATURE inside STRUCT
        """

        feature_urn = feature._urn()
        struct_urn = struct._urn()
        conns = []

        tech = self.nw_view.networkFor(feature)
        conn_tab = self.connTableFor(tech)

        pred = (conn_tab.field("in_object") == feature_urn) | (
            conn_tab.field("out_object") == feature_urn
        )

        for feature_type in self.nw_view.connections:
            tab = self.db_view.table(feature_type)
            pred &= tab.field("root_housing") == struct_urn

            conns += self.nw_view.getRecs(tab, pred, include_proposed)

        return conns

    def connTableFor(self, tech):
        """
        Returns connection table for TECH
        """

        network = self.nw_view.networks[tech]

        return self.db_view.table(network.connection_type)

    # -----------------------------------------------------------------------
    #                             CHANGE DETECTION
    # -----------------------------------------------------------------------

    def flattenChanges(self, delta_recs):
        """
        Flatten DELTA_RECS into a set of adds and removes
        """
        # TODO: Move to delta manager?

        adds = []
        removes = []

        for rec in delta_recs:
            rec._view = self.db_view  # ENH: Avoid need for this .. or do it further up

            if rec.myw_change_type in ["insert", "update"]:
                adds.append(rec)

            if rec.myw_change_type in ["update", "delete"]:
                tab = rec._view.table(rec.feature_type)
                base_rec = tab._baseRec(rec._id)
                removes.append(base_rec)

        return adds, removes

    def consolidate(self, connects, disconnects=[]):
        """
        Consolidate connection records CONNECTS and DISCONNECTS

        Merges adjacent ranges, removes null changes

        Returns:
          CONNECTS     Connections to make   (a list of Conns)
          DISCONNECTS  Connections to remove (a list of Conns)"""

        # Group connection records by the objects they connect
        pair_conns = {}
        for pair, conns in self._groupConnections(connects).items():
            if not pair in pair_conns:
                pair_conns[pair] = {"connects": [], "disconnects": []}
            pair_conns[pair]["connects"] = conns

        for pair, conns in self._groupConnections(disconnects).items():
            if not pair in pair_conns:
                pair_conns[pair] = {"connects": [], "disconnects": []}
            pair_conns[pair]["disconnects"] = conns

        # Show what we found
        self.progress(5, "consolidate()", "Found", len(pair_conns), "connection pairs")
        for pair, conns in pair_conns.items():
            self.progress(6, "   ", pair, ":", "connects   ", ":", *conns["connects"])
            self.progress(
                6, "   ", pair, ":", "disconnects", ":", *conns["disconnects"]
            )

        # Build changes
        connects = []
        disconnects = []

        for pair in sorted(pair_conns.keys()):
            conns = pair_conns[pair]
            (pair_connects, pair_disconnects) = self._consolidateChanges(
                conns["connects"], conns["disconnects"]
            )
            connects += pair_connects
            disconnects += pair_disconnects

        return connects, disconnects

    def _groupConnections(self, conn_recs):
        """
        Group CONNS_RECS by the pairs of objects they relate to (handling reversals)

        Returns a list of Conns, keyed by URN pairs"""

        pair_conns = {}
        for conn_rec in conn_recs:
            in_key = (conn_rec.in_object, conn_rec.in_side)
            out_key = (conn_rec.out_object, conn_rec.out_side)

            if in_key < out_key:
                key = (in_key, out_key)
                conn = Conn(conn_rec)
            else:
                key = (out_key, in_key)
                conn = Conn(conn_rec, False)

            if not key in pair_conns:
                pair_conns[key] = []

            pair_conns[key].append(conn)

        return pair_conns

    def _consolidateChanges(self, connects, disconnects):
        """
        Consolidate connection changes for a given object pair

        CONNS is a list of connection changes for a pair of objects (delta records)

        Returns:
          CONNECTS      Connections made    (a list of detached Conns)
          DISCONNECTS   Connections broken  (a list of detached Conns)"""

        # Get disconnect per pin
        pin_disconnects = {}
        for conn in disconnects:
            for pin in conn.from_pins.range():

                # Set as change for pin
                pin_conn = pin_disconnects.get(pin)
                if pin_conn:
                    self.progress(
                        "warning",
                        "Ignoring duplicate disconnection:",
                        conn.spec,
                        pin_conn.spec,
                        pin,
                    )
                pin_disconnects[pin] = conn

        # Get connect per pin (consolidating null changes)
        pin_connects = {}
        for conn in connects:
            for pin in conn.from_pins.range():

                # Check for null change
                disconnect_conn = pin_disconnects.get(pin)
                if disconnect_conn and self._connsMatch(conn, disconnect_conn, pin):
                    self.progress(
                        9, "Consoldating null change", conn, pin, disconnect_conn
                    )
                    del pin_disconnects[pin]
                    continue

                # Set as change for pin
                pin_conn = pin_connects.get(pin)
                if pin_conn:
                    self.progress(
                        "warning",
                        "Ignoring duplicate connection:",
                        conn.spec,
                        pin_conn.spec,
                        pin,
                    )
                pin_connects[pin] = conn

        # Build disconnections (consolidating adjacent pins)
        disconnects = []
        curr_conn = None
        for pin, conn in sorted(pin_disconnects.items()):
            to_pin = conn.toPinFor(pin)
            self.progress(10, "Processing disconnection:", pin, "->", to_pin, conn)

            if not curr_conn or not self._extendConn(curr_conn, conn, pin):
                curr_conn_from_pins = PinRange(conn.from_pins.side, pin)
                curr_conn = conn.intersect(curr_conn_from_pins)
                disconnects.append(curr_conn)

        # Build connections (consolidating adjacent pins)
        connects = []
        curr_conn = None
        for pin, conn in sorted(pin_connects.items()):
            to_pin = conn.toPinFor(pin)
            self.progress(10, "Processing connection:", pin, "->", to_pin, conn)

            if not curr_conn or not self._extendConn(curr_conn, conn, pin):
                curr_conn_from_pins = PinRange(conn.from_pins.side, pin)
                curr_conn = conn.intersect(curr_conn_from_pins)
                connects.append(curr_conn)

        return connects, disconnects

    def _extendConn(self, conn1, conn2, from_pin):
        """
        Extend CONN1 to include PIN (if appropriate)

        Returns True if CONN1 extended"""

        # Check for different objects or sides
        if not self._connsMatch(conn1, conn2, from_pin):
            return False

        # Check for non-contiguous range
        if from_pin != conn1.from_pins.high + 1:
            return False

        # Extent range
        self.progress(9, "Extending", conn1, from_pin, conn2)
        conn1.from_pins.high += 1
        conn1.to_pins.high += 1

        return True

    def _connsMatch(self, conn1, conn2, from_pin):
        """
        True if CONN1 and CONN2 are identical at FROM_PIN
        """

        return (
            conn1.from_ref.urn() == conn2.from_ref.urn()
            and conn1.from_pins.side == conn2.from_pins.side
            and conn1.to_ref.urn() == conn2.to_ref.urn()
            and conn1.to_pins.side == conn2.to_pins.side
            and conn1.conn_rec.housing == conn2.conn_rec.housing
            and conn1.toPinFor(from_pin) == conn2.toPinFor(from_pin)
        )
