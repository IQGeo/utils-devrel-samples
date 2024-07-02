# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.dd.myw_feature_view import MywFeatureView
from myworldapp.core.server.dd.myw_reference import MywReference


class ReadonlyFeatureView(MywFeatureView):
    """
    A feature view with in-memory cache

    Short lived, readonly object (does not support write-through)"""

    def __init__(self, db_view, cache_max_size=10000):
        """
        Init slots of self
        """

        super().__init__(db_view.db, db_view.delta, db_view.schema)

        self.features = {}  # Keyed by urn
        self.max_size = cache_max_size

    def getRecs(self, refs, error_if_bad=True):
        """
        Returns records referenced by REFS (a list of MywReferences or URNs)

        Missing records are ignored. Order of result is undefined

        If ERROR_IF_BAD is True, raises ValueError on malformed URNs

        Subclassed to return feature from cache (if easy)"""

        if len(refs) == 1:
            rec = self.get(refs[0], error_if_bad)
            if rec:
                return [rec]
            return []

        return super().getRecs(refs, error_if_bad=error_if_bad)

    def get(self, ref, error_if_bad=True):
        """
        Returns the record referenced by REF (a MywReference or URN) if there is one

        If ERROR_IF_BAD is True, raises ValueError on malformed URNs

        Subclassed to return feature from cache (if present)"""

        # Build cache key
        if isinstance(ref, MywReference):
            urn = ref.urn()
        else:
            urn = ref

        # Read feature (if necessary)
        if not urn in self.features:

            if self.max_size and len(self.features) > self.max_size:
                self.features = {}

            self.features[urn] = super().get(ref, error_if_bad=error_if_bad)

        # Return it
        return self.features[urn]

    def cacheFeature(self, feature):
        """
        Add feature to self
        """

        self.features[feature._urn()] = feature
