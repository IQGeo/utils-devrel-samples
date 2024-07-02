# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.database.myw_database_upgrade import MywDatabaseUpgrade
from myworldapp.core.server.base.system.myw_localiser import MywLocaliser


class CommsDatabaseUpgrade(MywDatabaseUpgrade):
    """
    Superclass for comms database upgrades

    Provides common useful methods and localisation
    """

    # Constants
    module_name = "comms"
    schema_vs_name = "myw_comms_schema"

    def __init__(self, session, progress=MywProgressHandler(), lang=None, encoding=None):
        """
        Init slots of self
        """

        super().__init__(session, progress, lang, encoding)

        # Override the default localiser)
        self.localiser = MywLocaliser(self.lang, "install", self.module.path)

    # ------------------------------------------------------------------------------
    #                                       HELPERS
    # ------------------------------------------------------------------------------

    def add_layer_to(self, app_name, layer_name, snap=False):
        """
        Adds layer LAYER_NAME to application APP_NAME (if possible)

        Returns true if added successfully"""

        # Find application record
        app_rec = self.db.config_manager.applicationRec(app_name)

        if not app_rec:
            self.progress(2, "No such application", app_name)
            return False

        # Check for already present
        layer_items = app_rec.layer_items()
        for item in layer_items:
            if item["name"] == layer_name:
                self.progress(2, "Layer already present", layer_name)
                return False

        # Add it
        item = {"name": layer_name, "snap": snap, "read_only": False}

        layer_items.append(item)
        app_rec.set_layers(layer_items)

        return True

    def feature_desc_for(self, feature_type):
        """
        Get feature descriptor from FEATURE_TYPE
        """

        feature_type_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        if not feature_type_rec:
            self.progress("warning", "No such feature type", feature_type)
            return

        return feature_type_rec, self.db.dd.featureTypeDescriptor(feature_type_rec)

    def add_field(self, feature_desc, field_name, type, **props):
        """
        Adds FIELD to SPEC_DESC
        Also adds field to first group of spec (if possible)
        """

        if feature_desc.fields.get(field_name):
            return

        # Add field
        external_name = self.localiser.msg("install", field_name)
        feature_desc.addField(field_name, type, external_name=external_name, **props)

    def add_to_layer(
        self,
        layer_name,
        feature_type,
        field_name=None,
        point_style=None,
        line_style=None,
        text_style=None,
        min_vis=None,
        max_vis=None,
        min_select=None,
        max_select=None,
    ):
        """
        Adds FEATURE_TYPE to LAYER (if not already present).
        """

        # Check for already present
        layer_def = self.db.config_manager.layerDef(layer_name)

        item_defs = layer_def.get("feature_types")
        if item_defs:
            for item_def in item_defs:
                if item_def["name"] == feature_type:
                    self.progress(2, feature_type, "already in layer", layer_name)
                    return

        # Build item def
        item_def = {"name": feature_type}

        if point_style:
            item_def["point_style"] = point_style
        if line_style:
            item_def["line_style"] = line_style
        if field_name:
            item_def["field_name"] = field_name
        if text_style:
            item_def["text_style"] = text_style
        if min_vis or min_vis == 0:
            item_def["min_vis"] = min_vis
        if max_vis or max_vis == 0:
            item_def["max_vis"] = max_vis
        if min_select or min_select == 0:
            item_def["min_select"] = min_select
        if max_select or max_select == 0:
            item_def["max_select"] = max_select

        # Add it
        if not layer_def.get("feature_types"):
            layer_def["feature_types"] = []
        layer_def["feature_types"].append(item_def)

        with self.progress.operation("Adding", feature_type, "to layer", layer_name):
            self.db.config_manager.updateLayer(layer_name, layer_def)

    def comms_6222_feature_types(self):
        """
        Names of the network manager feature types
        """
        structs = self.db.setting("mywcom.structures") or {}
        routes = self.db.setting("mywcom.routes") or {}
        conduits = self.db.setting("mywcom.conduits") or {}
        equips = self.db.setting("mywcom.equipment") or {}
        cables = self.db.setting("mywcom.cables") or {}
        designs = self.db.setting("mywcom.designs") or {}
        circuits = self.db.setting("mywcom.circuits") or {}

        comms_managed = [
            "mywcom_fiber_segment",
            "mywcom_fiber_connection",
            "mywcom_labor_cost",
            "mywcom_fiber_slack",
            "mywcom_route_junction",
            "mywcom_conduit_run",
        ]

        return (
            list(structs.keys())
            + list(routes.keys())
            + list(conduits.keys())
            + list(equips.keys())
            + list(cables.keys())
            + list(designs.keys())
            + list(circuits.keys())
            + comms_managed
        )

    def featureExists(self, feature_type):
        """
        Returns True feature exists in the database
        """

        if not self.db.dd.featureTypeRec("myworld", feature_type):
            return False
        
        return True