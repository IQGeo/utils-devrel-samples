import site, os, sys, codecs, glob, shutil
import argparse
from collections import OrderedDict

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

from comms_dev_db_build_util import CommsDevDbBuildUtil


class CommsDevDbTestRunner(CommsDevDbBuildUtil):
    """
    Command line util to run tests
    """

    # Define signature
    cli_arg_def = argparse.ArgumentParser()
    cli_arg_def.add_argument("--step", type=str, default="", help="Operation to perform")
    cli_arg_def.add_argument(
        "--trace", type=int, default=3, help="Controls amount of progress tracing output"
    )
    cli_arg_def.add_argument(
        "--browsers",
        type=str,
        default="chrome",
        help="Browsers to run GUI tests on (a comma-separated list)",
    )
    cli_arg_def.add_argument(
        "--db_type", type=str, default="postgres", help="The database type to use"
    )

    steps = {}
    steps["tools_tests"] = "Running Tools Tests"
    steps["engine_tests"] = "Running Engine Tests"
    steps["server_tests"] = "Running Server Tests"
    steps["js_api_tests"] = "Running JS API Tests"
    steps["gui_tests"] = "Running GUI Tests"
    steps["native_tests"] = "Running Native Tests"
    steps["comsof_client_tests"] = "Running Comsof GUI Tests"
    steps["comsof_engine_tests"] = "Running Comsof Engine Tests"
    steps["comsof_server_tests"] = "Running Comsof Server Tests"
    steps["no_op"] = "Dummy Step for debugging purposes"

    def __init__(self, trace, browsers, db_type, suppress_timings=False):
        """
        Constructor
        """
        db_name = "iqg_comms_dev"
        super().__init__(
            trace, db_name, suppress_timings=suppress_timings, db_type=db_type, suite_name="tests"
        )
        self.browsers = browsers.split(",")

        self.tests_root = os.path.join(
            os.environ["MYW_HOME"], "WebApps", "myworldapp", "modules", "comms_dev_db", "tests"
        )
        self.print_banner("Run Dev DB Tests")

    def tools_tests(self):
        """
        Run the tools test suite
        """

        cmd = os.path.join(self.tests_root, "tools", "comms_tools_tests")
        self._run_test_suite("tools", self.platform, cmd)

    def engine_tests(self):
        """
        Run the engine test suite
        """

        cmd = os.path.join(self.tests_root, "server", "comms_engine_tests")
        self._run_test_suite("engine", self.platform, cmd)

    def server_tests(self):
        """
        Run the server test suite
        """

        cmd = os.path.join(self.tests_root, "server", "comms_server_tests")
        self._run_test_suite("server", self.platform, cmd)

        # Remove temporary server data from previous runs
        # These can cause run to fail with permission problems (? clash between Apache use and Paste)
        self.os_engine.remove_matching(
            os.path.join(os.environ["MYW_HOME"], "WebApps", "data", "templates", "*.html.py")
        )

    def js_api_tests(self):
        """
        Run the js_api test suite
        """

        cmd = os.path.join(self.tests_root, "js", "comms_js_api_tests")
        self._run_test_suite("js_api", self.platform, cmd)

    def gui_tests(self):
        """
        Run the client and config tests
        """
        cmd = os.path.join(self.tests_root, "client", "comms_client_tests")

        self._run_test_suite(
            "client", "chrome", cmd, "--delay=1.2"
        )

    def native_tests(self):
        """
        Build extract and run native tests
        """

        # Initialise database, create extract
        self._run("build_extract", os.environ['MYW_BUILD_ID'])  # ENH: Use full path

        # Run tests
        cmd = os.path.join(self.tests_root, "js", "comms_js_api_tests_native")
        self._run_test_suite("js_api", "native", cmd)

    def comsof_client_tests(self):
        """
        Run the client and config tests
        """
        cmd = os.path.join(self.tests_root, "comsof","client", "comsof_client_tests")

        self._run_test_suite(
            "comsof_client", "chrome", cmd, "--delay=1.2"
        )
    
    
    def comsof_engine_tests(self):
        """
        Run the server test suite
        """

        cmd = os.path.join(self.tests_root, "comsof","engine", "comsof_engine_tests")
        self._run_test_suite("comsof_engine", self.platform, cmd)
    
    def comsof_server_tests(self):
        """
        Run the server test suite
        """

        cmd = os.path.join(self.tests_root, "comsof","server", "comsof_server_tests")
        self._run_test_suite("comsof_server", self.platform, cmd)

    def _clear_browser_tmp_dirs(self):
        """
        Remove all the temporary browser profile directories
        """
        for path in glob.glob(os.path.join(os.environ["TEMP"], "tmp*")):
            if os.path.isdir(path):
                shutil.rmtree(path)

    def no_op(self):
        """
        Deliberately blank step for testing purposes.
        """
        pass


if __name__ == "__main__":
    cli_args = CommsDevDbTestRunner.cli_arg_def.parse_args()
    b = CommsDevDbTestRunner(cli_args.trace, cli_args.browsers, cli_args.db_type)
    b.run(cli_args.step)
