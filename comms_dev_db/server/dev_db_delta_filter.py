# Copyright: IQGeo Limited 2010-2023


class DevDbDeltaFilter:
    """
    Engine for controlling which proposed records are shown in GUI

    Example implementation"""

    # Gets loaded from __init__.py

    def __init__(self, nw_view, progress):
        """
        Init slots of self

        NW_VIEW is a NetworkView. PROGRESS is a MywProgressHandler"""

        self.nw_view = nw_view
        self.db_view = nw_view.db_view
        self.progress = progress

    def include(self, rec):
        """
        True if REC should be included when displaying proposed features in GUI

        Overridden to exclude designs of type 'Network Upgrade'
        """

        design = self.db_view.get(rec.myw_delta)

        if design is not None and hasattr(design, "type"):
            return design.type != "Network Upgrade"

        return True


# ==============================================================================
#                               REGISTRATION
# ==============================================================================

from myworldapp.modules.comms.server.api.network_view import NetworkView

NetworkView.delta_filter = DevDbDeltaFilter
