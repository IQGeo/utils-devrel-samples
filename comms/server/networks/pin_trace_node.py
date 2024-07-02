# Copyright: IQGeo Limited 2010-2023

import myworldapp.core.server.controllers.base.myw_globals as myw_globals
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.networks.myw_trace_node import MywTraceNode
from .trace_pin import TracePin


class PinTraceNode(MywTraceNode):
    """
    Superclass for nodes in a pin-level network trace result

    Provides methods for trace consolidation"""

    # User-level properties (for all subclasses)
    metadata = [
        "ports",
        "fibers",
        "from_",
        "to_",
        "length",
        "direction",
        "individualLoss",
        "cumulativeLoss",
        "loc",
    ] + MywTraceNode.metadata

    metadata_unit_scales = dict(
        MywTraceNode.metadata_unit_scales,
        **{
            "length": {"scale": "length", "unit": "m"},
            "individualLoss": {"scale": "fiber_loss", "unit": "dB"},
            "cumulativeLoss": {"scale": "fiber_loss", "unit": "dB"},
        },
    )

    # Used for tracking cumulative loss
    cumulative_loss = None

    # Backstop values for user-level properties
    ports = None
    fibers = None
    from_ = None
    to_ = None
    loc = None

    # For debugging
    progress = MywSimpleProgressHandler(0)

    def __init__(self, feature, tech, pins, direction, dist, parent=None):
        """
        Init slots of self

        PINS in a PinRange. DIRECTION is trace direction ('upstream', 'downstream' or 'both')"""

        super().__init__(feature, dist, parent=parent)
        self.pins = pins
        self.direction = direction
        self.db = myw_globals.db
        self.tech = tech # tech defined at network engine


    @property
    def length(self):
        """
        Length of self's leg, in metres (if appropriate)
        """

        if self.parent:
            length = self.dist - self.parent.dist
        else:
            length = self.dist

        if not length:
            return None

        return "{:.2f}".format(length)

    @property
    def individualLoss(self):
        """
        Individual loss in dB.
        """
        feature_function = self.function()
        if not feature_function:
            return 0.0

        loss_config = self.db.setting("mywcom.loss")
        loss_by_tech = loss_config.get(self.tech)
        if loss_by_tech == None: 
            return 0.0
        
        loss = loss_by_tech.get(feature_function) 
        if loss == None:
            return 0.0

        # If copper cable, must account for gauge
        if self.tech == "copper" and feature_function == "cable":
            loss = loss.get(str(int(self.feature.gauge)), None)
            if loss == None:
                return 0.0
            
        return loss if not self.length else float(self.length) * (loss / 1000)
    
    @property
    def cumulativeLoss(self):
        """
        Cumulative fiber loss in dB. (iterative)
        """

        if self.cumulative_loss:
            return self.cumulative_loss

        node = self
        cumulative_loss = 0.0

        while node is not None:
            if node.parent:
                # prevent adding duplicative loss to cumulative loss
                if node.feature._urn() != node.parent.feature._urn():
                    cumulative_loss += node.individualLoss
            else:
                cumulative_loss += node.individualLoss
            node = node.parent

        self.cumulative_loss = cumulative_loss

        return self.cumulative_loss

    def coordsFromRoot(self):
        """
        The coordinates for path from self's root node to self (iterative)

        Returns a list of coords
        """
        coords = []

        # add self
        self._addCoords(self, coords)

        current_node = self
        while current_node.parent:
            self._addCoords(current_node.parent, coords)
            current_node = current_node.parent

        return list(reversed(coords))

    def _addCoords(self, current_node, coords):
        """
        Appends coord to COORDS
        """
        node_coords = current_node.coords()

        # case: linestring so reverse it's coords
        if len(node_coords) > 1:
            node_coords.reverse()

        for coord in node_coords:
            if not coords or coord != coords[-1]:
                coords.append(coord)

    def coords(self):
        """
        The coordinates of self's path

        Returns a list of coords"""

        return self.feature._primary_geom_field.geom().coords

    def tidy(self):
        """
        Consolidate consecutive links in self's sub-tree

        Returns self"""

        # Convert cable segs -> cables
        self.mutateCableSegments()

        # Consolidate nodes (to simplify result)
        nodes = [self]
        while nodes:
            node = nodes.pop()
            node.consolidate()
            nodes += node.children

        return self

    def mutateCableSegments(self):
        """
        Convert cable segment nodes of self's subtree to cable nodes

        Returns self"""
        # Uses pseudo-recursion to avoid stack overflow

        nodes = [self]

        while nodes:
            node = nodes.pop(0)

            if node.type == "segment":
                node.convertToCable()

            for child in node.children:
                nodes.append(child)

        return self

    def consolidate(self):
        """
        Merge self's 'obvious' children into self (to simplify trace)
        """
        # Subclassed in SegmentTraceNode

        # If child is single connection .. skip it
        if len(self.children) == 1:
            child = self.children[0]

            if (
                child.type == "connection"
                and len(child.children) == 1
                and not child.conn.is_splice
            ):
                self.children = child.children

    def leafNodes(self):
        """
        The leaf nodes of self's sub-tree (iterative)

        Returns a list of nodes

        ENH: move to super
        """

        leaf_nodes = []
        stack = [self]

        while stack:
            current_node = stack.pop()

            if not current_node.children:
                leaf_nodes.append(current_node)
            else:
                stack.extend(current_node.children)

        return leaf_nodes

    def terminations(self):
        """
        The trace pin at which each of self's pins terminates (non-recursive)
        """

        stack = []
        (current, child_node, children, trace_pins) = (
            self,
            None,
            self.children.copy(),
            {},
        )

        # Reverse list to conform to iterator behaviour; seems going through list in different
        # ways can give different results probably where multiple terminations are present.
        children.reverse()

        while True:

            if not children:
                # Finished with children so process node and add current's pins to tracepins

                # Add leaf pins from current node
                for pin in current.pins.range():
                    if not pin in trace_pins:
                        trace_pins[pin] = TracePin(current, pin)

                if not stack:
                    return trace_pins

                # Pop stack and continue processing parent
                child_trace_pins = trace_pins
                (current, child_node, children, trace_pins) = stack.pop()

                # Add leaf pins from child
                if child_node:
                    for child_pin, trace_pin in child_trace_pins.items():
                        pin = current.pinFor(child_node, child_pin)
                        if not pin in trace_pins:  # ENH: handle multiple terminations
                            trace_pins[pin] = child_trace_pins[child_pin]
                            current.progress(
                                5,
                                current,
                                "Mapped pin",
                                pin,
                                "->",
                                child_node,
                                child_pin,
                            )

            else:
                # Move onto next child
                child_node = children.pop()

                # Push parent and switch to child
                stack.append((current, child_node, children, trace_pins))
                (current, child_node, children, trace_pins) = (
                    child_node,
                    None,
                    child_node.children.copy(),
                    {},
                )
                children.reverse()

    def function(self):
        function_def = self.db.setting("mywcom.equipment").get(
            self.feature.feature_type
        )

        if not function_def and self.db.setting("mywcom.cables").get(
            self.feature.feature_type
        ):
            function_def = {"function": "cable"}

        if (
            not function_def
            and (self.feature.feature_type == "mywcom_fiber_connection" or 
                 self.feature.feature_type == "mywcom_copper_connection")
            and self.feature.splice
        ):
            function_def = {"function": "splice"}

        return function_def["function"] if function_def else None

    def toplevelAStarFeature(self, db_view):
        """
        Return top level feature for purpose of calculating A-star metric
        """

        if hasattr(self.feature, "root_housing"):
            return self.feature.root_housing
        else:
            return self.feature._urn()
