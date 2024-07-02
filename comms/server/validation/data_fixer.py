# Copyright: IQGeo Limited 2010-2023

from sqlalchemy.sql import null

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_line_string import MywLineString

from .feature_change import FeatureChange


class DataFixer:
    """
    Engine for fixing up data integrity errors

    Rebuilds fields derived from housings"""

    def __init__(self, nw_view, progress=MywProgressHandler()):
        """
        Init slots of self

        DB_VIEW is a MywFeatureView"""

        self.nw_view = nw_view
        self.progress = progress

    def fixGeom(self, rec, changes):
        """
        Update derived geometries on delta_rec
        """

        category = self.nw_view.categoryOf(rec._descriptor.name)

        if category == "route":
            self.fixRouteGeom(rec, changes)
        elif category == "equip":
            self.fixEquipGeom(rec, changes)
        elif category == "conduit":
            self.fixConduitGeom(rec, changes)
        elif category == "conduit_run":
            self.fixConduitRunGeom(rec, changes)
        elif category == "cable":
            self.fixCableGeom(rec, changes)
        elif category == "circuit":
            self.fixCircuitGeom(rec, changes)
        elif category == "segment":
            self.fixSegmentGeom(rec, changes)
        elif category == "connection":
            self.fixConnectionGeom(rec, changes)
        elif category == "line_of_count":
            self.fixLineOfCountGeom(rec, changes)

        return rec

    def fixRouteGeom(self, rec, changes):
        """
        Fix geometries on route REC
        """

        self.progress(6, "Checking route:", rec)

        reasons = []

        coords = list(rec._primary_geom_field.geom().coords)

        struct = rec._field("in_structure").rec()
        if struct:
            struct_coord = struct._primary_geom_field.geom().coords[0]
            if coords[0] != struct_coord:
                reasons.append("in_structure moved")
                coords[0] = struct_coord

        struct = rec._field("out_structure").rec()
        if struct:
            struct_coord = struct._primary_geom_field.geom().coord
            if coords[-1] != struct_coord:
                reasons.append("out_structure moved")
                coords[-1] = struct_coord

        if reasons:
            self.setPrimaryGeom(rec, MywLineString(coords), changes, *reasons)

    def fixEquipGeom(self, rec, changes):
        """
        Fix geometries on equipment REC
        """

        self.progress(6, "Checking equip:", rec)

        struct = rec._field("root_housing").rec()
        if struct:
            coord = rec._primary_geom_field.geom().coord  # ENH: Compare raw fields
            struct_coord = struct._primary_geom_field.geom().coord

            if coord != struct_coord:
                self.setPrimaryGeom(
                    rec, struct._primary_geom_field.geom(), changes, "root_housing moved"
                )

    def fixConduitGeom(self, rec, changes):
        """
        Fix geometries on conduit REC
        """

        self.progress(6, "Checking conduit:", rec)
        changed = False

        root_housing = rec._field("root_housing").rec()

        if root_housing:
            coords = list(rec._primary_geom_field.geom().coords)

            root_housing_geom = root_housing._primary_geom_field.geom()
            root_housing_coords = list(root_housing_geom.coords)

            if "forward" in rec._descriptor.fields and not rec.forward:
                root_housing_coords = root_housing_coords[::-1]  # Reverses list

            if coords != root_housing_coords:
                self.setPrimaryGeom(
                    rec, MywLineString(root_housing_coords), changes, "root_housing moved"
                )
                changed = True

        return changed

    def fixConduitRunGeom(self, rec, changes):
        """
        Fix geometries on conduit_run REC
        """

        self.progress(6, "Checking conduit run:", rec)

        ordered_conduits = self.nw_view.conduit_mgr.conduitRunChain(rec)  # ENH: Encapsulate
        geom = self.nw_view.conduit_mgr.calcConduitRunGeom(ordered_conduits)

        if geom != rec._primary_geom_field.geom():
            self.setPrimaryGeom(rec, geom, changes, "conduit_paths_changed")

    def fixSegmentGeom(self, rec, changes):
        """
        Fix geometries on cable segment REC
        """

        self.progress(6, "Checking segment:", rec)
        changed = False

        internal = rec.in_structure == rec.out_structure
        root_housing = rec._field("root_housing").rec()

        if root_housing:
            coords = list(rec._primary_geom_field.geom().coords)

            root_housing_geom = root_housing._primary_geom_field.geom()

            if internal:
                root_housing_coords = [root_housing_geom.coord, root_housing_geom.coord]
            else:
                root_housing_coords = list(root_housing_geom.coords)

            if not rec.forward:
                root_housing_coords = root_housing_coords[::-1]  # Reverses list

            if coords != root_housing_coords:
                self.setPrimaryGeom(
                    rec, MywLineString(root_housing_coords), changes, "root_housing moved"
                )
                changed = True

        return changed

    def fixCableGeom(self, rec, changes):
        """
        Fix geometries on cable REC
        """

        self.progress(6, "Checking cable:", rec)

        ordered_segs = self.nw_view.cable_mgr.orderedSegments(rec)
        geom = self.nw_view.cable_mgr.calcGeometry(ordered_segs)
        original_geom = rec._primary_geom_field.geom()

        # If no geometry, and original geometry, set it
        if not geom:
            if original_geom:
                self.setPrimaryGeom(
                    rec, None, changes, "segment_paths_changed"
                )  # Sets geom to null() in method
            return

        if geom != original_geom:
            self.setPrimaryGeom(rec, geom, changes, "segment_paths_changed")

    def fixConnectionGeom(self, rec, changes):
        """
        Fix geometries on connection REC
        """

        self.progress(6, "Checking connection:", rec)

        struct = rec._field("root_housing").rec()
        if struct:
            coord = rec._primary_geom_field.geom().coord
            struct_coord = struct._primary_geom_field.geom().coord
            if coord != struct_coord:
                self.setPrimaryGeom(
                    rec, struct._primary_geom_field.geom(), changes, "root_housing moved"
                )

    def fixCircuitGeom(self, rec, changes):
        """
        Fix geometries on circuit REC
        """

        self.progress(6, "Checking circuit:", rec)
        geom = self.nw_view.circuit_mgr.reconstructGeom(rec, False)
        original_geom = rec._primary_geom_field.geom()

        # If no geometry, and original geometry, set it
        if not geom:
            if original_geom:
                self.setPrimaryGeom(
                    rec, None, changes, "segment_paths_changed"
                )  # Sets geom to null() in method
            return

        if geom != original_geom:
            self.setPrimaryGeom(rec, geom, changes, "segment_paths_changed")

    def fixLineOfCountGeom(self, rec, changes):
        """
        Fix geometries on line of count REC
        """

        self.progress(6, "Fixing line of count:", rec)

        if rec.feature_type == "mywcom_line_of_count_section":
            container = rec._field("container").rec()
            if container:
                geom = container._primary_geom_field.geom()
                if geom != rec._primary_geom_field.geom():
                    self.setPrimaryGeom(rec, geom, changes, "container moved")           
        else:
            geom = self.nw_view.loc_mgr.calcLOCGeom(rec)
            if geom != rec._primary_geom_field.geom():
                    self.setPrimaryGeom(rec, geom, changes, "containers moved")        

    # ------------------------------------------------------------------------------
    #                                  HELPERS
    # ------------------------------------------------------------------------------

    def setPrimaryGeom(self, rec, geom, changes, *reasons):
        """
        Set primary geom field of REC, logging change in CHANGES
        """
        # ENH: Handle nothing changed?

        # Find (or create) change set item
        urn = rec._urn()
        change = changes.get(urn)

        if not change:
            orig_rec = rec._clone(True)
            orig_rec._view = rec._view
            change = self.addChange(changes, "update", None, rec, orig_rec)

        # Update record
        if not geom:
            primary_geom_name = rec._descriptor.primary_geom_name
            rec[primary_geom_name] = null()
        else:
            rec._primary_geom_field.set(geom)

        # Update change item
        change.rec = rec
        change.change_type = "update"

        for reason in reasons:
            self.progress(3, rec, "Fixed geometry", reason)
            change.reasons.append(reason)

    def addChange(self, changes, change_type, reason, rec, orig_rec=None):
        """
        Add a feature change item to CHANGES
        """

        self.progress(8, "Changed", rec, change_type, reason)

        urn = rec._urn()
        change = FeatureChange(change_type, rec, orig_rec)
        changes[urn] = change

        if reason:
            change.reasons.append(reason)

        self.progress(3, rec, change_type, reason or "")

        return change
