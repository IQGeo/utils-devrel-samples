###############################################################################
# Controller for managing circuit records
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from pyramid.view import view_config

from myworldapp.core.server.base.db.globals import Session

from myworldapp.modules.comms.server.api.mywcom_error import MywcomError
from myworldapp.modules.comms.server.api.pin_range import PinRange

from .utils import handling_exceptions
from .mywcom_controller import MywcomController


class MywcomCircuitController(MywcomController):
    """
    Controller for managing access to circuit records
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "CIRCUIT")

    # ==============================================================================
    #                                   ROUTING
    # ==============================================================================

    @view_config(
        route_name="mywcom_circuit_controller.route_circuit",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def route_circuit(self):
        """
        Route circuit ID to given termination pins
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        delta = self.get_param(self.request, "delta")
        tech = self.get_param(self.request, "tech", default="fiber")

        # Get manager
        db_view = self.db.view(delta)
        circuit_mgr = self.networkView(db_view).circuit_mgr

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
            right="editFeatures",
        )

        # Find circuit
        circuit = self.featureRec(db_view, feature_type, id)

        # Find termination info
        out_feature = circuit._field("out_feature").rec()
        out_pins = PinRange.parse(circuit.out_pins)

        # Unroute the circuit (in case of a re-route)
        circuit_mgr.unroute(circuit, tech)

        # Route the circuit
        # try:
        in_node = circuit_mgr.findPathTo(out_feature, out_pins, tech)

        if in_node is None:
            raise MywcomError(
                "bad_circuit_path", bad_path=True
            )  # handled in @handle_exceptions

        circuit_mgr.route(circuit, in_node)
        Session.commit()

        # Return updated circuit object
        return {"circuit": circuit.asGeojsonFeature(include_lobs=False)}

    @view_config(
        route_name="mywcom_circuit_controller.unroute_circuit",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def unroute_circuit(self):
        """
        Unroute circuit ID by deleting all of its segments
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        delta = self.get_param(self.request, "delta")
        tech = self.get_param(self.request, "tech", default="fiber")

        # Get manager
        db_view = self.db.view(delta)
        circuit_mgr = self.networkView(db_view).circuit_mgr

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
            right="editFeatures",
        )

        # Find circuit
        circuit = self.featureRec(db_view, feature_type, id)

        # Unroute the circuit
        circuit_mgr.unroute(circuit, tech)
        Session.commit()

        # Return updated circuit object
        return {"circuit": circuit.asGeojsonFeature(include_lobs=False)}
