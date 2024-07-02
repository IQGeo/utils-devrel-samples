################################################################################
# Object modelling a feature record change
################################################################################
# Copyright: IQGeo Limited 2010-2023


class FeatureChange(object):
    """
    Object modelling a change to a feature record

    Holds the old and new versions of record. Provides serialisation etc"""

    # ENH: Move to Core

    def __init__(self, change_type, rec, orig_rec=None):
        """
        Init slots of self
        """

        self.change_type = change_type
        self.rec = rec
        self.orig_rec = orig_rec
        self.reasons = []

    def __ident__(self):
        """
        String representation of self for test results
        """

        res = str(self)

        if self.change_type == "update":
            res += " fields={}".format(",".join(self.changedFields()))

        return res

    def __repr__(self):
        """
        String representation of self for tracebacks etc
        """

        return "{}({},{})".format(self.__class__.__name__, self.rec, self.change_type)

    def definition(self):
        """
        Self as a serialisable structure
        """

        defn = {}

        defn["change_type"] = self.change_type
        defn["feature"] = self._asGeojsonFeature(self.rec)

        if self.orig_rec:
            defn["orig_feature"] = self._asGeojsonFeature(self.orig_rec)

            if self.change_type == "update":
                defn["fields"] = self.changedFields()

        return defn

    def changedFields(self):
        """
        Names of the fields whose values have changed
        """
        # ENH: Duplicated with MywConflict

        if not self.orig_rec:
            return []

        return self.rec._differences(self.orig_rec)

    def _asGeojsonFeature(self, rec):
        """
        REC as serialisable structure (handling errors)
        """
        # Provided to permit display of records with broken geometry etc

        # ENH: Replace by error handling in rec.asGeojsonFeature()

        try:
            return rec.asGeojsonFeature(include_lobs=False)

        except Exception as cond:
            return {"id": rec._id, "myw": {"feature_type": rec.feature_type, "title": rec._title()}}
