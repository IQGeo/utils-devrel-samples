# Copyright: IQGeo Limited 2010-2024
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.system.myw_localiser import MywLocaliser
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import (
    CommsDatabaseUpgrade,
)
from myworldapp.modules.comms.server.config.config_validator import ConfigValidator


class CommsDatabaseUpgrade7132(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 7.1.3.2
    """

    from_version = 713101
    supports_dry_run = False
  
    updates = {
        713201: "add_directed_field",
    }

    def add_directed_field(self):
        """
        Add directed field to the equipment features.
        """

        config_validator = ConfigValidator(self.db)

        equip = self.db.setting("mywcom.equipment") or {}

        # For each configured type ..
        for feature_type in equip:

            (feature_rec, feature_desc) = self.feature_desc_for(feature_type)

            # Add directed field if equipment has port fields
            port_count_fields = list(config_validator.portCountFields())
            feature_port_fields = [ field_name for field_name in feature_desc.fields if field_name in port_count_fields]

            if feature_port_fields:
                self._add_field(
                    feature_desc,
                    "directed",
                    "boolean",
                    "equipment_feature_directed_name",
                    default=True,
                    mandatory=True
                    )
                self.db.dd.alterFeatureType(feature_rec, feature_desc)

    def _add_field(self, feature_desc, field_name, type, field_name_msg_id, **props):
        """
        Adds FIELD to FEATURE_DESC
        Handles external name localisation.
        """

        if feature_desc.fields.get(field_name):
            return

        # Use the models msg file rather than install
        localiser = MywLocaliser(self.lang, "models", self.module.path)
        external_name = localiser.msg("install", field_name_msg_id)
       
        feature_desc.addField(field_name, type, external_name=external_name, **props)
    