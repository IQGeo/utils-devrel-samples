# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.modules.comms.server.networks.mywcom_pin_network_engine import (
    MywcomPinNetworkEngine,
)
from myworldapp.modules.comms.server.networks.mywcom_multi_path_finder import (
    MywcomMultiPathFinder,
)

from myworldapp.modules.comms.server.api.network_view import NetworkView

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.pin_set import PinSet

from .port_trace_node import PortTraceNode
from .segment_trace_node import SegmentTraceNode
from .connection_trace_node import ConnectionTraceNode
from .pin_trace_node import PinTraceNode
from .pseudo_connection_trace_node import PseudoConnectionTraceNode


class PseudoConnection:
    def __init__(self, db_view, conn_rec, pins, next_pin, other_seg):
        self.db_view = db_view
        self.conn_rec = conn_rec

        # Copy to make sure that pins are truly local and not changed by
        # for example segment node consolidation
        self.from_pins = pins
        self.to_pins = next_pin
        self.forward = True

        self.to_ref = other_seg._urn()
        self.from_ref = conn_rec._urn()
        self.is_to_cable = True
        self.is_from_cable = True
        self.is_splice = True

    def toFeatureRec(self):
        """
        The feature record to which the connection points
        """

        return self.db_view.get(self.to_ref)

    def fromFeatureRec(self):
        """
        The feature record from which the connection points
        """

        return self.db_view.get(self.from_ref)


