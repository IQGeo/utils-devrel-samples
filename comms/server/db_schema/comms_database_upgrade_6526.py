# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import (
    CommsDatabaseUpgrade,
)
from myworldapp.modules.comms.server.config.config_manager import ConfigManager
from myworldapp.core.server.base.db.myw_db_meta import MywDbColumn


class CommsDatabaseUpgrade6526(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 6.5.2.6
    """

    from_version = 652502
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_6526")

    updates = {
        652601: "add_networks",
        652602: "add_path_finder_settings",
        652603: "add_task_queue",
        652604: "update_change_detail_feature",
    }

    def add_networks(self):
        """
        Add cable segment and fiber path networks
        """

        config_mgr = ConfigManager(self.db)

        # Load the network definition files
        self.loadResourceFiles(".", "*.network", update=True)

        # Add structures to cable segment network
        struct_types = self.db.setting("mywcom.structures") or {}
        for feature_type in struct_types:
            config_mgr._addToNetwork(
                "mywcom_cable_segment",
                feature_type,
                "in_fiber_segments",
                "out_fiber_segments",
            )

        # Add equipment to fiber path network
        equip_types = self.db.setting("mywcom.equipment") or {}
        for feature_type in equip_types:
            config_mgr._addToNetwork(
                "mywcom_fiber_path",
                feature_type,
                "fiber_connections",
                "fiber_connections",
            )

    def add_path_finder_settings(self):
        """
        Add new settings for path finder
        """
        self.loadResourceFiles("path_finder.settings", localiser=self.localiser)

    def add_task_queue(self):
        """
        Add task queue table for Task Manager functionality
        """

        self.loadResourceFiles("iqgapp_task_queue.def", localiser=self.localiser)

    def update_change_detail_feature(self):
        """
        Removes editability and query
        """

        self.loadResourceFiles("mywcom_change_detail.def", localiser=self.localiser)
