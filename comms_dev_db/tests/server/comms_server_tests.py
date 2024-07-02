# Command to run Comms Server Tests (REST API service tests)

import os, site

# ------------------
#  Init Environment
# ------------------

webapps_dir = os.path.abspath(__file__)
while os.path.basename(webapps_dir) != "WebApps":
    webapps_dir = os.path.dirname(webapps_dir)
site.addsitedir(webapps_dir)

from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)

# TBR: Workaround for PLAT-8642: Core should configure GeoJSON precision
from myworldapp.core.server.startup.myw_python_mods import configure_geojson_lib
configure_geojson_lib()

from myworldapp.modules.dev_tools.tests.common.myw_tests_command import MywTestsCommand
from comms_server_test_suite import CommsServerTestSuite

MywTestsCommand(CommsServerTestSuite).execute()
