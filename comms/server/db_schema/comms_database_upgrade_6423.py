# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade


class CommsDatabaseUpgrade6423(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 6.4.2.3
    """

    from_version = 632304
    supports_dry_run = True

    updates = {
        642301: "set_schema_version",
    }

    def set_schema_version(self):
        """
        Advance schema version stamp for this module's data-model
        """
        pass
