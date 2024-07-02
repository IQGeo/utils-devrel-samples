# Utility to build the Dev DB myWorld database

import site, os, subprocess, re, argparse, sys, tempfile, shutil
from slack import WebClient
from slack.errors import SlackApiError
import ssl
from datetime import datetime
from timeit import Timer
from collections import OrderedDict
from zipfile import *

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

from myworldapp.core.server.base.system.myw_product import MywProduct


class CommsDevDBResultAnalyzer(object):

    html_opening_tags = """ 
        <html>
        <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
        <link rel="stylesheet" href="https://code.getmdl.io/1.3.0/material.indigo-light_blue.min.css">
        <script defer src="https://code.getmdl.io/1.3.0/material.min.js"></script>
        <title>Network Manager Comms Build Status</title>
        </head>
        <body style="margin-left: 10px">
        <div style="margin-left: 20px;">
        <h2>Network Manager Comms Build Status</h2>
        """

    html_closing_tags = """
        </div>
        </body>
        </html>
        """

    def __init__(self, test_summary_log, log_file_name, output_dir):
        """
        Init slots of self
        """
        self.here = os.path.abspath(os.path.join(__file__, ".."))

        self.test_summary_log = test_summary_log
        self.test_summary_log_name = log_file_name
        self.output_dir = "/opt/myworld/nm/comms/build_status"  # output_dir
        self.failed = False
        self.failure_file = os.path.join(self.output_dir, "PREVIOUS_BUILD_HAD_FAILURES.txt")

        # Slack Integration
        # SSL context is workaround for cert errors
        # see https://github.com/slackapi/python-slackclient/issues/334
        slack_ssl_context = ssl.create_default_context()
        slack_ssl_context.check_hostname = False
        slack_ssl_context.verify_mode = ssl.CERT_NONE
        self.slack_token = os.getenv("MYWCOM_SLACK_TOKEN")
        self.slack = WebClient(token=self.slack_token, ssl=slack_ssl_context)
        self.slack_channel = os.getenv("MYWCOM_SLACK_CHANNEL") or ""

    def validate_db_results(self):

        log_file = self.test_summary_log

        is_valid = True

        file = open(log_file, "r")
        for line in file:
            if re.search("(\**)FAILED(\**)", line):
                is_valid = False

        return is_valid

    def publish_results(self):

        self.check_test_results()
        self.write_html_file()
        self.notify_slack()

    def check_test_results(self):

        self.failed_tests = []
        self.error_tests = []
        self.passed_tests = []
        self.versionNumber = ""
        self.elapsedBuildTime = "In Progress"
        file = open(self.test_summary_log, "r", encoding="ISO-8859-1")

        suiteName = ""

        for line in file:
            if line.startswith("suiteName:"):
                suiteName = line.split()[1]
            elif line.startswith("  comms"):
                self.versionNumber = line.split()[1].lstrip("version=")
            elif line.startswith("elapsedTime:"):
                self.elapsedBuildTime = line.split()[1]
            elif re.search("(\**)FAILED(\**)", line):
                line = line.replace("Test", suiteName, 1)
                line = line.rstrip("\n")
                self.failed_tests.append(line)
                self.failed = True
            elif re.search("(\*+)ERROR(\*+)", line):
                line = line.replace("Test", suiteName, 1)
                line = line.rstrip("\n")
                self.error_tests.append(line)
                self.failed = True
            elif line.startswith("Test"):
                line = line.replace("Test", suiteName, 1)
                line = line.rstrip("\n")
                self.passed_tests.append(line)

    def write_html_file(self):

        html_body = ""
        # self.progress(1, 'Writing file...')
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Version
        html_body += """
            <div style="display: block">
            <span class="mdl-typography--title">Version:</span>
        """
        html_body += (
            """<span class="mdl-typography--title">""" + self.versionNumber + """</span></div>"""
        )

        # Build Date
        html_body += """
            <div style="display: block">
            <span class="mdl-typography--title">Build Date:</span>
        """
        html_body += """<span class="mdl-typography--title">""" + now + """</span></div>"""

        # Total Build Time
        html_body += """
            <div style="display: block">
            <span class="mdl-typography--title">Total Build Time:</span>
        """
        html_body += (
            """<span class="mdl-typography--title">""" + self.elapsedBuildTime + """</span></div>"""
        )

        # Build status
        if self.failed:

            self._prepare_log_download()

            # Failures present
            html_body += """
                <div style="display: block; padding-top: 30px; padding-bottom: 5px;">
                    <span class="mdl-chip mdl-color-text--white mdl-color--red" style="vertical-align: middle;">
                        <span class="mdl-chip__text ">FAILED</span>
                    </span>
                    <span> <a href={} download>FAILURE DETAILS</a></span>
                </div>
                <div style="padding-top: 30px">
                    <table class="mdl-data-table mdl-js-data-table mdl-shadow--2dp">
                    <thead>
                        <tr>
                            <th class="mdl-data-table__cell--non-numeric">Suite</th>
                            <th class="mdl-data-table__cell--non-numeric">Browser</th>
                            <th class="mdl-data-table__cell--non-numeric">Test Name</th>
                            <th class="mdl-data-table__cell--non-numeric">Test Status</th>
                        </tr>
                    </thead>
                    <tbody>""".format(
                self.test_summary_log_name
            )

        else:
            # All passing
            html_body += """
                <div style="display: block; padding-top: 30px" padding-bottom: 5px;>
                    <span class="mdl-chip mdl-color-text--white mdl-color--green" style="vertical-align: middle;">
                        <span class="mdl-chip__text ">PASSED</span>
                    </span>
                </div>
                <div style="padding-top: 30px">
                    <table class="mdl-data-table mdl-js-data-table mdl-shadow--2dp">
                    <thead>
                        <tr>
                            <th class="mdl-data-table__cell--non-numeric">Suite</th>
                            <th class="mdl-data-table__cell--non-numeric">Browser</th>
                            <th class="mdl-data-table__cell--non-numeric">Test Name</th>
                            <th class="mdl-data-table__cell--non-numeric">Test Status</th>
                        </tr>
                    </thead>
                    <tbody>"""

        for failure in self.failed_tests:

            failure = failure.split()

            html_body += """<tr class="mdl-color--red mdl-color-text--white">"""
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + failure[0] + """</td>"""
            )
            if len(failure) == 4:
                html_body += (
                    """<td class="mdl-data-table__cell--non-numeric" >""" + failure[3] + """</td>"""
                )
            else:
                html_body += """<td class="mdl-data-table__cell--non-numeric" ></td>"""
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + failure[1] + """</td>"""
            )
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + failure[2] + """</td>"""
            )
            html_body += "</tr>"

        for error in self.error_tests:
            error = error.split()
            html_body += """<tr class="mdl-color--yellow mdl-color-text--white">"""
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + "suite" + """</td>"""
            )
            if len(error) == 4:
                html_body += (
                    """<td class="mdl-data-table__cell--non-numeric" >""" + error[3] + """</td>"""
                )
            else:
                html_body += """<td class="mdl-data-table__cell--non-numeric" ></td>"""
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + error[0] + """</td>"""
            )
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + error[1] + """</td>"""
            )
            html_body += "</tr>"

        for passed in self.passed_tests:
            passed = passed.split()
            html_body += """<tr class="mdl-color--green mdl-color-text--white">"""
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + passed[0] + """</td>"""
            )
            if len(passed) == 4:
                html_body += (
                    """<td class="mdl-data-table__cell--non-numeric" >""" + passed[3] + """</td>"""
                )
            else:
                html_body += """<td class="mdl-data-table__cell--non-numeric" ></td>"""
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + passed[1] + """</td>"""
            )
            html_body += (
                """<td class="mdl-data-table__cell--non-numeric" >""" + passed[2] + """</td>"""
            )
            html_body += "</tr>"

        html_body += """
                </tbody>
            </table>
        </div>
        """

        html_file = os.path.join(self.output_dir, "index.html")
        html = self.html_opening_tags + html_body + self.html_closing_tags

        file = open(html_file, "w")

        file.write(html)

        file.close()

    def notify_slack(self):

        previous_failure = self._previous_failure_exists()

        if self.failed:
            self._send_failure_message()
            self._remove_failure_file()
            self._write_failure_file()
        elif previous_failure:
            self._send_now_passing_message()
            self._remove_failure_file()
        elif self.failed == False:
            self._send_passing_message()
            self._remove_failure_file()

    def _send_failure_message(self):

        message_text = (
            "There were some issues with the latest build! :cry: :cry: :cry:\n\n"
            + "\n".join(self.failed_tests + self.error_tests)
            + "\n To view all test results visit: https://appsdev.us.iqgeo.com/nm/comms/build_status/"
        )

        self._send_slack_message(message_text)

    def _send_now_passing_message(self):

        message_text = (
            "All tests in the latest build are once again passing! :smiley: :smiley: :smiley:\n\n"
            + "\n To view all test results visit: https://appsdev.us.iqgeo.com/nm/comms/build_status/"
        )

        self._send_slack_message(message_text)

    def _send_passing_message(self):

        message_text = (
            "All tests in the latest build are passing! :smiley: :smiley: :smiley:\n\n"
            + "\n To view all test results visit: https://appsdev.us.iqgeo.com/nm/comms/build_status/"
        )

        self._send_slack_message(message_text)

    def _send_slack_message(self, message_text):

        # from slack api docs
        try:
            response = self.slack.chat_postMessage(channel=self.slack_channel, text=message_text)
        except SlackApiError as e:
            # You will get a SlackApiError if "ok" is False
            assert e.response["ok"] is False
            assert e.response["error"]  # str like 'invalid_auth', 'channel_not_found'
            print(f"Got an error: {e.response['error']}")

    def _previous_failure_exists(self):

        failure_exist = os.path.exists(self.failure_file)
        return failure_exist

    def _write_failure_file(self):

        file = open(self.failure_file, "w")
        file_contents = "COMMS NIGHTLY TEST FAILED " + datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        file.write(file_contents)
        file.close()

    def _remove_failure_file(self):

        file_path = self.failure_file

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                print("Error while deleting failure notify file ", file_path)

    def _prepare_log_download(self):

        # remove old log
        self._remove_old_log()
        # copy over new log
        sumnmary_for_download = os.path.join(self.output_dir, self.test_summary_log_name)
        shutil.copyfile(self.test_summary_log, sumnmary_for_download)

    def _remove_old_log(self):

        files = os.listdir(self.output_dir)

        for item in files:
            if item.endswith(".log"):
                os.remove(os.path.join(self.output_dir, item))
