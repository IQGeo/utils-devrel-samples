import traceback
from pyramid.view import view_config

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.controllers.myw_feature_controller import MywFeatureController

from myworldapp.modules.comms.server.api.network_view import NetworkView
from .utils import handling_exceptions


class MywcomFeatureController(MywFeatureController):
    """
    Controller for Comms feature routings

    Runs Comms triggers when features are inserted/updated/deleted
    """

    def __init__(self, request):
        """
        Initialize self
        """

        super().__init__(request)

        trace_level = self.request.registry.settings.get("myw.mywcom.options", {}).get(
            "log_level", 0
        )
        self.progress = MywSimpleProgressHandler(trace_level, "INFO: MYWCOM: FEATURE: ")

    # ------------------------------------------------------------------------------
    #                              SUBCLASSED METHODS
    # ------------------------------------------------------------------------------
    # These are cut-and-paste from Core

    # Prevent route end points from returning 404 not found errors
    @view_config(
        route_name="mywcom_feature_controller.transaction", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def transaction(self):
        return super().transaction()

    @view_config(
        route_name="mywcom_feature_controller.insert", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def create(self):
        return super().create()

    @view_config(
        route_name="mywcom_feature_controller.update_delete", request_method="PUT", renderer="json"
    )
    @handling_exceptions
    def update(self):
        return super().update()

    @view_config(route_name="mywcom_feature_controller.update_delete", request_method="DELETE")
    @handling_exceptions
    def delete(self):
        return super().delete()

    def _insertFeature(self, table, feature, update=True):
        """
        Insert the feature (running Comms triggers)
        """

        if update:
            key_field_desc = table.descriptor.key_field

            # Get supplied key (if there is one)
            id = feature.properties.get(key_field_desc.name)

            # Ignore supplied key for generated keys (to avoid messing up sequences)
            if id and key_field_desc.generator:
                del feature.properties[key_field_desc.name]
                id = None

            # Check for already exists
            rec = None
            if id:
                rec = table.get(id)

            if rec and update:
                return self._updateFeature(table, feature, id)

        self.commsPreInsertTrigger(table, feature)
        rec = super()._insertFeature(table, feature, update)
        self.commsPosInsertTrigger(table, rec)

        return rec

    def _updateFeature(self, table, feature, id=None):
        """
        Update the feature (running Comms triggers)
        """

        if not id:
            id = feature.properties[table.descriptor.key_field_name]

        # Get a handle on the record before update
        rec = table.get(id)

        orig_rec = None
        if rec:
            orig_rec = rec._clone()

        rec = super()._updateFeature(table, feature, id)
        self.commsPosUpdateTrigger(table, rec, orig_rec)

        return rec

    def _deleteFeature(self, table, feature=None, id=None, abort_if_none=False):
        """
        Deletes the feature (running Comms triggers)
        """

        if not id:
            id = feature.properties[table.descriptor.key_field_name]

        rec = table.get(id)

        self.commsPreDeleteTrigger(table, rec)
        rec = super()._deleteFeature(table, feature, id, abort_if_none)

        return rec

    # ------------------------------------------------------------------------------
    #                                  TRIGGERS
    # ------------------------------------------------------------------------------

    def commsPreInsertTrigger(self, table, feature):
        """
        Perform pre-insert actions
        """

        feature.feature_type = table.feature_type  # ENH: Avoid need for this (use detatched record)
        self.comms_nw_view(table.view).runPreInsertTriggers(feature)

    def commsPosInsertTrigger(self, table, rec):
        """
        Perform post-insert actions
        """

        self.comms_nw_view(table.view).runPosInsertTriggers(rec)

    def commsPosUpdateTrigger(self, table, rec, orig_rec):
        """
        Perform post-update actions
        """
        self.comms_nw_view(table.view).runPosUpdateTriggers(rec, orig_rec)

    def commsPreDeleteTrigger(self, table, rec):
        """
        Perform pre-delete actions
        """
        if not rec:
            return

        self.comms_nw_view(table.view).runPreDeleteTriggers(rec)

    def comms_nw_view(self, view):
        """
        Returns a NetworkView
        """

        # ENH: Get config from config cache (to avoid re-reading settings)
        if not hasattr(self, "_comms_nw_view"):
            self._comms_nw_view = NetworkView(view, self.progress)

        return self._comms_nw_view
