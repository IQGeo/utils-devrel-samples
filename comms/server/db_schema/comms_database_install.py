################################################################################
# Data model installer
################################################################################
# Copyright: IQGeo Limited 2010-2023

import os

from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade


class CommsDatabaseInstall(CommsDatabaseUpgrade):
    """
    Database upgrade to install Comms system-of-record data model
    """

    # Constants (required by super)
    from_version = 0

    updates = {
        1: "define_feature_types",
        2: "configure_application",
        3: "register_config_page",
        521001: "init_version_stamp",
    }

    resource_dir = os.path.join(os.path.dirname(__file__), "resources")

    sub_modules = ["fiber", "structures", "circuits", "conduits"]

    def define_feature_types(self):
        """
        Load schema files
        """

        for sub_module in self.sub_modules:
            self.loadResourceFiles("install", sub_module, "*.def")

    def configure_application(self):
        """
        Defaine layers, networks, application etc
        """

        for sub_module in self.sub_modules:
            self.loadResourceFiles("install", sub_module, "*.layer")
            self.loadResourceFiles("install", sub_module, "*.network")

        self.loadResourceFiles("install", "*.settings")
        self.loadResourceFiles("install", "*.application")
        self.loadResourceFiles("install", "*.rights")

    def register_config_page(self):
        """
        Add the Comms tab to the Settings config page
        """

        config_pages = ["comms.setting"] + self.db.setting("core.configSettingsPages")
        self.db.setSetting("core.configSettingsPages", config_pages)

    def init_version_stamp(self):
        """
        Dummy update to init the final version stamp
        """

        pass
