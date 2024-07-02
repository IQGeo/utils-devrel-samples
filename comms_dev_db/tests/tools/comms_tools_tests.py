# Command to run command line tool tests

import site, os

# ------------------
#  Init Environment
# ------------------

# Vile hack to get import path right # TODO: Find a better way
# Move up the tree until we get to the WebApps folder, then add that as a path
webapps_dir = os.path.abspath(__file__)
while os.path.basename(webapps_dir) != "WebApps":
    webapps_dir = os.path.dirname(webapps_dir)
site.addsitedir(webapps_dir)

from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)

# Imports
from myworldapp.modules.dev_tools.tests.common.myw_tests_command import MywTestsCommand
from comms_tools_test_suite import CommsToolsTestSuite

MywTestsCommand(CommsToolsTestSuite).execute()
