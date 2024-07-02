# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import os
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.modules.comms.server.base.system_utils import ProductUtils


class FeaturePackage:
    """
    Abstract superclass for feature packages

    FeaturePackages provides a format-independent API for accessing feature data from an external source

    Subclasses must implement
       .featureTypes(name_spec='*')    Lists feature types in package
       .featureDesc(ft)                Get field descriptor for FT
       .features(ft)                   Yield records for FT
    """

    # ------------------------------------------------------------------------------
    #                                REGISTRATION
    # ------------------------------------------------------------------------------

    # Registered feature package types (a list of classes, keyed by file extension)
    _feature_packages = {}
    file_package_classes = {}
    product = MywProduct()  # Used for finding engine classes

    @classmethod
    def _find_file_package_class(cls, name, progress=MywProgressHandler()):
        """
        Returns file package class for name (if there is one)

        Imports class dynamically, scanning core and modules. Looks for a file:
            <module>/server/data_import/<NAME>.py

        containing a class name based on the NAME, with underscored replaced
        by capitalisation (as per controllers)."""

        # ENH: Share code with controller loading?

        progress(9, "Finding file package class for", name)

        # Check for already loaded
        if name in cls.file_package_classes:
            return cls.file_package_classes.get(name)

        # Construct expected name of class
        module_words = name.replace("-", "_").split("_")
        class_name = "".join(w.title() for w in module_words)

        # For each module (including core) ..
        for module in cls.product.modules():

            # Check if file exists
            file_path = module.file("server", "data_import", name + ".py")
            progress(9, "Trying", file_path)
            if not os.path.exists(file_path):
                continue

            # Load it .. and extract class
            progress(8, "Loading engine class from", file_path)
            python_path = module.python_path("server", "data_import", name)
            python_module = __import__(python_path, globals(), locals(), fromlist=("myworldapp"))
            file_package_class = cls.file_package_classes[name] = getattr(python_module, class_name)

            return file_package_class

        # Case: Not found
        return None

    @classmethod
    def newFor(self, file_type_config, data_path, *args, **kwargs):
        """
        Returns instance of feature package for DATA_PATH
        """

        base_name = os.path.basename(data_path)
        type = base_name.split(".")[-1]
        package_class = None

        if type in file_type_config:
            package_class = self._find_file_package_class(file_type_config[type])

        if not package_class:
            from .file_feature_package import FileFeaturePackage

            return FileFeaturePackage(data_path, *args, **kwargs)

        return package_class(data_path, *args, **kwargs)

    @property
    def root(self):
        """
        The base feature package in the processing chain
        """
        # Overridden in MappedFeaturePackage

        return self

    @property
    def coord_sys(self):
        """
        Coordinate system in which self's data is yielded (if known)

        Returns a MywCoordSys (or None)"""

        # ENH: Just return name?

        coord_sys_name = self.metadata.get("coord_system")

        if not coord_sys_name:
            return None

        return MywCoordSystem(coord_sys_name)

    def featureCount(self, feature_type):
        """
        The number of records of FEATURE_TYPE in self
        """
        # Backstop implementation just counts them (slow)

        n_recs = 0
        for feature in self.features(feature_type):
            n_recs += 1

        return n_recs
