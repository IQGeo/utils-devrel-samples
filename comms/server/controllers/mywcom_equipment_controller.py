###############################################################################
# Controller for managing equipment
###############################################################################
# Copyright: IQGeo Limited 2010-2023

from pyramid.view import view_config

from myworldapp.core.server.base.db.globals import Session

from .utils import handling_exceptions
from .mywcom_controller import MywcomController


class MywcomEquipmentController(MywcomController):
    """
    Controller for managing equipment
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "EQUIP")

    # ==============================================================================
    #                                  ASSEMBLIES
    # ==============================================================================
    @view_config(route_name="mywcom_equipment_controller.move_assembly", request_method="POST")
    @handling_exceptions
    def move_assembly(self):
        """
        Move equipment (and its children) to housing
        """

        # Unpick parameters
        equip_feature_type = self.get_param(self.request, "equip_ft")
        equip_id = self.get_param(self.request, "equip_id")
        housing_feature_type = self.get_param(self.request, "housing_ft")
        housing_id = self.get_param(self.request, "housing_id")
        delta = self.get_param(self.request, "delta")
        app = self.get_param(self.request, "app")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=equip_feature_type, application=app, right="editFeatures"
        )
        self.current_user.assertAuthorized(
            self.request, feature_type=housing_feature_type, application=app
        )

        self.progress(
            2,
            "Moving assembly",
            equip_feature_type,
            equip_id,
            "->",
            housing_feature_type,
            housing_id,
        )

        # Get manager
        db_view = self.db.view(delta)
        equip_mgr = self.networkView(db_view).equip_mgr

        # Get records
        equip_rec = self.featureRec(db_view, equip_feature_type, equip_id)
        housing_rec = self.featureRec(db_view, housing_feature_type, housing_id)

        # Move assembly
        equip_mgr.moveAssembly(equip_rec, housing_rec)

        Session.commit()

        self.request.response.status_code = 201

        return self.request.response

    @view_config(
        route_name="mywcom_equipment_controller.copy_assembly",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def copy_assembly(self):
        """
        Copy equipment (and its children) to housing

        Returns geoJSON for new equipment
        """

        # Unpick parameters
        equip_feature_type = self.get_param(self.request, "equip_ft")
        equip_id = self.get_param(self.request, "equip_id")
        housing_feature_type = self.get_param(self.request, "housing_ft")
        housing_id = self.get_param(self.request, "housing_id")
        delta = self.get_param(self.request, "delta")
        app = self.get_param(self.request, "app")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=equip_feature_type, application=app, right="editFeatures"
        )
        self.current_user.assertAuthorized(
            self.request, feature_type=housing_feature_type, application=app
        )

        self.progress(
            2,
            "Copying assembly",
            equip_feature_type,
            equip_id,
            "->",
            housing_feature_type,
            housing_id,
        )

        # Get manager
        db_view = self.db.view(delta)
        equip_mgr = self.networkView(db_view).equip_mgr

        # Get records
        equip_rec = self.featureRec(db_view, equip_feature_type, equip_id)
        housing_rec = self.featureRec(db_view, housing_feature_type, housing_id)

        # Copy assembly
        new_equip = equip_mgr.copyAssembly(equip_rec, housing_rec)

        Session.commit()

        return new_equip.asGeojsonFeature(include_lobs=False)
