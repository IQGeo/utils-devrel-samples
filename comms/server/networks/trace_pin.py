################################################################################
# Comms Fiber Trace Node
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.networks.myw_trace_node import MywTraceNode


class TracePin:
    """
    A pin within a pin trace node

    Used for modelling paths"""

    def __init__(self, node, pin):
        """
        Init slots of self

        NODE is a PinTraceNode"""

        self.node = node
        self.pin = pin

    def __ident__(self):
        """
        String used to identify self in test results etc
        """

        return "{}({},{})".format(self.__class__.__name__, self.node.node_id, self.pin)

    def definition(self, full=False):
        """
        JSON-serialisable form of self
        """

        feature = self.node.feature

        if self.node.type == "segment":
            type = "cable"
            feature = feature._field("cable").rec()
            desc = "{}#{}".format(feature.name, self.pin)
        else:
            type = "port"
            desc = "{}#{}:{}".format(feature.name, self.node.pins.side.upper(), self.pin)

        defn = {
            "type": type,
            "id": self.text(),
            "feature": self.node.feature._urn(),
            "title": feature._title(),
            "desc": desc,
            "side": self.node.pins.side,
            "pin": self.pin,
        }

        if full:
            defn["coords"] = self.node.coordsFromRoot()

        return defn

    def text(self):
        """
        String representation of self for trace tree
        """

        if self.node.type == "segment":  # ENH: Move to node subclass
            name = self.node.feature._field("cable").rec().name
        else:
            name = self.node.feature.name

        return "{}#{}:{}".format(name, self.node.pins.side, self.pin)
