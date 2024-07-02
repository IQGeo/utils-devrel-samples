###############################################################################
# Controller for managing conduits
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import geojson
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.controllers.base.myw_feature_collection import MywFeatureCollection
from myworldapp.modules.comms.server.base.readonly_feature_view import ReadonlyFeatureView

from .utils import handling_exceptions
from .mywcom_controller import MywcomController


class MywcomConduitController(MywcomController):
    """
    Controller for managing conduits
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "CONDUIT")

    @view_config(
        route_name="mywcom_conduit_controller.continuous_conduits",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def continuous_conduits(self):
        """
        Returns ordered chain of continuous conduits
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        # Get manager
        db_view = ReadonlyFeatureView(self.db.view(delta))
        conduit_mgr = self.networkView(db_view).conduit_mgr

        # Get feature record
        conduit_rec = self.featureRec(db_view, feature_type, id)

        # Build chain
        conduits = conduit_mgr.conduitChain(conduit_rec)

        # Map recs -> feature collection
        features = self.featuresFromRecs(conduits)

        return MywFeatureCollection(features)

    # ------------------------------------------------------------------------------
    #                                   ROUTING
    # ------------------------------------------------------------------------------

    @view_config(
        route_name="mywcom_conduit_controller.find_path", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def find_path(self):
        """
        Find path through routes network linking given structures

        Returns a list of routes in order"""

        # ENH: similar code in cable controller, move to super class

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        struct_urns = self.get_param(self.request, "structures", "json", mandatory=True)
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        # Get manager
        db_view = ReadonlyFeatureView(self.db.view(delta))
        conduit_mgr = self.networkView(db_view).conduit_mgr

        # Find structures
        structs = []
        for urn in struct_urns:
            struct = db_view.get(urn)
            if not struct:
                raise exc.HTTPForbidden()
            structs.append(struct)

        # Find path that links them
        routes = conduit_mgr.findPath(structs, feature_type)

        # Map recs -> feature collection
        features = self.featuresFromRecs(routes)

        return MywFeatureCollection(features)

    @view_config(
        route_name="mywcom_conduit_controller.route", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def route(self):
        """
        Find path through routes network linking given structures
        and insert new conduits. Returns conduits created
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        delta = self.get_param(self.request, "delta")
        num_paths = self.get_param(self.request, "num_paths", type=int, mandatory=True)
        feature_json = self.get_param(self.request, "feature", "json", mandatory=True)
        struct_urns = self.get_param(self.request, "structures", "json", mandatory=True)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
            right="editFeatures",
        )

        # geojson feature
        feature = geojson.Feature(**feature_json)

        # Get manager
        db_view = self.db.view(delta)
        conduit_mgr = self.networkView(db_view).conduit_mgr

        # Find structures
        structs = []
        for urn in struct_urns:
            struct = db_view.get(urn)
            if not struct:
                raise exc.HTTPForbidden()
            structs.append(struct)

        # Do the routing
        conduits = conduit_mgr.routeConduit(feature_type, feature, structs, num_paths)

        Session.commit()

        # Map recs -> feature collection
        features = self.featuresFromRecs(conduits)

        return MywFeatureCollection(features)

    # ==============================================================================
    #                                   CONDUIT MANAGEMENT
    # ==============================================================================

    @view_config(
        route_name="mywcom_conduit_controller.connect", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def connect(self):
        """
        Connect the conduits at the structure
        """

        # Unpick parameters
        app = self.get_param(self.request, "application")
        struct_feature_type = self.get_param(self.request, "struct_ft")
        struct_id = self.get_param(self.request, "struct_id")
        conduit1_feature_type = self.get_param(self.request, "cnd1_ft")
        conduit1_id = self.get_param(self.request, "cnd1_id")
        conduit2_feature_type = self.get_param(self.request, "cnd2_ft")
        conduit2_id = self.get_param(self.request, "cnd2_id")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=struct_feature_type, application=app
        )
        self.current_user.assertAuthorized(
            self.request, feature_type=conduit1_feature_type, application=app, right="editFeatures"
        )
        self.current_user.assertAuthorized(
            self.request, feature_type=conduit2_feature_type, application=app, right="editFeatures"
        )

        # Get manager
        db_view = self.db.view(delta)
        conduit_mgr = self.networkView(db_view).conduit_mgr

        # Get feature records
        struct = self.featureRec(db_view, struct_feature_type, struct_id)
        conduit1 = self.featureRec(db_view, conduit1_feature_type, conduit1_id)
        conduit2 = self.featureRec(db_view, conduit2_feature_type, conduit2_id)

        # Connect ends
        conduit_mgr.connect(struct, conduit1, conduit2)

        Session.commit()

        return {"ok": True}  # ENH: Return something useful

    @view_config(
        route_name="mywcom_conduit_controller.disconnect", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def disconnect(self):
        """
        Disconnect/cut the conduit at structure
        """

        # Unpick parameters
        app = self.get_param(self.request, "application")
        conduit_feature_type = self.get_param(self.request, "conduit_ft")
        struct_feature_type = self.get_param(self.request, "struct_ft")
        conduit_id = self.get_param(self.request, "conduit_id")
        struct_id = self.get_param(self.request, "struct_id")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=conduit_feature_type, application=app, right="editFeatures"
        )
        self.current_user.assertAuthorized(
            self.request, feature_type=struct_feature_type, application=app
        )

        # Get manager
        db_view = self.db.view(delta)
        conduit_mgr = self.networkView(db_view).conduit_mgr

        # Get feature records
        conduit = self.featureRec(db_view, conduit_feature_type, conduit_id)
        struct = self.featureRec(db_view, struct_feature_type, struct_id)

        # Disconnect ends
        conduit_mgr.disconnectConduitAt(conduit, struct)
        Session.commit()

        return {"ok": True}

    @view_config(
        route_name="mywcom_conduit_controller.move_into", request_method="POST", renderer="json"
    )
    @view_config(
        route_name="mywcom_conduit_controller.move_cable_into",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def set_housing(self):
        """
        Move a cable segment or conduit to a new housing in same route

        Deals with propagation of changes when moving a cable into/out of a continuous conduit"""

        # Unpick args
        feature_id = self.get_param(self.request, "feature_id")
        housing_feature_type = self.get_param(self.request, "housing_ft")
        housing_id = self.get_param(self.request, "housing_id")
        app = self.get_param(self.request, "application")
        feature_type = self.get_param(self.request, "feature_type")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=housing_feature_type, application=app
        )
        self.current_user.assertAuthorized(
            self.request, feature_type=feature_type, application=app, right="editFeatures"
        )

        # Get managers
        db_view = self.db.view(delta)
        nw_view = self.networkView(db_view)

        # Get feature record
        new_housing_rec = self.featureRec(db_view, housing_feature_type, housing_id)
        contained_rec = self.featureRec(db_view, feature_type, feature_id)

        # Move
        nw_view = self.networkView(db_view)
        mgr = nw_view.managerFor(contained_rec)

        self.progress(2, "Change housing ", mgr, contained_rec, new_housing_rec)
        mgr.moveToHousing(contained_rec, new_housing_rec)

        Session.commit()

        return {"ok": True}  # ENH: Return feature
