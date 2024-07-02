# Copyright: IQGeo Limited 2010-2023

from heapq import heappush, heappop
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.networks.myw_graph_network_engine import MywGraphNetworkEngine

from myworldapp.modules.comms.server.networks.mywcom_multi_path_finder import MywcomMultiPathFinder
from myworldapp.modules.comms.server.base.readonly_feature_view import ReadonlyFeatureView

from .a_star_trace_node import AStarTraceNode


class MywcomGraphNetworkEngine(MywGraphNetworkEngine, MywcomMultiPathFinder):
    """
    A network engine operating on a 'simple graph' connectivity model

    In this model each feature is link and holds a direct
    reference to its upstream and downstream connections. The
    names of the fields holding the references are configured
    via the network definition."""

    #
    # Subclassed to improve performance:
    #   - Use cached feature view
    #   - Use A* algorithm for shortest path tracing
    #   - Reduce duplicated queries in undirected networks

    # ENH: Move changes to core and remove this

    def __init__(self, db_view, network_def, extra_filters={}, progress=MywProgressHandler()):

        # Use cache db view (for speed)
        db_view = ReadonlyFeatureView(db_view)

        super().__init__(db_view, network_def, extra_filters, progress)

    def rootNode(self, urn, direction):
        """
        Create the start node for URN
        """
        # Subclassed to use comms trace node class

        feature = self.featureRecFor(urn)

        return AStarTraceNode(feature, 0.0)

    def connectedNodes(self, node, direction, root_node):
        """
        Returns nodes directly reachable from NODE

        DIRECTION is 'upstream', 'downstream' or 'both'.
        ROOT_NODE is the root of the current trace (unused here).
        """
        # Subclassed to use comms trace node class

        nodes = []

        # For each reference .. create node
        for ftr_rec in self.connectedFeaturesFor(node.feature, direction):
            ftr_len = self.lengthOf(ftr_rec)
            conn_node = AStarTraceNode(ftr_rec, node.dist + ftr_len, node)
            nodes.append(conn_node)

        return nodes

    def _trace(self, from_urn, direction, stop_urns=[], max_dist=None, max_nodes=None):
        """
        Find objects reachable from FROM_URN (in distance order)

        Optional MAX_DIST is distance at which to stop tracing (in
        metres). Optional STOP_URNS is a list of feature urns we are
        trying to find. Tracing terminates when one of these is encourtered.

        Returns MywTraceNodes:
         ROOT_NODE   The node from which tracing started
         STOP_NODE   The node which caused tracing to stop (if any)
        """
        # Subclassed from myw_network_engine to:
        #    use A* algorithm for shortest path
        #    add some feature caching to reduce queries

        # ENH: Support start from specified location along FROM_URN
        # ENH: Make ordering by distance optional (for speed)

        active_nodes = []  # MywTraceNodes in the 'wave front'
        visited_nodes = set()  # Paths we have encountered so far

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
                if max_dist and conn_node.dist > max_dist:
                    self.progress(7, "  Beyond max dist")
                    conn_node.stopAt(max_dist)

                # Prevent cycles
                visited_nodes.add(conn_node.node_id)

                # Prevent memory overflow etc
                if max_nodes and len(visited_nodes) > max_nodes:
                    self.progress("warning", "Trace size limit exceeded:", max_nodes)
                    raise MywError("Trace size limit exceeded")

                # Add to wavefront
                self.progress(6, "  Activating:", conn_node)

                # MYWCOM: Include distance to stop nodes as part of A* algrorithm
                if stop_geoms:
                    conn_node.min_possible_dist = conn_node.dist + conn_node.minDistanceTo(
                        stop_geoms
                    )
                # MYWCOM: END

                heappush(active_nodes, conn_node)

                node.children.append(conn_node)

        return root_node, None

    def _stop_geoms(self, stop_urns):
        """
        Returns geometries for STOP_URNS
        """

        stop_geoms = []
        for stop_urn in stop_urns:
            stop_ftr = self.featureRecFor(stop_urn)
            if stop_ftr and stop_ftr.primaryGeometry():
                stop_geoms.append(stop_ftr.primaryGeometry())

        return stop_geoms

    def connectedFeaturesFor(self, feature, direction):
        """
        Returns features directly reachable from FEATURE

        DIRECTION is 'upstream', 'downstream' or 'both'
        """
        # Subclassed to support 'both' (performance optimisation)

        if direction == "both" or not self.network_def["directed"]:
            ftr_recs = self._connectedFeaturesFor(feature, "both")  # Subclassed to make single call
        else:
            ftr_recs = self._connectedFeaturesFor(feature, direction)

        # ENH: Exclude duplicates
        return ftr_recs

    def _connectedFeaturesFor(self, feature, direction):
        """
        Returns features directly reachable from FEATURE

        DIRECTION is 'upstream' or 'downstream' or 'both'
        """
        # Subclassed to support 'both' (performance optimisation)

        if direction == "both":
            upstream_field = self.featurePropFieldName(feature.feature_type, "upstream")
            downstream_field = self.featurePropFieldName(feature.feature_type, "downstream")

            if upstream_field == downstream_field:
                return self._getFeaturesFor(feature, "upstream")
            else:
                return self._getFeaturesFor(feature, "upstream") + self._getFeaturesFor(
                    feature, "downstream"
                )

        return self._getFeaturesFor(feature, direction)

    def _getFeaturesFor(self, feature, direction):
        """
        Returns features found following the configured field for DIRECTION
        DIRECTION is one of 'upstream' or 'downstream'
        """

        # Get field containing connection info
        field_name = self.featurePropFieldName(feature.feature_type, direction)
        if not field_name:
            return []

        # Get records
        recs = feature._field(field_name).recs(skip_bad_refs=True)

        # Apply filters
        return list(filter(self.includes, recs))
