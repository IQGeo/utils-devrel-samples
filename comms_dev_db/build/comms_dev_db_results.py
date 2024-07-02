import site, os, sys, codecs, io
import argparse, shutil, datetime
import ssl
from slack import WebClient
from slack.errors import SlackApiError

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

from myworldapp.modules.dev_tools.server.test_framework.myw_test_result_db import MywTestResultDB
from comms_dev_db_build_util import CommsDevDbBuildUtil


class CommsDevDbResults(CommsDevDbBuildUtil):
    """
    Utility to manage test results
    """

    # Define signature
    cli_arg_def = argparse.ArgumentParser()
    cli_arg_def.add_argument("--step", type=str, default="", help="Operation to perform")
    cli_arg_def.add_argument(
        "--trace", type=int, default=3, help="Amount of progress tracing to output"
    )
    cli_arg_def.add_argument("--results_db", type=str, default="results.db", help="Database to use")

    steps = OrderedDict()
    steps["clear_output"] = "clear_output"
    steps["import_results"] = "Import Test Results"
    steps["output_summary"] = "Output summary"
    steps["update_slack"] = "Updating Slack"
    steps["no_op"] = "Dummy Step for debugging purposes"

    def __init__(self, trace, results_db, suppress_timings=False):
        """ """
        super().__init__(trace, "myw_comms_dev", suppress_timings=suppress_timings)

        self.results_db = os.path.join(os.environ["MYW_COMMS_BUILD"], "logs", results_db)

    def clear_output(self):
        """
        Empty the build output directory
        """

        self.os_engine.ensure_exists(self.output_dir)
        self.os_engine.remove_matching(os.path.join(self.output_dir, "*"))

    def import_results(self):
        """
        Import test results into the database
        """

        log_dir = os.environ["MYW_BUILD_LOG_DIR"]

        self.progress(1, "Importing results from:", log_dir)
        self.progress(1, "Database:", self.results_db)

        for root, dirs, files in os.walk(log_dir):
            for file in files:
                bits = file.split(".")
                if bits[-1] == "log":
                    log_file = os.path.join(root, file)
                    with self.progress.operation("Importing results from", log_file):
                        self._run("test_results", self.results_db, "import", log_file)

    def output_summary(self):
        """
        Write output to summary log file
        """

        self.progress(1, "Building summary from:", self.results_db)

        out_file = os.path.join(os.environ["MYW_BUILD_LOG_DIR"], "summary.txt")

        self.progress(1, "Creating:", out_file)

        with io.open(out_file, "w") as f:
            self._run(
                os.path.join(self.here, "summarise_test_results"),
                self.results_db,
                os.environ["MYW_BUILD_ID"],
                stream=f,
            )

    def update_slack(self):
        """
        Show test failures on the slack channel
        """
        # TODO: Duplicates logic with build_summary

        host = "den1appsdev05"  # ENH: Get from OS
        job_name = os.getenv("JOB_BASE_NAME")
        build_id = os.getenv("MYW_BUILD_ID")
        build_no = os.getenv("BUILD_ID")

        # Build list of test results, grouped by full name
        db = MywTestResultDB(self.results_db, "r")
        test_infos = {}
        for suite in [
            "validation",
            "tools",
            "engine",
            "server",
            "js_api",
            "client",
            "comsof_client",
            "comsof_engine",
            "comsof_server"
        ]:  # TODO: Share with build summary etc
            test_infos.update(self.results_for(db, build_id, suite))

        # Get stats and failed tests
        failed_test_infos = {}
        n_tests = 0
        n_failed = 0
        for full_name, info in test_infos.items():

            for platform, result in info.items():
                n_tests += 1
                if result != "PASSED":
                    failed_test_infos[full_name] = info
                    n_failed += 1

        # Build links to results dir
        job_url = "http://{}:8080/job/{}/{}/console".format(host, job_name, build_no)
        logs_url = "http://{}/build/comms/logs/{}".format(host, build_id)
        summary_url = "{}/{}".format(logs_url, "summary.txt")

        # Build message(in Slack MarkDown format)
        msg = "{} *<{}|{}>*: {} <{}|tests>, {} <{}|failed>".format(
            job_name, job_url, build_id, n_tests, summary_url, n_failed, logs_url
        )
        for (full_name, info) in failed_test_infos.items():

            # Add test ident
            (suite, test) = full_name.split(".")
            n_just = int((60 - len(test)) * 1.15)  # HACK to roughly align results columns
            msg += "\n      {}\t{}".format(suite, test.ljust(n_just))

            # For each possible platform, in summary order ..
            for platform in ["windows", "linux", "native", "chrome"]:
                if platform in info:
                    result = info[platform]

                    # Build url of log file
                    suite_dir = "dev_db_build" if suite == "validation" else "tests"
                    suite_url = "{}/{}/{}.{}.log".format(logs_url, suite_dir, suite, platform)

                    # Add result to message
                    msg += "\t<{}|{}>".format(suite_url, result)

        # Display it
        self.open_slack_channel()
        self.show_slack_message(msg)

    def results_for(self, db, build_id, suite):
        """
        Get test results for BUILD_ID, grouped by test name

        Returns list of lists or results, keyed by full test name"""

        test_infos = {}
        
        for res in db.resultsMatching(build_id, suite):
            suite = res["suite"]
            test = res["test"].lower()
            platform = res["opts"]
            result = res["result"]

            if suite == 'client' or suite == 'comsof_client' and platform == '':
                platform = 'chrome'

            if platform.endswith("_log"):
                platform = platform[:-4]  # HACK until import fixed

            full_name = "{}.{}".format(suite, test.lower())

            info = test_infos.get(full_name)
            if not info:
                info = test_infos[full_name] = {}

            info[platform] = result
       
        return test_infos

    def open_slack_channel(self):
        """
        Open nthe slack channel
        """
        # ENH: Create a slack stream class

        self.slack_token = os.getenv("MYW_COMMS_SLACK_TOKEN")
        self.slack_channel = os.getenv("MYW_COMMS_SLACK_CHANNEL") or ""

        self.progress(4, "Token  :", self.slack_token)
        self.progress(4, "Channel:", self.slack_channel)

        # Create SSL context (workaround for certificate errors)
        # See https://github.com/slackapi/python-slackclient/issues/334
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE

        # Open channel
        self.slack = WebClient(token=self.slack_token, ssl=ssl_context)

    def show_slack_message(self, message, channel=None):
        """
        Show MESSAGE on the slack channel
        """
        # ENH: Create a slack stream class

        if not channel:
            channel = self.slack_channel

        self.progress(1, "Showing message on slack channel:", channel)
        self.progress(5, message)

        try:
            self.slack.chat_postMessage(channel=channel, text=message)
        except SlackApiError as e:
            self.progress("error", "Post to slack failed:", e.response.get("error"))

    def no_op(self):
        """Dummy step for debugging/skipping"""
        pass


if __name__ == "__main__":
    cli_args = CommsDevDbResults.cli_arg_def.parse_args()
    b = CommsDevDbResults(cli_args.trace, cli_args.results_db)
    b.run(cli_args.step)
