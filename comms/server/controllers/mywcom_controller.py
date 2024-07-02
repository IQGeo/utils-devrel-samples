###############################################################################
# Superclass Mywcomcontroller for comms
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import os, time
import pyramid.httpexceptions as exc
from base64 import b64decode

import myworldapp.core.server.controllers.base.myw_globals as myw_globals
from myworldapp.core.server.controllers.base.myw_controller import MywController
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.modules.comms.server.api.network_view import NetworkView


class MywcomController(MywController):
    """
    Superclass Mywcomfor comms controllers
    """

    # ==============================================================================
    #                                CONSTRUCTION
    # ==============================================================================

    def __init__(self, request, name, trace_level=None):
        """
        Initialize slots of self
        """

        super().__init__(request)

        progress_prefix = "INFO: MYWCOM: {}: ".format(name)

        if trace_level == None:
            trace_level = self.mywcom_ini_option("log_level", 0)

        self.progress = MywSimpleProgressHandler(trace_level, progress_prefix)

        self.db = myw_globals.db
        self.lang = self.get_param(self.request, "lang")

    def mywcom_ini_option(self, name, default=None):
        """
        Returns value of comms module option NAME from server INI file
        """

        opts = self.request.registry.settings.get("myw.mywcom.options", {})

        return opts.get(name, default)

    # ==============================================================================
    #                               PARAM HELPERS
    # ==============================================================================

    def get_param(
        self, request, name, type=str, list=False, default=None, mandatory=False, values=None
    ):
        """
        Helper to get request parameter NAME, cast to TYPE

        TYPE is a class Mywcomor special type name ('json', 'geojson' or 'reference').
        VALUES defines permitted values.
        """
        # Subclassed to support matchdict params (see Core ENH 17848)

        if name in request.matchdict:
            val = request.matchdict[name]
            return self._cast_param(request, name, val, type, values)

        return super().get_param(
            request, name, type=type, list=list, default=default, mandatory=mandatory, values=values
        )

    # ==============================================================================
    #                               FEATURE HELPERS
    # ==============================================================================

    def featureRec(self, db_view, feature_type, id):
        """
        Gets feature record (or aborts)
        """

        feature_rec = db_view.table(feature_type).get(id)
        if not feature_rec:
            raise exc.HTTPNotFound()

        return feature_rec

    def featuresFromRecs(self, feature_recs, fields=[], current_delta=0, **aspects):
        """
        Returns FEATURE_RECS as a list of GeoJSON features

        Optional FIELDS specified the attributes to encode (default: all )

        CURRENT_DELTA - if specified then any records from other deltas will have delta title information added
        """

        aspects["include_lobs"] = aspects.get("include_lobs", False)
        aspects["lang"] = self.lang

        check_delta = current_delta != 0 and aspects.get("include_display_values") is None

        features = {}

        for feature_rec in feature_recs:

            feature = feature_rec.asGeojsonFeature(fields=fields, **aspects)
            features[feature_rec._urn()] = feature

            if check_delta and feature["myw"].get("delta", current_delta) != current_delta:
                feature["myw"]["delta_owner_title"] = self._deltaOwnerTitle(feature_rec)

        return list(features.values())

    def _deltaOwnerTitle(self, rec):
        """
        Returns delta owner title for REC
        """

        if not hasattr(rec, "myw_delta"):
            return None

        delta_owner = rec._view.get(rec.myw_delta)
        delta_owner_title = (
            delta_owner._title() if delta_owner else "Bad reference: " + rec.myw_delta
        )

        return delta_owner_title

    def networkView(self, db_view):
        """
        Returns network view
        """

        return NetworkView(db_view, self.progress)

    # ==============================================================================
    #                               FILE HELPERS
    # ==============================================================================

    def uploadDir(self, *path, create=False):
        """
        Path to the local directory used to store uploaded files

        Creates directory if it doesn't already exist"""
        # ENH: Duplicates code in MywDataUploadController

        settings = self.request.registry.settings
        upload_dir = settings["myw.upload_cache"]

        self.progress(1, "Creating", upload_dir)

        full_path = os.path.join(upload_dir, *path)

        if create:
            os.makedirs(full_path)

        return full_path

    def tempName(self, prefix):
        """
        Name of a temporary file or directory
        """

        return "{}_{}".format(prefix, time.time_ns())
