# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler

from .feature_change import FeatureChange


class ConflictResolver:
    """
    Engine for fixing attribute conflicts
    """

    def __init__(self, nw_view, progress=MywProgressHandler()):
        """
        Init slots of self

        NW_VIEW is a NetworkView"""

        self.nw_view = nw_view
        self.progress = progress

        self.db_view = self.nw_view.db_view

    def fixConflict(self, conflict, changes=None):
        """
        Auto-resolve CONFLICT (if possible)

        Returns a FeatureChange (None if no change)"""

        conflict_type = conflict.master_change + "/" + conflict.delta_rec.myw_change_type

        # Say what we are doing
        self.progress(6, conflict.delta_rec, "Attempting to auto-resolve", conflict_type)

        # Resolve
        if conflict_type == "update/update":
            return self.fixUpdateUpdateConflict(conflict, changes)
        if conflict_type == "update/delete":
            return self.fixUpdateDeleteConflict(conflict, changes)
        if conflict_type == "delete/update":
            return self.fixDeleteUpdateConflict(conflict, changes)
        if conflict_type == "delete/delete":
            return self.fixDeleteDeleteConflict(conflict, changes)
        return None

    def fixUpdateUpdateConflict(self, conflict, changes):
        """
        Auto-resolve a update/update conflict (if possible)
        """

        # Get handle on records (just for convenience)
        master_rec = conflict.master_rec
        delta_rec = conflict.delta_rec
        base_rec = conflict.base_rec

        # Get changed fields
        master_fields = conflict.changedFields(base_rec, master_rec)  # ENH: Move to MywConflict
        delta_fields = conflict.changedFields(base_rec, delta_rec)

        # For each master fields that has change .. attempt to merge into delta
        det_rec = delta_rec._clone(True)
        det_rec._view = delta_rec._view

        for field in master_fields:

            # Case: System managed field (handled by fixup)
            if self.fieldsAreDerived(master_rec, [field]):
                self.progress(4, det_rec, "Derived field:", field)

            # Case: Unchanged in delta
            elif not (field in delta_fields):
                self.progress(4, det_rec, "Merging field:", field)
                det_rec[field] = master_rec[field]

            # Case: Same change in delta
            elif not delta_rec._differences(master_rec, [field]):
                self.progress(4, det_rec, "Master change also in delta:", field)

            # Case: Fix refset field
            elif self.canFixRefSetField(det_rec, field):
                self.fixRefSetField(conflict, det_rec, field)

            # Case: Conflicting changes
            else:
                self.progress(2, det_rec, "Real conflict:", field)
                return None

        # Update and rebase (or remove if no longer required)
        diffs = conflict.changedFields(det_rec, master_rec)
        if not diffs:
            self.revert(det_rec, changes, "all_changes_in_master")

        elif self.fieldsAreDerived(master_rec, master_fields):
            self.rebase(delta_rec, changes, "master_changes_derived_only")

        else:
            self.resolve(conflict, det_rec, changes, "merged_fields")

    def canFixRefSetField(self, det_rec, field):
        """
        Determines is we can fix reference set field. Currently do this only
        for circuits fields
        ENH: Permit all stored ref set fields to be fixable.
        """

        field_desc = det_rec._descriptor.fields[field]
        return (
            field_desc
            and field_desc.isStored()
            and field_desc.type_desc.base == "reference_set"
            and field == "circuits"
        )

    def fixRefSetField(self, conflict, delta_rec, field):
        """
        Fixup reference set by replaying master changes into delta
        """

        self.progress(4, delta_rec, "Fixup reference set field", field)

        master_rec = conflict.master_rec
        base_rec = conflict.base_rec

        master_values = master_rec[field]
        delta_values = delta_rec[field]
        base_values = base_rec[field]

        master_urns = set(master_values.split(";")) if master_values else set()
        delta_urns = set(delta_values.split(";")) if delta_values else set()
        base_urns = set(base_values.split(";")) if base_values else set()

        adds = master_urns.difference(base_urns)
        dels = base_urns.difference(master_urns)

        delta_urns = delta_urns.union(adds)
        delta_urns = delta_urns.difference(dels)

        delta_rec[field] = ";".join(delta_urns)

        self.progress(
            4, delta_rec, "Fixup reference set field", field, "additions", adds, "removals", dels
        )

        return delta_rec

    def fixUpdateDeleteConflict(self, conflict, changes):
        """
        Auto-resolve a update/delete conflict (if possible)
        """

        master_fields = conflict.changedFields(
            conflict.base_rec, conflict.master_rec
        )  # ENH: Move to MywConflict

        # Case: Master changes are system managed only => just ignore
        if self.fieldsAreDerived(conflict.master_rec, master_fields):
            self.rebase(conflict.delta_rec, changes, "master_changes_derived_only")

    def fixDeleteUpdateConflict(self, conflict, changes):
        """
        Auto-resolve a delete/update conflict (if possible)
        """

        delta_fields = conflict.changedFields(
            conflict.base_rec, conflict.delta_rec
        )  # ENH: Move to MywConflict

        # Case: Delta changes are system managed only => just ignore
        if self.fieldsAreDerived(conflict.delta_rec, delta_fields):
            self.revert(conflict.delta_rec, changes, "delta_changes_derived_only")

    def fixDeleteDeleteConflict(self, conflict, changes):
        """
        Auto-resolve a delete/delete conflict (if possible)
        """

        self.revert(conflict.delta_rec, changes, "delta_change_matches_master")

    def fieldsAreDerived(self, rec, fields):
        """
        True if all FIELDS of REC are system managed
        """

        # ENH: Get from managers
        category_derived_fields = {
            "equip": ["location"],
            "conduit": ["path"],
            "conduit_run": ["path"],
            "cable": ["path"],
            "segment": ["path"],
            "connection": ["location"],
            "circuit": ["path"],
            "circuit_segment": ["path"],
            "circuit_port": ["location"],
            "line_of_count": ["route"],
        }

        category = self.nw_view.categoryOf(rec.feature_type)

        derived_fields = category_derived_fields.get(category, [])

        for field in fields:
            if not field in derived_fields:
                return False

        return True

    def resolve(self, conflict, updated_rec, changes=None, reason=None):
        """
        Update delta rec from UPDATED_REC and rebase
        """

        delta_rec = conflict.delta_rec
        orig_rec = delta_rec._clone(True)
        orig_rec._view = delta_rec._view
        table = self.db_view.table(delta_rec.feature_type, versioned_only=True)

        # Resolve conflict
        # ENH: Duplicated with workflow controller
        delta_rec.updateFrom(
            updated_rec
        )  # delta recs not detached .. so no need for table.update() here
        table.rebase(delta_rec)

        if changes is not None:
            self.addChange(changes, "update", reason, delta_rec, orig_rec)

    def rebase(self, delta_rec, changes=None, reason=None):
        """
        Update base record of DELTA_REC to match current master
        """

        table = self.db_view.table(delta_rec.feature_type, versioned_only=True)
        table.rebase(delta_rec)

        if changes is not None:
            self.addChange(changes, "rebase", reason, delta_rec)

    def revert(self, delta_rec, changes=None, reason=None):
        """
        Remove REC from current delta
        """
        # ENH: Move to MywVersionedFeatureTable

        table = self.db_view.table(delta_rec.feature_type, versioned_only=True)
        self.db_view.session.delete(table._deltaRec(delta_rec.id))

        # Insert in delta means no base_rec
        base_rec = table._baseRec(delta_rec.id)
        if base_rec:
            self.db_view.session.delete(base_rec)

        if changes is not None:
            self.addChange(changes, "revert", reason, delta_rec)

    def addChange(self, changes, change_type, reason, rec, orig_rec=None):
        """
        Add a feature change item to CHANGES
        """
        # TODO: Duplicated with DataFixer

        self.progress(8, "Changed", rec, change_type, reason)

        urn = rec._urn()
        change = FeatureChange(change_type, rec, orig_rec)
        changes[urn] = change

        if reason:
            change.reasons.append(reason)

        self.progress(3, rec, change_type, reason or "")

        return change
