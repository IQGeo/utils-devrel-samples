from .pin_trace_node import PinTraceNode


class ConnectionTraceNode(PinTraceNode):
    """
    A connection node in a fiber network trace result
    """

    type = "connection"

    def __init__(self, conn, tech, direction, dist, ewl_dist, parent=None):
        """
        Init slots of self

        CONN is a Connection"""

        super().__init__(conn.conn_rec, tech, conn.from_pins, direction, dist, parent=parent)
        self.conn = conn

        id_pins = conn.from_pins if conn.forward else conn.to_pins
        self.node_id += "-{}".format(id_pins.rangeSpec())  # Used for detecting 'already visited'
        self._ewl_dist = ewl_dist

    @property
    def from_(self):
        """
        For display in trace result
        """

        return self._strFor(self.conn.from_pins, self.conn.is_from_cable)

    @property
    def to_(self):
        """
        For display in trace result
        """

        return self._strFor(self.conn.to_pins, self.conn.is_to_cable)

    def _strFor(self, pins, cable):
        """
        Text to show for PINs in trace result
        """

        if self.conn.is_splice:
            return pins.rangeSpec()

        if cable:
            return "Fibers: " + pins.rangeSpec()
        else:
            return "Ports: " + pins.spec

    def pinFor(self, child_node, child_pin):
        """
        The pin on self's feature that is connected to CHILD_PIN of CHILD_NODE
        """

        return self.conn.fromPinFor(child_pin)

    @property
    def ewl_dist(self):
        return self._ewl_dist
