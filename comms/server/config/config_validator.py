# Copyright: IQGeo Limited 2010-2023

import re, os, json
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.modules.comms.server.api.network import Network


class ConfigValidator:
    """
    Engine for validating comms configuration
    """

    expected_fields = {
        "structures": {
            "name": {
                "type": "string",
                "calculated": False,
                "must_be_indexed": False,
                "log": "error",
            },
            "routes": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "error",
            },
            "equipment": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "warn",
            },
            "cables": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "error",
            },
            "in_fiber_segments": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "warn",
            },
            "out_fiber_segments": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "warn",
            },
            "fiber_splices": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "warn",
            },
            "location": {
                "type": "geometry",
                "calculated": False,
                "must_be_indexed": False,
                "geom_type": "point",
                "log": "error",
            },
        },
        "routes": {
            "in_structure": {
                "type": "reference",
                "calculated": False,
                "must_be_indexed": True,
                "log": "error",
            },
            "out_structure": {
                "type": "reference",
                "calculated": False,
                "must_be_indexed": True,
                "log": "error",
            },
            "cable_segments": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "error",
            },
            "length": {
                "type": "double",
                "calculated": False,
                "must_be_indexed": False,
                "expected_unit_scale": "length",
                "required_unit": "m",
                "log": "warn",
            },
            "conduits": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "warn",
            },
            "path": {
                "type": "geometry",
                "calculated": False,
                "must_be_indexed": False,
                "geom_type": "linestring",
                "log": "error",
            },
        },
        "equipment": {
            "name": {
                "type": "string",
                "calculated": False,
                "must_be_indexed": False,
                "log": "error",
            },
            "root_housing": {
                "type": "reference",
                "calculated": False,
                "must_be_indexed": True,
                "log": "error",
            },
            "housing": {
                "type": "reference",
                "calculated": False,
                "must_be_indexed": True,
                "log": "error",
            },
            "circuits": {
                "type": "reference_set",
                "calculated": False,
                "must_be_indexed": False,
                "log": "error",
            },
            "equipment": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "warn",
            },
            "fiber_splices": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "warn",
            },
            "location": {
                "type": "geometry",
                "calculated": False,
                "must_be_indexed": False,
                "geom_type": "point",
                "log": "error",
            },
        },
        "conduits": {
            "name": {
                "type": "string",
                "calculated": False,
                "must_be_indexed": False,
                "log": "error",
            },
            "root_housing": {
                "type": "reference",
                "calculated": False,
                "must_be_indexed": True,
                "log": "error",
            },
            "housing": {
                "type": "reference",
                "calculated": False,
                "must_be_indexed": True,
                "log": "error",
            },
            "in_structure": {
                "type": "reference",
                "calculated": False,
                "must_be_indexed": True,
                "log": "error",
            },
            "out_structure": {
                "type": "reference",
                "calculated": False,
                "must_be_indexed": True,
                "log": "error",
            },
            "cable_segments": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "error",
            },
            "conduits": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "warn",
            },
            "path": {
                "type": "geometry",
                "calculated": False,
                "must_be_indexed": False,
                "geom_type": "linestring",
                "log": "error",
            },
        },
        "cables": {
            "name": {
                "type": "string",
                "calculated": False,
                "must_be_indexed": False,
                "log": "error",
            },
            "cable_type_count": {
                "has_tech_difference": True,
                "type": "count",
                "fiber_count": {
                    "type": "integer",
                    "calculated": False,
                    "must_be_indexed": False,
                    "log": "error",
                },
                "copper_count": {
                    "type": "integer",
                    "calculated": False,
                    "must_be_indexed": False,
                    "log": "error",
                },
                "coax_count": {
                    "type": "integer",
                    "calculated": False,
                    "must_be_indexed": False,
                    "log": "error",
                },
            },
            "directed": {
                "type": "boolean",
                "calculated": False,
                "must_be_indexed": False,
                "log": "error",
            },
            "cable_segments": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "error",
            },
            "cable_slacks": {
                "type": "reference_set",
                "calculated": True,
                "must_be_indexed": False,
                "log": "error",
            },
            "path": {
                "type": "geometry",
                "calculated": False,
                "must_be_indexed": False,
                "geom_type": "linestring",
                "log": "error",
            },
            "placement_path": {
                "type": "geometry",
                "calculated": False,
                "must_be_indexed": False,
                "geom_type": "linestring",
                "log": "error",
            },
        },
    }

    def __init__(self, db, progress=MywProgressHandler(), warn=True):
        """
        Init slots of self

        DB is a MywDatabase"""

        self.db = db
        self.db_view = db.view()
        self.progress = progress
        self.errors = {}
        self.warn = warn

        Network.defineTypesFrom(self.db)
        self.fiber_network = Network.types["fiber"]
        self.copper_network = Network.types["copper"]
        self.coax_network = Network.types["coax"]

        self.expected_properties = {}

        self.expected_properties["structures"] = {
            "fields": self.expected_fields["structures"],
            "network": "mywcom_routes",
            "mywcom_layer": ["mywcom_structures"],
            "mywcom_features": ["mywcom_route_junction"],
        }

        self.expected_properties["routes"] = {
            "fields": self.expected_fields["routes"],
            "network": "mywcom_routes",
            "mywcom_layer": ["mywcom_structures"],
            "mywcom_features": None,
        }

        self.expected_properties["equipment"] = {
            "fields": self.expected_fields["equipment"],
            "network": None,
            "mywcom_layer": [
                "mywcom_equipment",
                "mywcom_copper_equipment",
                "mywcom_coax_equipment",
                "mywcom_mixed_equipment",
            ],
            "mywcom_features": [
                self.fiber_network.slack_type,
                self.copper_network.slack_type,
                self.coax_network.slack_type,
            ],
        }

        self.expected_properties["conduits"] = {
            "fields": self.expected_fields["conduits"],
            "network": None,
            "mywcom_layer": ["mywcom_conduits"],
            "mywcom_features": None,
        }

        self.expected_properties["cables"] = {
            "fields": self.expected_fields["cables"],
            "network": None,
            "mywcom_layer": [
                "mywcom_cables",
                "mywcom_copper_cables",
                "mywcom_coax_cables",
            ],
            "mywcom_features": None,
        }

        self.expected_properties["circuits"] = {}
        self.expected_properties["specs"] = {}
        self.expected_properties["laborCosts"] = {}
        self.expected_properties["fiberColors"] = {}
        self.expected_properties["fiberColorSchemes"] = {}
        self.expected_properties["designs"] = {}
        self.expected_properties["import_config"] = {}

    # ------------------------------------------------------------------------------
    #                                     VALIDATION
    # ------------------------------------------------------------------------------

    def run(self, category="*", config=None):
        """
        Run checks

        Returns a list of problems found
        warn level defaults to True

        apsect: one of structures, routes, equipment, conduits, cable, specs"""

        if category == "*":
            self.checkAll(config)
        else:
            self.checkConfigFor(category, config)

        return self.errors

    def checkAll(self, config):
        """
        check all config categories
        """

        for category in self.expected_properties.keys():
            category_config = None
            if config is not None:
                category_config = config[category]
            self.checkConfigFor(category, category_config)

    def checkConfigFor(self, category, config=None):
        """
        check config for category name
        """

        with self.progress.operation("Checking configuration:", category):

            # Get database setting (if necessary)
            if not config:
                if category == "import_config":
                    config = {}
                    for name in self.db.settings("mywcom.import_config.*"):
                        config[name] = self.db.setting(name)
                else:
                    config = self.db.setting("mywcom." + category)

            # Do check
            if category == "specs":
                self.checkSpecs(category, config)
            elif category == "laborCosts":
                self.checkLaborCosts(category, config)
            elif category == "fiberColors":
                self.checkFiberColors(category, config)
            elif category == "fiberColorSchemes":
                self.checkFiberColorSchemes(category, config)
            elif category == "designs":
                self.checkDesigns(category, config)
            elif category == "circuits":
                self.checkCircuits(category, config)
            elif category == "import_config":
                self.checkImportConfigs(category, config)

            else:
                expected_props = self.expected_properties[category]
                self.checkNetworkObject(category, expected_props, config)

    @classmethod
    def printExpectedFields(self):
        """
        Print details of what self checks
        """
        # Used for manual generation of doc

        def print_tab_line(name, props):
            mandatory = "Yes" if props["log"] == "error" else "Optional"
            print(name, "\t", props["type"], "\t", mandatory)

        for category, fields in self.expected_fields.items():

            # Show stored fields
            print("STORED FIELDS:", category)
            for name, props in fields.items():
                if not props["calculated"]:
                    print_tab_line(name, props)
            print()

            # Show calculated fields
            print("CALCULATED FIELDS:", category)
            for name, props in fields.items():
                if props["calculated"]:
                    print_tab_line(name, props)
            print()

    # ------------------------------------------------------------------------------
    #                                   NETWORK OBJECTS
    # ------------------------------------------------------------------------------

    def checkNetworkObject(self, category, expected_props, setting):
        """
        Checks configuration of a network object

        Ensure feature exists
        Ensure feature names do not include mywcom_ prefix
        Ensure configured palette image file exists
        Ensure expected fields eixst on feature"""

        for feature_type, config in setting.items():

            mywcom_features = expected_props.get("mywcom_features")
            if mywcom_features is not None and feature_type in mywcom_features:
                self.progress(4, "Skipping core feature:", feature_type)
                continue

            self.progress(
                4, "Validating feature:", feature_type, "for setting", category
            )
            feature_table = self._checkFeatureTypeExists(category, feature_type)

            if not feature_table:
                continue

            self._checkFeatureTypeName(category, feature_type, expected_props)
            self._checkImagePath(category, feature_type, config)
            self._checkFields(
                category, feature_type, feature_table, expected_props, config, setting
            )
            self._checkFeatureNetwork(
                category, feature_type, feature_table, expected_props
            )
            self.checkFeatureLayerFor(category, feature_type, expected_props)
            self._checkFeatureVersioned(category, feature_type, feature_table)

    # ------------------------------------------------------------------------------
    #                                   CIRCUITS
    # ------------------------------------------------------------------------------
    # ENH: Should be with other network objects

    def checkCircuits(self, category, setting):
        """
        Check circuits definitions
        """

        for circuit, circuit_config in setting.items():
            if not self._checkName(category, circuit):
                continue

            self._checkImagePath(category, circuit, circuit_config)

            equip_types = ["inEquips", "outEquips"]

            for equip_type in equip_types:
                msg = "missing 'served from' feature(s)"
                if equip_type == "outEquips":
                    msg = "missing served to feature(s)"

                if (
                    equip_type not in circuit_config
                    or len(circuit_config[equip_type]) == 0
                ):
                    # prior to save
                    self.error(category, circuit, msg)
                else:
                    # checks equipment features after a save
                    for equip in circuit_config[equip_type]:
                        self._checkFeatureTypeExists(category, equip)

    # ------------------------------------------------------------------------------
    #                                   SPECS
    # ------------------------------------------------------------------------------

    def checkSpecs(self, category, setting):
        """
        Check spec configuration

        Ensure feature type exists
        Ensure configured spec field exists on feature
        Ensure configured spec field is type foreign_key and foreign_key reference exists
        Ensure configured spec field foreign key reference exists in layer"""

        for feature_type, spec_field_name in setting.items():

            self.progress(
                4, "Validating feature:", feature_type, "for setting", category
            )
            feature_table = self._checkFeatureTypeExists(category, feature_type)

            if not feature_table:
                continue

            spec_field = feature_table.descriptor.fields.get(spec_field_name)

            if not spec_field:
                params = {"feature_type": feature_type, "field_name": spec_field_name}
                self.error(category, f"no_such_field,{json.dumps(params)}")
                continue

            self._checkSpecField(category, feature_type, spec_field)

    # ------------------------------------------------------------------------------
    #                                   LABOR COSTS
    # ------------------------------------------------------------------------------

    def checkLaborCosts(self, category, setting):
        """
        Check labor_cost configuration

        Check feature type exists
        Check configured labor_cost field exists on feature
        Check configured labor_cost field is type string"""

        for feature_type, labor_cost_field_name in setting.items():
            # Check referenced feature exists
            self.progress(
                4, "Validating feature:", feature_type, "for setting", category
            )
            feature_table = self._checkFeatureTypeExists(category, feature_type)
            if not feature_table:
                continue

            # Check field exists
            labor_cost_field = feature_table.descriptor.fields.get(
                labor_cost_field_name
            )
            if not labor_cost_field:
                params = {
                    "feature_type": feature_type,
                    "field_name": labor_cost_field_name,
                }
                self.error(category, f"no_such_field,{json.dumps(params)}")
                continue

            # Check field type is string
            spec_field_type = labor_cost_field.type
            spec_field_name = labor_cost_field.name
            expected_field_type = "string"

            # error: not type string
            if spec_field_type.split("(")[0] != "string":
                params = {
                    "feature_type": feature_type,
                    "field_name": spec_field_name,
                    "field_type": spec_field_type,
                    "expected_field_type": expected_field_type,
                }
                self.error(
                    category, f"type_for_field_is_incorrect,{json.dumps(params)}"
                )

    # ------------------------------------------------------------------------------
    #                                   FIBER COLORS
    # ------------------------------------------------------------------------------

    def checkFiberColors(self, category, setting):
        """
        check that configured fiber colors have all values populated
        """

        for color, color_config in setting.items():

            if not self._checkName(category, color):
                continue

            for key, value in color_config.items():
                if not value:
                    params = {"color": color, "key": key}
                    self.error(category, f"missing_value_for,{json.dumps(params)}")

    # ------------------------------------------------------------------------------
    #                                   FIBER COLOR SCHEMES
    # ------------------------------------------------------------------------------

    def checkFiberColorSchemes(self, category, setting):
        """
        check that configured fiber color schemes have all values populated
        and all colors exist in fiber color config
        """

        for color_scheme_name in setting.keys():
            color_scheme = setting[color_scheme_name]

            if not self._checkName(category, color_scheme_name):
                continue

            for key, value in color_scheme.items():
                if value is None:
                    params = {"color": color_scheme, "key": key}
                    self.error(category, f"missing_value_for,{json.dumps(params)}")

                if key == "colors":
                    expected_colors = self.db.setting("mywcom.fiberColors").keys()
                    self._checkSchemeColors(
                        category, color_scheme_name, value, expected_colors
                    )

    # ------------------------------------------------------------------------------
    #                                   DESIGNS
    # ------------------------------------------------------------------------------

    def checkDesigns(self, category, config):
        """
        Check delta owner feature types

        Ensure table exists
        Ensure user group field exists
        Ensure feature is not configured as versioned"""

        for feature_type, feature_config in config.items():
            if not feature_config:
                continue

            # Check referenced feature exists
            feature_table = self.db_view.table(feature_type, error_if_none=False)
            if not feature_table:
                continue

            user_group_field_name = feature_config["userGroup"]

            # Check if reference field is defined
            if not user_group_field_name:
                continue

            # Check field exists
            user_group_field = feature_table.descriptor.fields.get(
                user_group_field_name
            )
            if not user_group_field:
                params = {
                    "feature_type": feature_type,
                    "field_name": user_group_field_name,
                }
                self.error(category, f"no_such_field,{json.dumps(params)}")
                continue

            self._checkFeatureNotVersioned(
                category, feature_type, feature_table, "Delta owner"
            )

    # ------------------------------------------------------------------------------
    #                                   IMPORT CONFIG
    # ------------------------------------------------------------------------------

    def checkImportConfigs(self, category, configs):
        """
        Check config for each engine of import engines
        """

        for engine in configs.values():
            for index, config in enumerate(engine.get("mappings")):
                self._checkFeatureTypeExists(
                    category, config.get("feature_type"), engine["engine"], index
                )

    # ------------------------------------------------------------------------------
    #                                   FIELD HELPERS
    # ------------------------------------------------------------------------------

    def _checkFields(
        self, category, feature_type, feature_table, expected_props, config, config_all
    ):
        """
        Check registered feature fields

        Ensure correct geomtery type
        Ensure expected fields exist on feature
        Ensure calculated fields configured correctly"""

        # Check conduits
        if category == "conduits":
            self._checkBundleTypeField(category, feature_type, config)
            self._checkContinuousConduitField(category, feature_type, config_all)
            self._checkHousings(category, feature_table, category, config)

        # Check equipment
        if category == "equipment":
            self._checkFiberFields(category, feature_type, feature_table)
            self._checkEquipmentField(category, feature_type, config)
            self._checkHousings(category, feature_table, category, config)
            self._checkDirectedField(category, feature_table, config)

        # Check if cables and equipment have a tech field populated
        if (category == "cables" or category == "equipment") and not config.get("tech"):
            params = {"feature_type": feature_type}
            self.error(category, f"feature_missing_tech_field,{json.dumps(params)}")
            return

        # Check expected fields
        expected_fields = expected_props.get("fields")
        for field_name, expected_field_props in expected_fields.items():

            # Added to support tech specific fields
            if expected_field_props.get("has_tech_difference"):
                field_name = "{}_{}".format(
                    config.get("tech"), expected_field_props.get("type")
                )
                expected_field_props = expected_field_props.get(field_name)

            field_desc = feature_table.descriptor.fields.get(field_name)

            # Check geometry fields
            if expected_field_props.get("type") == "geometry":
                self._checkGeometryField(
                    category,
                    feature_type,
                    feature_table,
                    expected_field_props.get("geom_type"),
                )
            elif expected_field_props["calculated"]:
                self._checkCalculatedField(
                    category, feature_type, field_name, expected_field_props, field_desc
                )
            else:
                # Circuit field is only required on fiber equipment now
                if (
                    category == "equipment"
                    and field_name == "circuits"
                    and config.get("tech") != "fiber"
                ):
                    continue
                self._checkStoredField(
                    category, feature_type, field_name, expected_field_props, field_desc
                )

    def _checkStoredField(self, category, feature_type, field_name, expected_props, field_desc):
        """
        Check stored field

        Ensure expected field exists
        Ensure expected field type is correct
        Ensure expected field is indexed if required"""

        expected_props_type = expected_props["type"]
        expected_props_indexed = expected_props["must_be_indexed"]
        expected_unit_scale = expected_props.get("expected_unit_scale")
        required_unit = expected_props.get("required_unit")

        if not field_desc:
            if expected_props["log"] == "error":
                # error required field missing on configured feature
                params = {"field_name": field_name, "feature_type": feature_type}
                self.error(
                    category, f"missing_expected_stored_field,{json.dumps(params)}"
                )
            else:
                params = {"field_name": field_name, "feature_type": feature_type}
                self.warning(
                    category, f"missing_expected_stored_field,{json.dumps(params)}"
                )

        else:
            field_desc_type = field_desc.type
            if field_desc.type.split("(")[0] == "string":
                field_desc_type = "string"
                # ENH: check string length?

            if field_desc_type != expected_props_type:
                # error wrong field type of required field
                params = {
                    "feature_type": feature_type,
                    "field_name": field_name,
                    "field_type": field_desc_type,
                    "expected_field_type": expected_props_type,
                }
                self.error(
                    category, f"type_for_field_is_incorrect,{json.dumps(params)}"
                )

            if (
                field_desc.indexed == False
                and field_desc.indexed != expected_props_indexed
            ):
                # error missing index on required field
                params = {
                    "field_desc_name": field_desc.name,
                    "feature_type": feature_type,
                }
                self.warning(category, f"field_name_is_missing_index,{params}")

            if expected_unit_scale and field_desc.unit_scale != expected_unit_scale:
                params = {
                    "field_name": field_desc.name,
                    "expected_unit_scale": expected_unit_scale,
                    "feature_type": feature_type,
                }
                self.error(category, f"missing_unit_scale,{json.dumps(params)}")

            if required_unit and field_desc.unit != required_unit:
                # error missing unit_scale on required field
                params = {
                    "field_name": field_desc.name,
                    "expected_unit_scale": required_unit,
                    "feature_type": feature_type,
                }
                self.error(category, f"missing_unit_scale,{json.dumps(params)}")

    def _checkHousings(self, category, feature_table, ref_field, config):
        """
        Check the housings
        """

        feature_type = feature_table.feature_type
        housing_config = config.get("housings", [])

        if not housing_config:
            params = {"feature_type": feature_type}
            self.error(category, f"missing_housings,{json.dumps(params)}")
            return

        for housing_feature_type in housing_config:

            # check housing table exists
            housing_table = self.db_view.table(
                housing_feature_type, error_if_none=False
            )

            if not housing_table:
                params = {
                    "feature_type": feature_type,
                    "housing_feature_type": housing_feature_type,
                }
                self.error(
                    category, f"no_such_housing_feature_type,{json.dumps(params)}"
                )
                continue

            # Check housing table has equipment or conduit field
            ref_fld = housing_table.descriptor.fields.get(ref_field)

            if not ref_fld:
                params = {
                    "ref_field": ref_field,
                    "feature_type": feature_type,
                    "housing_feature_type": housing_feature_type,
                }
                self.error(category, f"housing_missing,{json.dumps(params)}")
                continue

            # Check ref field is correct base type
            if ref_fld.type_desc.base != "reference_set":
                params = {
                    "ref_field": ref_field,
                    "feature_type": feature_type,
                    "housing_feature_type": housing_feature_type,
                }
                self.error(
                    category, f"housing_field_incorrect_type,{json.dumps(params)}"
                )
                continue

            # check ref field definition is valid
            found = False
            for ref_feature_type, ref_field_name in self._calculateRefFieldFeatureTypes(
                ref_fld, feature_type
            ):
                found = True
                if not feature_table.descriptor.fields.get(ref_field_name):
                    params = {
                        "ref_field": ref_field,
                        "feature_type": feature_type,
                        "housing_feature_type": housing_feature_type,
                    }
                    self.error(
                        category,
                        f"field_references_invalid_equipment_field_name,{json.dumps(params)}",
                    )
                    continue

            if not found:
                params = {
                    "ref_field": ref_field,
                    "feature_type": feature_type,
                    "housing_feature_type": housing_feature_type,
                }
                self.error(
                    category, f"housing_field_does_not_list,{json.dumps(params)}"
                )

    def _checkDirectedField(self, category, feature_table, config):
        """
        Check directed field is present if ports fields are.
        """

        self.progress(
            5, "Checking 'directed'  field", category, feature_table
        )

        field_desc = feature_table.descriptor.fields.get("directed")

        if not field_desc:

            for field in feature_table.descriptor.fields.values():
                if field.name in self.portCountFields():
                    params = {"feature_type": feature_table.feature_type}
                    self.error(category, f"missing_directed_field,{json.dumps(params)}")
                    return                                     


    def _checkCalculatedField(
        self, category, feature_type, field_name, expected_props, field_desc
    ):
        """
        Check calculated select field

        ensure expected field exists
        ensure expected field's feature references are valid
        ensure expected field's feature's reference fields are valid
        """
        # ENH: simplify w/ refactor

        self.progress(
            5, "Checking calculated field:", category, feature_type, field_name
        )

        field_name = field_name

        if not field_desc:

            splices_field_name = self.fiber_network.splices_field
            in_segs_field_name = self.fiber_network.struct_in_segments_field
            out_segs_field_name = self.fiber_network.struct_out_segments_field

            # missing calculated field
            if field_name == splices_field_name:
                params = {"feature_type": feature_type, "field_name": field_name}
                self.log(
                    category,
                    expected_props["log"],
                    f"missing_optional_calculated_field,{json.dumps(params)}",
                )

            elif field_name == "equipment":
                params = {"feature_type": feature_type, "field_name": field_name}
                self.log(
                    category,
                    expected_props["log"],
                    f"missing_optional_calculated_field,{json.dumps(params)}",
                )

            elif field_name == in_segs_field_name or field_name == out_segs_field_name:
                direction = "outgoing"
                if field_name == in_segs_field_name:
                    direction = "incoming"

                params = {
                    "feature_type": feature_type,
                    "field_name": field_name,
                    "direction": direction,
                }
                self.log(
                    category,
                    expected_props["log"],
                    f"missing_field_so_will_not_support,{json.dumps(params)}",
                )

            elif field_name == "equipment" and category == "mywcom.equipment":
                """this check is handled in _checkHousings()"""
                pass

            elif field_name == "conduits" and category == "mywcom.routes":
                params = {"feature_type": feature_type, "field_name": field_name}
                self.log(
                    category,
                    expected_props["log"],
                    f"missing_optional_calculated_field,{json.dumps(params)}",
                )
            else:
                params = {"feature_type": feature_type, "field_name": field_name}
                self.log(
                    category,
                    expected_props["log"],
                    f"missing_calculated_field,{json.dumps(params)}",
                )

        else:
            for ref_feature_type, ref_field_name in self._calculateRefFieldFeatureTypes(
                field_desc
            ):

                ref_feature_table = self.db_view.table(
                    ref_feature_type, error_if_none=False
                )

                if not ref_feature_table:
                    # error feature doesn't exist that calculated field is looking for
                    params = {
                        "feature_type": feature_type,
                        "ref_field_name": ref_field_name,
                        "ref_feature_type": ref_feature_type,
                    }
                    self.error(
                        category,
                        f"bad_selection_expression_for_field,{json.dumps(params)}",
                    )

                else:
                    ref_field_desc = ref_feature_table.descriptor.fields.get(
                        ref_field_name
                    )
                    if not ref_field_desc:
                        # error field doesn't exist on feature that calcuated field is looking for
                        params = {
                            "feature_type": feature_type,
                            "ref_field_name": ref_field_name,
                            "ref_feature_type": ref_feature_type,
                        }
                        self.error(
                            category, f"field_does_not_exist_on,{json.dumps(params)}"
                        )

    def _checkGeometryField(
        self, category, feature_type, feature_table, expected_geometry
    ):
        """
        Check geometry field

        Ensure correct geometry type based on config type"""

        configured_geometry = feature_table.descriptor.geometry_type

        if configured_geometry != expected_geometry:
            params = {
                "feature_type": feature_type,
                "expected_geometry": expected_geometry,
                "configured_geometry": configured_geometry,
            }
            self.error(category, f"bad_geometry_for_feature,{json.dumps(params)}")

    def _checkSpecField(self, category, feature_type, spec_field_desc):
        """
        Check spec field

        Ensure spec field is type foreign_key
        Ensure spec field foreign_key reference is valid
        Ensure spec field foreign_key feature is not versioned
        Ensure spec feidl foreign_key reference is in layer"""

        spec_field_type = spec_field_desc.type
        spec_field_name = spec_field_desc.name
        expected_field_type = "foreign_key"

        # error: not type foreign_key
        if spec_field_type.split("(")[0] != "foreign_key":
            params = {
                "spec_field_name": spec_field_name,
                "spec_field_type": spec_field_type,
                "expected_field_type": expected_field_type,
                "feature_type": feature_type,
            }
            self.error(category, f"incorrect_spec_field_type,{json.dumps(params)}")
            return

        self._checkForeignKeyField(
            category, feature_type, spec_field_type, spec_field_name, True
        )

        self._checkSpecFeaturelayerFor(category, spec_field_type, spec_field_name)

    def _checkForeignKeyField(
        self,
        category,
        feature_type,
        fk_field_value,
        fk_field_name,
        check_not_versioned=False,
    ):
        """
        Check foreign_key field reference

        Ensure foreign_key field's references a feature
        Ensure foreign_key field's reference feature exists"""

        fk_feature_type, fk_feature_table = self._getForeignKeyFieldFeature(
            fk_field_value, fk_field_name
        )

        if not fk_feature_table:
            params = {
                "fk_feature_type": fk_feature_type,
                "fk_field_name": fk_field_name,
                "feature_type": feature_type,
            }
            self.error(
                category, f"no_such_feature_type_for_foreign_key,{json.dumps(params)}"
            )
            return

        if check_not_versioned:
            self._checkFeatureNotVersioned(
                category, fk_feature_type, fk_feature_table, "Spec tables"
            )

    def _checkBundleTypeField(self, category, feature_type, config):
        """
        Check bundle type field
        """

        # Check bundle type feature type exists
        bundle_feature_type = config.get("bundle_type")

        if bundle_feature_type:
            bundle_table = self.db_view.table(bundle_feature_type, error_if_none=False)

            if not bundle_table:
                params = {
                    "feature_type": feature_type,
                    "bundle_feature_type": bundle_feature_type,
                }
                self.error(
                    category, f"no_such_bundle_feature_type,{json.dumps(params)}"
                )

    def _checkContinuousConduitField(self, category, feature_type, conduit_config):
        """
        Check continuous conduit field

        If FEATURE_TYPE is continuous check it appears in conduits field on mywcom_conduit_run
        """

        # If not continuous conduit do nothing
        if not conduit_config.get(feature_type).get("continuous"):
            return

        # Get feature types in select expression
        feature_table = self.db_view.table("mywcom_conduit_run")
        field_desc = feature_table.descriptor.fields.get("conduits")

        ref_feature_info = list(self._calculateRefFieldFeatureTypes(field_desc))
        ref_feature_types = []
        for tuple in ref_feature_info:
            ref_feature_types.append(tuple[0])

        # Check feature type is in expression
        if feature_type not in ref_feature_types:
            params = {"feature_type": feature_type}
            self.error(category, f"field_conduits_running,{json.dumps(params)}")

    def _checkEquipmentField(self, category, feature_type, equip_config):
        """
        Check features that are housings of FEATURE_TYPE contain it in their equipment field
        """

        housings = equip_config.get("housings")
        for housing in housings:
            ft_rec = self.db.dd.featureTypeRec("myworld", housing)
            if not ft_rec:
                params = {"housing": housing, "feature_type": feature_type}
                self.error(
                    category, f"housing_feature_missing_for,{json.dumps(params)}"
                )
                return
            ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

            equipment_field = ft_desc.fields.get("equipment")
            if not equipment_field:
                return

            field_specs = equipment_field.value
            select_regex = re.compile("^select\((.*)\)$")
            match = select_regex.match(field_specs)
            field_specs = match.group(1)

            if feature_type not in field_specs:
                params = {"housing": housing, "feature_type": feature_type}
                self.error(category, f"field_equipment_missing,{json.dumps(params)}")

    def portCountFields(self):
        """
        Names of port fields from network definitions
        """

        for network in [self.copper_network, self.fiber_network, self.coax_network]:
            for field in network.portCountFields():
                yield field

    # ------------------------------------------------------------------------------
    #                                   NETWORKS
    # ------------------------------------------------------------------------------

    def _checkFeatureNetwork(
        self, category, feature_type, feature_table, expected_props
    ):
        """Check features are in correct network

        Ensure structure and route features are in mywcom_routes network"""

        network_name = expected_props.get("network")

        if network_name is None:
            return

        network_config = self.db.config_manager.networkDef(network_name)

        ok = False
        for network_feature_type in network_config["feature_types"]:

            if feature_type == network_feature_type:
                ok = True
                continue

        if not ok:
            params = {"feature_type": feature_type, "network_name": network_name}
            self.error(category, f"not_found_in_network,{json.dumps(params)}")

    # ------------------------------------------------------------------------------
    #                                   LAYER HELPERS
    # ------------------------------------------------------------------------------

    def checkFeatureLayerFor(self, category, feature_type, expected_props):
        """
        Check feature exsist in layer
        """

        self._checkFeatureLayerFor(category, feature_type, expected_props)

    def _checkSpecFeaturelayerFor(self, category, fk_field_value, fk_field_name):
        """
        Check spec feature exist in layer
        """

        # parse spec field value to get referenced feature
        spec_feature_type, spec_feature = self._getForeignKeyFieldFeature(
            fk_field_value, fk_field_name
        )
        in_layer = False
        layer_names = self.db.config_manager.layerNames()

        for layer_name in layer_names:

            layer_def = self.db.config_manager.layerDef(layer_name)

            if "feature_types" in layer_def:
                for layer_feature_type in layer_def["feature_types"]:
                    # determine if spec feature is in a layer
                    if layer_feature_type["name"] == spec_feature_type:
                        in_layer = True
                        continue
            if in_layer:
                continue

        if not in_layer:
            params = {"feature_type": spec_feature_type}
            self.warning(category, f"feature_type_not_in_layer,{json.dumps(params)}")

    def _checkFeatureLayerFor(self, category, feature_type, expected_props):
        """
        Validte non-spec feature for layer

        Ensure layer exists in any layer
        Warn if not in expected core layer but in other layer

        ENH: determine if check for expected core layer is necassary"""

        expected_mywcom_layers = expected_props.get("mywcom_layer")
        in_expected_mywcom_layer = False

        # determine if feature is registered in core layer
        if expected_mywcom_layers is not None:
            for expected_mywcom_layer in expected_mywcom_layers:
                layer_def = self.db.config_manager.layerDef(expected_mywcom_layer)

                if "feature_types" in layer_def:
                    for layer_feature_type in layer_def["feature_types"]:
                        if layer_feature_type["name"] == feature_type:
                            in_expected_mywcom_layer = True
                            continue

        # determine if feature is registered in a non-core layer
        other_layer = self._otherLayer(feature_type)

        if not in_expected_mywcom_layer and not other_layer:
            params = {"feature_type": feature_type}
            self.error(category, f"feature_type_not_in_any_layer,{json.dumps(params)}")
            return

    def _otherLayer(self, feature_type):
        """
        Checks for feature_type in non-core layers

        returns None or layer name"""

        layer_names = self.db.config_manager.layerNames()
        other_layer = None
        for layer_name in layer_names:
            # only check in 'non-core'layers
            if layer_name.split("_")[0] != "mywcom":
                layer_def = self.db.config_manager.layerDef(layer_name)

                if "feature_types" in layer_def:
                    for layer_feature_type in layer_def.get("feature_types"):
                        if layer_feature_type["name"] == feature_type:
                            other_layer = layer_name
                            continue

            if other_layer is not None:
                continue

        return other_layer

    def _checkFutureViewLayerFeaturesFor(self, category, feature_type):
        """
        Check future view layers have features

        If future view layers are in the system
        Ensure feature exists in them. Warn if not"""

        in_layer = False
        for future_view_layer in self._getFutureViewLayers():
            if "feature_types" in future_view_layer:
                for layer_feature_type in future_view_layer["feature_types"]:
                    if layer_feature_type["name"] == feature_type:
                        in_layer = True
                        continue

            if not in_layer:
                params = {
                    "feature_type": feature_type,
                    "future_view_layer": future_view_layer["name"],
                }
                self.warning(
                    category,
                    f"feature_type_not_in_future_view_layer,{json.dumps(params)}",
                )

    def _getFutureViewLayers(self):
        """
        get layers used for future view
        """

        layer_names = self.db.config_manager.layerNames()
        future_view_layers = []

        for layer_name in layer_names:

            layer_def = self.db.config_manager.layerDef(layer_name)
            layer_spec = layer_def.get("spec")

            if "extraOptions" in layer_spec:
                layer_extra_options = layer_spec["extraOptions"]

                if "schema" in layer_extra_options:
                    if layer_extra_options["schema"] == "delta":
                        future_view_layers.append(layer_def)

        return future_view_layers

    # ------------------------------------------------------------------------------
    #                                   HELPERS
    # ------------------------------------------------------------------------------

    def _checkName(self, category, name):
        """
        Check config item name exists
        """

        if name == "":
            self.error(category, "missing_name")
            name = None

        return name

    def _checkFeatureTypeName(self, category, feature_type, expected_props):
        """
        Check feature name

        Ensure feature name does not use mywcom_ prefix"""

        name_parts = feature_type.split("_")
        prefix = name_parts[0]

        if prefix == "mywcom":
            params = {"feature_type": feature_type}
            self.error(category, f"invalid_prefix_mywcom,{json.dumps(params)}")

    def _checkFeatureTypeExists(
        self, category, ref_feature_type, engine=None, row=None
    ):
        """
        Check if feature type exists

        If true, return feature"""

        feature_table = self.db_view.table(ref_feature_type, error_if_none=False)
        if not feature_table:
            params = {"feature_type": ref_feature_type}
            self.error(category, f"no_such_feature_type,{json.dumps(params)}")
            if engine and row:
                params = {"engine": engine, "row": row + 1}
                self.error(category, f"error_found_in_row,{json.dumps(params)}")

        return feature_table

    def _calculateRefFieldFeatureTypes(self, fld, *feature_types):
        """
        Returns list of feature types referenced by calculated reference field

        TODO: Copied from MywCalculatedReferenceField._scanInfo(),  cleaner way?"""

        # Field is not correct type (eg stored field)
        if not fld.value:
            return

        # Regex for parsing calculated field select() expression
        select_regex = re.compile("^select\((.*)\)$")

        # Unpick the value expression
        match = select_regex.match(fld.value)

        if not match:
            # Not validating the DD here
            return

        # Split and yield the scan info
        field_specs = match.group(1)
        if field_specs == "":
            return

        for field_spec in field_specs.split(","):
            (feature_type, field_name) = field_spec.split(".", 1)

            if feature_types and not (feature_type in feature_types):
                continue

            yield feature_type, field_name

    def _checkImagePath(self, category, feature_type, config):
        """
        Valdiate palette image path

        Ensure that configured image file exists on file system
        ENH: this assumes file is in modules directory
        i.e. modules/comms/images/features/fiber_olt.svg
        configured location is a url not a file system path therefor
        it doesn't include public directory so its inserted
        i.e. modules/comms/public/images/features/fiber_olt.svg"""

        img_path_config = config.get("image")

        if not img_path_config:
            # TODO required?
            return

        base_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..")
        img_path_public = self._addPublicDir(img_path_config)

        img_path = os.path.join(base_dir, img_path_config)
        img_path_pub = os.path.join(base_dir, img_path_public)

        # look in path with public directory first
        img_file_pub = os.path.isfile(img_path_pub)

        if not img_file_pub:
            # look at configured path (without public)
            img_file = os.path.isfile(img_path_pub)
            if not img_file:
                params = {
                    "feature_type": feature_type,
                    "img_path_config": img_path_config,
                }
                self.error(category, f"image_does_not_exist,{json.dumps(params)}")

    def _addPublicDir(self, path):
        """
        Add public to image path


        i.e from modules/comms/images/features/fiber_olt.svg
        to modules/comms/public/images/features/fiber_olt.svg"""
        path_as_list = path.split("/")
        path_as_list.insert(2, "public")
        return "/".join(path_as_list)

    def _getForeignKeyFieldFeature(self, fk_field_value, fk_field_name):
        """
        Get foreign_key reference feature type and table
        """

        select_regex = re.compile("^foreign_key\((.*)\)$")

        # Unpick the value expression
        match = select_regex.match(fk_field_value)

        if not match:
            self.error("no feature type set for foreign_key field:", fk_field_name)
            return

        fk_feature_type = match.group(1)

        fk_feature_table = self.db_view.table(fk_feature_type, error_if_none=False)

        return fk_feature_type, fk_feature_table

    def _checkSchemeColors(self, category, scheme_name, scheme_colors, expected_colors):
        """
        Check if all scheme colors exist in configured fiber colors
        """

        for color_config in scheme_colors:
            color = color_config["color"]

            if color not in expected_colors:
                params = {"scheme_name": scheme_name, "color": color}
                self.error(category, f"color_not_configured,{json.dumps(params)}")

            stripe = "stripes" in color_config.keys()
            if stripe:
                for stripe_color in color_config["stripes"]:
                    if stripe_color not in expected_colors:
                        params = {"scheme_name": scheme_name, "color": color}
                        self.error(
                            category, f"color_not_configured,{json.dumps(params)}"
                        )

    def _checkFeatureVersioned(self, category, feature_type, feature_table):
        """
        Check if feature is configured as versioned, warn if not
        """

        if not feature_table.descriptor.versioned:
            params = {"feature_type": feature_type}
            self.warning(category, f"type_is_not_versioned,{json.dumps(params)}")

    def _checkFeatureNotVersioned(self, category, feature_type, feature_table, desc):
        """
        Check if feature is configured as not versioned, error if it is
        """

        if feature_table.descriptor.versioned:
            params = {"feature_type": feature_type, "desc": desc}
            self.error(category, f"cannot_be_versioned,{json.dumps(params)}")

    def _checkFiberFields(self, category, feature_type, feature_table):
        """
        If feature has a stored ports field check it also has fiber_connections field
        """

        port_count_fields = [
            "n_fiber_in_ports",
            "n_fiber_out_ports",
            "n_fiber_ports",
            "fiber_count",
        ]
        ft_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

        # For each port count field
        for field_name in port_count_fields:
            # If it has a port count field
            port_field = ft_desc.fields.get(field_name)
            if not port_field:
                continue
            # Check it also has the fiber_connections field
            if not ft_desc.fields.get("fiber_connections"):
                params = {"feature_type": feature_type, "field_name": field_name}
                self.error(
                    category, f"has_port_count_but_not_connection,{json.dumps(params)}"
                )
                return

    def log(self, key, level, *msg):
        """
        Helper to report problem at given level
        """

        if level == "error":
            return self.error(key, *msg)

        elif level == "warn":
            return self.warning(key, *msg)

    def error(self, key, *msg):
        """
        Report a problem as error
        """

        key = "mywcom." + key  # ENH: Hack until client code changed

        self.progress(1, "Error:", *msg)

        if key not in self.errors:
            self.errors[key] = {}
        if "errors" not in self.errors[key]:
            self.errors[key]["errors"] = []

        self.errors[key]["errors"].append(" ".join(msg))

    def warning(self, key, *msg):
        """
        Report a problem as warning
        """

        key = "mywcom." + key  # ENH: Hack until client code changed

        if self.warn:
            self.progress(2, "Warning:", *msg)
            if key not in self.errors:
                self.errors[key] = {}
            if "warnings" not in self.errors[key]:
                self.errors[key]["warnings"] = []

            self.errors[key]["warnings"].append(" ".join(msg))
