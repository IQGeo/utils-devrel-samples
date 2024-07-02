# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler


class DataImportManager:
    """
    Provides protocols for finding import engines etc
    """

    # Prefix for settings that define a data import format
    prefix = "mywcom.import_config."

    def __init__(self, db, progress=MywProgressHandler()):
        """
        Init slots of self
        """

        self.db = db
        self.progress = progress

    def dataImportConfigs(self):
        """
        Internal names of the defined import formats
        """

        names = []

        for setting_name in self.db.settings(self.prefix + "*"):
            format_name = setting_name[len(self.prefix) :]
            names.append(format_name)

        return sorted(names)

    def importFormatDef(self, name):
        """
        Definition of import format NAME

        Returns a dict with keys:
          name
          description
          engine
          file_specs
          mappings"""

        setting_name = self.prefix + name
        self.progress(5, "Reading format definition from setting:", setting_name)

        pkg_def = self.db.setting(setting_name)
        if not pkg_def:
            raise MywError("Unknown import format:", name)

        # ENH: Check structure ... or add defaults

        return pkg_def
