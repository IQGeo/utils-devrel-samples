# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade


class CommsDatabaseUpgrade6525(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 6.5.2.5
    """

    from_version = 642404
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_6525")

    updates = {652501: "add_view_all_deltas_right", 652502: "add_system_changes_limit_setting"}

    def add_view_all_deltas_right(self):
        """
        Adds right for viewing all deltas w/out having the editMaster right
        """
        self.loadResourceFiles("view_all_deltas.rights", localiser=self.localiser)

    def add_system_changes_limit_setting(self):
        """
        Adds setting for max limit for system changes UI
        """
        self.loadResourceFiles("system_changes_limit.settings", localiser=self.localiser)
