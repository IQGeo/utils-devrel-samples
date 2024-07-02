###############################################################################
# Controller for managing routes and structures
###############################################################################
# Copyright: IQGeo Limited 2010-2023
import json, geojson
from geojson import loads as geojson_loads
from pyramid.view import view_config

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.controllers.base.myw_feature_collection import (
    MywFeatureCollection,
)

from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.base.readonly_feature_view import (
    ReadonlyFeatureView,
)

from myworldapp.core.server.controllers.base.myw_utils import mywAbort
from myworldapp.core.server.base.core.myw_error import MywError

from .utils import handling_exceptions
from .mywcom_controller import MywcomController
from myworldapp.modules.comms.server.api.manager import Manager


class MywcomStructureController(MywcomController):
    """
    Controller for managing routes and structures
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "STRUCTURE")

    @view_config(
        route_name="mywcom_structure_controller.struct_contents",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def struct_contents(self):
        """
        Returns contents of structure

        Returns dict with keys:
         conduits       FeatureCollection
         conduit_runs   FeatureCollection
         cable_segs     FeatureCollection
         cables         FeatureCollection
         conns          FeatureCollection
         equip          FeatureCollection
         seg_circuits   Segment circuit infos
         port_circuits  Port circuit infos
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)
        include_proposed = self.get_param(
            self.request, "include_proposed", type=bool, default=False
        )
        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=feature_type, application=app
        )

        # Get views
        db_view = ReadonlyFeatureView(
            self.db.view(delta)
        )  # Use cached feature view for performance
        nw_view = self.networkView(db_view)

        # Get structure
        struct = self.featureRec(db_view, feature_type, id)

        # Get data
        conduits = nw_view.conduit_mgr.conduitsAt(struct, include_proposed)
        conduit_runs = nw_view.conduit_mgr.conduitRunsFor(conduits)
        segs = nw_view.cable_mgr.segmentsAt(struct, include_proposed)
        cables = nw_view.cable_mgr.cablesFor(segs)
        equips = nw_view.equip_mgr.equipsIn(struct, include_proposed)
        conns = nw_view.connection_mgr.connectionsIn(struct, include_proposed)
        circuit_segs = nw_view.circuit_mgr.circuitSegmentsAt(struct, include_proposed)
        circuit_ports = nw_view.circuit_mgr.circuitPortsAt(struct, include_proposed)

        # Encode it
        return {
            "conduits": self._asFeatureCollection(db_view, conduits),
            "conduit_runs": self._asFeatureCollection(db_view, conduit_runs),
            "cable_segs": self._asFeatureCollection(db_view, segs),
            "cables": self._asFeatureCollection(db_view, cables),
            "equip": self._asFeatureCollection(db_view, equips),
            "conns": self._asFeatureCollection(db_view, conns),
            "seg_circuits": circuit_segs,
            "port_circuits": circuit_ports,
        }  # ENH: Merge these into circuits?

    @view_config(
        route_name="mywcom_structure_controller.route_contents",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def route_contents(self):
        """
        Returns contents of route

        Returns dict with keys:
         conduits      FeatureCollection
         conduit_runs  FeatureCollection
         cable_segs    FeatureCollection
         cables        FeatureCollection
         circuits      ?
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)
        include_proposed = self.get_param(
            self.request, "include_proposed", type=bool, default=False
        )
        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=feature_type, application=app
        )

        # Get views
        db_view = ReadonlyFeatureView(
            self.db.view(delta)
        )  # Use cached feature view for performance
        nw_view = self.networkView(db_view)

        # Get route
        route = self.featureRec(db_view, feature_type, id)

        # Get data
        conduits = nw_view.conduit_mgr.conduitsIn(route, include_proposed)
        conduit_runs = nw_view.conduit_mgr.conduitRunsFor(conduits)
        segs = nw_view.cable_mgr.segmentsIn(route, include_proposed)
        cables = nw_view.cable_mgr.cablesFor(segs)
        circuit_segs = nw_view.circuit_mgr.circuitSegmentsIn(route, include_proposed)

        # Encode it
        return {
            "conduits": self._asFeatureCollection(db_view, conduits),
            "conduit_runs": self._asFeatureCollection(db_view, conduit_runs),
            "cable_segs": self._asFeatureCollection(db_view, segs),
            "cables": self._asFeatureCollection(db_view, cables),
            "circuits": circuit_segs,
        }

    @view_config(
        route_name="mywcom_structure_controller.route_split",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def route_split(self):
        """
        Splits routes on structs along inner coords
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)
        include_proposed = self.get_param(
            self.request, "include_proposed", type=bool, default=False
        )
        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=feature_type, application=app
        )

        # Get views
        db_view = self.db.view(delta)
        nw_view = self.networkView(db_view)

        # Get route
        route = self.featureRec(db_view, feature_type, id)

        # Split it
        routes = nw_view.struct_mgr.splitRoute(route)

        Session.commit()

        # Return routes
        features = self.featuresFromRecs(routes)
        return MywFeatureCollection(features)

    def _asFeatureCollection(self, db_view, recs):
        """
        Serialize RECS
        """

        features = self.featuresFromRecs(recs, current_delta=db_view.delta)

        return MywFeatureCollection(features)

    @view_config(
        route_name="mywcom_structure_controller.replace_structure",
        request_method="POST",
        renderer="json",
    )
    def replace_structure(self):
        """
        Reconnect routes to new structure
        """
        # get params from api
        feature_json = self.get_param(self.request, "feature", "json", mandatory=True)
        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        newFeature = self.get_param(self.request, "new_feature_type", mandatory=True)
        id = self.get_param(self.request, "id", mandatory=True)
        delta = self.get_param(self.request, "delta")
        app = self.get_param(self.request, "application")

        # check if authorized
        self.current_user.assertAuthorized(
            self.request, feature_type=feature_type, application=app
        )

        # convert feature to geojson
        feature = geojson.Feature(**feature_json)

        # get views
        db_view = self.db.view(delta)
        nw_view = self.networkView(db_view)
        try:
            # replace structure
            newStructure = nw_view.struct_mgr.replaceStructureWith(
                feature, feature_type, id, newFeature
            )

            Session.commit()

            return newStructure.asGeojsonFeature()
        except MywError as cond:
            params = {"insertError": True}
            mywAbort(cond, **params)
