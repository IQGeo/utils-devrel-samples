# Set tick marks on mywcom_fiber_segments

import os, base64
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.modules.comms.server.api.network_view import NetworkView


class Engine:
    """
    Engine for setting in_tick and out_tick of mywcom_fiber_segment
    """

    feature_types = ["fiber_cable"]

    def __init__(self, db, trace_level):
        """
        Init slots of self

        DB is a MywDatabase"""

        self.db_view = db.view()
        self.progress = MywSimpleProgressHandler(trace_level)
        self.data_dir = MywProduct().moduleOf(__file__).file("data")
        self.nw_view = NetworkView(self.db_view, self.progress)

    def setTickMarks(self, feature_type):
        """
        Set ticks marks for record of FEATURE_TYPE
        """

        with self.progress.operation("Setting tick marks for", feature_type):
            increment = True
            table = self.db_view.table(feature_type)
            for rec in table.orderBy("id"):
                self.setTickMarksFor(rec, increment)
                if increment is True:
                    increment = False
                else:
                    increment = True

    def setTickMarksFor(self, rec, increment):
        """
        Set tick marks of REC
        If increment starts from 0 ticks go up, else starts from total cable length and ticks go down
        """

        # Get table
        segs = self.nw_view.cable_mgr.orderedSegments(rec)
        tab = segs[0]._view.table(segs[0].feature_type)

        spec = rec._field("specification").rec()
        if not spec:
            return
        tick_spacing = spec.tick_mark_spacing

        # Dont add ticks to internal cables
        if len(segs) == 1 and segs[0].in_structure == segs[0].out_structure:
            return

        # Get total cable length if necesary
        tick = 0
        if increment is False:
            totalCableLength = 0
            for seg in segs:
                totalCableLength += seg.length or seg._primary_geom_field.geoLength()

            tick = totalCableLength / tick_spacing

        # For each seg...
        for seg in segs:
            # Update in_tick and out_tick
            if "mywcom_route_junction" not in seg.in_structure:
                seg.in_tick = tick

            length = seg.length or seg._primary_geom_field.geoLength()

            if increment:
                tick += length / tick_spacing
            else:
                tick -= length / tick_spacing

            if "mywcom_route_junction" not in seg.out_structure:
                seg.out_tick = tick

            tab.update(seg)


# ==============================================================================
#
# ==============================================================================

# pylint: disable=undefined-variable
engine = Engine(db, 1)

for feature_type in engine.feature_types:
    engine.setTickMarks(feature_type)
