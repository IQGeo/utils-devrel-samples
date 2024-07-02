################################################################################
# Comms Fiber Network Engine
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.pin_set import PinSet
from myworldapp.modules.comms.server.api.conn_set import ConnSet
from myworldapp.modules.comms.server.base.readonly_feature_view import (
    ReadonlyFeatureView,
)
from myworldapp.modules.comms.server.api.network import Network
from myworldapp.modules.comms.server.api.network_view import NetworkView

from .port_trace_node import PortTraceNode
from .segment_trace_node import SegmentTraceNode
from .connection_trace_node import ConnectionTraceNode
from heapq import heappush, heappop


class MywcomPinNetworkEngine(MywNetworkEngine):
    """
    A network engine for tracing signal path through cables and equipment

    Includes support for bulk trace on a range of pins"""

    # ==============================================================================
    #                                    CREATION
    # ==============================================================================

    def __init__(self, db_view, network_def, extra_filters={}, progress=MywProgressHandler()):
        """
        Returns a engine for NETWORK_DEF

        DB_VIEW is a MywFeatureView. NETWORK_DEF is a dict of network
        properties (as returned by MywNetwork.definition()).

        Optional EXTRA_FILTERS (a set of myWorld select expressions, keyed
        by feature type) can be used to further limit which objects
        are considered to be in the network. If supplied, they are
        ANDed with any filters in NETWORK_DEF"""

        # Init super
        super().__init__(db_view, network_def, extra_filters, progress)

        # ENH Make less brittle. Relies on tech in second part of name.
        self.tech = network_def["name"].split("_")[1]
        Network.defineTypesFrom(db_view.db)
        self.network = Network.types[self.tech]

        self.nw_view = NetworkView(db_view)

        # Cache settings
        self.equipment = db_view.db.setting("mywcom.equipment") or {}
        self.ewl = db_view.db.setting("mywcom.ewl") or {}

    # -------------------------------------------------------------------------
    #                                 SUBPATHS
    # -------------------------------------------------------------------------

    def subPathsFor(self, feature_rec, lang):
        """
        Tree of URNs that can be used as trace start points within FEATURE_REC (if any)

        Returns a list of descriptive strings, keyed by URN (or None)
        """
        # ENH: Change trace dialog to use trees and remove this?
        # ENH: Support build conn points for structure etc

        if not self.includes(feature_rec):
            return None

        urns = {}

        for side in ["in", "out"]:
            pins = self.network.pinsOn(feature_rec, side)

            if not pins:
                continue

            for pin in pins.range():
                pin_range = PinRange(side, pin)
                urn = feature_rec._urn(pins=pin_range.spec)
                urns[urn] = "{}#{}".format(side.upper(), pin)  # TODO: Localise

        return urns

    # -------------------------------------------------------------------------
    #                                 TRACING
    # -------------------------------------------------------------------------
    def traceOutRaw(self, feature, pins, direction="both", max_dist=None, max_nodes=None):
        """
        Find objects reachable from FROM_FEATURE

        Direction is 'upstream', 'dowstream' or 'both'. Optional
        MAX_DIST is maximum distance to trace for (in metres)
        measured from start of FROM_URN.

        Returns root of an unconsolidated trace tree (a MywFiberTraceNode)"""

        # ENH: Make .tidy() optional in core

        urn = feature._urn(pins=pins.spec)

        self.progress(
            2,
            "Tracing from",
            urn,
            ":",
            "direction=",
            direction,
            ":",
            "max_dist=",
            max_dist,
        )

        (root_node, stop_node) = self._trace(urn, direction, max_dist=max_dist, max_nodes=max_nodes)

        return root_node

    def rootNode(self, urn, direction):
        """
        Create the start node for URN
        """

        ref = MywReference.parseUrn(urn)

        feature = self.featureRecFor(ref.base)

        pins = PinRange.parse(ref.qualifiers["pins"])

        if self.network.isSegment(feature):
            return SegmentTraceNode(
                feature, self.tech, pins, direction, 0.0, 0.0, None, self.locFor(feature, pins)
            )
        else:
            ft = self.functionOf(feature)
            return PortTraceNode(feature, self.tech, pins, direction, 0.0, 0.0, ft)

    def connectedNodes(self, node, direction, root_node):
        """
        The nodes directly reachable from NODE

        DIRECTION is unused (uses node.direction instead).
        ROOT_NODE is the root of the current trace (unused here)."""

        if node.direction == "both" or not self.network_def["directed"]:
            nodes = self.connectedNodesFor(node, "upstream") + self.connectedNodesFor(
                node, "downstream"
            )
        else:
            nodes = self.connectedNodesFor(node, node.direction)

        # ENH: Exclude duplicates
        return nodes

    def connectedNodesFor(self, node, direction):
        """
        The nodes directly reachable from NODE in DIRECTION

        DIRECTION is 'upstream' or 'downstream'

        Returns a list of trace nodes"""

        self.progress(6, "\n")
        self.progress(
            6,
            "Finding",
            direction,
            "connections at side",
            node.pins.side,
            "of",
            node.feature,
        )

        if node.type == "port":
            return self.connectedNodesForPort(node, direction)
        if node.type == "segment":
            return self.connectedNodesForSegment(node, direction)
        if node.type == "connection":
            return self.connectedNodesForConnection(node, direction)

        raise MywInternalError("Bad node type:", node.type)

    def connectedNodesForPort(self, node, direction):
        """
        The nodes directly reachable from port trace node NODE

        DIRECTION is 'upstream' or 'downstream'

        Returns a list of trace nodes"""

        equip = node.feature
        ports = node.pins

        # Case: Hop to ports on other side (via implicit connection)
        if (ports.side == "in" and direction == "downstream") or (
            ports.side == "out" and direction == "upstream"
        ):

            # Find ports on other side
            conn_ports = self.equipConnectedPortsFor(equip, ports)
            if not conn_ports:
                return []

            # Find connections from those ports
            # Note: We exclude unconnected out ports from trace results (simplifies result)
            conn_sets = []
            for conn_ports_range in conn_ports:
                conns = self.connSetFor(equip, conn_ports_range.side, conn_ports_range)
                if conns:
                    conn_sets.append(conns)

            if not conn_sets:
                return []

            # Add trace nodes (for connected pins only)
            conn_nodes = []
            for conn_set in conn_sets:
                for conn in conn_set.conns:
                    ft = self.functionOf(equip)
                    conn_node = PortTraceNode(
                        equip, self.tech, conn.from_pins, direction, node.dist, node.ewl_dist, ft, node
                    )
                    if conn_node:
                        conn_nodes.append(conn_node)

            return conn_nodes

        # Case: Hop to connected object
        else:
            # Find outgoing connections
            conn_set = self.connSetFor(equip, ports.side, ports)
            if not conn_set:
                return []

            # Find connected features
            conn_nodes = []
            for conn in conn_set.conns:
                conn_node = ConnectionTraceNode(conn, self.tech, direction, node.dist, node.ewl_dist, node)
                conn_nodes.append(conn_node)

            return conn_nodes

    def connectedNodesForSegment(self, node, direction):
        """
        The nodes directly reachable from segment trace node NODE

        DIRECTION is 'upstream' or 'downstream'

        Returns a list of trace nodes"""

        seg = node.feature
        pins = node.pins

        # Hack for traces started from a segment
        starting_in = (node.parent is None) and (
            (direction == "upstream" and pins.side == "in")
            or (direction == "downstream" and pins.side == "out")
        )

        # Check for hop to other end of segment
        if node.entering and not starting_in:
            seg_len = self.lengthOf(seg)
            ewl_len = 0.0
            if self.tech == "copper":
                ewl_len = seg_len * self.getEwlFactor(seg)
            next_pins = PinRange(pins.otherSide(), pins.low, pins.high)
            next_node = SegmentTraceNode(
                seg,
                self.tech,
                next_pins,
                direction,
                node.dist + seg_len,
                node.ewl_dist + ewl_len,
                node,
                self.locFor(seg, next_pins),
            )
            return [next_node]

        # Find outgoing connections
        conn_set = self.connSetFor(seg, pins.side, pins)

        # Add node for each connection
        # ENH: Consolidate adjacent connections to same object
        conn_nodes = []
        if conn_set:
            for conn in conn_set.conns:
                conn_node = ConnectionTraceNode(conn, self.tech, direction, node.dist, node.ewl_dist, node)
                conn_nodes.append(conn_node)

        # Find next segment (for passthrough fibers)
        field_name = pins.side + "_segment"
        next_seg = seg._field(field_name).rec()
        if not next_seg:
            return conn_nodes
        next_side = pins.otherSide()

        # Build set of passthrough fibers
        next_pin_set = PinSet(next_side, pins.low, pins.high)
        if conn_set:
            for conn in conn_set.conns:
                next_pin_set = next_pin_set.subtract(conn.from_pins)

        # Remove those that are cut
        next_conn_set = self.connSetFor(next_seg, next_side, pins)
        if next_conn_set:
            for conn in next_conn_set.conns:
                next_pin_set = next_pin_set.subtract(conn.from_pins)

        # Add node for each group of passthrough fibers
        for next_pins in next_pin_set.ranges:
            conn_node = SegmentTraceNode(
                next_seg,
                self.tech,
                next_pins,
                direction,
                node.dist,
                node.ewl_dist,
                node,
                self.locFor(next_seg, next_pins),
            )
            conn_nodes.append(conn_node)

        return conn_nodes

    def connectedNodesForConnection(self, node, direction):
        """
        The nodes directly reachable from connection trace node NODE

        DIRECTION is 'upstream' or 'downstream'

        Returns a list of trace nodes"""

        # Find pins it is connected to
        conn = node.conn
        to_feature = conn.toFeatureRec()
        to_pins = conn.to_pins

        # Build node
        if conn.is_to_cable:
            conn_node = SegmentTraceNode(
                to_feature,
                self.tech,
                conn.to_pins,
                direction,
                node.dist,
                node.ewl_dist,
                node,
                self.locFor(to_feature, conn.to_pins),
            )
        else:
            ft = self.functionOf(to_feature)
            conn_node = PortTraceNode(
                to_feature, self.tech, conn.to_pins, direction, node.dist, node.ewl_dist, ft, node
            )

        return [conn_node]

    def _trace(self, from_urn, direction, stop_urns=[], max_dist=None, max_nodes=None):
        """
        Find objects reachable from FROM_URN (in distance order)

        Optional MAX_DIST is distance at which to stop tracing (in
        metres). Optional STOP_URNS is a list of feature urns we are
        trying to find. Tracing terminates when one of these is encourtered.

        Returns MywTraceNodes:
         ROOT_NODE   The node from which tracing started
         STOP_NODE   The node which caused tracing to stop (if any)"""

        # Overidden from myw_network_engine to add ewl distance
        # TBR: PLAT-9028 Ideally we wouldn't have to subclass the entire trace function to change distance behavior
        #  ** Need to check MywNetworkEngine._trace method for changes after every platform release  **

        # ENH: Support start from specified location along FROM_URN
        # ENH: Make ordering by distance optional (for speed)

        active_nodes = []  # MywTraceNodes in the 'wave front'
        visited_nodes = set()  # Paths we have encountered so far

        if self.euclidean:
            # Get stop geoms to use when calculating node to end point distances for A*
            stop_geoms = self._stop_geoms(stop_urns)

        # Add start node
        root_node = self.rootNode(from_urn, direction)
        heappush(active_nodes, root_node)
        visited_nodes.add(root_node.node_id)

        # Propagate wavefront (in distance order)
        while active_nodes:

            # Move to next closest node
            node = heappop(active_nodes)
            node_urn = node.feature._urn()
            self.progress(4, "Processing:", node)

            # Check for found stop node
            if node_urn in stop_urns:
                return root_node, node

            # Check for node beyond distance limit
            if node.partial:
                continue

            # Add end nodes of connected items to wavefront
            for conn_node in self.connectedNodes(node, direction, root_node):
                self.progress(5, "  Connection:", conn_node)

                # Check for already found
                if conn_node.node_id in visited_nodes:
                    self.progress(8, "  Already visited")
                    continue

                # Check for end beyond distance limit
                # Note: This may change the node_id
                if max_dist:
                    self.traceStopAtDist(max_dist, conn_node)

                # Prevent cycles
                visited_nodes.add(conn_node.node_id)

                # Prevent memory overflow etc
                if max_nodes and len(visited_nodes) > max_nodes:
                    self.progress("warning", "Trace size limit exceeded:", max_nodes)
                    raise MywError("Trace size limit exceeded")

                # Add to wavefront
                self.progress(6, "  Activating:", conn_node)

                # Include distance to stop nodes as part of A* algrorithm
                if self.euclidean and stop_geoms:
                    conn_node.min_possible_dist = conn_node.dist + conn_node.minDistanceTo(
                        stop_geoms
                    )

                heappush(active_nodes, conn_node)

                node.children.append(conn_node)

        return root_node, None
    
    def traceStopAtDist(self, max_dist, conn_node):
        # if ewl distance is present, use it for max distance
        if (
            hasattr(conn_node, "ewl_dist")
            and conn_node.ewl_dist != None
            and conn_node.ewl_dist != 0.0
        ):
            if conn_node.ewl_dist > max_dist:
                self.progress(7, "  Beyond max EWL dist")
                # max dist and ewl_dist are applying the ewl factor, need the actual distance here
                diff = conn_node.ewl_dist - max_dist 
                ewl_factor = self.getEwlFactor(conn_node.feature)
                real_max_distance = conn_node.dist - (diff/ewl_factor)
                conn_node.stopAt(real_max_distance)
        elif conn_node.dist > max_dist:
            self.progress(7, "  Beyond max dist")
            conn_node.stopAt(max_dist)

    # -------------------------------------------------------------------------
    #                                 EQUIPMENT
    # -------------------------------------------------------------------------

    def equipConnectedPortsFor(self, equip, pins):
        """
        The ports on the opposite side of EQUIP that are connected to PINS

        Uses equipment function to determine internal connectivity

        Returns a list of PinRanges (or None)"""

        # ENH: Support cross-connect etc

        funct = self.functionOf(equip)

        if funct == "connector":
            return [PinRange(pins.otherSide(), pins.low, pins.high)]

        if funct == "splitter":
            if pins.side == "in":
                return [self.network.pinsOn(equip, "out")]
            if pins.side == "out":
                return [PinRange("in", 1)]

        if funct == "mux":
            if pins.side == "in":
                return [PinRange("out", 1)]
            if pins.side == "out":
                return [self.network.pinsOn(equip, "in")]

        if funct == "bridge_tap":
            return self.equipConnectedPortsForTap(equip, pins)

        return None

    def equipConnectedPortsForTap(self, equip, pins):
        """
        The ports on the opposite side of tap EQUIP that are connected to PINS
        
        Returns a list of PinRanges (or None)"""

        in_ports = self.network.pinsOn(equip, "in")

        if pins.side == "in":              
            return [PinRange("out", pins.low, pins.high), 
                    PinRange("out", pins.low+in_ports.size, pins.high+in_ports.size)]                        
        
        if pins.side == "out":
            if pins.low <= in_ports.size:
                if pins.high <= in_ports.size:
                    # Range is in first set of ports
                    return [ PinRange("in", pins.low,pins.high)]
                else:
                    # Range overlaps both sets of ports
                    r1 = PinRange("in", pins.low, in_ports.size)
                    r2 = PinRange("in", 1, pins.high - in_ports.size)
                    if r2.high >= r1.low:
                        # New ranges overlap so return combination
                        return [PinRange("in", r1.low, r2.high)]
                    else:
                        return [r1, r2]                                 
            else:
                # Range is in second set of ports
                return [ PinRange("in", pins.low-in_ports.size, pins.high-in_ports.size)]
            
        return None

    def functionOf(self, equip):
        """
        Returns the function of feature EQUIP
        """

        return self.equipment.get(equip.feature_type, {}).get("function")

    # -------------------------------------------------------------------------
    #                                 HELPERS
    # -------------------------------------------------------------------------

    def connSetFor(self, feature, side, pins=None):
        """
        The connections from SIDE of FEATURE (if configured)

        If options PINS is provided, limit connections to those pins

        Returns a ConnSet or None"""

        # Get field holding connections
        direction = self.directionFor(side)
        field_name = self.featurePropFieldName(feature.feature_type, direction)

        if not field_name:
            self.progress(10, feature, "No field configured for", direction)
            return None

        # Build connection set
        self.progress(7, feature, "Getting connections from field:", field_name)
        conns = ConnSet(feature, self.tech, side, field_name)
        if pins:
            conns = conns.intersect(pins)

        self.progress(6, feature, "Found connections", conns)

        return conns

    def directionFor(self, side):
        """
        The direction implied by SIDE
        """

        if side == "in":
            return "upstream"
        if side == "out":
            return "downstream"

        raise MywInternalError("Bad side:", side)

    def lengthOf(self, feature_rec):
        """
        Length of feature_rec for tracing purposes (in m)
        """

        # Try attribute
        length = self.featureProp(feature_rec, "length", unit="m")
        if length != None:
            self.progress(10, feature_rec, "Got length from record:", length)
            return length

        # Try housing
        if "housing" in feature_rec._descriptor.fields:
            housing = feature_rec._field("housing").rec()
            if housing and housing._descriptor.geometry_type == "linestring":
                self.progress(10, feature_rec, "Trying:", housing)
                return self.lengthOf(housing)

        # Compute from geometry
        # ENH: Warn if geom is in internal world (where units will be wrong)
        primary_geom_name = feature_rec._descriptor.primary_geom_name
        length = feature_rec._field(primary_geom_name).geoLength()

        self.progress(10, feature_rec, "Computed length:", length)
        return length

    def getEwlFactor(self, feature_rec):

        gauge = self.featureProp(feature_rec, "gauge")

        # not on passed in feature, check for containing cable
        if gauge == None:
            if "cable" in feature_rec._descriptor.fields:
                cable = feature_rec._field("cable").rec()
                gauge = self.featureProp(cable, "gauge")

        if gauge == None:
            # no result, leave distance unchanged
            return 1

        conversions = self.ewl.get("conversions", {})
        conversion = list(filter(lambda conversion: conversion["gauge"] == gauge, conversions))

        if len(conversion) == 0:
            # no result, leave distance unchanged
            return 1

        return conversion[0].get("ewl", 1)

    def featureProp(self, feature_rec, prop, unit=None):
        """
        The value of FEATURE_REC's configured property PROP (if set)

        PROP is the name of a configurable field property in a
        network definition ('upstream', 'downstream' or 'length')

        Returns None if the property is not configured for FEATURE_REC"""

        # Get field holding value (handling feature types not in network)
        field_name = self.featurePropFieldName(feature_rec.feature_type, prop)

        if not field_name and prop in feature_rec._descriptor.fields:
            field_name = prop

        if not field_name:
            return None

        # Get value
        val = getattr(feature_rec, field_name)
        if unit and val:
            field_unit = feature_rec._descriptor.fields[field_name].unit
            val = val * self.length_scale.conversionFactor(field_unit, unit)

        return val

    def locFor(self, feature, pins):
        """
        Calculate the line of count string for FEATURE across PINS
        ENH: Use localised string
        """

        locs = self.nw_view.loc_mgr.getLoc(feature, pins=pins)
        locs = map(
            lambda loc: f"{loc['name']} [{loc['low']}-{loc['high']}] {loc['status']}",
            locs,
        )
        return ",".join(locs)
