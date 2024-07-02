# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_error import MywError

from myworldapp.modules.comms.server.base.readonly_feature_view import (
    ReadonlyFeatureView,
)
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.networks.mywcom_graph_network_engine import (
    MywcomGraphNetworkEngine,
)


class MywcomCableNetworkEngine(MywcomGraphNetworkEngine):
    """
    A network engine for tracing cable network
    """

    def __init__(self, db_view, network_def, extra_filters={}, progress=MywProgressHandler()):
        # Use cache db view (for speed)
        db_view = ReadonlyFeatureView(db_view)
        nw_view = NetworkView(db_view)
        self.cable_mgr = nw_view.cable_mgr

        super().__init__(db_view, network_def, extra_filters, progress)

    def _getFeaturesFor(self, feature, direction):
        """
        Returns features found following the configured field for DIRECTION
        DIRECTION is one of 'upstream' or 'downstream'
        Subclassed to handle getting in and out fiber segments - replicating
        client side methods
        """

        # Get field containing connection info
        field_name = self.featurePropFieldName(feature.feature_type, direction)
        if not field_name:
            return []

        struct_urn = feature._urn()

        if field_name == "in_fiber_segments":
            segs = self.cable_mgr.segmentsAt(feature)
            recs = [seg for seg in segs if seg.out_structure == struct_urn]
        elif field_name == "out_fiber_segments":
            segs = self.cable_mgr.segmentsAt(feature)
            recs = [seg for seg in segs if seg.in_structure == struct_urn]
        else:
            recs = feature._field(field_name).recs(skip_bad_refs=True)

        # Apply filters
        return list(filter(self.includes, recs))
