###############################################################################
# Controller for managing versioned data
###############################################################################
# Copyright: IQGeo Limited 2010-2023

import logging, base64, os
from zipfile import ZipFile
from contextlib import contextmanager
from pyramid.view import view_config
from sqlalchemy.sql import null

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.controllers.base.myw_feature_collection import MywFeatureCollection

from myworldapp.modules.comms.server.base.controller_progress_handler import (
    ControllerProgressHandler,
)
from myworldapp.modules.comms.server.base.log_progress_handler import LogProgressHandler
from myworldapp.modules.comms.server.api.mywcom_error import MywcomError
from myworldapp.modules.comms.server.api.data_import_manager import DataImportManager
from myworldapp.modules.comms.server.data_import.data_importer import DataImporter


from .utils import handling_exceptions
from .mywcom_controller import MywcomController


class MywcomDataController(MywcomController):
    """
    Controller for managing data imports etc
    """

    def __init__(self, request):
        """
        Initialize slots of self
        """

        super().__init__(request, "DATA")

        self.mgr = DataImportManager(self.db)

    @view_config(
        route_name="mywcom_data_controller.data_import_configs",
        request_method="GET",
        renderer="json",
    )
    @handling_exceptions
    def data_import_configs(self):
        """
        Returns the configured data package definitions (a dict, keyed by internal name)
        """

        formatDefs = {}
        for name in self.mgr.dataImportConfigs():
            formatDefs[name] = self.mgr.importFormatDef(name)

        return formatDefs

    @view_config(
        route_name="mywcom_data_controller.upload_data", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def upload_data(self):
        """
        Upload a data package and unzip it

        Returns handle on data (for use in subsequent requests)"""

        # WARNING: Assumes use of stick sessions or shared upload cache

        # Unpick args
        zipdata_base64 = self.get_param(self.request, "filedata", mandatory=True)
        filename = self.get_param(self.request, "filename", mandatory=True)
        task_id = self.get_param(self.request, "task_id", type=int)
        application = self.get_param(self.request, "application")

        self.progress(1, task_id, "Uploading data package", ":", len(zipdata_base64), "bytes")

        # With task progress reporting enabled (if requested) ..
        with self.progressHandlerFor(task_id, 3) as progress:
            progress = LogProgressHandler(3, progress=progress)

            # Unzip the data (reporting errors to user)
            # with self.errorHandler():
            upload_id = self.saveData(filename, zipdata_base64, progress)

        return {"id": upload_id}

    def saveData(self, filename, zipdata_base64, progress):
        """
        Create a temporary directory structure from ZIPDATA_BASE64
        """

        # Unpick data
        zipdata = base64.b64decode(zipdata_base64)

        # Get locations for files (in upload cache dir)
        upload_id = self.tempName("mywcom_data_upload")
        upload_root = self.uploadDir(upload_id, create=True)
        zip_path = os.path.join(upload_root, filename)
        root_dir = os.path.join(upload_root, "data")

        # Store data as file
        with open(zip_path, "wb") as local_file:
            local_file.write(zipdata)

        if filename.split(".")[-1] == "zip":
            # Unzip it
            # ENH: Check for paths outside of root
            # ENH: Support gz, 7z and tar
            self.progress(1, "Unzipping data ...")
            with ZipFile(zip_path, "r") as zip_file:
                zip_file.extractall(root_dir)

            # ENH: Delete zip file

        return upload_id

    @view_config(
        route_name="mywcom_data_controller.preview_features", request_method="GET", renderer="json"
    )
    @handling_exceptions
    def preview_features(self):
        """
        Get features for previewing the content of an upload
        """

        task_id = self.get_param(self.request, "task_id", type=int)

        with self.engineFor() as engine:

            # Get preview
            feature_types = engine.previewFeatureTypes()
            with self.errorHandler():
                recs = engine.detachedFeatures(feature_types)

        self.progress(1, task_id, "Complete")

        # Workaround to avoid problems in .asGeojsonFeature()
        # ENH: Move to super .. or remove need for this
        id = -1
        for rec in recs:
            for field_name in rec._descriptor.storedFields():
                if rec[field_name].__class__.__name__ == "Null":
                    rec[field_name] = None
            rec["id"] = id
            id -= 1

        # Return result
        features = self.featuresFromRecs(recs)
        return MywFeatureCollection(features)

    @view_config(
        route_name="mywcom_data_controller.import_upload", request_method="POST", renderer="json"
    )
    @handling_exceptions
    def import_upload(self):
        """
        Import an uploaded data package
        """

        task_id = self.get_param(self.request, "task_id", type=int)
        application = self.get_param(self.request, "application")

        with self.engineFor() as engine:

            # Check we have permission to make the updates
            for ft in engine.featureTypes():
                self.current_user.assertAuthorized(
                    self.request, right="editFeatures", feature_type=ft, application=application
                )

            # Do import
            with self.errorHandler():
                engine.run()
                res = list(engine.featureTypes())  # ENH: Return stats + log

        self.progress(1, task_id, "Import complete")
        self.db.commit()

        # ENH: Return stats
        return {"feature_types": res, "log": self.log}

    @contextmanager
    def engineFor(self):
        """
        Create an engine for uploading and preview and provide context for it
        """

        # Unpick request parameters
        upload_id = self.get_param(self.request, "id")
        engine_name = self.get_param(self.request, "engine")
        engine_opts = self.get_param(self.request, "options", type="json", default={})
        mappings = self.get_param(self.request, "mappings", type="json", default={})
        coord_sys_name = self.get_param(self.request, "coord_system")
        delta = self.get_param(self.request, "delta")
        task_id = self.get_param(self.request, "task_id", type=int)
        application = self.get_param(self.request, "application")
        filename = self.get_param(self.request, "filename")

        # Check authorised (edit right checked later)
        self.current_user.assertAuthorized(self.request, application=application)

        # ENH: Check engine name good etc
        coord_sys = None  # Means get from package
        if coord_sys_name:
            coord_sys = MywCoordSystem(coord_sys_name)

        # Say what we are about to do (which could take minutes)
        self.progress(1, task_id, "Importing", upload_id, "using", engine_name)
        self.progress(3, task_id, "mappings", mappings)
        self.progress(3, task_id, "coord_system", coord_sys_name)
        self.progress(3, task_id, "delta", delta)

        db_view = self.db.view(delta)

        # With task progress reporting enabled (if requested) ..
        with self.progressHandlerFor(task_id, 3) as progress:
            progress = LogProgressHandler(3, progress=progress)

            # Find the data
            if filename.endswith("zip"):
                data_path = self.uploadDir(upload_id, "data")
            else:
                root_dir = self.uploadDir(upload_id)
                data_path = os.path.join(root_dir, filename)

            # Build data importer
            engine = DataImporter.buildEngine(
                data_path, engine_name, engine_opts, mappings, coord_sys, db_view, progress
            )

            yield engine

            # Save log
            self.log = progress.log

    @contextmanager
    def progressHandlerFor(self, task_id, level):
        """
        Yield progress handler to use for long ops

        If task_id is non-zero, creates a db progress handler (writes to table 'myw.configuration_task').
        This allows the client to track progress using the Core task service"""

        # ENH: Move to base?

        self.progress(3, "Reporting progress using task ID", task_id)

        if task_id:
            try:
                progress = ControllerProgressHandler(level, task_id, Session.bind)
                yield progress
            finally:
                progress.cleanup()

        else:
            yield self.progress

    @contextmanager
    def errorHandler(self):
        """
        Context manager that maps exception to MywError

        Used to report bad data in zip files etc"""

        # Do import
        try:
            yield self

        except (MywcomError, MywError) as cond:  # These get handled by handling_exceptions
            raise cond

        except Exception as cond:
            msg = "{}: {}".format(
                cond.__class__.__name__, cond
            )  # ENH: Return localisable string when Core 22808 fixed
            raise MywcomError(msg)
