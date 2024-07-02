# Command to run command line tool tests

import os, site, sys

if os.getenv("MYWAPP_HOME", None) is None or os.getenv("MYW_ATOM_DATA_ROOT", None) is None:
    print(
        """Error: Some required environment variables have not been set. Ensure the following two have been set:
    - MYWAPP_HOME - The directory of the native app. Must contain '{}'
    - MYW_ATOM_DATA_ROOT - The directory where the native app stores it's data, usually contains 'databases' and 'extracts' folders""".format(
            os.path.join("Electron", "NodeServer", "NodeServer.js")
        )
    )
    sys.exit()

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


# ----------------
# Imports
# ----------------
from myworldapp.modules.dev_tools.tests.common.myw_tests_command import MywTestsCommand


class MywNativeJsTestsCommand(MywTestsCommand):
    def setupSuite(self, cli_args):
        return self.SuiteClass(
            cli_args,
            js_script="js_tests_native.js",
            tmp_sub_folder=cli_args.module + "_tests_native",
        )


from myworldapp.modules.dev_tools.tests.js_test_suite import JSTestSuite
from comms_js_api_test_suite import CommsJSApiTestSuite


# ------------------
#  Run Tests
# ------------------

MywNativeJsTestsCommand(CommsJSApiTestSuite).execute()
