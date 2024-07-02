################################################################################
# A network connection
################################################################################
# Copyright: IQGeo Limited 2010-2023

from copy import copy
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.dd.myw_reference import MywReference
from .pin_range import PinRange
from .network import Network


class Conn:
    """
    A connection from one set of pins to another

    Deals with the business of reversing connection when looking
    upstream"""

    # ------------------------------------------------------------------------------
    #                                   CONSTRUCTION
    # ------------------------------------------------------------------------------

    def __init__(self, conn_rec, forward=True):
        """
        Init slots of self from connection record CONN_REC

        If FORWARD is false, reverse the connection"""

        # Init slots
        self.conn_rec = conn_rec
        self.forward = forward
        self.network = Network.connection_types[conn_rec.feature_type]

        # Get from and to info
        if forward == True:
            from_urn = conn_rec.in_object
            from_pin_side = conn_rec.in_side
            from_pin_low = conn_rec.in_low
            from_pin_high = conn_rec.in_high
            to_urn = conn_rec.out_object
            to_pin_side = conn_rec.out_side
            to_pin_low = conn_rec.out_low
            to_pin_high = conn_rec.out_high

        elif forward == False:
            from_urn = conn_rec.out_object
            from_pin_side = conn_rec.out_side
            from_pin_low = conn_rec.out_low
            from_pin_high = conn_rec.out_high
            to_urn = conn_rec.in_object
            to_pin_side = conn_rec.in_side
            to_pin_low = conn_rec.in_low
            to_pin_high = conn_rec.in_high

        else:
            raise MywError("Bad direction:", forward)

        self.from_ref = MywReference.parseUrn(from_urn)
        self.to_ref = MywReference.parseUrn(to_urn)
        self.from_pins = PinRange(from_pin_side, from_pin_low, from_pin_high)
        self.to_pins = PinRange(to_pin_side, to_pin_low, to_pin_high)

    def intersect(self, from_pins):
        """
        The subset of self that relates to FROM_PINS (if any)

        Returns a Conn (or None)"""

        # Find pin range overlap
        overlap = self.from_pins.intersect(from_pins)
        if not overlap:
            return None

        # Return a shallow copy of self with pins updated
        # ENH: Use contructor instead
        conn = copy(self)

        conn.from_pins = overlap

        conn.to_pins = PinRange(
            self.to_pins.side, self.toPinFor(overlap.low), self.toPinFor(overlap.high)
        )

        return conn

    # ------------------------------------------------------------------------------
    #                                    PROPERTIES
    # ------------------------------------------------------------------------------

    def __str__(self):
        """
        String representation of self for debug messages etc
        """

        return "{}({})".format(self.__class__.__name__, self.spec)

    @property
    def spec(self):
        """
        String representation of self's data
        """

        return "{}#{} -> {}#{}".format(
            self.from_ref.urn(), self.from_pins.spec, self.to_ref.urn(), self.to_pins.spec
        )

    @property
    def db_view(self):
        """
        FeatureView that self's record comes from
        """

        return self.conn_rec._view

    def description(self):
        """
        String representation of self for GUI
        """

        sep = "->" if self.forward else "<-"

        return "{} {} {}".format(self.fromDescription(), sep, self.toDescription())

    def fromDescription(self):
        """
        String representation of self's from side for GUI
        """

        obj = self.fromFeatureRec()

        if not obj:
            return "Bad reference: {}#{}".format(self.from_ref, self.from_pins.spec)

        if self.is_from_cable:
            obj = obj._field("cable").rec()

        return "{}#{}".format(obj.name, self.from_pins.spec)

    def toDescription(self):
        """
        String representation of self's to side for GUI
        """

        obj = self.toFeatureRec()

        if not obj:
            return "Bad reference: {}#{}".format(self.to_ref, self.to_pins.spec)

        if self.is_to_cable:
            obj = obj._field("cable").rec()

        return "{}#{}".format(obj.name, self.to_pins.spec)

    @property
    def is_from_cable(self):
        """
        True if self runs from a cable segment
        """

        return self.from_feature_type == self.network.segment_type

    @property
    def is_to_cable(self):
        """
        True if self runs to a cable segment
        """

        return self.to_feature_type == self.network.segment_type

    @property
    def is_splice(self):
        """
        True if self connects two cables
        """

        return self.is_from_cable and self.is_to_cable

    @property
    def to_feature_type(self):
        """
        The feature type that self connects to
        """

        return self.to_ref.feature_type

    @property
    def from_feature_type(self):
        """
        The feature type that self connects to
        """

        return self.from_ref.feature_type

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

    # ------------------------------------------------------------------------------
    #                                   PIN MAPPING
    # ------------------------------------------------------------------------------

    def pinPairs(self):
        """
        Yields from,to pairs of self
        """

        # ENH: Check range sizes match

        to_pin = self.to_pins.low
        for from_pin in self.from_pins.range():
            yield from_pin, to_pin
            to_pin += 1

    def toPinsFor(self, from_pins):
        """
        The pins that FROM_PINS connect to

        Assumes FROM_PINS is within range"""

        return PinRange(
            self.to_pins.side, self.toPinFor(from_pins.low), self.toPinFor(from_pins.high)
        )

    def toPinFor(self, from_pin):
        """
        The pin that FROM_PIN connects to

        Assumes FROM_PIN is within range"""

        return self.to_pins.low + (from_pin - self.from_pins.low)

    def fromPinFor(self, to_pin):
        """
        The pin that TO_PIN connects to

        Assumes TO_PIN is within range"""

        return self.from_pins.low + (to_pin - self.to_pins.low)

    # ------------------------------------------------------------------------------
    #                                   SERIALISATION
    # ------------------------------------------------------------------------------

    def definition(self):
        """
        Self in JSON-serialisable form
        """

        defn = {}

        defn["urn"] = self.conn_rec._urn()
        defn["forward"] = self.forward
        defn["from_feature"] = self.from_ref.urn()
        defn["from_pins"] = self.from_pins.definition()
        defn["to_feature"] = self.to_ref.urn()
        defn["to_pins"] = self.to_pins.definition()

        # For cable segments, add cable
        if self.is_from_cable:
            defn["from_cable"] = self.fromFeatureRec().cable
            defn["from_cable_side"] = self.from_pins.otherSide()

        if self.is_to_cable:
            defn["to_cable"] = self.toFeatureRec().cable
            defn["to_cable_side"] = self.to_pins.otherSide()

        # For delta records, add name of owner
        # ENH: Duplicated with myw_feature_model_mixin
        # ENH: Make optional
        delta = self.db_view.delta
        if delta is not None:
            delta_owner = self.db_view.get(delta)
            defn["delta"] = {"name": delta, "title": delta_owner._title()}

        return defn

    def asRec(self, **extra_fields):
        """
        Self as a pseudo-record

        Used for export"""

        rec = {**extra_fields}
        rec["in_object"] = self.from_ref.urn()
        rec["in_side"] = self.from_pins.side
        rec["in_low"] = self.from_pins.low
        rec["in_high"] = self.from_pins.high
        rec["out_object"] = self.to_ref.urn()
        rec["out_side"] = self.to_pins.side
        rec["out_low"] = self.to_pins.low
        rec["out_high"] = self.to_pins.high
        rec["housing"] = self.conn_rec.housing

        return rec

    def features(self):
        """
        The features referenced in self

        Returns a set of features"""

        features = set()

        features.add(self.fromFeatureRec())
        features.add(self.toFeatureRec())

        # For cable segments, add cable
        if self.is_from_cable:
            features.add(self.fromFeatureRec()._field("cable").rec())

        if self.is_to_cable:
            features.add(self.toFeatureRec()._field("cable").rec())

        return features
