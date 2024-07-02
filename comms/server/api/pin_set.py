################################################################################
# A set of network pin ranges
################################################################################
# Copyright: IQGeo Limited 2010-2023

from copy import copy
from .pin_range import PinRange


class PinSet(object):
    """
    A set of non-overlapping PinRanges
    """

    # ENH: Better as RangeSet?

    def __init__(self, side, low, high):
        """
        Init slots of self
        """

        self.side = side
        self.ranges = [PinRange(side, low, high)]

    def subtract(self, range):
        """
        A copy of self with RANGE excludes

        Returns a PinSet (or None)"""

        sub_ranges = []

        for self_range in self.ranges:
            for sub_range in self_range.subtract(range):
                sub_ranges.append(sub_range)

        sub_set = copy(self)
        sub_set.ranges = sub_ranges

        return sub_set

    def __str__(self):
        """
        Identifying string for progress messages
        """

        return "{}({})".format(self.__class__.__name__, self.spec)

    @property
    def spec(self):
        """
        Full string representation of self
        """

        range_specs = [r.rangeSpec() for r in self.ranges]

        return "{}-{}".format(self.side, ",".join(range_specs))
