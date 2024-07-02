# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import (
    CommsDatabaseUpgrade,
)


class CommsDatabaseUpgrade7026(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 7.0.2.6
    """

    from_version = 652604
    supports_dry_run = True

    updates = {
        702601: "set_schema_version",
    }

    def set_schema_version(self):
        """
        Advance schema version stamp for this module's data-model
        """
        pass
