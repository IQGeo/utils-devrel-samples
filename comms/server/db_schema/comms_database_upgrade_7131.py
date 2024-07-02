# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import (
    CommsDatabaseUpgrade,
)


class CommsDatabaseUpgrade7131(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 7.1.3.1
    """

    from_version = 703012
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_7131")


    updates = {
        713101: "add_tmf_settings",
    }


    def add_tmf_settings(self):
        """
        Add TMF api settings 
            1) category aliases to remove abbreviations 
            2) required TMF fields by category
            3) empty tmfTables aliases, populated in devDB w/ the model 
        """

        self.loadResourceFiles("tmf.settings", localiser=self.localiser)

