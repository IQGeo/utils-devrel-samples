##############################################################################
# Controller for managing connection records
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import json
from pyramid.view import view_config
import pyramid.httpexceptions as exc

from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.conn_set import ConnSet
from myworldapp.modules.comms.server.base.readonly_feature_view import ReadonlyFeatureView

from .utils import handling_exceptions
from .mywcom_controller import MywcomController


class MywcomConnectivityController(MywcomController):
    """
    Controller for managing access to connection records
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "CONNECTIVITY")

    # ==============================================================================
    #                               PIN TREE ACCESS
    # ==============================================================================

    @view_config(
        route_name="mywcom_connectivity_controller.connections",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def connections(self):
        """
        Returns pins on SIDE of FEATURE (with their connections)

        Returns:
         CONNECTIONS  a tree of connection points
         FEATURES     features referenced by urns in CONNECTIONS (list keyed by URN)"""

        # Unpick params
        tech = self.get_param(self.request, "tech")
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        side = self.get_param(self.request, "side")
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        # Get feature record
        db_view = self.db.view(delta)
        feature_rec = self.featureRec(db_view, feature_type, id)

        # Get connection points
        conn_set = ConnSet(feature_rec, tech, side)

        return {"conns": conn_set.definition()}

    # ==============================================================================
    #                               CONNECT / DISCONNECT
    # ==============================================================================

    @view_config(
        route_name="mywcom_connectivity_controller.connect", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def connect(self):
        """
        Connect a pair of objects in network TECH

        Returns connection record created"""

        # Unpick parameters
        tech = self.get_param(self.request, "tech")
        fr_ref = self.get_param(self.request, "from", type="reference", mandatory=True)
        to_ref = self.get_param(self.request, "to", type="reference", mandatory=True)
        housing_ref = self.get_param(self.request, "housing", type="reference", mandatory=True)
        delta = self.get_param(self.request, "delta")

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=fr_ref.feature_type,
            application=self.get_param(self.request, "application"),
            right="editFeatures",
        )
        self.current_user.assertAuthorized(
            self.request,
            feature_type=to_ref.feature_type,
            application=self.get_param(self.request, "application"),
            right="editFeatures",
        )

        # Get managers
        db_view = self.db.view(delta)
        nw_view = self.networkView(db_view)
        conduit_mgr = nw_view.conduit_mgr
        conn_mgr = nw_view.connection_mgr

        # Get features to connect
        fr_feature = self.featureRec(db_view, fr_ref.feature_type, fr_ref.id)
        to_feature = self.featureRec(db_view, to_ref.feature_type, to_ref.id)
        housing = self.featureRec(db_view, housing_ref.feature_type, housing_ref.id)

        # Get pins to connect
        fr_pins = PinRange.parse(fr_ref.qualifiers["pins"])
        to_pins = PinRange.parse(to_ref.qualifiers["pins"])

        # Get structure we are connecting in
        struct = housing
        if "root_housing" in housing._descriptor.fields:
            struct = housing._field("root_housing").rec()

        # Check not in continuous conduit
        conduit_mgr._assertCanConnectAt(fr_feature, struct)
        conduit_mgr._assertCanConnectAt(to_feature, struct)

        # Make connection
        conn_rec = conn_mgr.connect(tech, housing, fr_feature, fr_pins, to_feature, to_pins)

        Session.commit()

        return conn_rec.asGeojsonFeature(include_lobs=False)

    @view_config(
        route_name="mywcom_connectivity_controller.disconnect",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def disconnect(self):
        """
        Disconnect port or splice in network TECH
        """

        # Unpick Parameters
        tech = self.get_param(self.request, "tech")
        app = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        ref = self.get_param(self.request, "pins", type="reference", mandatory=True)

        pin_range_str = ref.qualifiers.get("pins")
        if not pin_range_str:
            print("Disconnect: Missing pin range:", ref)
            raise exc.HTTPBadRequest()  # Bad self.request
        pins = PinRange.parse(pin_range_str)

        # Check authorised
        # ENH: Better to check can edit connection table?
        self.current_user.assertAuthorized(
            self.request, feature_type=ref.feature_type, application=app, right="editFeatures"
        )

        # Get Manager
        db_view = self.db.view(delta)
        conn_mgr = self.networkView(db_view).connection_mgr

        # Find feature
        feature_rec = self.featureRec(db_view, ref.feature_type, ref.id)

        # Do disconnect
        conn_mgr.disconnect(tech, feature_rec, pins)
        Session.commit()

        return {}

    # ==============================================================================
    #                                    PIN INFO
    # ==============================================================================

    @view_config(
        route_name="mywcom_connectivity_controller.paths", request_method="GET", renderer="json"
    )
    @handling_exceptions
    def paths(self):
        """
        Find paths for pins of feature ID

        Returns a list of path objects, keyed by pin number"""

        # Unpick params
        feature_type = self.get_param(self.request, "feature_type")
        tech = self.get_param(self.request, "tech")
        id = self.get_param(self.request, "id")
        pins_spec = self.get_param(self.request, "pins", mandatory=True)
        full = self.get_param(self.request, "full", type=bool, default=False)
        delta = self.get_param(self.request, "delta")

        pins = PinRange.parse(pins_spec)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        # Get Manager
        db_view = ReadonlyFeatureView(self.db.view(delta))
        conn_mgr = self.networkView(db_view).connection_mgr

        # Check feature record exists
        ftr = self.featureRec(db_view, feature_type, id)

        # Get trace engine
        network = conn_mgr.nw_view.networks[tech]
        network_def = self.db.config_manager.networkDef(network.network_name)
        network_engine = MywNetworkEngine.newFor(db_view, network_def)

        # Find upstream and downstream paths
        in_trace_pins = network_engine.traceOutRaw(ftr, pins, "upstream").terminations()
        out_trace_pins = network_engine.traceOutRaw(ftr, pins, "downstream").terminations()

        # Build result
        res = {}
        for pin in pins.range():
            res[pin] = {
                "in": in_trace_pins[pin].definition(full),
                "out": out_trace_pins[pin].definition(full),
            }

        return res

    @view_config(
        route_name="mywcom_connectivity_controller.circuits", request_method="GET", renderer="json"
    )
    @handling_exceptions
    def circuits(self):
        """
        Find circuits running on a given set of pins

        Returns list of lists of circuit infos, keyed by pin number"""

        # Unpick args
        id = self.get_param(self.request, "id")
        feature_type = self.get_param(self.request, "feature_type")
        delta = self.get_param(self.request, "delta")
        pins_spec = self.get_param(self.request, "pins")
        include_proposed = self.get_param(
            self.request, "include_proposed", type=bool, default=False
        )
        pins = PinRange.parse(pins_spec)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        # Get manager
        db_view = self.db.view(delta)
        circuit_mgr = self.networkView(db_view).circuit_mgr

        # Get feature record
        db_view = ReadonlyFeatureView(self.db.view(delta))
        ftr_rec = self.featureRec(db_view, feature_type, id)

        # Get circuits
        circuits = circuit_mgr.circuitsOn(ftr_rec, pins, True, include_proposed)

        # Serialise them
        circuit_infos = {}
        for pin, pin_circuits in circuits.items():
            circuit_infos[pin] = self.circuitInfoFor(pin_circuits, db_view.delta)

        return {"circuits": circuit_infos}

    def circuitInfoFor(self, circuits, delta):
        """
        Convert circuit records CIRCUITS to JSON-serialisable form

        Excludes geometry etc to reduce data volume. DELTA is for handling proposed circuits

        Returns a list of dicts
        """

        # Serialise (seleced properties only)
        infos = []
        for circuit in circuits:

            # Get basic info
            info = {"name": circuit._title(), "urn": circuit._urn()}

            # If proposed .. add delta info
            if hasattr(circuit, "myw_delta") and circuit.myw_delta != delta:
                info["delta"] = {"name": circuit.myw_delta, "title": self._deltaOwnerTitle(circuit)}

            infos.append(info)

        # Sort (just to keep tests stable)
        infos = sorted(infos, key=lambda info: info["urn"])

        return infos
