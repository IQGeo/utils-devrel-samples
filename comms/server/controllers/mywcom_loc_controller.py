from pyramid.view import view_config
import json

from myworldapp.core.server.base.db.globals import Session
from myworldapp.modules.comms.server.api.network_view import NetworkView

from myworldapp.core.server.controllers.base.myw_feature_collection import (
    MywFeatureCollection,
)
from myworldapp.modules.comms.server.controllers.mywcom_controller import (
    MywcomController,
)


class MywcomLocController(MywcomController):
    """
    Tracing logic in this class is based on the NM show terminations code
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "LOGICAL COUNTS")

    @view_config(
        route_name="mywcom_loc_controller.ripple_trace",
        request_method="GET",
        renderer="json",
    )
    def ripple_trace(self):
        """
        Performs a ripple trace. Basically, a normal pin level trace with connectivity information returned
        that will then be used to update line of count information
        """

        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)
        do_update = self.get_param(self.request, "update", default=False)

        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        side = self.get_param(self.request, "side")
        config = self.get_param(self.request, "config")
        config = json.loads(config) if config else None

        # Check authorised
        self.current_user.assertAuthorized(self.request, feature_type=feature_type, application=app)

        db_view = self.db.view(delta)
        nw_view = NetworkView(db_view)
        loc_mgr = nw_view.loc_mgr

        result = loc_mgr.rippleTrace(feature_type, id, side=side, config=config)

        # Update loc segment records along the trace if asked to.
        if do_update:
            feature = db_view.get(f"{feature_type}/{id}")
            loc_mgr.rippleUpdate(result, feature, side=side)

        return result

    @view_config(
        route_name="mywcom_loc_controller.ripple_trace_update",
        request_method="POST",
        renderer="json",
    )
    def ripple_trace_update(self):
        """
        Performs a ripple trace and then update.
        """

        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)

        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        side = self.get_param(self.request, "side")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, right="editFeatures", feature_type="mywcom_line_of_count", application=app
        )

        db_view = self.db.view(delta)
        nw_view = NetworkView(db_view)
        loc_mgr = nw_view.loc_mgr

        result = loc_mgr.rippleTrace(feature_type, id, side=side)

        feature = db_view.get(f"{feature_type}/{id}")
        loc_mgr.rippleUpdate(result, feature, side=side)

        Session.commit()

        return result

    @view_config(
        route_name="mywcom_loc_controller.get_loc",
        request_method="POST",
        renderer="json",
    )
    def get_loc(self):
        """
        Fetch line of count information for multiple features
        """

        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        feature_qurns = json.loads(self.get_param(self.request, "urns", mandatory=True))
        include_proposed = self.get_param(
            self.request, "include_proposed", default=False, type=bool
        )

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type="mywcom_line_of_count", application=app
        )

        db_view = self.db.view(delta)
        nw_view = NetworkView(db_view)
        loc_mgr = nw_view.loc_mgr

        feature_loc = loc_mgr.getLocMany(feature_qurns, include_proposed=include_proposed)

        return feature_loc

    @view_config(
        route_name="mywcom_loc_controller.get_loc_details",
        request_method="POST",
        renderer="json",
    )
    def get_loc_details(self):
        """
        Fetch line of count information for multiple features
        """

        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        feature_qurns = json.loads(self.get_param(self.request, "urns", mandatory=True))
        include_proposed = self.get_param(
            self.request, "include_proposed", default=False, type=bool
        )

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type="mywcom_line_of_count", application=app
        )

        db_view = self.db.view(delta)
        nw_view = NetworkView(db_view)
        loc_mgr = nw_view.loc_mgr

        loc_data = loc_mgr.getLocDetailsMany(feature_qurns, include_proposed=include_proposed)

        return loc_data

    @view_config(
        route_name="mywcom_loc_controller.update_loc",
        request_method="POST",
        renderer="json",
    )
    def update_loc(self):
        """
        Updates line of count information for multiple features
        """

        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        feature_loc = self.get_param(self.request, "feature_loc")
        mark_stale = self.get_param(self.request, "mark_stale", default=False, type=bool)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, right="editFeatures", feature_type="mywcom_line_of_count", application=app
        )

        db_view = self.db.view(delta)
        nw_view = NetworkView(db_view)
        loc_mgr = nw_view.loc_mgr

        feature_loc = json.loads(feature_loc)

        loc_mgr.updateLocMany(feature_loc,mark_stale)

        feature_qurns = feature_loc.keys()

        Session.commit()

        loc_data = loc_mgr.getLocMany(feature_qurns)

        return loc_data

    @view_config(
        route_name="mywcom_loc_controller.ripple_deletions",
        request_method="POST",
        renderer="json",
    )
    def ripple_deletions(self):

        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)

        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        data = self.get_param(self.request, "loc_data")
        side = self.get_param(self.request, "side")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, right="editFeatures", feature_type=feature_type, application=app
        )

        db_view = self.db.view(delta)
        nw_view = NetworkView(db_view)
        loc_mgr = nw_view.loc_mgr

        feature = db_view.get(f"{feature_type}/{id}")

        updates = loc_mgr.rippleDeletions(feature, side=side)

        Session.commit()

        return {"update": updates}

    @view_config(
        route_name="mywcom_loc_controller.disconnect_loc",
        request_method="POST",
        renderer="json",
    )
    def disconnect_loc(self):
        """
        Updates line of count information after a disconnect
        """

        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)
        side = self.get_param(self.request, "side")
        ripple = self.get_param(self.request, "ripple", default=False, type=bool)

        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, right="editFeatures", feature_type="mywcom_line_of_count", application=app
        )

        db_view = self.db.view(delta)
        nw_view = NetworkView(db_view)
        loc_mgr = nw_view.loc_mgr

        feature = db_view.get(f"{feature_type}/{id}")

        result = loc_mgr.disconnectLoc(feature, side=side, ripple=ripple)

        Session.commit()

        return result

    @view_config(
        route_name="mywcom_loc_controller.connect_loc",
        request_method="POST",
        renderer="json",
    )
    def connect_loc(self):
        """
        Updates line of count information after a connection. Connection record is passed in.
        """

        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)
        ripple = self.get_param(self.request, "ripple", default=False, type=bool)

        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, right="editFeatures", feature_type=feature_type, application=app
        )

        db_view = self.db.view(delta)
        nw_view = NetworkView(db_view)
        loc_mgr = nw_view.loc_mgr

        # Get connection record
        feature = db_view.get(f"{feature_type}/{id}")

        result = loc_mgr.connectLoc(feature, ripple=ripple)

        Session.commit()

        return result
