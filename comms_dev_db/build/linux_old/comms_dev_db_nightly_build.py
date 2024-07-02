import site, os, sys, re
import argparse, shutil, glob
from datetime import datetime, timedelta
import io, json
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

from myworldapp.modules.comms_dev_db.utils.myw_batch_utility import MywBatchUtility
from myworldapp.modules.comms_dev_db.utils.comms_dev_db_result_analyzer import (
    CommsDevDBResultAnalyzer,
)

# ENH: subclass CommsDevDbBuildUtil?

"""
  Utility for running the Comms nightly build and test suite.
  It can utilize the following ENV VARS (with example values)

  MYW_HOME=/opt/myworld/nm/comms/latest_nightly -- Root directory of myWorld

  MYW_COMMS_BUILD=/opt/myworld_data/mywlogs/comms -- Output directory for logs and archived db
  MYW_COMMS_DEV_DB_HOME=${MYW_HOME}/WebApps/myworldapp/modules/comms_dev_db/ -- comms_dev_db module directory
  MYW_COMMS_HOME=${MYW_HOME}/WebApps/myworldapp/modules/comms -- comms module directory
  MYW_BUILD_LOG_DIR=/opt/myworld_data/mywlogs/comms --Output directory for logs and archived db TODO: same as MYW_COMMS_BUILD?
  MYW_COMMS_BUILD_INI_FILE=${MYW_HOME}/WebApps/myworldapp.ini -- Location of .ini file
  MYW_COMMS_REMOTE_URL='http://10.1.10.5:4444/wd/hub' -- Url to remote selenium server for client tests
  MYW_COMMS_BASE_URL='http://10.1.10.11/6x/nm/comms/latest_nightly' -- Url to base myWorld enviroment for client tests
  MYWCOM_SLACK_TOKEN=xoxb-286252318547-578695538129-WQ0tQrYp18gwgO1nneeeVuBK -- Token for using the slack api
  MYW_COMMS_DEV_DB_SYNC_DIR=/opt/myworld_data/offline/comms_latest_nightly -- Location of extract sync directory
  MYWCOM_SLACK_CHANNEL='slack_api_dev' -- Slack channel name in which to send notifications
  PATH=${MYW_HOME}/Tools:${MYW_COMMS_DEV_DB_HOME}/utils:${PATH} -- Path to include tools and utils dir

  These can be set in the <MYW_HOME>/Tools/myw_env_site file:"""


class LoggedStream:
    """
    Helper to 'tee' console output to second stream
    """

    def __init__(self, stream1, stream2):
        self.stream1 = stream1
        self.stream2 = stream2

    def write(self, a_str):
        self.stream1.write(a_str)
        self.stream2.write(a_str)

    def flush(self):
        self.stream1.flush()
        self.stream2.flush()


