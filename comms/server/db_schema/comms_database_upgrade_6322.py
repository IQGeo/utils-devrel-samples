# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade


class CommsDatabaseUpgrade6322(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 6.3.2.2
    """

    from_version = 622219
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_6322")

    updates = {
        632201: "set_schema_version",
        632202: "remove_segment_geom_index",
        632203: "set_reference_fields_readonly",
    }

    def set_schema_version(self):
        """
        Advance schema version stamp for this module's data-model
        """
        pass

    def remove_segment_geom_index(self):
        """remove the geom index records for mywcom_fiber_segment"""
        new_feature_desc = {}
        new_feature_desc["geom_indexed"] = False

        feature_type = "mywcom_fiber_segment"
        segment_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        self.db.dd.alterFeatureType(segment_rec, new_feature_desc)

    def set_reference_fields_readonly(self):
        """Sets all the feature reference fields as read only"""
        feature_types = self.comms_6222_feature_types()

        for feature_type in feature_types:
            feature_type_rec, feature_type_desc = self.feature_desc_for(feature_type)

            if not feature_type_rec or not feature_type_desc:
                continue

            for field_name in feature_type_desc.fields:

                field_desc = feature_type_desc.fields.get(field_name)
                if field_desc.type == "reference" or field_desc.type == "reference_set":
                    self.progress(2, "Setting read_only=True for field: ", feature_type, field_name)
                    field_desc.read_only = True

            self.db.dd.alterFeatureType(feature_type_rec, feature_type_desc)
