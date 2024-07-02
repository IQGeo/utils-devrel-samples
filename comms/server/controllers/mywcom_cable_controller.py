###############################################################################
# Controller for managing cable substructure
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import json, geojson
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.core.server.controllers.base.myw_feature_collection import (
    MywFeatureCollection,
)

from .utils import handling_exceptions
from .mywcom_controller import MywcomController


class MywcomCableController(MywcomController):
    """
    Controller for managing cable substructure and derived properties
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "CABLE")

    @view_config(
        route_name="mywcom_cable_controller.equip_cables",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def equip_cables(self):
        """
        Find cables connected to given equipment feature

        Navigates connections to determine associated cables

        Returns a set of cable features"""

        # ENH: Move to separate controller

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
        db_view = self.db.view(delta)
        cable_mgr = self.networkView(db_view).cable_mgr

        # Find equipment
        equip = db_view.table(feature_type).get(id)
        if not equip:
            raise exc.HTTPForbidden()

        # For each technology ... find URNS of connected segments
        # ENH: Delegate to equipment manager?
        seg_urns = set()
        for network in cable_mgr.nw_view.networks.values():

            # Skip network/tech if equipment has no connections for technology
            conn_field = network.connections_field
            field_desc = equip._descriptor.fields.get(conn_field)
            if not field_desc:
                continue

            # For each connection record ..
            for conn_rec in equip._field(
                conn_field
            ).recs():  # ENH: Replace with call to connectionManager.connectionsOf()

                # If it goes to a cable segment ... get its cable
                if conn_rec.in_object == equip._urn():
                    ref = MywReference.parseUrn(conn_rec.out_object)
                    if ref.feature_type == network.segment_type:
                        seg_urns.add(ref.urn())

                if conn_rec.out_object == equip._urn():
                    ref = MywReference.parseUrn(conn_rec.in_object)
                    if ref.feature_type == network.segment_type:
                        seg_urns.add(ref.urn())

        # Map segment URNs -> cable URNs
        cable_urns = set()
        for seg_rec in db_view.getRecs(seg_urns):
            cable_urns.add(seg_rec.cable)

        # Get cable records
        cable_recs = db_view.getRecs(cable_urns)

        # Map recs -> feature collection
        features = self.featuresFromRecs(cable_recs)

        return MywFeatureCollection(features)

    # ------------------------------------------------------------------------------
    #                                   ROUTING
    # ------------------------------------------------------------------------------

    @view_config(
        route_name="mywcom_cable_controller.find_path",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def find_path(self):
        """
        Find path through routes network linking given structures

        Returns a list of (route,forward) tuples"""

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        struct_urns = self.get_param(self.request, "structures", "json", mandatory=True)
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, application=self.get_param(self.request, "application")
        )

        # Find structures
        db_view = self.db.view(delta)
        cable_mgr = self.networkView(db_view).cable_mgr

        structs = []
        for urn in struct_urns:
            struct = db_view.get(urn)
            if not struct:
                raise exc.HTTPForbidden()
            structs.append(struct)

        # Find path that links them
        route_infos = cable_mgr.findPath(structs, feature_type)

        # Return route info
        return {
            "routes": [
                [route[0].asGeojsonFeature(include_lobs=False), route[1]]
                for route in route_infos
            ]
        }

    @view_config(
        route_name="mywcom_cable_controller.route_cable",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def route_cable(self):
        """
        Route cable ID through the given structures
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        struct_urns = self.get_param(self.request, "structures", "json", mandatory=True)
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
            right="editFeatures",
        )

        db_view = self.db.view(delta)
        cable_mgr = self.networkView(db_view).cable_mgr

        # Find cable
        cable = db_view.table(feature_type).get(id)
        if not cable:
            raise exc.HTTPForbidden()

        # Find structures to route via
        structs = []
        for urn in struct_urns:
            struct = db_view.get(urn)
            if not struct:
                raise exc.HTTPForbidden()
            structs.append(struct)

        # Route the cable
        routes = cable_mgr.findPath(structs, feature_type)
        cable_mgr.route(cable, *routes)
        cable_mgr.buildPlacementGeometry(cable, structs)

        Session.commit()

        # Return updated cable object
        return {"cable": cable.asGeojsonFeature(include_lobs=False)}

    @view_config(
        route_name="mywcom_cable_controller.reroute_cable",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def reroute_cable(self):
        """
        Update route of cable ID

        Retains connections and existing segments where possible. Supports dry run

        Returns dict with member:
          cable
          add_routes
          remove_routes
          same_routes
          affected_structures"""

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        struct_urns = self.get_param(self.request, "structures", "json", mandatory=True)
        delta = self.get_param(self.request, "delta")
        dry_run = self.get_param(self.request, "dry_run", type=bool)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
            right="editFeatures",
        )

        # Get manager
        db_view = self.db.view(delta)
        cable_mgr = self.networkView(db_view).cable_mgr

        # Find cable
        cable = db_view.table(feature_type).get(id)
        if not cable:
            raise exc.HTTPForbidden()

        # Find structures to route via
        structs = []
        for urn in struct_urns:
            struct = db_view.get(urn)
            if not struct:
                raise exc.HTTPForbidden()
            structs.append(struct)

        # Route the cable
        routes = cable_mgr.findPath(structs, feature_type)
        changes = cable_mgr.update_route(cable, dry_run, *routes)

        if not dry_run:
            cable_mgr.buildPlacementGeometry(cable, structs)
            Session.commit()

        # Build result
        changes["cable"] = cable.asGeojsonFeature(include_lobs=False)
        changes["add_routes"] = self.featuresFromRecs(changes["add_routes"])
        changes["remove_routes"] = self.featuresFromRecs(changes["remove_routes"])
        changes["same_routes"] = self.featuresFromRecs(changes["same_routes"])

        for urn, entry in changes["affected_structures"].items():
            f = db_view.get(urn)
            if f:
                entry["feature"] = f.asGeojsonFeature(include_lobs=False)

        return changes

    # ------------------------------------------------------------------------------
    #                                CONNECTIONS
    # ------------------------------------------------------------------------------

    @view_config(
        route_name="mywcom_cable_controller.connections",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def connections(self):
        """
        Returns connections for cable (for all technology)
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        delta = self.get_param(self.request, "delta")
        sort = self.get_param(self.request, "sort", type=bool)
        splice = self.get_param(self.request, "splice", type=bool)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        # Get manager
        db_view = self.db.view(delta)
        cable_mgr = self.networkView(db_view).cable_mgr

        # Find cable
        cable = self.featureRec(db_view, feature_type, id)

        # Get the connections
        conn_recs = cable_mgr.connectionsFor(cable, is_splice=splice, sort=sort)

        # Map recs -> feature collection
        features = self.featuresFromRecs(conn_recs)

        return MywFeatureCollection(features)

    @view_config(
        route_name="mywcom_cable_controller.highest_connected",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def highest_connected_pin(self):
        """
        Returns highest number fiber of a cable that is connected (0 if none)
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        delta = self.get_param(self.request, "delta")

        # Check authorized
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        # Get manager
        db_view = self.db.view(delta)
        cable_mgr = self.networkView(db_view).cable_mgr

        # Find cable
        cable = self.featureRec(db_view, feature_type, id)

        # Get top pin
        return {"high": cable_mgr.highestConnectedPin(cable)}

    @view_config(
        route_name="mywcom_cable_controller.add_slack",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def add_slack(self):
        """
        Create slack at side of structure

        Returns new slack record"""

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.request.params.get("application"),
            right="editFeatures",
        )

        feature_json = self.get_param(self.request, "feature", "json", mandatory=True)
        seg_urn = self.get_param(self.request, "seg_urn", mandatory=True)
        side = self.get_param(self.request, "side", mandatory=True)
        delta = self.get_param(self.request, "delta")

        # Create new segment, update segment chain, transfer any connections
        feature = geojson.Feature(**feature_json)
        db_view = self.db.view(delta)
        cable_mgr = self.networkView(db_view).cable_mgr
        slack_rec = cable_mgr.addSlack(feature_type, feature, seg_urn, side)

        Session.commit()

        self.request.response.status_code = 201
        return slack_rec.asGeojsonFeature(include_lobs=False)

    @view_config(
        route_name="mywcom_cable_controller.split_slack",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def split_slack(self):
        """
        Splits Slack at given LENGTH

        Returns old and new slack record"""

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.request.params.get("application"),
            right="editFeatures",
        )

        id = self.get_param(self.request, "id")
        length = self.get_param(self.request, "length")
        delta = self.get_param(self.request, "delta")

        db_view = self.db.view(delta)

        slack_tab = db_view.table(feature_type)
        slack = slack_tab.get(id)

        cable_mgr = self.networkView(db_view).cable_mgr
        [slack_rec, new_slack_rec] = cable_mgr.splitSlack(slack, float(length))

        Session.commit()

        self.request.response.status_code = 201
        return {
            "old_slack": slack_rec.asGeojsonFeature(include_lobs=False),
            "new_slack": new_slack_rec.asGeojsonFeature(include_lobs=False),
        }

    @view_config(
        route_name="mywcom_cable_controller.split_cable",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def split_cable(self):
        """
        Splits cable at specificed segment in either forward or backward direction. Connect unconnected
        fibres if splice housing is provided
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "feature_id")
        delta = self.get_param(self.request, "delta")
        splice_housing = self.get_param(self.request, "splice_housing")
        seg_id = self.get_param(self.request, "seg_id")
        cut_forward = self.get_param(self.request, "cut_forward", type=bool)

        # Check authorized to edit
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        db_view = self.db.view(delta)
        cable_mgr = self.networkView(db_view).cable_mgr

        cable = self.featureRec(db_view, feature_type, id)

        if splice_housing:
            splice_housing = db_view.get(splice_housing)

        seg_table = cable_mgr.segmentTypeFor(cable)
        segment = self.featureRec(db_view, seg_table, seg_id)
        new_cable = cable_mgr.splitCableAt(cable, segment, cut_forward, splice_housing)

        Session.commit()

        return new_cable.asGeojsonFeature(include_lobs=False)
