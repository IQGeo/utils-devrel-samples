# Copyright: IQGeo Limited 2010-2023

from copy import copy
from myworldapp.core.server.base.core.myw_error import MywError
from .conn import Conn
from .network import Network


class ConnSet:
    """
    A set of connections from a given side of a feature

    Provides facilities for mapping from_pin -> to_pin etc"""

    # ------------------------------------------------------------------------------
    #                                 CONSTRUCTION
    # ------------------------------------------------------------------------------

    def __init__(self, feature, tech, side, field=None):
        """
        Init self from connection records on SIDE of FEATURE

        SIDE is 'in' or 'out'"""

        self.feature = feature
        self.side = side
        self.conns = []

        # Get connection records
        if not field:
            field = Network.types[tech].connections_field

        if field in feature._descriptor.fields:
            conn_recs = feature._field(field).recs()
        else:
            conn_recs = []

        # Build connection objects
        urn = feature._urn()
        for conn_rec in conn_recs:
            if (conn_rec.in_object == urn) and (conn_rec.in_side == side):
                self.conns.append(Conn(conn_rec, True))
            if (conn_rec.out_object == urn) and (conn_rec.out_side == side):
                self.conns.append(Conn(conn_rec, False))

        # Sort them
        sort_key = lambda conn: conn.from_pins.low
        self.conns.sort(key=sort_key)

    def intersect(self, from_pins):
        """
        The connections of self that run from FROM_PINS (a PinRange)

        Returns a ConnSet"""

        # Build subset of connections
        int_conns = []

        for conn in self.conns:
            int_conn = conn.intersect(from_pins)

            if int_conn:
                int_conns.append(int_conn)

        # Return shallow copy of self
        # ENH: Use contructor instead
        int_conn_set = copy(self)
        int_conn_set.conns = int_conns

        return int_conn_set

    def add(self, conn):
        """
        add a connection to the set
        """

        self.conns.append(conn)

    # ------------------------------------------------------------------------------
    #                                    PROPERTIES
    # ------------------------------------------------------------------------------

    def __ident__(self):
        """
        Identifying string for progress messages
        """

        return f"{self.__class__.__name__}({self.feature._urn()}, {self.side}, {len(self.conns)})"
        # ENH: Show info

    def __iter__(self):
        """
        Yields elements of self
        """

        return self.conns.__iter__()

    def size(self):
        """
        Number of elements in self
        """

        return len(self.conns)

    def connFor(self, from_pin):
        """
        Returns the connection of self that relates to FROM_PIN (if any)

        Returns a Conn (or None)"""

        # ENH: Return a new conn that just covers the requested pin?

        for conn in self.conns:
            if from_pin in conn.from_pins:
                return conn

        return None

    def fromPins(self):
        """
        Yields the pins that have a connection

        Yields:
         PIN
         CONN"""

        for conn in self.conns:
            for pin in conn.from_pins.range():
                yield pin, conn

    # ------------------------------------------------------------------------------
    #                                   SERIALISATION
    # ------------------------------------------------------------------------------

    def definition(self):
        """
        Self in JSON-serialisable form
        """

        conn_defs = []
        for conn in self.conns:
            conn_defs.append(conn.definition())

        return conn_defs