class MywcomFiberPathNetworkEngine(MywcomPinNetworkEngine, MywcomMultiPathFinder):
    """
    A network engine for tracing fiber paths. Can be subclassed to provide custom behaviour, for example
    what counts as valid splicing.
    """

    def __init__(self, db_view, network_def, extra_filters={}, progress=MywProgressHandler()):
        super().__init__(db_view, network_def, extra_filters, progress)
        self.db_view = db_view
        self.sort_props = []
        self.nw_view = NetworkView(self.db_view)
        self.extra_filters = extra_filters
        self._segments_at = {}

    def connectedNodesForSegment(self, node, direction):
        """
        Override to return, if the node has no pin connect nodes, the
        connections that we could have if spliced.
        Note that we can not at this stage pick the first free fibre as this one might not take us to the end.
        We will need to wait until the trace is complete before calculating actual connections we should make.
        """

        conns = self.actualConnectedNodesForSegment(node, direction)

        # Hoping from one end of segment to another
        if node.entering and len(conns) == 1 and conns[0].feature == node.feature:
            return conns

        # If any actual connections, then travel along these.
        # ENH: Need to handle case where subset of incoming range is un-connected?
        if conns and not isinstance(conns[0], SegmentTraceNode):
            return conns

        # No real connections so free to potentially splice to other cables
        self.progress(4, node, "Augmenting with potential connections", direction)

        pins = node.pins
        next_side = pins.otherSide()

        if node.seg_forward:
            housing_urn = node.feature.out_structure
        else:
            housing_urn = node.feature.in_structure

        housing = self.db_view.get(housing_urn)

        # For every exiting segment, create a PCN
        for other_seg in self.otherSegmentsAt(node.feature, housing):

            # Ignore segments that jump back to a cable we have already been through and left
            if other_seg.cable != node.feature.cable and other_seg.cable in self.previousCables(
                node
            ):
                continue

            if other_seg.in_structure == housing_urn:
                next_side = "in"
            else:
                next_side = "out"

            # Create PCN for each free range
            free_ranges = self.freeFibersForSegmentAt(other_seg, housing)

            for next_pin in free_ranges:

                next_pin.side = next_side

                self.progress(4, node, "  Create PCN for", other_seg, next_pin)

                conn = PseudoConnection(self.db_view, node.feature, pins, next_pin, other_seg)
                conn_node = PseudoConnectionTraceNode(
                    conn, self.tech, direction, node.dist, node.ewl_dist, node, self.sort_props
                )
                view = self.caching_view.db.view(self.caching_view.delta)
                struct = view.get(node.feature.out_structure)
                conn_node.feature = struct
                conn_node.node_id += "-{}-{}".format(other_seg._urn(), node.feature._urn())
                self.progress(4, " node_id=", conn_node.node_id)
                conns.append(conn_node)

        return conns

    def previousCables(self, node):
        """
        Return cables trace has passed through up to and including NODE
        ENH: Cache this data
        """

        cables = set()
        while node:
            if isinstance(node, SegmentTraceNode):
                cables.add(node.feature.cable)
            node = node.parent

        return cables

    def freeFibersForSegmentAt(self, seg, housing):
        """
        Returns free fibers for SEG
        """

        fiber_count = seg._field("cable").rec().fiber_count
        full_range = PinRange("in", 1, fiber_count)
        seg_urn = seg._urn()

        conn_set = self.nw_view.connection_mgr.connectionsAt(seg, housing)
        # conn_set = self.connSetFor(seg, "in")

        connected_ranges = []
        for c in conn_set:
            if seg_urn == c.in_object:
                connected_ranges.append(PinRange(c.in_side, c.in_low, c.in_high))
            else:
                connected_ranges.append(PinRange(c.out_side, c.out_low, c.out_high))

        ranges = [PinRange("out", 1, fiber_count)]
        for c1 in connected_ranges:
            new_current = []
            for c2 in ranges:
                new_current = new_current + c2.subtract(c1)
            ranges = new_current

        return ranges

    def otherSegmentsAt(self, seg, struct, direction="downstream"):
        """
        Returns segments following SEG in DIRECTION in other cables
        ENH: Take into account connections in other designs.
        """

        self.progress(4, "otherSegmentsAt", seg, struct, direction)

        segs = []
        struct_urn = struct._urn()

        segs_at = self.segmentsAt(struct)
        for next_seg in segs_at:

            # Check technology matches
            if seg.feature_type != next_seg.feature_type:
                continue

            self.progress(4, "otherSegmentsAt next_seg=", next_seg)

            if seg.cable == next_seg.cable:
                continue

            # Exclude directed segments that are pointing the wrong way
            if next_seg.directed:
                if (direction == "downstream" and next_seg.in_structure != struct_urn) or (
                    direction == "upstream" and next_seg.out_structure != struct_urn
                ):
                    continue

            self.progress(4, "otherSegmentsAt checking is valid", next_seg)

            if self.isValidNextSegment(seg, next_seg):
                segs.append(next_seg)

        return segs

    def segmentsAt(self, struct):
        """
        Returns segments at a structure.
        """

        # Check in cache for answer
        struct_urn = struct._urn()
        if struct_urn in self._segments_at:
            return self._segments_at[struct_urn]

        # Query database and add to cache
        segs_at = self.nw_view.cable_mgr.segmentsAt(struct)
        self._segments_at[struct_urn] = segs_at

        return segs_at

    def isValidNextSegment(self, current_seg, next_seg):
        """
        Determines if going from current_set to next_seg is valid. Can be subclassed
        to relax or strengthen these rules.

        """

        self.progress(4, "isValidNextSegment", current_seg, next_seg)

        # This means that we only allow splicing between segments that are in the same splice closure or 
        # allow a new splice to be created.
        valid_splices_only = self.extra_filters.get("valid_splices_only", True)

        if valid_splices_only:

            if current_seg.out_structure == next_seg.in_structure:
                housing = current_seg.out_structure
            else:
                housing = current_seg.in_structure
            housing = self.db_view.get(housing)

            current_seg_urn = current_seg._urn()
            next_seg_urn = next_seg._urn()

            # Calculate the splices the current and next segments appear in
            struct_conns = self.nw_view.connection_mgr.connectionsIn(housing)

            # Start with the enclosures that segments are explicitly associated to
            current_splices = set( filter( lambda x: x, [current_seg.in_equipment, current_seg.out_equipment]))
            next_splices = set( filter( lambda x: x, [next_seg.in_equipment, next_seg.out_equipment]))               

            for conn in struct_conns:
                if conn.in_object == current_seg_urn or conn.out_object == current_seg_urn:
                    sc = self.findSpliceClosure(conn.housing)
                    if sc:
                        current_splices.add(sc._urn())
                if conn.in_object == next_seg_urn or conn.out_object == next_seg_urn:
                    sc = self.findSpliceClosure(conn.housing)
                    if sc:
                        next_splices.add(sc._urn())

            self.progress(
                4,
                "isValidNextSegment housing=",
                housing,
                "current_splices=",
                current_splices,
                "next_splices=",
                next_splices,
            )

            # If current segment and next segment are not in any splices, then valid,
            # and a new splice will be created
            if not current_splices and not next_splices:
                return True

            # If current segment shares a splice with next segment, then valid
            if current_splices.intersection(next_splices):
                return True

            # Otherwise next segment is not valid
            return False

        return True

    def findSpliceClosure(self, housing):
        """
        Go up housing chain from connection to find splice closure.
        """

        splice_closure_type = self.extra_filters["splice_closure_type"]

        while True:
            rec = self.db_view.get(housing)
            if rec.feature_type == splice_closure_type:
                return rec
            if hasattr(rec, "housing"):
                housing = rec.housing
            else:
                return None

    def actualConnectedNodesForSegment(self, node, direction):
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
            next_pins = PinRange(pins.otherSide(), pins.low, pins.high)
            next_node = SegmentTraceNode(seg, self.tech, next_pins, direction, node.dist + seg_len, 0.0, node)

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
                next_seg, self.tech, next_pins, direction, node.dist, node.ewl_dist, node
            )
            conn_nodes.append(conn_node)

        return conn_nodes

    def updateMetrics(self, node):
        super().updateMetrics(node)

        new_connections = 0 if not node.parent else node.parent.new_connections
        if getattr(node, "is_new_connection", False):
            node.new_connections = new_connections + 1
        else:
            node.new_connections = new_connections

        existing_connections = 0 if not node.parent else node.parent.existing_connections
        if not isinstance(node, PseudoConnectionTraceNode) and isinstance(
            node, ConnectionTraceNode
        ):
            node.existing_connections = existing_connections + 1
        else:
            node.existing_connections = existing_connections

    def nodeSortValue(self, node):
        """
        Value for a node to use to pick next node
        """

        if hasattr(node, "_node_sort_value"):
            # pylint: disable=no-member
            return self._node_sort_value

        dist = node.min_possible_dist if hasattr(node, "min_possible_dist") else node.dist

        # This number is just a heuristic to allow us to blend number of connections with distance.
        # Distance needs to remain part of the value to ensure convergence.
        connection_cost_metres = self.options.get("connection_cost_metres", 10)

        if self.options["sort_by"] == "least_new":
            node._node_sort_value = node.new_connections * connection_cost_metres + dist
        elif self.options["sort_by"] == "least_existing":
            node._node_sort_value = node.existing_connections * connection_cost_metres + dist
        else:
            node._node_sort_value = (
                dist,
                node.new_connections,
                node.existing_connections,
            )

        return node._node_sort_value

    def toplevelFeatureForNode(self, node):
        """
        Find top level feature for NODE to use to calculate A* heuristic metric
        """

        return node.toplevelAStarFeature(self.db_view)

    def minDistForTopFeature(self, top_feature, node):
        """
        Calculate min possible distance for TOP_FEATURE
        """

        min_dist = None

        if top_feature not in self.end_distances:
            return None

        feature_type = top_feature.split("/")[0]

        # If looking at a route them use distance of end/start structure closest to end
        if feature_type in self.nw_view.routes:
            rec = self.db_view.get(top_feature)
            if rec.in_structure in self.end_distances and rec.out_structure in self.end_distances:
                s1 = self.end_distances[rec.in_structure]
                s2 = self.end_distances[rec.out_structure]
                min_dist = min(s1, s2) + node.dist

        else:
            min_dist = self.end_distances[top_feature] + node.dist

        return min_dist
