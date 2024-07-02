# Copyright: IQGeo Limited 2010-2023

from .connection_trace_node import ConnectionTraceNode


class PseudoConnectionTraceNode(ConnectionTraceNode):

    # User-level properties (for all subclasses)
    metadata = [
        "is_new_connection",
        "from_ref",
        "to_ref",
        "to_pins",
        "from_pins",
    ] + ConnectionTraceNode.metadata

    def __init__(self, conn, tech, direction, dist, ewl_dist, parent=None, sort_props=None):
        super().__init__(conn, tech, direction, dist, ewl_dist, parent=parent)

        self.is_new_connection = True

    @property
    def from_ref(self):
        return self.conn.from_ref

    @property
    def to_ref(self):
        return self.conn.to_ref

    @property
    def from_pins(self):
        return self.conn.from_pins.spec

    @property
    def to_pins(self):
        return self.conn.to_pins.spec

    def function(self):
        return "splice"

    def toplevelAStarFeature(self, db_view):
        """
        Return top level feature for purposes of calculating A-star metric

        This ensures that although pseudo-connection nodes have a point as their
        feature that we pick the one going out on a fiber segment that brings us closer
        to our goal.
        """

        to_seg = self.conn.to_ref
        to_seg_rec = db_view.get(to_seg)
        top_feature = to_seg_rec.root_housing

        return top_feature
