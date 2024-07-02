# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_tabulation import MywTableFormatter


class SpecValidator(object):
    """
    Engine for checking spec data consistency
    """

    def __init__(self, db, progress=MywProgressHandler()):
        """
        Init slots of self

        DB is a MywDatabase"""

        self.db = db
        self.progress = progress
        self.errors = []

    # ------------------------------------------------------------------------------
    #                                     UTILS
    # ------------------------------------------------------------------------------

    def run(self):
        """
        Run checks

        Returns a list of problems found"""

        for feature_type, field_name, spec_table in self.specFields():

            with self.progress.operation(
                "Checking", feature_type + "." + field_name, "->", spec_table
            ):
                self.checkDD(feature_type, field_name, spec_table)

        return self.errors

    def checkDD(self, feature_type, field_name, spec_table_name):
        """
        Check the fields of FEATURE_TYPE match those of SPEC_TABLE
        """

        skip_props = ["key", "mandatory"]

        # Get tables
        feature_table = self.db.tables[feature_type]
        spec_table = self.db.tables[spec_table_name]

        # For each matching field .. check its properties match
        for field_name in self.physicalFields(spec_table, feature_table):
            self.progress(3, "Checking physical field:", field_name)

            # Get field descriptors
            spec_field_desc = spec_table.descriptor.fields[field_name]
            feature_field_desc = feature_table.descriptor.fields[field_name]

            # Show significant differencs
            for (prop, spec_val, feature_val) in spec_field_desc.differences(feature_field_desc):
                if not prop in skip_props:
                    self.error(
                        feature_type,
                        field_name,
                        "Property does not match spec record:",
                        prop,
                        "=",
                        feature_val,
                        "(",
                        "expected",
                        prop,
                        "=",
                        spec_val,
                        ")",
                    )

    # ------------------------------------------------------------------------------
    #                                     UTILS
    # ------------------------------------------------------------------------------

    def printSpecs(self):
        """
        Prints a table showing category of each field on each spec relationship
        """

        # Get data to display
        rows = []
        for feature_type, field_name, spec_table_name in self.specFields():
            feature_table = self.db.tables[feature_type]
            spec_table = self.db.tables[spec_table_name]

            phys_fields = self.physicalFields(spec_table, feature_table)

            meta_fields = []
            for field_name in spec_table.descriptor.fields:
                if not field_name in phys_fields:
                    meta_fields.append(field_name)

            row = {
                "feature": feature_type,
                "spec": spec_table_name,
                "physical": ",".join(phys_fields),
                "metadata": ",".join(meta_fields),
            }

            rows.append(row)

        # Display it
        tab_fmtr = MywTableFormatter("feature", "spec", "physical", "metadata")
        for line in tab_fmtr.format(rows):
            print(line)

    # ------------------------------------------------------------------------------
    #                                   HELPERS
    # ------------------------------------------------------------------------------

    def specFields(self):
        """
        Yields the feature fields that reference a spec

        Yields:
         feature_type
         field_name
         spec_table"""

        # For each field in DD
        for field_rec in self.db.dd.fieldRecs("myworld"):
            field_desc = field_rec.type_desc

            # Check is foreign key
            if field_desc.base != "foreign_key" or not field_desc.args:
                continue

            # Check target table is spec
            target_table_name = field_desc.args[0]
            if not target_table_name.endswith("_spec"):  # ENH: Or use setting?
                continue

            # Check spec table exists
            spec_table = self.db.tables.table(target_table_name, error_if_none=False)
            if not spec_table:
                self.error(
                    field_rec.table_name,
                    field_rec.internal_name,
                    "No such table:",
                    target_table_name,
                )
                continue

            yield field_rec.table_name, field_rec.internal_name, target_table_name

    def physicalFields(self, spec_table, feature_table):
        """
        Determines which fields on SPEC_TABLE will be copied onto FEATURE_TABLE
        """

        phys_fields = []

        # For each field on spec record ..
        for field_name in spec_table.descriptor.fields:

            # Find corresponding field on feature (if there is one)
            if field_name in feature_table.descriptor.fields:
                phys_fields.append(field_name)

        return phys_fields

    def error(self, feature_type, field_name, *msg):
        """
        Report a problem
        """

        key = feature_type + "." + field_name

        self.progress("warning", key + ":", *msg)

        self.errors.append([key, msg])
