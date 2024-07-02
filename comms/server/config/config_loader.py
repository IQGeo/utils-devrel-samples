# Copyright: IQGeo Limited 2010-2023
import os, copy, glob
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine

from myworldapp.modules.comms.server.config.config_manager import ConfigManager


class ConfigLoader:
    """
    Engine for loading a template model

    Loads all .def, .layer and comms config files from a directory tree"""

    def __init__(self, db, root_dir, localiser, progress=MywProgressHandler()):
        """
        Init slots of self

        DB is a MywDatabase. ROOT_DIR is the location of the template model.
        LOCALISER is used to translate message strings in the .def files"""

        self.db = db
        self.root_dir = root_dir
        self.localiser = localiser
        self.progress = progress

        self.app_name = "mywcom"  # ENH: Make configurable
        self.config_mgr = ConfigManager(self.db, self.progress)
        self.os_engine = MywOsEngine(self.progress)

    def run(self):
        """
        Load feature types and configuration
        """

        # Check directory exists
        if not os.path.exists(self.root_dir):
            raise MywError("No such model:", self.root_dir)
        self.progress(2, "Loading model from", self.root_dir)

        # Load enums
        for path in self.files("*.enum"):
            self.db.data_loader.loadEnumerators(path, localiser=self.localiser)

        # Load feature definitions
        for path in self.files("*.def"):
            self.db.data_loader.loadFeatureTypeDefs(path, localiser=self.localiser)

        # Load layer definitions
        for path in self.files("*.layer"):
            layer_names = self.db.data_loader.loadLayerDefinitions(path, localiser=self.localiser)
            for layer_name in layer_names:
                self.addLayerTo(self.app_name, layer_name)

        # Load layer group definitions
        for path in self.files("*.layer_group"):
            self.db.data_loader.loadLayerGroupDefinitions(path, localiser=self.localiser)

        # Configure structures
        for path in self.files("*.struct_config"):
            (feature_type, config) = self.loadConfig(path)
            icon_file = config.pop("image")
            layer_data = config.pop("layer", None)
            self.config_mgr.addStructType(feature_type, icon_file, layer_data, **config)

        # Configure Routes
        for path in self.files("*.route_config"):
            (feature_type, config) = self.loadConfig(path)
            icon_file = config.pop("image")
            layer_data = config.pop("layer", None)
            self.config_mgr.addRouteType(feature_type, icon_file, layer_data, **config)

        # Configure Conduits
        for path in self.files("*.conduit_config"):
            (feature_type, config) = self.loadConfig(path)
            icon_file = config.pop("image")
            layer_data = config.pop("layer", None)
            self.config_mgr.addConduitType(feature_type, icon_file, layer_data, **config)

        # Configure Equipment
        for path in self.files("*.equip_config"):
            (feature_type, config) = self.loadConfig(path)
            icon_file = config.pop("image")
            layer_data = config.pop("layer", None)
            secondary_layer = config.pop("secondary_layer", None)
            self.config_mgr.addEquipType(
                feature_type, icon_file, layer_data, secondary_layer, **config
            )

        # Configure Cables
        for path in self.files("*.cable_config"):
            (feature_type, config) = self.loadConfig(path)
            icon_file = config.pop("image")
            layer_data = config.pop("layer", None)
            secondary_layer = config.pop("secondary_layer", None)
            self.config_mgr.addCableType(
                feature_type, icon_file, layer_data, secondary_layer, **config
            )

        # Configure Circuits
        for path in self.files("*.circuit_config"):
            (feature_type, config) = self.loadConfig(path)
            icon_file = config.pop("image")
            layer_data = config.pop("layer", None)
            self.config_mgr.addCircuitType(feature_type, icon_file, layer_data, **config)

        # Configure Specs
        for path in self.files("*.spec_config"):
            (feature_type, config) = self.loadConfig(path)
            ref_feature = config.get("ref_feature")
            field_name = config.get("field_name")
            layer_name = config.get("layer")
            self.config_mgr.addSpecType(feature_type, ref_feature, field_name, layer_name)

        # Configure Designs
        for path in self.files("*.design_config"):
            (feature_type, config) = self.loadConfig(path)
            layer_data = config.pop("layer", None)
            self.config_mgr.addDesignType(feature_type, layer_data, **config)

        # Load settings
        # ENH: Not safe (can overwrite existing settings). Merge values in instead?
        for path in self.files("*.settings"):
            self.db.data_loader.loadSettings(path, update=True, localiser=self.localiser)

        self.db.commit()

    def loadConfig(self, path):
        """
        Load configuration file PATH

        Returns:
          FEATURE_TYPE
          CONFIG"""

        basename = os.path.basename(path)
        feature_type = basename.split(".")[0]

        self.progress(3, "Loading config file:", path)
        config = self.db.data_loader.loadJsonFile(path, localiser=self.localiser)

        return feature_type, config

    def addLayerTo(self, app_name, layer_name):
        """
        Add LAYER_NAME to the layers accessible to APP_NAME (handling errors)

        Does nothing if layer already present"""

        # Check for not found
        if not self.db.config_manager.applicationExists(app_name):
            self.progress(3, "Application not found (skipping):", app_name)
            return

        # Get definition
        app_rec = self.db.config_manager.applicationRec(app_name)
        app_layer_items = app_rec.layer_items()
        app_layer_names = [layer_item["name"] for layer_item in app_layer_items]

        # Check for already present
        if layer_name in app_layer_names:
            self.progress(3, "Layer already present:", app_name, layer_name)
            return

        # Add new layer
        self.progress(1, "Adding layer", layer_name, "to application", app_name)
        app_def = self.db.config_manager.applicationDef(app_name)

        app_def["layers"].append({"name": layer_name})
        self.db.config_manager.updateApplication(app_name, app_def)

    def files(self, name_spec):
        """
        Yields the path names for files matching NAME_SPEC (in sorted order)
        """

        paths = []

        for path in self.os_engine.find_files(self.root_dir, name_spec):
            paths.append(path)

        return sorted(paths)
