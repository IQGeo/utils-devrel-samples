# Copyright: IQGeo Limited 2010-2023
from sqlalchemy.orm import Query
from sqlalchemy import func, literal

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.core.server.base.geom.myw_geo_utils import degrees_to_metres
from myworldapp.core.server.base.geom.myw_geometry import MywGeometry
from myworldapp.core.server.base.db.globals import Session

# from myworldapp.core.server.controllers.myw_select_controller import getModels

from .data_validator import DataValidator
from .data_fixer import DataFixer
from .conflict_resolver import ConflictResolver
from .conflict import Conflict
from .feature_change import FeatureChange


class DeltaManager:
    """
    Engine for managing design data

    Provides API for getting changes, validating and merging a delta.
    Returns changes as FeatureChange objects"""

    def __init__(self, db_view, progress=MywProgressHandler()):
        """
        Init slots of self

        DB_VIEW is a MywFeatureView"""

        if not db_view.delta:
            raise MywInternalError("View not delta", db_view)

        self.db_view = db_view
        self.progress = progress

        self.nw_view = NetworkView(self.db_view, self.progress)
        self.conflict_fixer = ConflictResolver(self.nw_view, self.progress)
        self.data_fixer = DataFixer(self.nw_view, self.progress)

    # ------------------------------------------------------------------------------
    #                                   CHANGE DETECTION
    # ------------------------------------------------------------------------------

    def changes(self, feature_types=None, change_types=None, bounds=None, limit=None):
        """
        The feature changes made in self's delta. Returns up to and includeing 'limit'
        changes within 'bounds'.

        Returns an ordered list of FeatureChange objects
        """

        if change_types is None:
            change_types = ["insert", "update", "delete"]

        changes = []
        cnt = 0
        for delta_rec in self.deltaRecs(
            feature_types=feature_types, change_types=change_types, bounds=bounds
        ):
            if limit and cnt >= limit:
                break
            cnt += 1

            base_rec = None
            if delta_rec.myw_change_type == "update":
                table = self.db_view.table(
                    delta_rec.feature_type
                )  # ENH: Get them all up front (for speed)
                base_rec = table._baseRec(delta_rec.id)

                if base_rec:
                    base_rec._view = self.db_view  # To allow getting display values
                else:
                    self.progress("warning", "Base record missing for", delta_rec)

            change = FeatureChange(delta_rec.myw_change_type, delta_rec, base_rec)
            changes.append(change)

        return changes

    def conflicts(self, bounds=None, categories=None):
        """
        Find conflicts in self's delta

        Optional BOUNDS is a polygon. Optional CATEGORIES is a list of names

        Returns a list of lists of MywConflict objects, keyed by feature type"""

        feature_types = self.orderedFeatureTypes(categories)
        change_types = ["insert", "update", "delete"]

        # Find conflicts
        conflicts = {}
        for feature_type in feature_types:
            with self.progress.operation("Checking", feature_type):
                table = self.db_view.table(feature_type)

                # Find changed records
                delta_recs = self.deltaRecs(
                    feature_types=[feature_type],
                    change_types=change_types,
                    bounds=bounds,
                )

                # Find conflicts
                ft_conflicts = {}
                for delta_rec in delta_recs:
                    conflict = self.conflictFor(table, delta_rec)

                    if conflict:
                        self.progress(0, conflict)
                        delta_rec._view = self.db_view
                        ft_conflicts[delta_rec._id] = conflict

                # Add to result
                if ft_conflicts:
                    conflicts[feature_type] = ft_conflicts

        return conflicts

    def validate(self, bounds=None, categories=None, max_errors=None):
        """
        Check integrity of objects in self's delta

        Returns a list of IntegrityError objects

        MAX_ERRORS - if specified will stop after that many errors found"""

        self.progress(6, "Checking", self.db_view)
        validator = DataValidator(self.db_view, progress=self.progress)

        feature_types = self.orderedFeatureTypes(categories)

        for rec in self.deltaRecs(bounds=bounds, feature_types=feature_types):

            validator.check(rec)

            if max_errors and len(validator.errors) >= max_errors:
                break

        return validator.errors

    # ------------------------------------------------------------------------------
    #                                   MERGING
    # ------------------------------------------------------------------------------

    def merge(self):
        """
        Auto-resolve conflicts and integrity errors in self's delta

        Returns a list of FeatureChange objects"""

        self.progress(2, "Merging", self.db_view)

        changes = {}
        self.fixConflicts(changes)
        self.fixGeoms(changes)

        return changes.values()

    def mergeRec(self, delta_rec):
        """
        Auto-resolve conflicts and integrity errors for DELTA_REC

        Returns dict with conflict and change"""

        table = self.db_view.table(delta_rec.feature_type, versioned_only=True)
        conflict = self.conflictFor(table, delta_rec)

        changes = {}
        if conflict:
            self.conflict_fixer.fixConflict(conflict, changes)

        rec = self.data_fixer.fixGeom(delta_rec, changes)
        table.update(rec)

        change = changes[delta_rec._urn()] if changes else None

        return {"conflict": conflict, "change": change}

    def fixConflicts(self, changes):
        """
        Auto-resolve conflicts in self's delta

        Updates CHANGES (a set of FeatureChange objects)"""

        with self.progress.operation("Fixing conflicts in", self.db_view):

            for feature_type, conflicts in self.conflicts().items():
                for id, conflict in conflicts.items():
                    self.conflict_fixer.fixConflict(conflict, changes)

    def fixGeoms(self, changes):
        """
        Update derived geometries on objects in self's delta

        Updates CHANGES (a set of FeatureChange objects)"""

        with self.progress.operation("Fixing geometries in", self.db_view):

            # Update routes
            for rec in self.deltaRecs(self.nw_view.routes):
                self.data_fixer.fixRouteGeom(rec, changes)

            # Update equipment
            for rec in self.deltaRecs(self.nw_view.equips):
                self.data_fixer.fixEquipGeom(rec, changes)

            # Update conduits
            extra_conduit_run_urns = set()
            for rec in self.deltaRecs(self.nw_view.conduits):
                if self.data_fixer.fixConduitGeom(rec, changes):
                    if "conduit_run" in rec._descriptor.fields and rec.conduit_run:
                        extra_conduit_run_urns.add(rec.conduit_run)

            # Update conduit runs
            for rec in self.deltaRecs(self.nw_view.conduit_runs):
                self.data_fixer.fixConduitRunGeom(rec, changes)
                extra_conduit_run_urns.discard(rec._urn())
            # ENH: Deal with extra_cables_urns (requires clone into view)

            # Update cable segments
            extra_cable_urns = set()
            for rec in self.deltaRecs(self.nw_view.segments):
                if self.data_fixer.fixSegmentGeom(rec, changes):
                    extra_cable_urns.add(rec.cable)

            # Update cables
            for rec in self.deltaRecs(self.nw_view.cables):
                self.data_fixer.fixCableGeom(rec, changes)
                extra_cable_urns.discard(rec._urn())
            # ENH: Deal with extra_cable_urns (requires clone into view)

            # Update connections
            for rec in self.deltaRecs(self.nw_view.connections):
                self.data_fixer.fixConnectionGeom(rec, changes)

            # Update circuits
            for rec in self.deltaRecs(self.nw_view.circuits):
                self.data_fixer.fixCircuitGeom(rec, changes)

            # Update line of count
            for rec in self.deltaRecs(self.nw_view.line_of_counts):
                self.data_fixer.fixLineOfCountGeom(rec, changes)

            self.progress(2, "Changes:", len(changes))

        return changes

    def revert(self, delta_rec):
        """
        Return delta_rec to master state
        """

        return self.conflict_fixer.revert(delta_rec)

    def rebase(self, delta_rec):
        """
        Update base record of DELTA_REC to match current master
        """

        return self.conflict_fixer.rebase(delta_rec)

    # ------------------------------------------------------------------------------
    #                                  HELPERS
    # ------------------------------------------------------------------------------

    def deltaRecs(self, feature_types=None, change_types=None, bounds=None):
        """
        The delta records of current view
        """
        # ENH: Replace by protocol on MywVersionedFeatureView
        # ENH: Return detached records?

        if change_types is None:
            change_types = ["insert", "update"]

        # Deal with defaults
        if feature_types is None:
            feature_types = self.orderedFeatureTypes()

        # For each feature type ..
        for feature_type in feature_types:
            tab = self.db_view.table(feature_type)

            # Build query (ordering to get inserts first)
            recs = tab._delta_recs.order_by(tab.delta_model._key_column().desc())
            if change_types:
                recs = recs.filter(tab.delta_model.myw_change_type.in_(change_types))

            if bounds:
                primary_geom_name = tab.descriptor.primary_geom_name

                if primary_geom_name is not None:
                    geom_filter = getattr(tab.delta_model, primary_geom_name).st_intersects(
                        bounds.ewkt()
                    )
                    recs = recs.filter(geom_filter)

            # Yield records
            for rec in recs:
                rec._view = self.db_view
                yield rec

    def orderedFeatureTypes(self, categories=None):
        """
        Versioned feature types, in 'top down' order

        If optional CATEGORIES is provided, return only types from those categories"""

        # ENH: Move to network view

        # Mapping from category name -> nw_view property
        name_mappings = {"structures": "structs", "equipment": "equips"}

        # Case: Categories
        # ENH: Filter result instead
        if categories:
            feature_types = []
            for category in categories:
                prop_name = name_mappings.get(category, category)
                feature_types += getattr(self.nw_view, prop_name)

            return feature_types

        # Case: All
        all_feature_types = self.db_view.db.dd.featureTypes("myworld", versioned_only=True)

        user_feature_types = (
            list(self.nw_view.structs)
            + list(self.nw_view.routes)
            + list(self.nw_view.equips)
            + list(self.nw_view.conduits)
            + list(self.nw_view.cables)
            + list(self.nw_view.connections)
            + list(self.nw_view.circuits)
            + list(self.nw_view.line_of_counts)
        )

        int_feature_types = self.nw_view.conduit_runs + list(self.nw_view.segments)

        custom_feature_types = sorted(
            list(set(all_feature_types) - set(user_feature_types) - set(int_feature_types))
        )

        return custom_feature_types + user_feature_types + int_feature_types

    def conflictFor(self, table, delta_rec):
        """
        Conflict info for delta_rec (if any)

        Returns a Conflict (or None)"""

        # ENH: Remove need for custom conflict class and get rid of this

        conflict = table.conflictFor(delta_rec)

        if not conflict:
            return None

        return Conflict(
            conflict.master_change,
            conflict.delta_rec,
            conflict.master_rec,
            conflict.base_rec,
        )

    def bounds(self):
        """
        Return convex hull around all changes in the delta
        For performance, constructs a database query against the delta geometry index tables
        """

        index_tables = [
            "delta_geo_world_point",
            "delta_geo_world_linestring",
            "delta_geo_world_polygon",
        ]

        models = self._getModels(Session, index_tables)

        from geoalchemy2 import Geometry
        from sqlalchemy import cast

        def make_query(model):
            query = Session.query(model)
            return query.filter(model.delta == self.db_view.delta).with_entities(
                cast(model.the_geom, Geometry)
            )

        base_queries = map(make_query, models.values())
        union_query = Query.union_all(*base_queries)
        subquery = union_query.subquery()

        hull_func = func.ST_GeogFromWKB(
            func.ST_convexhull(func.ST_collect(subquery.c.myw_delta_geo_world_point_the_geom))
        )
        results = Session.query(func.ST_astext(func.ST_buffer(hull_func, literal(10)))).select_from(
            subquery
        )

        bounds_geom = results.first()[0]

        return {"geometry": MywGeometry.decode(bounds_geom)} if bounds_geom else {}

    def _getModels(self, Session, tablenames):
        """
        Returns dictionary of record 'exemplars' for the geom index tables
        """
        # ENH: Get via driver

        import warnings
        from sqlalchemy import literal, Column, exists
        from myworldapp.core.server.models.myw_dd_feature import MywDDFeature
        from myworldapp.core.server.models.base import ModelBase, MywModelMixin
        from geoalchemy2 import Geometry

        # Suppressing SQLAlchemy warnings about geographic indexes
        with warnings.catch_warnings():
            from sqlalchemy import exc as sa_exc

            warnings.simplefilter("ignore", category=sa_exc.SAWarning)  # ENH: Should it be SA.exc?

            models = {}

            for a_tablename in tablenames:

                # Build a new table class
                model = type(
                    a_tablename,
                    (ModelBase, MywModelMixin),
                    dict(
                        __tablename__=Session.myw_db_driver.dbNameFor("myw", a_tablename),
                        __table_args__={
                            "schema": Session.myw_db_driver.dbNameFor("myw"),
                            "autoload": True,
                            "extend_existing": True,
                            "autoload_with": Session.bind,
                        },
                        the_geom=Column(Geometry(srid=4326)),
                    ),
                )

                # Add it to the dictionary
                models[a_tablename] = model

            return models
