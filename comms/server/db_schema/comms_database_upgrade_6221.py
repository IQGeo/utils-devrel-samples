# Copyright: IQGeo Limited 2010-2023
import os, re, json
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade
from myworldapp.core.server.base.geom.myw_line_string import MywLineString


class CommsDatabaseUpgrade6221(CommsDatabaseUpgrade):
    """
    Upgrade Network Manager Comms data model to 6.2.2.1
    """

    from_version = 612009
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_6221")

    updates = {
        622101: "add_settings",
        622102: "fix_equipment_field",
        622103: "specs_add_new_cost_fields",
        622104: "specs_populate_new_fields",
        622105: "specs_drop_old_cost_fields",
        622106: "fix_mywcom_designs_setting",
        622107: "remove_forward_field_from_conduits",
    }

    def add_settings(self):
        """
        Add settings for:
          - configuring feature change and conflict colors
          - equipment report and connectivity report
          - data import format CDIF
        """

        self.loadResourceFiles("settings", "*.settings", localiser=self.localiser)

    def fix_equipment_field(self):
        """
        Check housings of equipment are mentioned in equipment field of housing
        """

        # For each feature in equipment category
        for feature, config in self.db.setting("mywcom.equipment").items():
            # Check feature exists
            equipment_rec = self.db.dd.featureTypeRec("myworld", feature)
            if not equipment_rec:
                self.progress("warning", "No such feature type", feature)
                continue

            # For each housing check equipment field
            for housing in config["housings"]:
                # Check housing exists
                ft_rec = self.db.dd.featureTypeRec("myworld", housing)
                if not ft_rec:
                    self.progress("warning", "No such feature type", housing)
                    continue

                # Get equipment field
                ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)
                equip_field = ft_desc.fields.get("equipment")

                if not equip_field:
                    self.progress(3, housing, ":", "no equipment field")
                    continue

                if equip_field.type != "reference_set":
                    self.progress(3, housing, ":", "equipment field is not reference_set")
                    continue

                if not equip_field.value:
                    self.progress(3, housing, ":", "equipment field is not a calculated field")
                    continue

                # Add feature to equip_field
                self._ensureFieldContainsRef(ft_rec, ft_desc, equip_field, feature)

    def specs_add_new_cost_fields(self):
        """
        Adds fields with cost information to linear specs
        Removes incorrect fields (and removes from group)
        """

        for spec_feature_type, old_field, new_field, new_field_type in self._spec_cost_fields():
            spec_desc = self._feature_desc_for(spec_feature_type)

            # Add new field to spec
            if new_field:
                if new_field not in spec_desc.fields:
                    # Get type
                    type = new_field_type

                    old_field_desc = spec_desc.fields.get(old_field)

                    if old_field_desc:
                        type = old_field_desc.type

                    self.progress(1, "Adding", new_field, "to ", spec_desc)
                    self._add_field(spec_desc, new_field, type)

            # Add item_length field
            if "item_length" not in spec_desc.fields:
                self.progress(1, "Adding item_length to ", spec_desc)
                self._add_field(spec_desc, "item_length", "double")

            spec_rec = self.db.dd.featureTypeRec("myworld", spec_feature_type)
            self.db.dd.alterFeatureType(spec_rec, spec_desc)

    def specs_populate_new_fields(self):
        """
        Populate new fields from the old ones
        """

        for spec_feature_type, old_field, new_field, new_field_type in self._spec_cost_fields():
            self.progress(
                1, "Populating", new_field, "with values from ", old_field, "for", spec_feature_type
            )
            spec_table = self.db.tables[spec_feature_type]

            spec_desc = self._feature_desc_for(spec_feature_type)
            if old_field not in spec_desc.fields:
                continue

            field = spec_desc.fields[old_field]
            if old_field == "cost_length_unit" and "string" in field.type:
                # Value should be string of <number><unit> so split it
                self.progress(
                    1,
                    "Splitting",
                    old_field,
                    "into item_length and item_length_unit for ",
                    spec_feature_type,
                )
                for rec in spec_table:
                    # Split string
                    if rec[old_field]:
                        value = re.findall(r"[A-Za-z]+|\d+", rec[old_field])

                        if len(value) == 0:
                            continue

                        # Set numeric part to length field
                        if value[0].isnumeric():
                            number_value = value[0]
                            rec["item_length"] = number_value

                        # Set unit part to unit field
                        if len(value) == 2:
                            unit_value = value[1]
                            rec["item_length_unit"] = unit_value

                        spec_table.update(rec)
            else:
                # Copy value from old field to new field
                for rec in spec_table:
                    rec[new_field] = rec[old_field]
                    spec_table.update(rec)

    def specs_drop_old_cost_fields(self):
        """
        Removes old fields from spec feature types
        """

        for spec_feature_type, old_field, new_field, new_field_type in self._spec_cost_fields():
            spec_desc = self._feature_desc_for(spec_feature_type)

            if old_field:
                self.progress(1, "Removing", old_field, "from ", spec_desc)
                self._remove_field(spec_desc, old_field)

            spec_rec = self.db.dd.featureTypeRec("myworld", spec_feature_type)
            self.db.dd.alterFeatureType(spec_rec, spec_desc)

    def fix_mywcom_designs_setting(self):
        """
        Fix mywcom.designs setting by mutating from an array to a dict
        """

        updated_designs = {}
        # Get existing designs setting
        MywSetting = self.rawModelFor("myw", "setting")
        settings = self.session.query(MywSetting)
        old_setting_rec = settings.filter(MywSetting.name == "mywcom.designs").first()
        if old_setting_rec:
            self.progress(1, "Mutating mywcom.designs to a dict")
            for design in self.db.setting("mywcom.designs"):
                updated_designs[design] = {}

            # Delete existing record
            self.session.delete(old_setting_rec)

            # Add new record
            new_rec = MywSetting(
                name="mywcom.designs", type="JSON", value=json.dumps(updated_designs)
            )
            self.session.add(new_rec)

    def remove_forward_field_from_conduits(self):
        """
        Drop forward field from all conduit feature types
        """

        conduits = self.db.setting("mywcom.conduits") or {}

        # For each configured type ..
        for ft in conduits:
            # Get descriptor
            ft_rec = self.db.dd.featureTypeRec("myworld", ft)
            ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

            # Check has field
            if not "forward" in ft_desc.storedFields():
                continue

            # Remove field
            with self.progress.operation(ft, ":", "Removing field: forward"):
                self._remove_field(ft_desc, "forward")
                self.db.dd.alterFeatureType(ft_rec, ft_desc)

    def _spec_cost_fields(self):
        """
        Yield cost fields that need to be replaced

        Yields:
             FEATURE_TYPE spec feature type
             OLD_FIELD_NAME
             NEW_FIELD_NAME
             NEW_FIELD_TYPE
        """

        field_mappings = [
            {"old": "cost_length_unit", "new": "item_length_unit", "type": "string(3)"},
            {"old": "cost_unit", "new": "item_cost", "type": "double"},
            {"old": "cost_per_unit", "new": "item_cost", "type": "double"},  # For fiber cable spec
            {"old": "cost", "new": "item_cost", "type": "double"},  # For fiber cable spec
        ]

        for feature_type in self.db.setting("mywcom.specs").keys():
            # Get desc
            desc = self._feature_desc_for(feature_type)
            if not desc:
                continue

            # Check linear
            if desc.primary_geom_field.type != "linestring":
                continue

            # Get spec record
            spec_desc = self._feature_desc_for(feature_type + "_spec")
            if not spec_desc:
                continue

            for field_mapping in field_mappings:
                old_field = field_mapping["old"]
                new_field = field_mapping["new"]
                type = field_mapping["type"]

                yield feature_type + "_spec", old_field, new_field, type

    def _ensureFieldContainsRef(self, ft_rec, ft_desc, field, ref):
        """
        Check FIELD contains REF. If not, adds it
        """

        # Get field specs
        select_regex = re.compile("^select\((.*)\)$")
        match = select_regex.match(field.value)
        field_specs = match.group(1)

        # If ref is not in field_specs, add it
        if ref not in field_specs:
            self.progress(1, "Adding", ref, "to field", ft_rec, ".equipment")

            # Add feature to field specs
            if field_specs != "":
                field_specs += ","
            field_specs += "{}.housing".format(ref)
            field_specs = "select(" + field_specs + ")"
            field.value = field_specs

            self.db.dd.alterFeatureType(ft_rec, ft_desc)

    def _feature_desc_for(self, feature_type):
        """
        Get feature descriptor from FEATURE_TYPE
        """

        ft_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        if not ft_rec:
            self.progress("warning", "No such feature type", feature_type)
            return

        return self.db.dd.featureTypeDescriptor(ft_rec)

    def _add_field(self, spec_desc, field_name, type, value=None):
        """
        Adds FIELD to SPEC_DESC
        Also adds field to first group of spec (if possible)
        """

        if spec_desc.fields.get(field_name):
            return

        # Add field
        external_name = self.localiser.msg("install", field_name)
        spec_desc.addField(field_name, type, external_name=external_name, value=value)

        # Add field to group if it has one
        groups = spec_desc.groups
        if groups:
            group = spec_desc.groups[0]
            if group:
                group_fields = group.get("fields")
                if group_fields and field_name not in group_fields:
                    group_fields.append(field_name)

    def _remove_field(self, ft_desc, field_name):
        """
        Remove FIELD_NAME from fields of FT_DESC
        Remove FIELD_NAME from any groups it is in
        """

        # Remove old_field from group
        for group in ft_desc.groups:
            group_fields = group.get("fields")
            if group_fields and field_name in group_fields:
                self.progress(
                    1, ft_desc.name, ": Removing", field_name, "from group", group.get("name")
                )
                group_fields.remove(field_name)

        fld_desc = ft_desc.fields.get(field_name)
        if not fld_desc:
            return

        # Drop old_field
        ft_desc.dropField(field_name)
