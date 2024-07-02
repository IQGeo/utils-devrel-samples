from myworldapp.core.server.base.core.myw_error import MywError
from .pin_trace_node import PinTraceNode


class PortTraceNode(PinTraceNode):
    """
    A port node in a fiber network trace result
    """

    type = "port"

    def __init__(self, feature, tech, pins, direction, dist, ewl_dist, funct, parent=None):
        """
        Init slots of self
        """

        super().__init__(feature, tech, pins, direction, dist, parent=parent)

        self.node_id += "-{}".format(pins.spec)  # Used for detecting 'already visited'
        self.funct = funct
        self._ewl_dist = ewl_dist

    @property
    def ports(self):
        """
        For display in trace result
        """

        return self.pins.spec

    def pinFor(self, child_node, child_pin):
        """
        The pin on self's feature that is connected to CHILD_PIN of CHILD_NODE
        """

        # Case: Implicit connection
        if child_node.type == "port" and child_node.feature == self.feature:
            funct = self.functionOf(self.feature)

            if funct == "connector":
                return child_pin

            if funct == "splitter":
                if self.pins.side == "in":
                    return 1  # Upstream trace
                if self.pins.side == "out":
                    return self.pins.low  # Downstream trace (assumes single pin connected)

            if funct == "mux":
                if self.pins.side == "in":
                    return self.pins.low  # Upstream trace
                if self.pins.side == "out":
                    return 1  # Downstream trace (assumes single pin connected)
                
            if funct == "bridge_tap":
                size = self.feature[ f"n_{self.tech}_in_ports" ]
                if self.pins.side == "in":
                    return child_pin if child_node.pins.low <= size else child_pin - size
                if self.pins.side == "out":
                    return child_pin if child_pin <= size else child_pin - size
                
        # Case: Child is connection (which holds self's pin)
        return child_pin

    def functionOf(self, equip):
        """
        The function of feature EQUIP
        """

        return self.funct

    @property
    def ewl_dist(self):
        return self._ewl_dist
