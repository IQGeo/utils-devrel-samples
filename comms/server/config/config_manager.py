# Copyright: IQGeo Limited 2010-2023
import os, re
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.dd.myw_calculated_reference_field import MywCalculatedReferenceField
from myworldapp.modules.comms.server.api.network_view import NetworkView


class ConfigManager:
    """
    Engine for managing comms configuration

    Provides API for adding a feature type to a category"""

    def __init__(self, db, progress=MywProgressHandler()):
        """
        Init slots of self

        DB is a MywDatabase"""

        self.db = db
        self.db_view = db.view()
        self.progress = progress
        self.nw_view = NetworkView(self.db_view, self.progress)

        self.structs_layer = "mywcom_structures"
        self.routes_layer = "mywcom_structures"
        self.conduits_layer = "mywcom_conduits"
        self.circuits_layer = "mywcom_circuits"

        # add cable features to correct layer based on tech
        self.cables_layer = {
            "fiber": "mywcom_cables",
            "coax": "mywcom_coax_cables",
            "copper": "mywcom_copper_cables",
        }

        self.cables_secondary_layer = {
            "coax": "mywcom_coax_cables_offset",
        }

        # add equipment features to correct layer based on tech
        self.equips_layer = {
            "fiber": "mywcom_equipment",
            "coax": "mywcom_coax_equipment",
            "copper": "mywcom_copper_equipment",
            "mixed": "mywcom_mixed_equipment",
        }

        self.equips_secondary_layer = {
            "coax": "mywcom_coax_equipment_offset",
            "mixed": "mywcom_coax_equipment_offset",
        }

        # Basic template definitions for these networks are added on comms schema installation
        # When a new feature is added then it is added to networks depending on its
        # category.
        self.routes_network = "mywcom_routes"
        self.tech_types = ["fiber", "copper", "coax"]
        self.networks = {
            "fiber": ["mywcom_fiber", "mywcom_fiber_path"],
            "copper": ["mywcom_copper"],
            "coax": ["mywcom_coax"],
        }
        self.cable_network = "mywcom_cable_segments"

    # ------------------------------------------------------------------------------
    #                                       API
    # ------------------------------------------------------------------------------

    def addStructType(self, feature_type, icon_file, layer_data=None, palette=True):
        """
        Adds FEATURE_TYPE as a structure type (if not already present).

        ICON_FILE is path to a module image resource for display in connectivity tree etc

        Optional args are:
           LAYER_DATA    Dict containing display settings for the layer
           PALETTE       Boolean for wether the feature shows in the palette
           NETWORK       Dict containing upstream and downstream field names"""

        with self.progress.operation("Adding structure type:", feature_type):

            # Check for already exists
            struct_defs = self.db.setting("mywcom.structures")
            added_to_setting = feature_type not in struct_defs

            if added_to_setting:
                # Add to core configuration
                if layer_data:
                    if not "point_style" in layer_data:
                        layer_data["point_style"] = "circle:green:4"
                    self._addToLayer(self.structs_layer, feature_type, "location", **layer_data)
                self._addToNetwork(self.routes_network, feature_type, "routes", "routes")
                self._addToNetwork(
                    self.cable_network,
                    feature_type,
                    "in_fiber_segments",
                    "out_fiber_segments",
                )
                self._addEquipFeatureToHousings(feature_type)

            # Update comms setting
            struct_defs[feature_type] = {"image": icon_file, "palette": palette}
            self.db.setSetting("mywcom.structures", struct_defs)

            return {"feature_type": feature_type, "added_to_setting": added_to_setting}

    def addRouteType(self, feature_type, icon_file, layer_data=None, palette=True):
        """
        Adds FEATURE_TYPE as a route type (if not already present).

        ICON_FILE is path to a module image resource for display in connectivity tree etc

        Optional args are:
           LAYER_DATA    Dict containing display settings for the layer
           PALETTE       Boolean for wether the feature shows in the palette
           NETWORK       Dict containing upstream and downstream field names"""

        with self.progress.operation("Adding route type:", feature_type):

            # Check for already exists
            route_defs = self.db.setting("mywcom.routes")
            added_to_setting = feature_type not in route_defs

            if added_to_setting:
                # Add to core configuration
                if layer_data:
                    if not "line_style" in layer_data:
                        layer_data["line_style"] = "green:2:solid"
                    self._addToLayer(self.routes_layer, feature_type, "path", **layer_data)
                self._addToNetwork(
                    self.routes_network,
                    feature_type,
                    "in_structure",
                    "out_structure",
                    "length",
                )
                self._addToRoutesField(feature_type)

            # Update comms setting
            route_defs[feature_type] = {"image": icon_file, "palette": palette}
            self.db.setSetting("mywcom.routes", route_defs)

            res = {"feature_type": feature_type, "added_to_setting": added_to_setting}
            if added_to_setting:
                res["field_updated"] = "routes"
                res["feature_updated"] = "mywcom.structures"

            return res

    def addEquipType(
        self,
        feature_type,
        icon_file,
        layer_data=None,
        secondary_layer=None,
        palette=True,
        housings=None,
        function=None,
        tech=None,
        data_block=None,
        offset=False,
    ):
        """
        Adds FEATURE_TYPE as a equipment type (if not already present).

        ICON_FILE is path to a module image resource for display in connectivity tree etc

        Optional args are:
           LAYER_DATA    Dict containing display settings for the layer
           PALETTE       Boolean for wether the feature shows in the palette
           HOUSINGS      Features that can house FEATURE_TYPE
           FUNCTION      What the equipment is used for"""

        with self.progress.operation("Adding equipment type:", feature_type):

            # Check for already exists
            equip_defs = self.db.setting("mywcom.equipment")
            added_to_setting = feature_type not in equip_defs

            # Add to core configuration
            if added_to_setting:
                if layer_data:
                    self._addToLayer(
                        self.equips_layer[tech], feature_type, "location", **layer_data
                    )

                self._addToTechNetworks(feature_type)
                self._addEquipFeatureToHousings(feature_type)

            # Update equipment field for housings of feature_type
            self._addHousingsToEquipField(feature_type, housings)

            # handle offset layers and secondary geometry
            # adds features to layer specified in config, eg 'mywcom_coax_equipment_offset'
            if offset and secondary_layer:
                if "geometry" in secondary_layer:
                    field_name = secondary_layer.pop("geometry", None)
                    self._addToLayer(
                        self.equips_secondary_layer[tech],
                        feature_type,
                        field_name,
                        **secondary_layer,
                    )

            # Update comms setting
            equip_defs[feature_type] = {
                "image": icon_file,
                "palette": palette,
                "housings": housings,
                "function": function,
                "tech": tech,
                "offset": offset,
            }
            self.db.setSetting("mywcom.equipment", equip_defs)

            if data_block:
                data_block_setting = self.db.setting("mywcom.dataBlocks")

                if data_block_setting is None:
                    data_block_setting = {}

                data_block_setting[feature_type] = data_block
                self.db.setSetting("mywcom.dataBlocks", data_block_setting)

            res = {
                "feature_type": feature_type,
                "added_to_setting": added_to_setting,
                "field_updated": "equipment",
            }
            return res

    def addConduitType(
        self,
        feature_type,
        icon_file,
        layer_data=None,
        palette=True,
        structure_palette_image=None,
        housings=None,
        continuous=False,
        bundle_type=None,
    ):
        """
        Adds FEATURE_TYPE as a conduit type (if not already present).

        ICON_FILE is path to a module image resource for display in connectivity tree etc

        Optional args are:
           LAYER_DATA                Dict containing display settings for the layer
           PALETTE                   Boolean for wether the feature shows in the palette
           STRUCTURE_PALLETE_IMAGE   Image to show in palette
           HOUSINGS                  Feature types that can house FEATURE_TYPE
           CONTINUOUS                Boolean for wether the conduit is continuous
           BUNDLE_TYPE               String to specific type of bundle"""

        with self.progress.operation("Adding conduit type:", feature_type):

            # Check for already exists
            conduit_defs = self.db.setting("mywcom.conduits")
            added_to_setting = feature_type not in conduit_defs

            if added_to_setting:
                if layer_data:
                    # Add to core configuration
                    layer = layer_data.pop("layer", None) or self.conduits_layer
                    if not "line_style" in layer_data:
                        layer_data["line_style"] = "green:2:solid"
                    self._addToLayer(layer, feature_type, "path", **layer_data)
                # Add feature_type to conduit field of housings
                self._addConduitFeatureToHousings(feature_type)

            # Update conduit field of feature_type for housings
            self._addHousingsToConduitField(feature_type, housings)

            # Update comms setting
            conduit_defs[feature_type] = {
                "image": icon_file,
                "palette": palette,
                "structurePaletteImage": structure_palette_image,
                "housings": housings,
            }
            if continuous:
                conduit_defs[feature_type]["continuous"] = continuous             
                self._addFeatureTypeToRefSet("mywcom_conduit_run", "conduits", feature_type + ".conduit_run")
            else:
                self._removeFeatureTypeFromRefSet("mywcom_conduit_run", feature_type, "conduits")              

            if bundle_type:
                conduit_defs[feature_type]["bundle_type"] = bundle_type

            self.db.setSetting("mywcom.conduits", conduit_defs)

            res = {"feature_type": feature_type, "added_to_setting": added_to_setting}
            if added_to_setting:
                res["field_updated"] = "conduits"
                res["feature_updated"] = feature_type
            return res

    def addCableType(
        self,
        feature_type,
        icon_file,
        layer_data=None,
        secondary_layer=None,
        palette=True,
        housings=None,
        tech=None,
    ):
        """
        Adds FEATURE_TYPE as a cable type (if not already present).

        ICON_FILE is path to a module image resource for display in connectivity tree etc

        Optional args are:
           LAYER_DATA    Dict containing display settings for the layer
           PALETTE       Boolean for wether the feature shows in the palette
           HOUSINGS      feature types that can house FEATURE_TYPE"""

        with self.progress.operation("Adding cable type:", feature_type):

            # Check for already exists
            cable_defs = self.db.setting("mywcom.cables")
            added_to_setting = feature_type not in cable_defs

            if added_to_setting and layer_data:
                # Add to core configuration
                if not "line_style" in layer_data:
                    layer_data["line_style"] = "green:2:solid"
                self._addToLayer(self.cables_layer[tech], feature_type, "path", **layer_data)

            # handle offset layers and secondary geometry
            # adds features to layer specified in config, eg 'mywcom_coax_cables_offset'
            if secondary_layer and tech in self.cables_secondary_layer:
                if "geometry" in secondary_layer:
                    field_name = secondary_layer.pop("geometry", None)
                    self._addToLayer(
                        self.cables_secondary_layer[tech],
                        feature_type,
                        field_name,
                        **secondary_layer,
                    )

            # Update comms setting
            cable_defs[feature_type] = {
                "image": icon_file,
                "palette": palette,
                "housings": housings,
                "tech": tech,
            }
            self.db.setSetting("mywcom.cables", cable_defs)

            return {"feature_type": feature_type, "added_to_setting": added_to_setting}

    def addCircuitType(
        self,
        feature_type,
        icon_file,
        layer_data=None,
        palette=True,
        in_equips=[],
        out_equips=[],
    ):
        """
        Adds FEATURE_TYPE as a circuit type (if not already present).

        ICON_FILE is path to a module image resource for display in connectivity tree etc

        Optional args are:
           LAYER_DATA    Dict containing display settings for the layer
           PALETTE       Boolean for wether the feature shows in the palette
           IN_EQUIPS     Feature types that can start a circuit
           OUT_EQUIPS    Feature types that can end a circuit"""

        with self.progress.operation("Adding circuit type:", feature_type):

            # Check for already exists
            circuit_defs = self.db.setting("mywcom.circuits")
            added_to_setting = feature_type not in circuit_defs

            # Add to core configuration
            if added_to_setting and layer_data:
                if not "line_style" in layer_data:
                    layer_data["line_style"] = "green:2:solid"
                self._addToLayer(self.circuits_layer, feature_type, "path", **layer_data)

            # Update comms setting
            circuit_defs[feature_type] = {
                "image": icon_file,
                "palette": palette,
                "inEquips": in_equips,
                "outEquips": out_equips,
            }
            self.db.setSetting("mywcom.circuits", circuit_defs)

            return {"feature_type": feature_type, "added_to_setting": added_to_setting}

    def addSpecType(self, feature_type, ref_feature, field_name, layer_name=None):
        """
        Adds FEATURE_TYPE as a spec type (if not already present).
        """

        with self.progress.operation("Adding spec type:", feature_type):
            spec_defs = self.db.setting("mywcom.specs")
            added_to_setting = feature_type not in spec_defs

            if added_to_setting and layer_name:
                self._addToLayer(layer_name, feature_type)

            # Update comms setting
            spec_defs[ref_feature] = field_name
            self.db.setSetting("mywcom.specs", spec_defs)

            return True

    def addDesignType(self, feature_type, layer_data=None, **config):
        """
        Add FEATURE_TYPE as a design type (if not already present)
        """

        with self.progress.operation("Adding design type:", feature_type):
            designs_defs = self.db.setting("mywcom.designs")
            added_to_setting = feature_type not in designs_defs

            if added_to_setting:
                # Update comms setting
                designs_defs[feature_type] = config
                self.db.setSetting("mywcom.designs", designs_defs)

                if layer_data:
                    layer_name = layer_data.pop("layer", "designs")
                    field_name = layer_data.pop("field_name", "boundary")
                    self._addToLayer(layer_name, feature_type, **layer_data)

            return True

    def removeStructType(self, feature_type):
        """
        Removes FEATURE_TYPE from struct list
        """

        # Check for not exists
        struct_defs = self.db.setting("mywcom.structures")

        if feature_type not in struct_defs:
            self.progress(1, "Structure type not in setting:", feature_type)
            return False

        # Update core configuration
        self._removeFromNetwork(self.routes_network, feature_type)
        self._removeFromNetwork(self.cable_network, feature_type)

        # Update comms setting
        del struct_defs[feature_type]
        self.db.setSetting("mywcom.structures", struct_defs)

        return {"feature_type": feature_type, "removed_from_setting": True}

    def removeRouteType(self, feature_type):
        """
        Removes FEATURE_TYPE from routes list
        """

        # Check for not exists
        route_defs = self.db.setting("mywcom.routes")

        if feature_type not in route_defs:
            self.progress(1, "Route type not in setting:", feature_type)
            return False

        # Update core configuration
        self._removeFromNetwork(self.routes_network, feature_type)
        self._removeFromRoutesField(feature_type)

        # Update comms setting
        del route_defs[feature_type]
        self.db.setSetting("mywcom.routes", route_defs)

        res = {
            "feature_type": feature_type,
            "removed_from_setting": True,
            "field_removed": "routes",
            "feature_updated": "mywcom.structures",
        }
        return res

    def removeEquipType(self, feature_type):
        """
        Removes FEATURE_TYPE from equipment list
        """

        # Check for not exists
        equip_defs = self.db.setting("mywcom.equipment")

        if feature_type not in equip_defs:
            self.progress(1, "Equipment type not in setting:", feature_type)
            return False

        # Update core configuration
        for tech in self.tech_types:
            self._removeFromNetworks(self.networks[tech], feature_type)
        self._removeFromEquipmentField(feature_type)

        # Update comms setting
        del equip_defs[feature_type]
        self.db.setSetting("mywcom.equipment", equip_defs)

        res = {
            "feature_type": feature_type,
            "removed_from_setting": True,
            "field_removed": "equipment",
        }
        return res

    def removeConduitType(self, feature_type):
        """
        Removes FEATURE_TYPE from conduit list
        """

        # Check for not exists
        conduit_defs = self.db.setting("mywcom.conduits")

        if feature_type not in conduit_defs:
            self.progress(1, "Conduit type not in setting:", feature_type)
            return False

        # Update core configuration
        continuous = conduit_defs[feature_type].get("continuous")
        if continuous:
            self._removeFromConduitsField(feature_type)

        # Update comms setting
        del conduit_defs[feature_type]
        self.db.setSetting("mywcom.conduits", conduit_defs)

        res = {"feature_type": feature_type, "removed_from_setting": True}
        if continuous:
            res["field_removed"] = "conduits"
            res["feature_updated"] = "mywcom_conduit_run"
        return res

    def removeCableType(self, feature_type):
        """
        Removes FEATURE_TYPE from cable list
        """

        # Check for not exists
        cable_defs = self.db.setting("mywcom.cables")

        if feature_type not in cable_defs:
            self.progress(1, "Cable type not in setting:", feature_type)
            return False

        # Update comms setting
        del cable_defs[feature_type]
        self.db.setSetting("mywcom.cables", cable_defs)

        return {"feature_type": feature_type, "removed_from_setting": True}

    def removeCircuitType(self, feature_type):
        """
        Removes FEATURE_TYPE from circuit list
        """

        # Check for not exists
        circuit_defs = self.db.setting("mywcom.circuits")

        if feature_type not in circuit_defs:
            self.progress(1, "Circuit type not in setting:", feature_type)
            return False

        # Update comms setting
        del circuit_defs[feature_type]
        self.db.setSetting("mywcom.circuits", circuit_defs)

        return {"feature_type": feature_type, "removed_from_setting": True}

    def removeSpecType(self, feature_type):
        """
        Removes FEATURE_TYPE from circuit list
        """
        # ENH: Consider if we want to remove from layer?

        # Check for not exists
        spec_defs = self.db.setting("mywcom.specs")

        if feature_type not in spec_defs:
            self.progress(1, "Spec type not in setting:", feature_type)
            return False

        # Update comms setting
        del spec_defs[feature_type]
        self.db.setSetting("mywcom.specs", spec_defs)

    # ------------------------------------------------------------------------------
    #                                    HELPERS
    # ------------------------------------------------------------------------------

    def _addToLayer(
        self,
        layer_name,
        feature_type,
        field_name=None,
        point_style=None,
        line_style=None,
        text_style=None,
        fill_style=None,
        min_vis=None,
        max_vis=None,
        min_select=None,
        max_select=None,
    ):
        """
        Adds FEATURE_TYPE to LAYER (if not already present).
        """
        self.progress(1, "Adding", feature_type, "to", layer_name)

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
        if fill_style:
            item_def["fill_style"] = fill_style
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

    def _addToNetworks(
        self, network_names, feature_type, upstream=None, downstream=None, length=None
    ):
        """
        Adds FEATURE_TYPES to networks NETWORKS_NAMES
        """

        for network in network_names:
            self._addToNetwork(
                network,
                feature_type,
                upstream=upstream,
                downstream=downstream,
                length=length,
            )

    def _addToNetwork(
        self, network_name, feature_type, upstream=None, downstream=None, length=None
    ):
        """
        Adds FEATURE_TYPE to NETWORK_NAME
        UPSTREAM, DOWNSTREAM, and LENGTH are field names
        """

        network = self.db.config_manager.networkExists(network_name)

        # Check for network doesnt exist
        if not network:
            self.progress("Warning", "No such network:", network_name)
            return

        network_def = self.db.config_manager.networkDef(network_name)
        network_feature_items = network_def.pop("feature_types", [])

        # Check for feature type already in network
        if feature_type in network_feature_items:
            self.progress(1, feature_type, "already in", network_name)
            return

        self.progress(3, "Adding feature type", feature_type, "to network", network_name)

        # Create netowrk feature def
        network_feature_def = {"upstream": upstream, "downstream": downstream}
        if length:
            network_feature_def["length"] = length
        network_feature_items[feature_type] = network_feature_def

        # Add to network
        network_def["feature_types"] = network_feature_items
        self.db.config_manager.updateNetwork(network_name, network_def)

    def _addToRoutesField(self, feature_type):
        """
        Adds FEATURE_TYPE to calculated field 'routes' on all structures
        """

        for struct in self.nw_view.structs:           
            with self.progress.operation("Adding", feature_type, "to field", struct + ".routes"):
                self._addFeatureTypeToRefSet(struct, "routes", f"{feature_type}.in_structure,{feature_type}.out_structure")

    def _addToTechNetworks(self, feature_type):
        """
        Adds FEATURE_TYPE to techology networks if it has the required port fields
        """

        ft_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

        for tech in ["fiber", "copper", "coax"]:
            if f"n_{tech}_in_ports" in ft_desc.fields and f"n_{tech}_out_ports" in ft_desc.fields:
                self._addToNetworks(
                    self.networks[tech],
                    feature_type,
                    f"{tech}_connections",
                    f"{tech}_connections",
                )
                continue

            if f"n_{tech}_ports" in ft_desc.fields:
                self._addToNetworks(
                    self.networks[tech],
                    feature_type,
                    f"{tech}_connections",
                    f"{tech}_connections",
                )
                continue

            # Add to upstream only
            if f"n_{tech}_in_ports" in ft_desc.fields:
                self._addToNetworks(self.networks[tech], feature_type, f"{tech}_connections")
                continue

            # Add to downstream only
            if f"n_{tech}_out_ports" in ft_desc.fields:
                self._addToNetworks(self.networks[tech], feature_type, None, f"{tech}_connections")
                continue

    def _addEquipFeatureToHousings(self, feature_type):
        """
        Add equipment feature types to the equipment field of FEATURE_TYPE if the equipment declares FEATURE_TYPE as housing
        """
        ft_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

        # For each item defined in equipment setting...
        for feature, config in self.db.setting("mywcom.equipment").items():

            # If feature_type is its housing
            if feature_type in config["housings"]:

                # if field exists...
                if not self._fieldExists(ft_desc, "equipment"):
                    continue

                # Add the equipment type to equipment field
                equipment_field = ft_desc.fields["equipment"]
                field_specs = self._addToFieldSpec(equipment_field.value, f"{feature}.housing")
                equipment_field.value = field_specs

                with self.progress.operation(
                    "Adding", feature_type, "to field", feature + ".equipment"
                ):
                    self.db.dd.alterFeatureType(ft_rec, ft_desc)

    def _addHousingsToEquipField(self, feature_type, housings):
        """
        Add FEATURE_TYPE to the equipment field of its housings
        """

        # For each housing...
        for housing in housings:
            ft_rec = self.db.dd.featureTypeRec("myworld", housing)
            if not ft_rec:
                self.progress(1, "Housing type", housing, "is not defined")
                continue

            ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

            # if field exists...
            if not self._fieldExists(ft_desc, "equipment"):
                continue

            # Add the equipment type to equipment field
            equipment_field = ft_desc.fields["equipment"]
            field_specs = self._addToFieldSpec(equipment_field.value, f"{feature_type}.housing")
            equipment_field.value = field_specs

            with self.progress.operation(
                "Adding", feature_type, "to field", housing + ".equipment"
            ):
                self.db.dd.alterFeatureType(ft_rec, ft_desc)

    def _addConduitFeatureToHousings(self, feature_type):
        """
        Add conduit feature types to the conduit field of FEATURE_TYPE if the conduit declares FEATURE_TYPE as housing
        """
        ft_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

        # For each item defined in conduits setting...
        for feature, config in self.db.setting("mywcom.conduits").items():

            # If feature_type is its housing
            if feature_type in config["housings"]:

                # if field exists...
                if not self._fieldExists(ft_desc, "conduits"):
                    continue

                # Add the conduits type to conduits field
                conduits_field = ft_desc.fields["conduits"]
                field_specs = self._addToFieldSpec(conduits_field.value, f"{feature}.housing")
                conduits_field.value = field_specs

                with self.progress.operation(
                    "Adding", feature_type, "to field", feature + ".conduits"
                ):
                    self.db.dd.alterFeatureType(ft_rec, ft_desc)

    def _addHousingsToConduitField(self, feature_type, housings):
        """
        Add FEATURE_TYPE to the conduit field of its housings
        """

        # For each housing...
        for housing in housings:
            ft_rec = self.db.dd.featureTypeRec("myworld", housing)
            if not ft_rec:
                self.progress(1, "Housing type", housing, "is not defined")
                continue

            ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

            # if field exists...
            if not self._fieldExists(ft_desc, "conduits"):
                continue

            # Add the conduits type to conduits field
            conduits_field = ft_desc.fields["conduits"]
            field_specs = self._addToFieldSpec(conduits_field.value, f"{feature_type}.housing")
            conduits_field.value = field_specs

            with self.progress.operation("Adding", feature_type, "to field", housing + ".conduits"):
                self.db.dd.alterFeatureType(ft_rec, ft_desc)

       

    def _fieldExists(self, ft_desc, field_name):
        """
        Checks if FIELD_NAME exists on FT_DESC and is a reference set field
        """

        # Check field exists
        if field_name not in ft_desc.fields:
            self.progress(1, "Warning: {} field not on feature".format(field_name))
            return False

        # Check field is a reference set
        field = ft_desc.fields[field_name]
        if field.type != "reference_set":
            self.progress(1, "Warning: {} field is not reference_set".format(field_name))
            return False

        return True

    def _addToFieldSpec(self, field_specs, new_field_spec):
        """
        Adds "FEATURE_TYPE.housing" to FIELD_SPECS
        """

        select_regex = re.compile(MywCalculatedReferenceField.select_regex)
        match = select_regex.match(field_specs)
        field_specs = match.group(1)

        # Dont modify if feature is already in specs
        if new_field_spec in field_specs:
            return "select(" + field_specs + ")"

        # Add feature_type to the select statement
        if field_specs != "":
            field_specs += ","

        field_specs += new_field_spec
        return "select(" + field_specs + ")"

    def _removeFromLayer(self, layer_name, feature_type):
        """
        Removes FEATURE_TYPE from LAYER_NAME
        """

        self.progress(3, "Removing", feature_type, "from layer", layer_name)
        layer_def = self.db.config_manager.layerDef(layer_name)

        # Remove feature type from layer feature items
        feature_types = layer_def["feature_types"]
        feature_types = [
            layer_item
            for layer_item in layer_def["feature_types"]
            if layer_item.get("name") != feature_type
        ]

        # Warn if feature type not removed
        if len(feature_types) == len(layer_def["feature_types"]):
            self.progress(1, "Warning: feature item:", feature_type, "is not in", layer_name)
            return

        # Update layer
        layer_def["feature_types"] = feature_types
        self.db.config_manager.updateLayer(layer_name, layer_def)

    def _removeFromNetworks(self, network_names, feature_type):
        """
        Removes FEATURE_TYPE from networks NETWORK_NAMES
        """

        for network in network_names:
            self._removeFromNetwork(network, feature_type)

    def _removeFromNetwork(self, network_name, feature_type):
        """
        Removes FEATURE_TYPE from NETWORK_NAME
        """

        network = self.db.config_manager.networkExists(network_name)

        # Check for network doesnt exist
        if not network:
            self.progress(1, "Warning: network", network_name, "doesn't exist")
            return

        self.progress(3, "Removing", feature_type, "from network", network_name)

        # Get feature types
        network_def = self.db.config_manager.networkDef(network_name)
        feature_types = network_def["feature_types"]

        # Warn if feature type not in network features
        if feature_type not in feature_types:
            self.progress(1, "Warning: feature item:", feature_type, "is not in", network_name)
            return

        # Update network
        del feature_types[feature_type]
        network_def["feature_types"] = feature_types
        self.db.config_manager.updateNetwork(network_name, network_def)

    def _removeFromRoutesField(self, feature_type):
        """
        Removes references to FEATURE_TYPE in all structures that have a routes field
        """

        for feature in self.nw_view.structs:
            self._removeFeatureTypeFromRefSet(feature, feature_type, "routes")

    def _removeFromConduitsField(self, feature_type):
        """
        Removes reference to FEATURE_TYPE in conduits field of mywcom_conduit_run
        """

        self._removeFeatureTypeFromRefSet("mywcom_conduit_run", feature_type, "conduits")

    def _removeFromEquipmentField(self, feature_type):
        """
        Removes reference to FEATURE_TYPE in equipment field of structures and equipments
        """

        features = list(self.nw_view.structs.keys()) + list(self.nw_view.equips.keys())
        for feature in features:
            self.progress(3, "Removing", feature_type, "from equipment field of feature:", feature)
            self._removeFeatureTypeFromRefSet(feature, feature_type, "equipment")

    def _removeFeatureTypeFromRefSet(self, feature, feature_type, field_name):
        """
        Remove references to FEATURE_TYPE in FIELD_NAME for FEATURE
        """      

        ft_rec = self.db.dd.featureTypeRec("myworld", feature)
        ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

        # Warn if no relevant field
        if field_name not in ft_desc.fields:
            self.progress(1, "Warning: {} field not on feature".format(field_name))
            return

        field = ft_desc.fields[field_name]

        # Warn if field of wrong type
        if field.type != "reference_set":
            self.progress(1, "Warning: {} field is not reference_set".format(field_name))
            return

        # Remove items relevant to feature_type
        select_regex = re.compile("^select\((.*)\)$")
        match = select_regex.match(field.value)
        field_specs = match.group(1)

        if field_specs == "":
            self.progress(3, "{} field empty".format(field_name))
            return

        feature_field_specs = field_specs.split(",")
        # Filter out items that refer to feature_type
        filtered_fields = [
            spec for spec in feature_field_specs if spec.split(".")[0] != feature_type
        ]
        field_specs = ",".join(filtered_fields)

        field.value = "select(" + field_specs + ")"
        self.db.dd.alterFeatureType(ft_rec, ft_desc)

    def _addFeatureTypeToRefSet(self,feature, field_name, field_spec):
        """
        Add reference FIELD_SPEC to a feature in the reference set FIELD_NAME on FEATURE
        """

        ft_rec = self.db.dd.featureTypeRec("myworld", feature)
        ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

        if not self._fieldExists(ft_desc, field_name):
            return
      
        field_desc = ft_desc.fields[field_name]

        new_field_specs = self._addToFieldSpec(field_desc.value, field_spec)

        field_desc.value = new_field_specs
        self.db.dd.alterFeatureType(ft_rec, ft_desc)