class CommsDevDbNightlyBuild(MywBatchUtility):

    steps = OrderedDict()
    steps["get_version"] = "Getting Version to be built"
    steps["update_src"] = "Update Source"
    steps["install_dependency_patches"] = "Ensure patches are installed for dependencies"
    steps["reset_test_results"] = "Resetting test results"
    steps["build_db"] = "Building database"
    steps["validate_db"] = "Validating database"
    steps["find_db_validation_failures"] = "Finding Database validation errors"
    steps["archive_db"] = "Archiving database"
    steps["run_server_tests"] = "Running engine and server tests"
    steps["restart_apache"] = "Restart Apache"
    steps["build_javascript"] = "Build JavaScript"
    steps["increment_cache_bust"] = "Incrementing cache bust"
    steps["run_js_api_tests"] = "Running JS Api tests"
    steps["run_client_tests"] = "Running client tests"
    steps["publish_results"] = "Publishing test results"

    def __init__(
        self, db_name, tilestore, log_output, trace, suppress_timings=False, client_delay=1
    ):
        """
        Init slots of self
        """

        # Init super
        super().__init__(trace, suppress_timings)

        self.use_shell = os.name == "nt"
        self.home = os.getenv("MYW_COMMS_HOME")
        self.dev_db_home = os.getenv("MYW_COMMS_DEV_DB_HOME")
        self.log_dir = os.getenv("MYW_BUILD_LOG_DIR") or log_output
        self.db_name = db_name
        self.platform = "windows" if os.name == "nt" else "linux"
        self.trace = trace
        self.db_validated = True
        self.diff_tool = "csdiff" if os.name == "nt" else "diff"
        self.start_time = datetime.now()
        self.client_delay = client_delay

        # Set paths to various places
        self.here = os.path.abspath(os.path.join(__file__, ".."))
        self.build_dir = os.path.abspath(os.path.join(self.here, "..", "build"))

        timestamp = self._get_timestamp()

        if self.log_dir:

            self.os_engine.ensure_exists(self.log_dir)
            self.test_result_dir = os.path.join(log_output, "summary")
            self.os_engine.ensure_exists(self.test_result_dir)

            self.log_file = os.path.join(self.log_dir, self.db_name + "-" + timestamp + ".log")

            summary_log_name = self.db_name + "_TEST_RESULT_SUMMARY-" + timestamp + ".log"
            self.test_summary_log = os.path.join(self.test_result_dir, summary_log_name)

            self.log_stream = io.open(self.log_file, mode="w", newline="\n", encoding="ISO-8859-1")
            sys.stdout = LoggedStream(sys.stdout, self.log_stream)
            sys.stderr = LoggedStream(sys.stderr, self.log_stream)

            self.result_analyzer = CommsDevDBResultAnalyzer(
                self.test_summary_log, summary_log_name, self.log_dir
            )

    def get_version(self):

        self.start_time = datetime.now()
        self.progress(1, "Getting Version.....")

        with io.open(self.test_summary_log, "a") as f:
            self._run("myw_product", "list", "versions", "comms", "--layout", "keys", stream=f)

    def update_src(self):
        """
        pull latest code from git
        """

        self.progress(1, "Getting latest source...")

        source_info = self._get_source_info()

        for repo in source_info:
            self._update_src_for(repo)

    def install_dependency_patches(self):
        """
        Cheeck for core patches and install them
        """

        core_patches_dir = os.path.join(self.dev_db_home, "patches", "core")

        patches_dirs = [core_patches_dir]

        if os.path.exists(core_patches_dir):

            for dir in patches_dirs:
                files = os.listdir(dir)

                # run twice to ensure all patches install
                self._run_patch_install_for(files, dir)
                self._run_patch_install_for(files, dir)

    def _run_patch_install_for(self, files, dir):
        """
        Run myw_product install command
        """

        for file in files:
            ext = os.path.splitext(file)
            # if its a myWorld patch file, install it
            if ext[1] == ".mpf":
                patch = os.path.join(dir, file)
                self._run("myw_product", "install", patch)

    def reset_test_results(self):
        """
        reset test results
        """

        validation_tests_dir = self.here
        server_tests_dir = os.path.join(self.here, "..", "tests", "server")
        js_api_tests_dir = os.path.join(self.here, "..", "tests", "js")
        client_tests_dir = os.path.join(self.here, "..", "tests", "client")

        tests = {
            "comms_validation_tests": validation_tests_dir,
            "comms_server_tests": server_tests_dir,
            "comms_engine_tests": server_tests_dir,
            "comms_js_api_tests": js_api_tests_dir,
            "comms_client_tests": client_tests_dir,
        }

        for cmd, directory in tests.items():
            self.progress(1, "Resetting results for " + cmd)
            cmd = os.path.join(directory, cmd)
            self._run(cmd, "reset")

    def build_db(self):
        """
        Build the dev_Db using comms_build_dev_db command
        """

        self.progress(1, "Build db...")
        build_cmd = os.path.join(self.here, "comms_build_dev_db")
        self._run(build_cmd, "--database", self.db_name, "--skip", "run_tests")

    def validate_db(self):
        """
        Run dev_db validation tests, summarize results
        """

        self.progress(1, "Validate db...")
        validate_cmd = os.path.join(self.here, "comms_validation_tests")

        # run validation test suite
        self._run(validate_cmd, "run", "--database", self.db_name)

        self._summarize_results(validate_cmd, "DB", None, "checking validation_tests...")

    def find_db_validation_failures(self):
        """
        Report if dev_db build was valid
        """

        self.db_validated = self.result_analyzer.validate_db_results()
        self.progress(1, "DB validated? " + str(self.db_validated))

    def archive_db(self):
        """
        Archive dev_db if valid
        """

        # No longer required?
        pass

        # if not self.db_validated:
        #     self.progress(1, 'dev db build is not valid, not archiving')
        #     return

        # cmd = os.path.join(self.build_dir, 'comms_dev_db_builder')
        # self._run(cmd, '--database', self.db_name, '--step', 'archive_database')

    def run_server_tests(self):
        """
        run comms_server_tests and comms_engine_tests, summarize results
        """

        server_tests_dir = os.path.join(self.here, "..", "tests", "server")

        engine_test_cmd = os.path.join(server_tests_dir, "comms_engine_tests")
        # run comms engine test suite
        self._run(engine_test_cmd, "run", "--database", self.db_name)
        self._summarize_results(engine_test_cmd, "Engine", None, "checking engine tests...")

        server_test_cmd = os.path.join(server_tests_dir, "comms_server_tests")
        # run comms server test suite
        self._run(server_test_cmd, "run", "--database", self.db_name)
        self._summarize_results(server_test_cmd, "Server", None, "checking server tests...")

    def restart_apache(self):
        """
        Restart Apache
        """

        if self.platform == "windows":
            cmd = os.path.join(self.build_dir, "restart_apache")
            self._run(cmd)
        else:
            cmd = os.path.join(self.here, "restart_apache")
            self._run(cmd)

    def build_javascript(self):
        """
        Fetch node dependencies, build javascript code
        """

        """clear node modules"""
        self.progress(1, "Clearing node_modules...")
        comms_node_modules_dir = os.path.join(self.home, "node_modules")
        if os.path.exists(comms_node_modules_dir):
            shutil.rmtree(comms_node_modules_dir)

        """build node_modules"""
        self.progress(1, "Getting node modules...")
        self._run("myw_product", "fetch", "node_modules")

        self.progress(1, "Building Comms JavaScript...")
        self._run("myw_product", "build", "all")

    def increment_cache_bust(self):
        """
        Increment custom module version_info to bust any cache
        """

        version_info_file = os.path.join(self.home, "..", "custom", "version_info.json")

        with open(version_info_file, "r") as version_info:
            data = json.load(version_info)

        current_version = int(data["custom"])
        data["custom"] = str(current_version + 1)

        with open(version_info_file, "w") as version_info:
            json.dump(data, version_info)

    def run_js_api_tests(self):
        """
        Run comms_js_api_tests, summarize results
        """

        js_api_tests_dir = os.path.join(self.here, "..", "tests", "js")

        self._run("myw_product", "build", "applications_dev")

        self.progress(1, "running js api tests")
        js_api_test_cmd = os.path.join(js_api_tests_dir, "comms_js_api_tests")
        # run comms js api test suite
        self._run(js_api_test_cmd, "run")
        self._summarize_results(js_api_test_cmd, "JS API", None, "checking js api tests...")

    def run_client_tests(self):
        """
        Run comms_client_tests, summarize results
        """

        client_tests_dir = os.path.join(self.here, "..", "tests", "client")

        client_test_cmd = os.path.join(client_tests_dir, "comms_client_tests")
        # run comms cliet test suite
        self._run(
            client_test_cmd, "run", "--database", self.db_name, "--delay", str(self.client_delay)
        )
        self._summarize_results(client_test_cmd, "Client", "Chrome", "checking client tests...")

    def publish_results(self):
        """
        Publish results to slack, webpage
        """
        self._get_elapsed_time()
        self.result_analyzer.publish_results()

    def _update_src_for(self, repo_info):
        """
        Get latest code for modules
        """

        self.progress(1, "Getting latest source for " + repo_info["name"])
        branch = repo_info["branch"] or self.git_branch or "master"
        """execute from the correct module dir"""
        env = {}
        env["CWD"] = repo_info["cwd"]
        self._run("git", "reset", "HEAD", "--hard", env=env)
        self._run("git", "clean", "-fd", env=env)
        self._run("git", "pull", "origin", branch, env=env)

    def _get_source_info(self):
        """
        Get git repo details for each modules
        """

        source_info = []

        comms_repo = {"name": "comms", "branch": "master", "cwd": self.home}
        source_info.append(comms_repo)

        comms_dev_db_repo = {"name": "comms_dev_db", "branch": "master", "cwd": self.dev_db_home}
        source_info.append(comms_dev_db_repo)

        return source_info

    def _get_elapsed_time(self):
        """
        Get elapsed time
        """

        end_time = datetime.now()
        total_time = end_time - self.start_time
        elapsed_time = timedelta(seconds=total_time.total_seconds())
        formatted_elapsed_time = str(elapsed_time).split(".")[0]

        self.progress(1, "Total Elapsed Time: " + formatted_elapsed_time)
        with open(self.test_summary_log, "a") as myfile:
            myfile.write("elapsedTime: " + formatted_elapsed_time)

    def _get_timestamp(self):
        """
        Get a timestamp, format it"""
        # 3
        now = datetime.now()
        timestamp = now.strftime("%Y-%m-%d-%H-%M")

        return timestamp

    def _summarize_results(self, cmd, suite, browser, message):
        """
        Summarize all results, grouped by test suite name
        """

        log = open(self.test_summary_log, "a")
        log.write("suiteName: " + suite + "\n")
        if browser:
            log.write("browser: " + browser + "\n")
        log.close()

        with io.open(self.test_summary_log, "a") as f:
            self.progress(1, message)
            if suite == "JS API":
                self._run(cmd, "check", "*", self.diff_tool, stream=f)
            else:
                self._run(cmd, "check", "*", self.diff_tool, "--database", self.db_name, stream=f)


if __name__ == "__main__":
    """
    MAIN
    """
    # Define signature
    cli_arg_def = argparse.ArgumentParser()
    cli_arg_def.add_argument("--step", type=str, default="", help="Step(s) in process to perform")
    cli_arg_def.add_argument(
        "--database", type=str, help="Name of database to create (default: MYW_COMMS_DEV_DB)"
    )
    cli_arg_def.add_argument("--tilestore", type=str, default=None, help="Name of tilestore to use")
    cli_arg_def.add_argument(
        "--log_output", type=str, default="/tmp/logs", help="Output directory for log"
    )
    cli_arg_def.add_argument(
        "--trace", type=int, default=3, help="Controls amount of progress tracing output"
    )
    cli_arg_def.add_argument(
        "--delay",
        type=float,
        default=1,
        help="Delay between input operations (sec) for client tests",
    )

    # Parse args
    cli_args = cli_arg_def.parse_args()

    # Deal with defaults
    database = cli_args.database or os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"

    # Run build
    b = CommsDevDbNightlyBuild(
        database,
        cli_args.tilestore,
        cli_args.log_output,
        cli_args.trace,
        client_delay=cli_args.delay,
    )
    b.run(cli_args.step)
