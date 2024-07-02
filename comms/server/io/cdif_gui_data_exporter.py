# Copyright: IQGeo Limited 2010-2024

import os

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.data_import.data_exporter import DataExporter
from myworldapp.core.server.io.myw_data_exporter import MywDataExporter
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

class CdifGuiDataExporter(DataExporter):
    """
    Engine for exporting Comms physical data in NM CDIF format From GUI
    """

    def __init__(self, current_user, db_view, coord_sys, progress=MywProgressHandler()):
        """
        Init slots of self

        """       
        super().__init__(db_view, None, None, current_user, coord_sys, progress)

    def run(self, filename, area=None, **kwargs):
        """
        Create export directory tree and dump files
        """
        
        # ENH: bit of a hack to work with platform myw_export_controller
        file_parts = filename.split(".")
        file_dir = file_parts[0]
        
        tmp_dir = Path(file_dir)
        self.dir = tmp_dir
        
        self.runExport()

        self.build_zip(filename, self.dir)
    
        return filename
    
    def build_zip(self, zip_file_name, src_dir):
        """
        Add files from SRC_DIR to ZIP_FILE
        """
        # ENH: Copied from comms_db_command.py

        with ZipFile(zip_file_name, "w", ZIP_DEFLATED) as zip_file:
            for dir, dir_names, dir_file_names in os.walk(src_dir):

                for file_name in dir_file_names:
                    file_path = os.path.join(dir, file_name)
                    self.progress(4, "Processing file:", file_path)

                    zip_path = os.path.relpath(file_path, src_dir)
                    info = ZipInfo.from_file(file_path, zip_path)
                    self.progress(1, "Adding file:", zip_path)

                    with open(file_path, "rb") as contents:
                        zip_file.writestr(info, contents.read())

   
MywDataExporter.register("cdif", CdifGuiDataExporter)
