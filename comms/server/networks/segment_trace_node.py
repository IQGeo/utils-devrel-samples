from copy import copy
from .pin_trace_node import PinTraceNode

class SegmentTraceNode(PinTraceNode):
    """
    A cable segment node in a fiber network trace result

    Also used to model a list of connected segments (see mutation code)"""

    type = "segment"

    def __init__(
        self,
        feature,
        tech,
        pins,
        direction,
        dist,
        ewl_dist,
        parent=None,
        loc=None,
    ):
        """
        Init slots of self
        """

        super().__init__(feature, tech, pins, direction, dist, parent=parent)

        # Determine if this is a continuation node
        self.leaving = (
            parent and (parent.type == "segment") and (parent.feature._urn() == feature._urn())
        )

        # Set trace direction relative to geom (if meaningful)
        self.seg_forward = True  # ENH: Remove need for this
        if self.leaving:
            self.seg_forward = pins.side == "out"

        # Init list of consolidated segments (see mutation)
        self.segments = None

        self.node_id += "-{}".format(pins.spec)  # Used for detecting 'already visited'
        self._loc = loc
        self._ewl_dist = ewl_dist

    @property
    def entering(self):
        """
        True if this is first node on segment
        """

        return not self.leaving

    @property
    def fibers(self):
        """
        For display in trace result
        """

        return "{}".format(self.pins.rangeSpec())

    @property
    def loc(self):
        return self._loc

    @property
    def ewl_dist(self):
        return self._ewl_dist

    @property
    def start_coord(self):
        """
        Position on self's feature at which self starts (if partial link)
        """

        if not self.segments:
            return None

        geom = self.segments[0]._primary_geom_field.geom()

        if self.seg_forward:
            return geom.coords[0]
        else:
            return geom.coords[-1]

    @property
    def stop_coord(self):
        """
        Position on self's feature at which self ends (if partial link)
        """

        # Case: Root node of trace from segment
        if self.dist == 0.0:
            return self.start_coord

        # Case: Unconsolidated segment
        if not self.segments:
            return None

        geom = self.segments[-1]._primary_geom_field.geom()

        # Case: Full link
        if not self.partial:
            if self.seg_forward:
                return geom.coords[-1]
            else:
                return geom.coords[0]

        # Case: Zero length segment (prevents problems later)
        if geom.geoLength() == 0.0:
            return geom.coords[0]

        # Find position of stop point along last segment (as proportion of total length)
        # Remember: dist may have been computed from a stored length value
        pos = (self.dist - self.prev_seg_dist) / (self.full_dist - self.prev_seg_dist)
        if not self.seg_forward:
            pos = 1.0 - pos

        # Compute coordinate at that position
        return geom.geoCoordAtPos(pos)

    def coords(self):
        """
        The coordinates of self's path

        Returns a list of coords"""

        # Assumes self is unconsolidated

        if self.leaving:
            return []

        geom = self.feature._primary_geom_field.geom()
        coords = geom.coords

        if self.forward:
            coords = coords[::-1]

        return coords

    def convertToCable(self):
        """
        Convert self to a cable node

        Returns self"""

        if self.segments is None:
            self.segments = [self.feature]
            self.feature = self.feature._field("cable").rec()

        return self

    def consolidate(self):
        """
        Merge self's 'obvious' children into self (to simplify trace)
        """

        # Set start distance
        if self.parent:
            self.prev_seg_dist = self.parent.dist
        else:
            self.prev_seg_dist = 0

        # While child node relates to same cable .. consolidate it into self
        while len(self.children) == 1 and (self.children[0].feature == self.feature):
            child_node = self.children[0]

            if child_node.leaving:
                self.prev_seg_dist = self.dist
                # Copy to ensure that we don't update shared pin range
                self.pins = copy(self.pins)
                self.pins.side = child_node.pins.side
                self.seg_forward = child_node.seg_forward
                self.dist = child_node.dist
                self.partial = child_node.partial
                self.full_dist = child_node.full_dist
                self.segments += child_node.segments
            self.children = child_node.children

        # Consolidate connections
        super().consolidate()

        return self

    def pinFor(self, child_node, child_pin):
        """
        The pin on self's feature that is connected to CHILD_PIN of CHILD_NODE
        """

        return child_pin
