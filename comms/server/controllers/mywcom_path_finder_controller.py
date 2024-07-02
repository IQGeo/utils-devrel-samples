###############################################################################
# Controller for fiber path finding and use
###############################################################################
# Copyright: IQGeo Limited 2010-2023

from pyramid.view import view_config
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.controllers.base.myw_utils import mywAbort
from myworldapp.core.server.controllers.myw_network_controller import (
    MywNetworkController,
)
from .utils import handling_exceptions
from myworldapp.modules.comms.server.api.path_finder_manager import PathFinderManager
from myworldapp.core.server.base.db.globals import Session
from myworldapp.modules.comms.server.task_manager.task import Task


class MywcomPathFinderController(MywNetworkController):
    """
    Controller for finding circuit paths
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request)
        self.network = "mywcom_fiber_path"

    @view_config(
        route_name="mywcom_path_finder_controller.find_path",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def find_path(self):
        """
        Find fiber path between from and to URNs
        """

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, application=self.get_param(self.request, "application")
        )

        # Get defaults
        settings = self.db.setting("mywcom.path_finder")
        if settings:
            max_paths_default = settings["max_paths_default"]
            max_dist_default = settings["max_dist_default"]

        # Unpick parameters
        from_urn = self.get_param(self.request, "from_urn", mandatory=True)
        to_urn = self.get_param(self.request, "to_urn", mandatory=True)
        include_urns = self.get_param(self.request, "include_urns", default="")
        avoid_urns = self.get_param(self.request, "avoid_urns", default="")
        sort_by = self.get_param(self.request, "sort_by", default="shortest")
        max_paths = self.get_param(self.request, "max_paths", type=int, default=max_paths_default)
        max_distance = self.get_param(
            self.request, "max_distance", type=float, default=max_dist_default
        )
        options = self.get_param(self.request, "options", type="json", default={})
        application = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        do_async = self.get_param(self.request, "async", default=False)
        options["exclude_similar"] = self.get_param(
            self.request, "exclude_similar", type=bool, default=True
        )

        if do_async:
            task = Task()
            args = [
                from_urn,
                to_urn,
                include_urns,
                avoid_urns,
                sort_by,
                max_paths,
                max_distance,
                options,
                delta,
                application,
            ]
            task.spawn(
                "myworldapp.modules.comms.server.api.path_finder_manager.path_finder_process",
                args,
            )

            return {"msg": "Job queued", "paths": [], "task_id": task.task_id}
        else:
            fp_mgr = PathFinderManager(self.db, delta)
            results = fp_mgr.findPaths(
                from_urn,
                to_urn,
                include_urns,
                avoid_urns,
                sort_by,
                max_paths,
                max_distance,
                options,
            )
            return {"paths": results}

    @view_config(
        route_name="mywcom_path_finder_controller.create_circuit",
        request_method="POST",
        renderer="json",
    )
    @handling_exceptions
    def create_circuit(self):

        application = self.get_param(self.request, "application")
        delta = self.get_param(self.request, "delta")
        feature_type = self.get_param(self.request, "feature_type", mandatory=True)
        feature = self.get_param(self.request, "feature", mandatory=True, type="json")
        path = self.get_param(self.request, "path", mandatory=True, type="json")

        # Check authorised
        self.current_user.assertAuthorized(self.request)

        fp_mgr = PathFinderManager(self.db, delta)

        circuit = fp_mgr.createCircuitFromPath(feature_type, feature, path)

        Session.commit()

        return circuit.asGeojsonFeature()
