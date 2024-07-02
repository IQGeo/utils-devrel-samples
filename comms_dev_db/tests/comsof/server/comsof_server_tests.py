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


from myworldapp.modules.dev_tools.tests.common.myw_tests_command import MywTestsCommand
from comsof_server_test_suite import ComsofServerTestSuite

MywTestsCommand(ComsofServerTestSuite).execute()
