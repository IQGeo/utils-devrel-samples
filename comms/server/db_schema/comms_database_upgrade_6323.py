# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade


class CommsDatabaseUpgrade6323(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 6.3.2.3
    """

    from_version = 632203
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_6323")

    updates = {
        632301: "add_design_user_group_setting",
        632302: "add_design_feature_user_group_field",
        632303: "add_mywcom_change_detail_feature",
        632304: "add_mywcom_change_detail_feature_to_structures_layer",
    }

    def add_design_user_group_setting(self):
        """
        Add user group field to existing design settings.
        """
        designs = self.db.setting("mywcom.designs") or {}

        for design in designs.keys():
            designs[design]["userGroup"] = "user_group"

        self.db.setSetting("mywcom.designs", designs)

    def add_design_feature_user_group_field(self):
        """
        Add user group field to existing design features.
        """
        designs = self.db.setting("mywcom.designs") or {}

        for design in designs.keys():
            feature_type_rec, feature_type_desc = self.feature_desc_for(design)

            if (
                not feature_type_rec
                or not feature_type_desc
                or feature_type_desc.fields.get("user_group")
            ):
                continue

            self.add_field(feature_type_desc, "user_group", "string(200)")

            self.db.dd.alterFeatureType(feature_type_rec, feature_type_desc)

    def add_mywcom_change_detail_feature(self):
        """
        Adds feature mywcom_change_detail from def file
        """

        self.loadResourceFiles("mywcom_change_detail.def", localiser=self.localiser)

    def add_mywcom_change_detail_feature_to_structures_layer(self):
        """
        Adds mywcom_change_detail to mywcom_structures layer. This is better than adding
        a new layer that then has to be added to applications.
        """

        self.add_to_layer("mywcom_structures", "mywcom_change_detail")
