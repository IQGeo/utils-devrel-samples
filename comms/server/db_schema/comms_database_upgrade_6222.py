# Copyright: IQGeo Limited 2010-2023
import json
import os

from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade
from sqlalchemy.orm import load_only


class CommsDatabaseUpgrade6222(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 6.2.2.2
    """

    from_version = 622107
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_6222")

    updates = {
        622201: "add_report_settings",
        622202: "add_right_publish_design",
        622203: "grant_right_publish_design",
        622204: "add_segment_tick_mark_fields",
        622205: "add_cable_tick_mark_fields",
        622206: "add_cable_spec_tick_mark_fields",
        622207: "set_spec_retired_field_mandatory",
        622208: "add_right_manage_labor_costs",
        622209: "grant_right_manage_labor_costs",
        622210: "add_mywcom_labor_costs_setting",
        622211: "add_mywcom_labor_cost_feature",
        622212: "add_labor_cost_feature_to_structures_layer",
        622213: "add_labor_cost_field_to_all_comms_features",
        622214: "migrate_fiber_spec_cable_structure",
        622215: "migrate_fiber_color_schemes_setting",
        622216: "add_core_unit_fiber_loss",
        622217: "add_fiber_loss_settings",
        622218: "migrate_circuit_segments",
        622219: "migrate_circuit_ports",
    }

    def add_report_settings(self):
        """
        Add setting for configuring fiber report
        """

        self.loadResourceFiles("report.settings", localiser=self.localiser)

    def add_right_publish_design(self):
        """
        Adds new right for controlling who can publish a design
        """

        self.loadResourceFiles("design.rights", localiser=self.localiser)

    def grant_right_publish_design(self):
        """
        Grants 'publishDesign' right to roles that have the 'editFeatures' right in mywcom application
        """

        for role_name in self.db.config_manager.roleNames(sort=True):
            if self.has_right(role_name, "mywcom", "editFeatures"):
                self.grant_right(role_name, "mywcom", "mywcom.publishDesign")

    def add_segment_tick_mark_fields(self):
        """
        Adds fields 'in_tick' and 'out_tick' to fiber segment
        """

        feature_type = "mywcom_fiber_segment"
        feature_desc = self._feature_desc_for(feature_type)
        segment_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        self._add_field(feature_desc, "in_tick", "integer")
        self._add_field(feature_desc, "out_tick", "integer")
        self.db.dd.alterFeatureType(segment_rec, feature_desc)

    def add_cable_tick_mark_fields(self):
        """
        Adds 'tick_mark_spacing' field to cables
        """

        cables = self.db.setting("mywcom.cables") or {}

        # For each configured type ..
        for feature_type in cables:
            feature_desc = self._feature_desc_for(feature_type)
            feature_rec = self.db.dd.featureTypeRec("myworld", feature_type)
            self._add_field(
                feature_desc,
                "tick_mark_spacing",
                "double",
                unit="m",
                display_unit="ft",
                unit_scale="length",
            )
            self.db.dd.alterFeatureType(feature_rec, feature_desc)

    def add_cable_spec_tick_mark_fields(self):
        """
        Adds 'tick_mark_spacing' field to cable specs
        """

        cables = self.db.setting("mywcom.cables") or {}

        # For each configured type ..
        for feature_type in cables:
            feature_type = feature_type + "_spec"
            feature_desc = self._feature_desc_for(feature_type)

            # Check spec exists
            if not feature_desc:
                continue

            spec_rec = self.db.dd.featureTypeRec("myworld", feature_type)
            self._add_field(
                feature_desc,
                "tick_mark_spacing",
                "double",
                unit="m",
                display_unit="ft",
                unit_scale="length",
            )
            self.db.dd.alterFeatureType(spec_rec, feature_desc)

    def set_spec_retired_field_mandatory(self):
        """
        Updates SPEC features to make the retired field Mandatory and default value 'false'
        """

        spec_feature_type_names = [x + "_spec" for x in self.db.setting("mywcom.specs").keys()]

        for spec_feature_type_name in spec_feature_type_names:
            # Get desc
            desc = self._feature_desc_for(spec_feature_type_name)
            if not desc:
                continue
            ft_rec = self.db.dd.featureTypeRec("myworld", spec_feature_type_name)

            # Get the retired field
            retired_field = desc.fields.get("retired")
            if not retired_field:
                continue

            # If already mandatory, don't process
            if retired_field.mandatory == "true":
                continue

            self.progress(
                0, spec_feature_type_name, ": Changing", retired_field.name, "field to mandatory"
            )

            # Update all records where retired is null
            spec_table = self.db.tables[spec_feature_type_name]
            for rec in spec_table.filterOn(retired_field.name, None):
                rec[retired_field.name] = False
                spec_table.update(rec)

            # Update feature definition
            retired_field.mandatory = True
            retired_field.default = "false"
            self.db.dd.alterFeatureType(ft_rec, desc)

    def add_right_manage_labor_costs(self):
        """
        Adds new right for controlling who can manage labor costs
        """

        self.loadResourceFiles("labor_costs.rights", localiser=self.localiser)

    def grant_right_manage_labor_costs(self):
        """
        Grants 'manageLaborCosts' right to roles that have the 'manageSpecifications' right in mywcom application
        """

        for role_name in self.db.config_manager.roleNames(sort=True):
            if self.has_right(role_name, "mywcom", "manageSpecifications"):
                self.grant_right(role_name, "mywcom", "mywcom.manageLaborCosts")

    def add_mywcom_labor_costs_setting(self):
        """
        Adds setting 'mywcom.laborCosts' and populate it for each comms feature
        """

        features = self.comms_6221_feature_types()
        setting = dict.fromkeys(features, "labor_costs")
        self.db.setSetting("mywcom.laborCosts", setting)

    def add_mywcom_labor_cost_feature(self):
        """
        Adds feature mywcom_labor_cost from def file
        """

        self.loadResourceFiles("mywcom_labor_cost.def", localiser=self.localiser)

    def add_labor_cost_feature_to_structures_layer(self):
        """
        Adds mywcom_labor_cost to mywcom_structures layer
        """

        MywLayer = self.rawModelFor("myw", "layer")
        MywLayerFeatureItem = self.rawModelFor("myw", "layer_feature_item")
        MywDDFeature = self.rawModelFor("myw", "dd_feature")
        struct_layer_rec = (
            self.session.query(MywLayer).filter(MywLayer.name == "mywcom_structures").first()
        )
        feature_rec = (
            self.session.query(MywDDFeature)
            .filter(MywDDFeature.feature_name == "mywcom_labor_cost")
            .first()
        )

        # Add the mywcom_labor_cost feature to structures layer
        item_rec = MywLayerFeatureItem(
            layer_id=struct_layer_rec.id, feature_id=feature_rec.id, field_name="-"
        )

        self.session.add(item_rec)

    def add_labor_cost_field_to_all_comms_features(self):
        """
        Adds labor cost field to all comms features (not circuits), including specs
        """

        for feature in self.comms_6221_feature_types():
            self.progress(1, "Adding labor_costs field to feature type", feature)

            # Get descriptor
            ft_rec = self.db.dd.featureTypeRec("myworld", feature)
            if not ft_rec:
                continue
            ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

            # Add labor_costs field
            self._add_field(ft_desc, "labor_costs", "string()")
            self.db.dd.alterFeatureType(ft_rec, ft_desc)

    def add_core_unit_fiber_loss(self):
        """
        Adds a core unit to the core unit settings for fiber loss
        """

        self.progress(1, "Adding new fiber_loss scale to core units")

        core_units = self.db.setting("core.units") or {}
        core_units["fiber_loss"] = {"base_unit": "dB", "units": {"dB": 1}}
        self.db.setSetting("core.units", core_units)

    def add_fiber_loss_settings(self):
        """
        Adds new right for controlling who can manage labor costs
        """

        self.loadResourceFiles("fiber_loss.settings", localiser=self.localiser)

    def migrate_fiber_spec_cable_structure(self):
        """
        Migrate fiber_color_scheme and fiber_color_scheme_config to cable_structure
        """

        spec_feature_type_names = [x + "_spec" for x in self.db.setting("mywcom.cables").keys()]

        for spec_feature_type_name in spec_feature_type_names:
            self.progress(0, "Migrating cable structure for", spec_feature_type_name)

            # Get desc
            desc = self._feature_desc_for(spec_feature_type_name)
            if not desc:
                continue
            ft_rec = self.db.dd.featureTypeRec("myworld", spec_feature_type_name)

            # Add cable_structure field
            self._add_field(desc, "cable_structure", "string")
            self.db.dd.alterFeatureType(ft_rec, desc)

            # Migrate records in the spec table to cable_structure
            spec_table = self.db.tables[spec_feature_type_name]
            for rec in spec_table:
                if not rec.color_scheme:
                    continue

                orig_structure = rec.color_scheme_config
                if orig_structure:
                    orig_structure = json.loads(orig_structure)
                else:
                    # If original structure is not set, default it to the implied structure (12 fibers by N tubes)
                    orig_structure = [{"bundleSize": 12, "bundleType": None}]
                    if rec.fiber_count > 12:
                        orig_structure.insert(
                            0, {"bundleSize": int(rec.fiber_count / 12), "bundleType": "tube"}
                        )

                new_structure = []
                for structure_level in orig_structure:
                    new_structure.append(
                        {
                            "bundleType": structure_level["bundleType"],
                            "bundleSize": structure_level["bundleSize"],
                            "colorScheme": rec.color_scheme,
                        }
                    )

                rec["cable_structure"] = json.dumps(new_structure)

                spec_table.update(rec)

            # Update display to show the cable_structure instead of color_scheme
            for group in desc.groups:
                if "color_scheme_config" in group["fields"]:
                    group["fields"].remove("color_scheme_config")
                if "color_scheme" in group["fields"]:
                    index = group["fields"].index("color_scheme")
                    group["fields"][index] = "cable_structure"

            # Drop color_scheme and color_scheme_config fields
            if "color_scheme" in desc.fields:
                del desc.fields["color_scheme"]
            if "color_scheme_config" in desc.fields:
                del desc.fields["color_scheme_config"]
            self.db.dd.alterFeatureType(ft_rec, desc)

    def migrate_fiber_color_schemes_setting(self):
        color_schemes = self.db.setting("mywcom.fiberColorSchemes")

        for key, color_scheme in color_schemes.items():
            # Remove the 'engine' property
            del color_scheme["engine"]

            # Wrap the color as an object
            color_scheme["colors"] = [{"color": x} for x in color_scheme["colors"]]

            # Duplicate colors and add stripes for wellknown schemes
            if key in ["TIA-598-C"]:
                # This color scheme has a black stripe on 13-24
                # Except the stripe on the black cable is changed to yellow
                new_colors = []
                for old_color in color_scheme["colors"]:
                    stripe_color = "yellow" if old_color["color"] == "black" else "black"
                    new_colors.append({"color": old_color["color"], "stripes": [stripe_color]})
                color_scheme["colors"] += new_colors

            if key in ["DIN VDE 0888", "FIN2012"]:
                # These color schemes have a black stripe on 13-24
                # Except black cable is replaced with transparent and no stripe
                new_colors = []
                for old_color in color_scheme["colors"]:
                    base_color = old_color["color"]
                    stripes = ["black"]
                    if base_color == "black":
                        base_color = "transparent"
                        stripes = []
                    new_colors.append({"color": base_color, "stripes": stripes})
                color_scheme["colors"] += new_colors

        self.db.setSetting("mywcom.fiberColorSchemes", color_schemes)

    def migrate_circuit_segments(self):
        self.drop_fiber_segment_circuit_segments_field()
        self.drop_circuit_segments_layer()

        # Add Circuts Field to mywcom_fiber_segment
        feature_type = "mywcom_fiber_segment"
        feature_desc = self._feature_desc_for(feature_type)
        segment_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        self._add_field(feature_desc, "circuits", "reference_set")
        self.db.dd.alterFeatureType(segment_rec, feature_desc)

        # Update fiber_segments in all schemas by applying the new Qualified URN
        # format of the circuit_segments from the DATA schema.
        # This establishes a baseline for what UNCHANGED looks like for the fiber_segment records
        for schema in ["data", "base", "delta"]:
            self.migrate_circuit_segment_baseline(schema)

        # Now that baseline has been established, apply circuit_segment changes in each delta
        self.migrate_circuit_segments_in_deltas()

        # Finally, drop the circuit_segment table
        self.db.dd.emptyFeatureTable("mywcom_circuit_segment")
        feature_type_rec = self.db.dd.featureTypeRec("myworld", "mywcom_circuit_segment")
        self.db.dd.dropFeatureType(feature_type_rec)

    def drop_fiber_segment_circuit_segments_field(self):
        """Drop the circuit_segments field from mywcom_fiber_segment"""
        feature_rec = self.db.dd.featureTypeRec("myworld", "mywcom_fiber_segment")
        feature_desc = self.db.dd.featureTypeDescriptor(feature_rec)
        feature_desc.dropField("circuit_segments")
        self.db.dd.alterFeatureType(feature_rec, feature_desc)

    def drop_circuit_segments_layer(self):
        self.db.config_manager.dropLayer("mywcom_circuit_segments")

    def migrate_circuit_segment_baseline(self, schema="data"):
        """For each fiber_segment record in the schema, set the circuits field to the
        new Qualified URN format of circuit_segments in the DATA schema."""

        fiberSegmentModels = self.db.dd.featureModelsFor("mywcom_fiber_segment")
        fiber_segment_model = fiberSegmentModels[schema]
        circuit_segment_model = self.db.dd.featureModel("mywcom_circuit_segment", "data")

        # Subset of fields that should be returned while retrieving related circuit_segments
        cable_segment_fields = [
            circuit_segment_model.id,
            circuit_segment_model.cable_segment,
            circuit_segment_model.circuit,
            circuit_segment_model.low,
            circuit_segment_model.high,
        ]

        # ENH - Only process fiber_segment records that are related to circuit_segments
        fiber_segment_query = (
            self.db.session.query(fiber_segment_model)
            .options(load_only(fiber_segment_model.id, fiber_segment_model.circuits))
            .order_by(fiber_segment_model.id)
        )

        # for fiber_segment in self.query_stream(fiber_segment_query, 1000):
        for fiber_segment in fiber_segment_query:
            circuit_query = self.db.session.query(*cable_segment_fields).filter(
                circuit_segment_model.cable_segment == fiber_segment._urn()
            )

            circuit_segments = list(circuit_query)
            if circuit_segments:
                qurns = self.get_fiber_urns(circuit_segments)
                fiber_segment.circuits = qurns
                self.db.session.flush()

    def migrate_circuit_segments_in_deltas(self):
        for delta in self.db.deltas(sort=True):
            self.apply_circuit_segment_deltas(delta)

    def apply_circuit_segment_deltas(self, delta):
        """For the specified delta, identify circuit_segments that have changed.
        Migrate these changes to their corresponding fiber_segment."""

        fiberSegmentTable = self.db.view(delta=delta).table("mywcom_fiber_segment")
        circuitSegmentTable = self.db.view(delta=delta).table("mywcom_circuit_segment")

        # Get the IDs of the fiber_segments that have related circuit_segments
        fiber_segment_ids = list(
            set(
                [MywReference.parseUrn(x.cable_segment).id for x in circuitSegmentTable._delta_recs]
            )
        )

        for seg_id in fiber_segment_ids:
            fiber_segment = fiberSegmentTable.get(seg_id)

            circuit_segments = list(
                circuitSegmentTable.filterOn("cable_segment", fiber_segment._urn())
            )
            qurns = self.get_fiber_urns(circuit_segments)
            if fiber_segment.circuits != qurns:
                fiber_segment.circuits = qurns
                fiberSegmentTable.update(fiber_segment)

    def get_fiber_urns(self, circuit_segment_records):
        """Converts mywcom_circuit_segment records into Qualified URN representation."""
        if not circuit_segment_records:
            return None

        qurns = sorted(
            ["{0}?fibers={1}:{2}".format(x.circuit, x.low, x.high) for x in circuit_segment_records]
        )
        return ";".join(qurns)

    def migrate_circuit_ports(self):
        equips = self.db.setting("mywcom.equipment")
        for equip_feature_type in equips:
            self.migrate_circuit_ports_for_euqipment(equip_feature_type)

        # Drop circuit_port table
        self.db.dd.emptyFeatureTable("mywcom_circuit_port")
        feature_type_rec = self.db.dd.featureTypeRec("myworld", "mywcom_circuit_port")
        self.db.dd.dropFeatureType(feature_type_rec)

    def migrate_circuit_ports_for_euqipment(self, equip_feature_type):
        self.progress(0, "Migrating circuit_ports for", equip_feature_type)

        # Add circuit field
        feature_type_desc = self._feature_desc_for(equip_feature_type)
        feature_type_rec = self.db.dd.featureTypeRec("myworld", equip_feature_type)
        if feature_type_desc.fields.get("circuits"):
            feature_type_desc.dropField("circuits")
        self._add_field(feature_type_desc, "circuits", "reference_set")
        self.db.dd.alterFeatureType(feature_type_rec, feature_type_desc)

        # General setup
        equipment_models = self.db.dd.featureModelsFor(equip_feature_type)
        circuit_port_model = self.db.dd.featureModel("mywcom_circuit_port", "data")

        circuit_port_fields = [
            circuit_port_model.id,
            circuit_port_model.equipment,
            circuit_port_model.circuit,
            circuit_port_model.side,
            circuit_port_model.low,
            circuit_port_model.high,
        ]

        # Apply baseline circuit information
        baseline_schemas = ["data"]
        if feature_type_desc.versioned:
            baseline_schemas += ["base", "delta"]

        circuit_ports_query = (
            self.db.session.query(circuit_port_model)
            .options(load_only(*circuit_port_fields))
            .filter(circuit_port_model.equipment.like("{}/%".format(equip_feature_type)))
            .order_by(circuit_port_model.equipment)
        )

        for group in self.qroup_query_stream(circuit_ports_query, ["equipment"]):
            equipment_id = MywReference.parseUrn(group[0].equipment).id
            qurns = self.get_port_qurns(group)

            for schema in baseline_schemas:
                equip_model = equipment_models[schema]
                equip_query = (
                    self.db.session.query(equip_model)
                    .options(load_only(equip_model.id, equip_model.circuits))
                    .filter(equip_model.id == equipment_id)
                )
                for equip_rec in equip_query:
                    equip_rec.circuits = qurns

            self.db.session.flush()

        # Now migrate deltas
        circuit_port_model = self.db.dd.featureModel("mywcom_circuit_port", "delta")
        circuit_ports_query = (
            self.db.session.query(circuit_port_model.myw_delta, circuit_port_model.equipment)
            .filter(circuit_port_model.equipment.like("{}/%".format(equip_feature_type)))
            .group_by(circuit_port_model.myw_delta, circuit_port_model.equipment)
            .order_by(circuit_port_model.myw_delta, circuit_port_model.equipment)
        )

        db_view = None
        equip_table = None
        circuit_port_table = None
        for circuit_port_delta in circuit_ports_query:
            delta_name = circuit_port_delta[0]
            delta_equipment = circuit_port_delta[1]
            if not db_view or db_view.delta != delta_name:
                db_view = self.db.view(delta_name)
                equip_table = db_view.table(equip_feature_type)
                circuit_port_table = db_view.table("mywcom_circuit_port")

            equip_id = MywReference.parseUrn(delta_equipment).id
            equip_record = equip_table.get(equip_id)
            circuit_port_records = circuit_port_table.filterOn("equipment", delta_equipment)
            equip_record.circuits = self.get_port_qurns(circuit_port_records)
            equip_table.update(equip_record)

    def get_port_qurns(self, circuit_port_records):
        """Converts mywcom_circuit_port records into Qualified URN representation."""
        if not circuit_port_records:
            return None

        ports_by_circuit = {}
        for rec in circuit_port_records:
            if not ports_by_circuit.get(rec.circuit):
                ports_by_circuit[rec.circuit] = []
            ports_by_circuit[rec.circuit].append("{0}={1}:{2}".format(rec.side, rec.low, rec.high))

        qurns = []
        for (circuit_id, port_ranges) in ports_by_circuit.items():
            port_ranges.sort()
            qurns.append("{0}?{1}".format(circuit_id, "&".join(port_ranges)))

        qurns.sort()
        return ";".join(qurns)

    # ------------------------------------------------------------------------------
    #                                      HELPERS
    # ------------------------------------------------------------------------------

    def has_right(self, role_name, application_name, right_name=None):
        """
        True if ROLE_NAME has right RIGHT_NAME in APPLICATION_NAME

        If RIGHT_NAME is omitted, just tests if role can access the application"""

        role_def = self.db.config_manager.roleDef(role_name)

        perms = role_def.get("permissions", {})
        app_perms = perms.get(application_name, [])

        if not right_name:
            return application_name in perms

        has_right = right_name in app_perms

        self.progress(2, "Checking right:", role_name, application_name, right_name, has_right)

        return has_right

    def grant_right(self, role_name, application_name, right_name):
        """
        Grant RIGHT_NAME to ROLE in APPLICATION_NAME
        """

        # Get existing permissions
        role_def = self.db.config_manager.roleDef(role_name)
        perms = role_def["permissions"]

        app_perms = perms.get(application_name)
        if not app_perms:
            app_perms = perms[application_name] = []

        # Check for already has right
        if right_name in app_perms:
            self.progress(2, "Role already has right:", role_name, application_name, right_name)
            return

        # Grant the right
        self.progress(
            0, "Application", application_name, ":", "Granting right", right_name, "to", role_name
        )
        app_perms.append(right_name)
        self.db.config_manager.updateRole(role_name, role_def)

    def _feature_desc_for(self, feature_type):
        """
        Get feature descriptor from FEATURE_TYPE
        """

        ft_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        if not ft_rec:
            self.progress("warning", "No such feature type", feature_type)
            return

        return self.db.dd.featureTypeDescriptor(ft_rec)

    def _add_field(self, feature_desc, field_name, type, **props):
        """
        Adds FIELD to SPEC_DESC
        Also adds field to first group of spec (if possible)
        """

        if feature_desc.fields.get(field_name):
            return

        # Add field
        external_name = self.localiser.msg("install", field_name)
        feature_desc.addField(field_name, type, external_name=external_name, **props)

    def comms_6221_feature_types(self):
        """
        Names of the network manager feature types
        """
        # WARNING: Does not include designs or circuits

        structs = self.db.setting("mywcom.structures") or {}
        routes = self.db.setting("mywcom.routes") or {}
        conduits = self.db.setting("mywcom.conduits") or {}
        equips = self.db.setting("mywcom.equipment") or {}
        cables = self.db.setting("mywcom.cables") or {}
        specs = self.db.setting("mywcom.specs") or {}

        # Get spec features from setting
        spec_fts = []
        for feature in specs.keys():
            spec_fts.append(feature + "_spec")

        nm_features = (
            list(structs.keys())
            + list(routes.keys())
            + list(conduits.keys())
            + list(equips.keys())
            + list(cables.keys())
            + spec_fts
        )

        # Remove non physical feautres from list
        non_physical_features = ["mywcom_route_junction", "mywcom_fiber_slack"]
        for ft in non_physical_features:
            if ft in nm_features:
                nm_features.remove(ft)

        return nm_features

    def qroup_query_stream(self, query, gbfields):
        """Iterable that returns an array of records grouped by @gbfield."""
        grouped = None
        for rec in query:
            if not grouped:
                grouped = [rec]
            else:
                # pylint: disable=unsubscriptable-object
                if any(grouped[0][gbfield] != rec[gbfield] for gbfield in gbfields):
                    yield grouped
                    grouped = [rec]
                else:
                    grouped.append(rec)

        if grouped:
            yield grouped
