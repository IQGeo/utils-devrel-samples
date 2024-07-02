# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

from heapq import heappush, heappop
from myworldapp.modules.comms.server.api.mywcom_error import MywcomError


class MywcomMultiPathFinder:
    """
    A mixin to provide an algorithm that yields multiple paths. Rather than return when we hit
    the end node, we yield it up and continue to search. Also, revisit checks are for a particular path
    rather than a global visited nodes list.
    """

    def findPaths(
        self,
        from_urn,
        stop_urns=[],
        avoid_urns=[],
        direction="downstream",
        end_distances={},
        options={},
    ):

        """
        Yield objects (and paths) reachable from FROM_URN (in distance order)
        Optional MAX_DIST is distance at which to stop tracing (in
        metres). Optional STOP_URNS is a list of feature urns we are
        trying to find. Tracing terminates when one of these is encourtered.
        Returns MywTraceNodes:
         ROOT_NODE   The node from which tracing started
         STOP_NODE   The node which caused tracing to stop (if any)
        """

        # ENH: Support start from specified location along FROM_URN
        # ENH: Make ordering by distance optional (for speed)

        max_dist = options.get("max_distance", None)
        max_nodes = options.get("max_nodes", None)

        self.options = options
        self.end_distances = end_distances

        self.route_path = options.get("route_features", [])

        active_nodes = []  # MywTraceNodes in the 'wave front'
        visited_nodes = set()

        self.skip_reentrant_cables = True
        self.avoid_urns = avoid_urns

        if self.euclidean:
            # Get stop geoms to use when calculating node to end point distances for A*
            self.stop_geoms = self._stop_geoms(stop_urns)

        # Add start node
        root_node = self.rootNode(from_urn, direction)
        self.updateMetrics(root_node)
        heappush(active_nodes, (self.nodeSortValue(root_node), root_node))
        visited_nodes.add(root_node.node_id)

        root_node.min_possible_dist = self.minPossibleDistanceFor(root_node, self.stop_geoms)

        # Propagate wavefront (in distance order)
        while active_nodes:
            # Move to next closest node
            (sort_value, node) = heappop(active_nodes)
            node_urn = node.feature._urn()
            self.progress(4, "Processing:", node)

            # Check for found stop node
            if self.isStopNode(node, stop_urns):
                yield root_node, node
                continue

            # Check for node beyond distance limit
            if node.partial:
                continue

            # Add end nodes of connected items to wavefront
            for conn_node in self.connectedNodes(node, direction, root_node):
                self.progress(5, "  Connection:", conn_node)

                if self.isInvalidNode(conn_node, node):
                    continue

                # Check for end beyond distance limit
                # Note: This may change the node_id
                if max_dist and conn_node.dist > max_dist:
                    self.progress(7, "  Beyond max dist")
                    conn_node.stopAt(max_dist)

                # Prevent cycles
                visited_nodes.add(conn_node.node_id)

                # Prevent memory overflow etc
                # This is not an error here. Just to prevent searching for more paths were none are there
                if max_nodes and len(visited_nodes) > max_nodes:
                    # Yield so that caller can, for example, add it to list of partial paths
                    # and return to signify we are done
                    yield root_node, None
                    return

                # Add to wavefront
                self.progress(6, "  Activating:", conn_node)

                # Record new node and append to children of current node
                self.updateMetrics(conn_node)
                heappush(active_nodes, (self.nodeSortValue(conn_node), conn_node))

                node.children.append(conn_node)

        yield root_node, None

    def updateMetrics(self, node):
        """
        Set minimum possible total distance on the node. This is calculated from
        current distance traversed + minimum possible distance from this node to the end.
        The latter is obtained either from distances calculated from a previous trace or Euclidean
        distance to the end.
        """

        if self.euclidean and self.stop_geoms:

            min_dist = None

            # Use distances to end from a previous trace if we can
            if self.end_distances:
                top_feature = self.toplevelFeatureForNode(node)
                min_dist = self.minDistForTopFeature(top_feature, node)

            node.min_possible_dist = (
                min_dist if min_dist != None else self.minPossibleDistanceFor(node, self.stop_geoms)
            )

    def toplevelFeatureForNode(self, node):
        """
        Find top level feature for NODE to use to calculate A* heuristic metric
        """

        if hasattr(node.feature, "root_housing"):
            top_feature = node.feature.root_housing
        else:
            top_feature = node.feature._urn()

        return top_feature

    def minDistForTopFeature(self, top_feature, node):
        """
        Calculate min possible distance for TOP_FEATURE
        """

        min_dist = None

        if top_feature in self.end_distances:
            min_dist = self.end_distances[top_feature] + node.dist

        return min_dist

    def nodeSortValue(self, node):
        """
        Value for a node to use to pick next node
        """

        return node.min_possible_dist if hasattr(node, "min_possible_dist") else node.dist

    def isStopNode(self, node, stop_urns):
        """
        Determines if NODE is a stop node or contained in one.
        """

        if node.feature._urn() in stop_urns:
            return True

        if hasattr(node.feature, "root_housing") and node.feature.root_housing in stop_urns:
            return True

        return False

    def isInvalidNode(self, conn_node, node):
        """
        Used to filter out nodes.
        Can be subclassed to add additional checks
        """

        if self.isAvoid(conn_node, self.avoid_urns):
            return True

        # Check for already visited on this path
        if self.haveVisited(node, conn_node):
            self.progress(8, "  Already visited", conn_node.node_id)
            return True

        # Ensure only looking along route edges
        if self.route_path and hasattr(conn_node.feature, "root_housing"):
            root_housing = conn_node.feature.root_housing
            if root_housing not in self.route_path:
                return True

        return False

    def isAvoid(self, node, avoid_urns):
        """
        Determine if NODE is one we should be avoiding
        """

        if avoid_urns and node.feature._urn() in avoid_urns:
            return True

        return False

    def haveVisited(self, parent, new_node):
        """
        Determine if we have visited NEW_NODE on path from PARENT
        """

        node = parent
        while node:
            if node.node_id == new_node.node_id:
                return True
            node = node.parent

        return False

    def minPossibleDistanceFor(self, conn_node, stop_geoms):
        """
        Calculate A-star heuristic. Can be subclassed to provide different one.
        Note that there conditions necessary to ensure optimal path is found.
        """

        conn_node.distance_to_end = conn_node.minDistanceTo(stop_geoms)
        return conn_node.dist + conn_node.distance_to_end
