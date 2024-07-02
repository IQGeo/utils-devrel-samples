################################################################################
# Object modelling a network integrity error
################################################################################
# Copyright: IQGeo Limited 2010-2023


class IntegrityError(object):
    """
    Object modelling a network integrity error

    Holds the problem record plus info on the problem details"""

    # ENH: Rename as ValidationError

    def __init__(self, rec, field, type, ref_rec=None, ref_field=None, **data):
        """
        Init slots of self
        """

        self.rec = rec
        self.field = field
        self.type = type
        self.ref_rec = ref_rec
        self.ref_field = ref_field
        self.data = data

    def __repr__(self):
        """
        String representation of self
        """

        res = "{} {} {}".format(self.rec, self.field, self.type)

        if self.ref_rec:
            res += " {}".format(self.ref_rec)

        if self.ref_field:
            res += " {}".format(self.ref_field)

        return res

    def details(self):
        """
        String representations of self.data
        """

        res = []
        sep = ""
        for prop in sorted(self.data):
            val = self.data[prop]
            item = "{}={}".format(prop, val)
            res.append(item)

        return res

    def definition(self):
        """
        Self as a serialisable structure
        """

        defn = {}

        # Add records
        defn["feature"] = self._asGeojsonFeature(self.rec)
        defn["field"] = self.field
        defn["type"] = self.type

        if self.ref_rec:
            defn["ref_feature"] = self._asGeojsonFeature(self.ref_rec)

        if self.ref_field:
            defn["ref_field"] = self.ref_field

        if self.data:
            data = defn["data"] = {}
            for prop, val in self.data.items():
                if hasattr(val, "__ident__"):
                    val = val.__ident__()
                data[prop] = val

        return defn

    def _asGeojsonFeature(self, rec):
        """
        REC as serialisable structure (handling errors)
        """
        # Provided to permit display of records with broken geometry etc

        # ENH: Replace be error handling in rec.asGeojsonFeature()

        try:
            return rec.asGeojsonFeature(include_lobs=False)

        except Exception as cond:
            return {"id": rec._id, "myw": {"feature_type": rec.feature_type, "title": rec._title()}}
