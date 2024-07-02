# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.networks.myw_trace_node import MywTraceNode
from myworldapp.core.server.base.geom.myw_geo_utils import geodeticDistanceBetween


class AStarTraceNode(MywTraceNode):
    """
    Trace node for use with A* algorithm

    Adds property min_possible_dist which stores the minimum possible total length
    of the path to a stop node (if doing shortest path). This is computed assuming nodes
    a located in euclidean space (see web for description of A*)"""

    def __lt__(self, other):
        """
        Comparison operator (used in heap operations)
        """
        # Subclassed to support ordering by distance to stop nodes (part of the A* algorithm implementation)

        if hasattr(self, "min_possible_dist"):
            return self.min_possible_dist < other.min_possible_dist

        return self.dist < other.dist

    def minDistanceTo(self, geoms):
        """
        Distance from self to nearest vertex on GEOMS, in m (0.0 if not known)

        GEOMS is a set of shapely geometries
        """

        self_coord = self._stop_coord()

        if not self_coord:
            return 0.0

        min_dist = None
        for geom in geoms:
            for coord in geom.coords:
                dist = geodeticDistanceBetween(self_coord, coord)

                if min_dist == None or min_dist > dist:
                    min_dist = dist

        return min_dist

    def _stop_coord(self):
        """
        Position on self's feature at which self ends
        """

        if not self.parent:  # ENH: Do better if root node
            return None

        geom = self.featureGeom()
        if geom.geom_type == "Point":
            return geom.coords[0]

        # Find position of stop point along feature (as proportion of total length)
        # Remember: dist may have been computed from a stored length value
        if self.partial:
            pos = (self.dist - self.parent.dist) / (self.full_dist - self.parent.dist)
        else:
            pos = 1.0

        if not self.forward(geom):
            pos = 1.0 - pos

        return geom.geoCoordAtPos(pos)
