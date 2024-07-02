###############################################################################
# Controller for managing versioned data
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import pyramid.httpexceptions as exc
from pyramid.view import view_config

from myworldapp.core.server.base.geom.myw_polygon import MywPolygon
from myworldapp.core.server.controllers.base.myw_feature_collection import MywFeatureCollection
from myworldapp.modules.comms.server.validation.delta_manager import DeltaManager
from myworldapp.modules.comms.server.base.readonly_feature_view import ReadonlyFeatureView
from myworldapp.core.server.controllers.base.myw_utils import mywAbort

from .utils import handling_exceptions
from .mywcom_controller import MywcomController


class MywcomDeltaController(MywcomController):
    """
    Controller for managing versioned data
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "DELTA")

    @view_config(
        route_name="mywcom_delta_controller.changes", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def changes(self):
        """
        Returns feature changes in FEATURE_TYPE/ID
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        application = self.get_param(self.request, "application")
        limit = self.get_param(self.request, "limit", mandatory=False, type=int)

        change_types = self.get_param(
            self.request, "change_types", type=str, list=True, mandatory=False
        )
        bounds = self.get_param(self.request, "bounds", type="coords", mandatory=False)
        bounds_poly_param = self.get_param(
            self.request, "bounds_poly", type="coords", mandatory=False
        )
        feature_types = self.get_param(
            self.request, "feature_types", type=str, list=True, mandatory=False
        )

        # Ask DeltaManager for one over limit; getting this number is the signal
        # we have a truncated result.
        query_limit = limit + 1 if limit else None

        bounds_poly = None
        if bounds:
            bounds_poly = MywPolygon.newBox(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1])
        elif bounds_poly_param:
            bounds_poly = MywPolygon(bounds_poly_param)

        delta = "/".join([feature_type, id])

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, feature_type=feature_type, application=application
        )

        # Check delta is accessible to user (taking filters into account)
        delta_owner = self.db.view().get(delta, False)
        if not delta_owner:
            raise exc.HTTPForbidden()

        # Use cached feature view for performance
        db_view = ReadonlyFeatureView(self.db.view(delta))

        # Find changes
        engine = DeltaManager(db_view, self.progress)
        changes = engine.changes(
            feature_types=feature_types,
            change_types=change_types,
            bounds=bounds_poly,
            limit=query_limit,
        )

        # Check to see if we have truncated result
        if limit and len(changes) > limit:
            changes.pop()
            truncated = True
        else:
            truncated = False

        # Build result
        res = []
        for change in changes:
            res.append(change.definition())

        if truncated:
            return {"changes": res, "truncated": truncated}
        else:
            return {"changes": res}

    @view_config(
        route_name="mywcom_delta_controller.conflicts", request_method="GET", renderer="json"
    )
    def conflicts(self):
        """
        Return info for records of FEATURE_TYPE that are in conflict with master
        """
        # ENH: Support feature types, aspects, session vars, change_type etc?

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        bounds = self.get_param(self.request, "bounds", type="coords", mandatory=False)
        categories = self.get_param(
            self.request, "categories", type=str, list=True, mandatory=False
        )
        application = self.get_param(self.request, "application")

        bounds_poly = None
        if bounds:
            from myworldapp.core.server.base.geom.myw_polygon import MywPolygon

            bounds_poly = MywPolygon.newBox(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1])

        delta = feature_type + "/" + id

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, application=application
        )  # ENH: Check feature types

        db_view = self.db.view(delta)

        engine = DeltaManager(db_view, self.progress)
        conflicts = engine.conflicts(bounds=bounds_poly, categories=categories)

        res = {}
        for ft, ft_conflicts in conflicts.items():
            ft_res = res[ft] = {}
            for id, conflict in ft_conflicts.items():
                ft_res[id] = conflict.definition()

        return {"conflicts": res}

    @view_config(
        route_name="mywcom_delta_controller.validate", request_method="GET", renderer="json"
    )
    @handling_exceptions
    def validate(self):
        """
        Find geometry of objects in delta FEATURE_TYPE/ID

        Returns conflict objects"""

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")
        bounds = self.get_param(self.request, "bounds", type="coords", mandatory=False)
        categories = self.get_param(
            self.request, "categories", type=str, list=True, mandatory=False
        )
        max_errors = self.get_param(self.request, "max_errors", type=int, mandatory=False)

        delta = "/".join([feature_type, id])

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            application=self.get_param(self.request, "application"),
        )

        # Check delta is accessible to user
        delta_owner = self.db.view().get(delta, False)
        if not delta_owner:
            raise exc.HTTPForbidden()

        bounds_poly = None
        if bounds:
            from myworldapp.core.server.base.geom.myw_polygon import MywPolygon

            bounds_poly = MywPolygon.newBox(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1])

        # Use cached feature view for performance
        db_view = ReadonlyFeatureView(self.db.view(delta))

        # Find integrity problems
        engine = DeltaManager(db_view, self.progress)
        errors = engine.validate(bounds=bounds_poly, categories=categories, max_errors=max_errors)

        # Build result
        res = {}
        for feature_urn, errors_by_field in errors.items():
            res[feature_urn] = {}
            for field_name, error in errors_by_field.items():
                res[feature_urn][field_name] = error.definition()

        return {"errors": res}

    @view_config(
        route_name="mywcom_delta_controller.validate_area", request_method="GET", renderer="json"
    )
    @handling_exceptions
    def validate_area(self):
        """
        Find broken objects

        Returns integrity error objects"""
        # ENH: Move to better controller

        from myworldapp.core.server.base.geom.myw_polygon import MywPolygon
        from myworldapp.modules.comms.server.validation.data_validator import DataValidator

        # Unpick args
        delta = self.get_param(self.request, "delta")
        bounds = self.get_param(self.request, "bounds", type="coords", mandatory=True)
        categories = self.get_param(
            self.request, "categories", type=str, list=True, mandatory=False
        )

        # Check authorised
        self.current_user.assertAuthorized(
            self.request, application=self.get_param(self.request, "application")
        )

        # Build polygon
        poly = MywPolygon.newBox(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1])

        # Find integrity problems
        engine = DataValidator(self.db.view(delta), poly, self.progress)
        errors = engine.run(categories)

        # Build result
        res = {}
        for feature_urn, errors_by_field in errors.items():
            res[feature_urn] = {}
            for field_name, error in errors_by_field.items():
                res[feature_urn][field_name] = error.definition()

        return {"errors": res}

    @view_config(route_name="mywcom_delta_controller.merge", request_method="POST", renderer="json")
    @handling_exceptions
    def merge(self):
        """
        Auto-resolve integrity errors and conflicts in delta FEATURE_TYPE/ID

        Returns features updated"""

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")

        delta = "/".join([feature_type, id])

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            right="editFeatures",
            application=self.get_param(self.request, "application"),
        )

        # Check delta is accessible to user (taking filters into account)
        delta_owner = self.db.view().get(delta, False)
        if not delta_owner:
            raise exc.HTTPForbidden()

        # Apply auto-resolution and fixup
        engine = DeltaManager(self.db.view(delta), self.progress)
        changes = engine.merge()
        self.db.commit()

        # Build result
        res = []
        for change in changes:
            res.append(change.definition())

        return {"changes": res}

    @view_config(
        route_name="mywcom_delta_controller.merge_feature", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def merge_feature(self):
        """
        Auto-resolve integrity errors and conflicts on individual FEATURE_TYPE/ID
        """

        # Unpick args
        delta_owner = self.get_param(self.request, "delta_owner")
        delta_id = self.get_param(self.request, "delta_id")
        feature_type = self.get_param(self.request, "feature_type")
        feature_id = self.get_param(self.request, "feature_id")

        delta = "/".join([delta_owner, delta_id])
        db_view = self.db.view()
        delta_db_view = self.db.view(delta)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            right="editFeatures",
            application=self.get_param(self.request, "application"),
        )

        # Check delta is accessible to user (taking filters into account)
        delta_owner = db_view.get(delta, False)
        if not delta_owner:
            raise exc.HTTPForbidden()

        engine = DeltaManager(delta_db_view, self.progress)

        table = delta_db_view.table(feature_type)
        delta_rec = table.get(feature_id)
        base_rec = table._baseRec(feature_id)
        mergeResult = None

        if not delta_rec:
            # delta_rec deleted in delta -> revert
            engine.revert(base_rec)
        else:
            # merge
            mergeResult = engine.mergeRec(delta_rec)

        self.db.commit()

        if mergeResult is not None:
            res = {}
            for conflict_or_change, item in mergeResult.items():
                if item:
                    res[conflict_or_change] = item.definition()
            return res
        else:
            return {"status": 200}

    @view_config(
        route_name="mywcom_delta_controller.revert_feature", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def revert_feature(self):
        """
        Set delta record to base
        """

        # Unpick args
        delta_owner = self.get_param(self.request, "delta_owner")
        delta_id = self.get_param(self.request, "delta_id")
        feature_type = self.get_param(self.request, "feature_type")
        feature_id = self.get_param(self.request, "feature_id")

        delta = "/".join([delta_owner, delta_id])
        db_view = self.db.view(delta)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            right="editFeatures",
            application=self.get_param(self.request, "application"),
        )

        # Check delta is accessible to user (taking filters into account)
        delta_owner = self.db.view().get(delta, False)
        if not delta_owner:
            raise exc.HTTPForbidden()

        delta_rec = db_view.table(feature_type).get(feature_id)
        base_rec = db_view.table(feature_type)._baseRec(feature_id)

        if not delta_rec:
            if not base_rec:
                mywAbort(400)  # Trying to revert a feature that has no base rec
            # delta_rec deleted in delta
            delta_rec = base_rec

        # Apply auto-resolution and fixup
        engine = DeltaManager(self.db.view(delta), self.progress)
        engine.revert(delta_rec)

        self.db.commit()

        return {"status": 200}

    @view_config(
        route_name="mywcom_delta_controller.rebase_feature", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def rebase_feature(self):
        """
        Set delta record to base
        """

        # Unpick args
        delta_owner = self.get_param(self.request, "delta_owner")
        delta_id = self.get_param(self.request, "delta_id")
        feature_type = self.get_param(self.request, "feature_type")
        feature_id = self.get_param(self.request, "feature_id")

        delta = "/".join([delta_owner, delta_id])
        db_view = self.db.view(delta)

        # Check authorised
        self.current_user.assertAuthorized(
            self.request,
            feature_type=feature_type,
            right="editFeatures",
            application=self.get_param(self.request, "application"),
        )

        # Check delta is accessible to user (taking filters into account)
        delta_owner = self.db.view().get(delta, False)
        if not delta_owner:
            raise exc.HTTPForbidden()

        delta_rec = db_view.table(feature_type).get(feature_id)
        base_rec = db_view.table(feature_type)._baseRec(feature_id)

        if not delta_rec:
            if not base_rec:
                mywAbort(400)  # Trying to revert a feature that has no base rec
            # delta_rec deleted in delta
            delta_rec = base_rec

        # Apply auto-resolution and fixup
        engine = DeltaManager(self.db.view(delta), self.progress)
        engine.rebase(delta_rec)

        self.db.commit()

        return {"status": 200}

    @view_config(route_name="mywcom_delta_controller.bounds", request_method="GET", renderer="json")
    @handling_exceptions
    def bounds(self):
        """
        Calculate bounds for items in a delta
        """

        # Unpick args
        feature_type = self.get_param(self.request, "feature_type")
        id = self.get_param(self.request, "id")

        delta = "/".join([feature_type, id])
        db_view = ReadonlyFeatureView(self.db.view(delta))

        engine = DeltaManager(db_view, self.progress)
        bounds = engine.bounds()

        return bounds
