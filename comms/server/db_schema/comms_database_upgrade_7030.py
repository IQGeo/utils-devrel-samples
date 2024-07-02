# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import (
    CommsDatabaseUpgrade,
)


class CommsDatabaseUpgrade7030(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 7.0.3.0
    """

    from_version = 702601
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_7030")
    copper_exists = False

    updates = {
        703000: "check_for_copper",
        703001: "add_cable_technology",
        703002: "add_equipment_technology",
        703003: "add_copper_schema",
        703004: "add_coaxial_schema",
        703005: "add_segment_refs_to_housings",
        703006: "add_line_of_count_schema",
        703007: "add_network_types",
        703008: "add_fiber_layout_group",
        703009: "add_segment_containment_fields",
        703010: "add_coax_offset_layers",
        703011: "add_data_block",
        703012: "add_loss_settings",
    }

    def check_for_copper(self):
        """
        Check if copper exists in the database 
        """
        if self.copperExists():
            self.copper_exists = True

    def add_cable_technology(self):
        """
        Add fiber technology to existing cables.
        """
        cables = self.db.setting("mywcom.cables") or {}

        for cable in cables.keys():

            cable_config = cables[cable]
            tech = cable_config.get("tech")

            if tech == None:
                cable_config["tech"] = "fiber"

        self.db.setSetting("mywcom.cables", cables)

    def add_equipment_technology(self):
        """
        Add fiber technology to existing equipment.
        """
        equipment = self.db.setting("mywcom.equipment") or {}

        for equip in equipment.keys():

            equip_config = equipment[equip]
            tech = equip_config.get("tech")

            if tech == None:
                if equip_config["function"] == "enclosure":
                    equip_config["tech"] = "mixed"
                elif tech == None:
                    equip_config["tech"] = "fiber"

        self.db.setSetting("mywcom.equipment", equipment)

    def add_fiber_layout_group(self):
        """
        Add all necessary layers and definitions of fiber to the database
        """
        self.loadResourceFiles("mywcom_fiber_group.layer_group", localiser=self.localiser)
        
        if self.copper_exists:
            self.warning(1, 'Copper schema already exists, skipping the loading of mywcom_mixed_equipment.layer')
        else:
            self.loadResourceFiles("mywcom_mixed_equipment.layer", localiser=self.localiser)
            self.add_layer_to("mywcom", "mywcom_mixed_equipment")

    def add_copper_schema(self):
        """
        Add all necessary layers and definitions of copper to the database
        """

        if self.copper_exists:
            self.warning(1, 'Copper schema already exists, skipping')
            return

        self.loadResourceFiles("mywcom_copper_connection.def", localiser=self.localiser)
        self.loadResourceFiles("mywcom_copper_segment.def", localiser=self.localiser)
        self.loadResourceFiles("mywcom_copper_slack.def", localiser=self.localiser)
        self.loadResourceFiles("mywcom_copper.network", localiser=self.localiser)
        self.loadResourceFiles("mywcom_copper_cables.layer", localiser=self.localiser)
        self.loadResourceFiles("mywcom_copper_equipment.layer", localiser=self.localiser)

        self.add_to_layer(
            "mywcom_cable_segments",
            "mywcom_copper_connection",
            point_style="circle:#b87333:0.5m:#b87333",
            min_vis=0,
            max_vis=0,
            min_select=0,
            max_select=0,
        )
        self.add_to_layer(
            "mywcom_cable_segments",
            "mywcom_copper_segment",
            line_style="#b87333:4:shortdash:none:arrow",
        )

        self.add_layer_to("mywcom", "mywcom_copper_cables")
        self.add_layer_to("mywcom", "mywcom_copper_equipment")

        self.add_to_layer(
            "mywcom_copper_equipment",
            "mywcom_copper_slack",
            point_style="modules/comms/images/features/copper/copper_slack.svg:12:0",
        )

        color_schemes = self.db.setting("mywcom.fiberColorSchemes") or {}

        json_file = self.resourceFile("copper_color_schemes.json")
        new_schemes = json.load(open(json_file))
        for k, v in new_schemes.items():
            color_schemes[k] = v

        self.db.setSetting("mywcom.fiberColorSchemes", color_schemes)

        self.loadResourceFiles("mywcom_copper_group.layer_group", localiser=self.localiser)

        # add EWL settings
        self.loadResourceFiles("ewl.settings", localiser=self.localiser)

    def add_coaxial_schema(self):
        """
        Add all necessary layers and definitions of coaxial to the database
        """
        self.loadResourceFiles("mywcom_coax_connection.def", localiser=self.localiser)
        self.loadResourceFiles("mywcom_coax_segment.def", localiser=self.localiser)
        self.loadResourceFiles("mywcom_coax_slack.def", localiser=self.localiser)
        self.loadResourceFiles("mywcom_coax.network", localiser=self.localiser)
        self.loadResourceFiles("mywcom_coax_cables.layer", localiser=self.localiser)
        self.loadResourceFiles("mywcom_coax_equipment.layer", localiser=self.localiser)

        self.add_to_layer(
            "mywcom_cable_segments",
            "mywcom_coax_connection",
            point_style="circle:#48a872:0.5m:#48a872",
            min_vis=0,
            max_vis=0,
            min_select=0,
            max_select=0,
        )
        self.add_to_layer(
            "mywcom_cable_segments",
            "mywcom_coax_segment",
            line_style="#9bbf88:4:shortdash:none:arrow",
        )

        self.add_layer_to("mywcom", "mywcom_coax_cables")
        self.add_layer_to("mywcom", "mywcom_coax_equipment")

        self.add_to_layer(
            "mywcom_coax_equipment",
            "mywcom_coax_slack",
            point_style="modules/comms/images/features/fiber_slack.svg:12:0",
        )

        self.loadResourceFiles("mywcom_coax_group.layer_group", localiser=self.localiser)

    def add_segment_refs_to_housings(self):
        """
        Add segment refs to route and conduit features
        """
        routes = list(self.db.setting("mywcom.routes").keys())
        conduits = list(self.db.setting("mywcom.conduits").keys())
        housings = routes + conduits

        if self.copper_exists:
            self.warning(1, "Copper schema exists, adding only coax segment refs to housings")
            new_seg_features = ["mywcom_coax_segment"]
        else:
            new_seg_features = ["mywcom_copper_segment", "mywcom_coax_segment"]

        for housing in housings:
            # Check housing exists
            ft_rec = self.db.dd.featureTypeRec("myworld", housing)
            if not ft_rec:
                self.progress("warning", "No such feature type", housing)
                continue

            # Get equipment field
            ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)
            seg_field = ft_desc.fields.get("cable_segments")

            if not seg_field:
                self.progress("warning", "cable_segments field does not exist", housing)
                continue

            for new_seg_feature in new_seg_features:
                # Get field specs
                select_regex = re.compile("^select\((.*)\)$")
                match = select_regex.match(seg_field.value)
                field_specs = match.group(1)

                # If ref is not in field_specs, add it
                if new_seg_feature not in field_specs:
                    self.progress(
                        1,
                        "Adding",
                        new_seg_feature,
                        "to field",
                        ft_rec,
                        ".cable_segments",
                    )

                    # Add feature to field specs
                    if field_specs != "":
                        field_specs += ","
                    field_specs += "{}.housing".format(new_seg_feature)
                    field_specs = "select(" + field_specs + ")"
                    seg_field.value = field_specs

                    self.db.dd.alterFeatureType(ft_rec, ft_desc)

    def add_line_of_count_schema(self):
        """
        Add schema to support line of count
        """

        self.loadResourceFiles("loc_status.enum", localiser=self.localiser)
        self.loadResourceFiles("mywcom_line_of_count.def", localiser=self.localiser)
        self.loadResourceFiles("mywcom_line_of_count_section.def", localiser=self.localiser)

        self.loadResourceFiles("mywcom_line_of_count.layer", localiser=self.localiser)
        self.add_layer_to("mywcom", "mywcom_line_of_count")

        self.loadResourceFiles("line_of_count.settings", localiser=self.localiser)

    def add_network_types(self):
        """
        Add settings for network types. Previously hard coded in network.py
        """
        if not self.copper_exists:
            self.loadResourceFiles("network_types.settings", localiser=self.localiser)
        else: 
            self.warning(1, "Copper schema exists, only adding coax network type")
            self._add_coax_network()

    def add_segment_containment_fields(self):
        """
        Add fields on segment features to store in and out equip
        """

        seg_fts = [
            "mywcom_fiber_segment",
            "mywcom_copper_segment",
            "mywcom_coax_segment",
        ]

        dd = self.db.dd

        for ft in seg_fts:
            self.progress(2, "Adding fields to", ft)

            ft_rec = dd.featureTypeRec("myworld", ft)
            ft_desc = dd.featureTypeDescriptor(ft_rec)

            ft_desc.addField("in_equipment", "reference", indexed=True)
            ft_desc.addField("out_equipment", "reference", indexed=True)

            dd.alterFeatureType(ft_rec, ft_desc)


    def add_coax_offset_layers(self):

        self.loadResourceFiles("mywcom_coax_cables_offset.layer", localiser=self.localiser)
        self.loadResourceFiles("mywcom_coax_equipment_offset.layer", localiser=self.localiser)
        self.add_layer_to("mywcom", "mywcom_coax_cables_offset", True)
        self.add_layer_to("mywcom", "mywcom_coax_equipment_offset", True)

        self.loadResourceFiles("mywcom_coax_offset_group.layer_group", localiser=self.localiser)

    def add_data_block(self):

        self.loadResourceFiles("mywcom_data_block.def", localiser=self.localiser)
        self.loadResourceFiles("mywcom_data_block.layer", localiser=self.localiser)
        self.loadResourceFiles("mywcom_data_block.setting", localiser=self.localiser)
        self.add_layer_to("mywcom", "mywcom_data_block")

    def add_loss_settings(self):
        """
        Adds loss config to replace fiber_loss.settings
        """
        if not self.copper_exists:
            self.loadResourceFiles("loss.settings", localiser=self.localiser)
        else:
            self.warning(1, "Copper schema exists, skip loading loss settings")
    
    def _add_coax_network(self):
        """
        Add coax network to database
        """
        coax_network_config =  {
            "segment_type": "mywcom_coax_segment",
            "slack_type": "mywcom_coax_slack",
            "connection_type": "mywcom_coax_connection",
            "struct_in_segments_field": "in_coax_segments",
            "struct_out_segments_field": "out_coax_segments",
            "equip_n_in_pins_field": "n_coax_in_ports",
            "equip_n_out_pins_field": "n_coax_out_ports",
            "equip_n_pins_field": "n_coax_ports",
            "cable_n_pins_field": "coax_count",
            "connections_field": "coax_connections",
            "splices_field": "coax_splices",
            "network_name": "mywcom_coax"
        }

        network_settings = self.db.setting("mywcom.networks")

        if not network_settings:
            return
        
        network_settings["coax"] = coax_network_config

        self.db.setSetting("mywcom.networks", network_settings)

    
    def copperExists(self):
        """
        Check if copper exists in the database
        """
        copper_ftrs = ['mywcom_copper_connection', 'mywcom_copper_segment', 'mywcom_copper_slack']

        for ftr in copper_ftrs:
            if not self.featureExists(ftr):
                return False
    
        return True