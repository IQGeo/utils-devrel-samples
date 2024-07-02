# Copyright: IQGeo Limited 2010-2023

import os, re, tempfile
from myworldapp.modules.dev_tools.server.test_framework.myw_test_suite import MywTestSuite
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.modules.dev_tools.tests.js_test_suite import JSTestSuite


class CommsJSApiTestSuite(JSTestSuite):

    default_database = os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"

    def __init__(self, cli_args, js_script="js_tests.js", tmp_sub_folder=None):

        """
        Construct test suite operating on database DB_ENGINE
        Run the JavaScript engine
        Subclassed to set path to js_tests.js
        """

        # for comms devcontainer to use vscode as diff tool
        self.APP_LOCATIONS["cdiff"] = {"Linux": ["cdiff"]}

        super(CommsJSApiTestSuite, self).__init__(cli_args, js_script, tmp_sub_folder)

        # Init slots
        self.base_url = os.getenv("MYW_COMMS_BASE_URL") or "http://localhost/myworld"
        self.here = os.path.abspath(os.path.join(__file__, ".."))

    # subclassed to add hack to work with comms
    # ENH: shouldn't need to subclass
    def ensure_filenames_fetched(self):
        if self.filename_list is None:
            res = self.run_engine("listFilenames", "*", trace_hack=9)
            # We may end up getting a few other logs (eg. Identified platform as : jsdom), but it should be fine
            res = res.splitlines()
            self.filename_list = dict(entry.split(": ") for entry in res if ";" in entry)

    def run_engine(self, op, test_spec, trace_hack=0):
        """
        Run the JavaScript engine
        """

        def filter_proc(line):
            if re.match(r"\d\d:", line):
                return 5  # COMMS: Suppress witterage from spatialite plugin
            if re.match(r"^Unknown agent: jsdom", line):
                return 5  # COMMS: Suppress other witterage
            if re.match(r"^Identified platform as : unknown", line):
                return 5
            if re.match(r"^Preferences : {", line):
                return 5
            if re.match(r"^Usage Monitor Disabled", line):
                return 2

            filter = "^Shim config"
            if re.match(filter, line) == None:
                return trace_hack + 1
            else:
                return trace_hack + 3

        prog = os.path.join(self.self_dir, "js", self.js_script)
        cmd = ["node"]
        if op == "run" and self.inspect:
            cmd.append("--inspect")
        elif op == "run" and self.inspect_brk:
            cmd.append("--inspect-brk")
        cmd.extend([prog, self.module_name, self.base_url, op, test_spec])
        self.progress(2, "Running:", " ".join(cmd))

        return self.os_engine.run(
            *cmd, use_pipes=True, filter=filter_proc, env={"TEMP": self._temp_dir}
        )
