# Command to run server tests

import site, os

# ------------------
#  Init Environment
# ------------------

# Add the product root dir to the module search path
product_root_dir = os.getenv("MYW_PRODUCT_ROOT_DIR")
if product_root_dir:
    site.addsitedir(product_root_dir)

# Add myWorld modules to module search path and ensure they have priority over default python paths
from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)

from myworldapp.modules.dev_tools.tests.common.myw_tests_command import MywTestsCommand
from comms_client_test_suite import CommsClientTestSuite

MywTestsCommand(CommsClientTestSuite).execute()
