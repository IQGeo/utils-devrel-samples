# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade


class CommsDatabaseUpgrade6424(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 6.4.2.4
    """

    from_version = 642301
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_6424")

    updates = {
        642401: "add_bulk_move_settings",
        642402: "add_design_markup",
        642403: "add_layout_strand",
        642404: "add_data_import_settings",
    }

    def add_bulk_move_settings(self):
        """
        Adds settings and right for controlling bulk_move functionality
        """
        self.loadResourceFiles("bulk_move.settings", localiser=self.localiser)
        self.loadResourceFiles("bulk_move.rights", localiser=self.localiser)

    def add_design_markup(self):
        """
        Add features and layer for design markup
        """

        self.loadResourceFiles("markup", "*.def", localiser=self.localiser)
        self.loadResourceFiles("markup", "*.layer", localiser=self.localiser)
        self.loadResourceFiles("markup", "markup.settings", localiser=self.localiser)

        self.add_layer_to("mywcom", "iqgapp_markup_layer")

    def add_layout_strand(self):
        """
        Adds settings config for layout strand tool.
        """

        self.loadResourceFiles("layout_strand.settings", localiser=self.localiser)

    def add_data_import_settings(self):
        self.loadResourceFiles("data_import.settings", localiser=self.localiser)
