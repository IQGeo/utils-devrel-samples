# Helpers extending core.base.system
from myworldapp.core.server.base.system.myw_product import MywProduct
import os, importlib


class ProductUtils:
    """
    Singleton providing geometry helpers
    """

    # ENH: Replace these by methods on MywLineString

    @classmethod
    def importAll(self, *rel_path):
        """
        Import python module REL_PATH from all modules that have one

        Used for dynamic loading of custom engines etc"""

        prod = MywProduct()

        for module in prod.modules():
            path = module.file(*rel_path)
            if not os.path.exists(path):
                continue

            python_module = module.python_path(*rel_path)  # ENH: Handle errors
            importlib.__import__(python_module)
