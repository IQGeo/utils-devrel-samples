################################################################################
# A network pin range
################################################################################
# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError


class PinRange(object):
    """
    A contiguous set of connection pins on a given side of a feature

    Provides facilities for parsing from strings, computing range, .."""

    @classmethod
    def parse(self, spec):
        """
        Create a range for string representation SPEC

         SPEC is a string of the form:
           <side> : <low> [ : <high> ]"""

        # Split into components
        # ENH: Use a regex
        parts = spec.split(":")

        n_parts = len(parts)
        if (n_parts < 2) or (n_parts > 3):
            raise MywError("Bad pin spec:", spec)

        # Extract properties
        side = parts[0]
        low_str = parts[1]
        high_str = parts[2] if (n_parts > 2) else low_str

        if side not in ["in", "out"]:
            raise MywError("Bad pin spec:", spec)

        # Create
        return PinRange(side, int(low_str), int(high_str))

    def __init__(self, side, low, high=None):
        """
        Init slots of self
        """

        if high == None:
            high = low

        self.side = side
        self.low = low
        self.high = high

    def __str__(self):
        """
        Identifying string for progress messages
        """

        return "{}({}:{}:{})".format(self.__class__.__name__, self.side, self.low, self.high)

    def definition(self):
        """
        Self as a dict
        """

        defn = {}
        defn["side"] = self.side
        defn["low"] = self.low
        defn["high"] = self.high

        return defn

    @property
    def spec(self):
        """
        Full string representation of self
        """

        return "{}:{}".format(self.side, self.rangeSpec())

    def rangeSpec(self):
        """
        String representation of self's pin range
        """

        spec = str(self.low)
        if self.high != self.low:
            spec += ":" + str(self.high)

        return spec

    def __contains__(self, other):
        """
        'in' operator

        OTHER is a PinRange or int"""

        if isinstance(other, PinRange):
            return self.__contains__(other.low) and self.__contains__(other.high)

        return self.low <= other <= self.high

    def range(self):
        """
        Iteration range
        """
        # ENH: Make class an iterator

        return range(self.low, self.high + 1)

    def intersect(self, other):
        """
        The pins of self that match OTHER (if any)

        Returns a PinRange (or None)"""

        if self.low > other.high:
            return None
        if self.high < other.low:
            return None

        return PinRange(self.side, max(self.low, other.low), min(self.high, other.high))

    def subtract(self, other):
        """
        The pins of self that are not in OTHER

        Returns a list of PinRanges"""

        pin_ranges = []

        if self.low < other.low:
            pin_range = PinRange(self.side, self.low, min(other.low - 1, self.high))
            pin_ranges.append(pin_range)

        if self.high > other.high:
            pin_range = PinRange(self.side, max(self.low, other.high + 1), self.high)
            pin_ranges.append(pin_range)

        return pin_ranges

    @property
    def size(self):
        """
        Size of self's range
        """

        return 1 + (self.high - self.low)

    def otherSide(self):
        """
        The other side from self
        """

        if self.side == "in":
            return "out"
        if self.side == "out":
            return "in"
        raise MywError("Bad side:", self.side)
