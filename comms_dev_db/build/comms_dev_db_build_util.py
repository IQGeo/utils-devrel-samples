import site, os, sys, codecs, tempfile, re
import argparse, shutil, glob, datetime
import io, json
from zipfile import *

# from myworldapp.modules.dev_tools.server._unshipped.myw_batch_utility import MywBatchUtility
from myworldapp.modules.comms_dev_db.utils.myw_batch_utility import MywBatchUtility


class CommsDevDbBuildUtil(MywBatchUtility):
    """
    Superclass for overnight build DevDB utils
    """

    @property
    def test_trace(self):
        """
        Trace level to send to the test processes

        This is 3 less than the trace level for self (gives more control)
        """
        return str(max(self.verbosity - 3, 1))

    @property
    def update_src_log(self):
        """
        Temporary location for the output from 'update_source'
        """
        # ENH: Avod need for this

        if self.platform == "linux":
            tmp = "/tmp"
        else:
            tmp = os.environ["TMP"]
        return os.path.join(tmp, "update_src.log")

    def __init__(self, trace, db_name, db_type="postgres", suite_name=None, suppress_timings=False):
        """
        Init slots of self
        """

        self.db_name = db_name

        # Setmain environment variables
        self.__set_env()

        # Get debug options
        options_file = os.path.join(os.environ["MYW_COMMS_BUILD"], "options.json")
        if os.path.exists(options_file):
            with open(options_file) as f:
                debug_opts = json.load(f)
        else:
            debug_opts = {}

        self.dry_run = debug_opts.get("dry_run", False)
        trace = debug_opts.get("trace", trace)

        # Init super
        super().__init__(trace, suppress_timings)

        # Set build-specifc environment variables
        self.platform = "windows" if os.name == "nt" else "linux"
        self._show_env_vars()

        # Set paths
        self.here = os.path.abspath(os.path.join(__file__, ".."))
        self.utils = os.path.abspath(os.path.join(self.here, "..", "Utils"))

        # Set the directory for build output
        self.output_dir = os.path.join(os.environ["MYW_COMMS_BUILD"], "output")
        self.os_engine.ensure_exists(self.output_dir)

        # Set location of log file
        log_root = os.path.join(os.environ["MYW_BUILD_LOG_DIR"])
        if suite_name != None:
            self.log_dir = os.path.join(log_root, suite_name)
            self.log_file = os.path.join(self.log_dir, suite_name + "." + self.platform + ".out")
        else:
            self.log_file = ""

        # Copy console output to file in logs dir
        if self.log_file:
            self.os_engine.ensure_exists(log_root)
            self.os_engine.ensure_exists(self.log_dir)

            self.log_stream = io.open(self.log_file, mode="w", encoding="utf-8")

            sys.stdout = LoggedStream(sys.stdout, self.log_stream)
            sys.stderr = LoggedStream(sys.stderr, self.log_stream)

        self.__display_update_src()

        # Display our environment
        self.progress(1, "MYW_COMMS_BUILD:", os.environ.get("MYW_COMMS_BUILD"))
        self.progress(1, "MYW_BUILD_ID:", os.environ.get("MYW_BUILD_ID"))
        self.progress(1, "LOG_FILE    :", self.log_file)

    def __set_env(self):
        """
        Set build environment variables in os.environ
        """
        if os.getenv("MYW_HOME") is None:
            os.environ["MYW_HOME"] = os.path.abspath(
                os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "..")
            )

        if os.getenv("MYW_COMMS_BUILD") is None:
            os.environ["MYW_COMMS_BUILD"] = os.path.abspath(
                os.path.join(os.environ["MYW_HOME"], "..", "build", "comms")
            )

        if os.getenv("PARENT_BUILD_TIMESTAMP") is None:
            if os.getenv("BUILD_TIMESTAMP") is None:
                dt = datetime.datetime.now()
            else:
                dt = datetime.datetime.strptime(os.getenv("BUILD_TIMESTAMP"), "%Y-%m-%d %H-%M-%S")
        else:
            dt = datetime.datetime.strptime(
                os.getenv("PARENT_BUILD_TIMESTAMP"), "%Y-%m-%d %H-%M-%S"
            )

        if os.environ["MYW_BUILD_ID"] is None:
            os.environ["MYW_BUILD_ID"] = dt.strftime("%Y-%m-%d_%H%M")
            
        os.environ["MYW_BUILD_LOG_DIR"] = os.path.join(
            os.environ["MYW_COMMS_BUILD"], "logs", os.environ["MYW_BUILD_ID"]
        )

    def _show_env_vars(self):
        """
        Display environment variables
        """
        self.print_banner("Environment Variables")

        if self.verbosity < 5:
            self.progress(
                1, "PARENT_BUILD_ID         :", (os.getenv("PARENT_BUILD_ID") or "Not Set")
            )
            self.progress(1, "BUILD_ID                :", (os.getenv("BUILD_ID") or "Not Set"))
            self.progress(
                1, "BUILD_TIMESTAMP         :", (os.getenv("BUILD_TIMESTAMP") or "Not Set")
            )
            self.progress(1, "MYW_HOME                :", (os.getenv("MYW_HOME") or "Not Set"))
            self.progress(
                1, "MYW_BUILD               :", (os.getenv("MYW_COMMS_BUILD") or "Not Set")
            )
            self.progress(1, "MYW_BUILD_ID            :", (os.getenv("MYW_BUILD_ID") or "Not Set"))
            self.progress(
                1, "MYW_BUILD_LOG_DIR       :", (os.getenv("MYW_BUILD_LOG_DIR") or "Not Set")
            )
            self.progress(1, "MYW_DB_TYPE             :", (os.getenv("MYW_DB_TYPE") or "Not Set"))
            self.progress(2, "MYW_DB_PORT             :", (os.getenv("MYW_DB_PORT") or "Not Set"))
            self.progress(
                2, "MYW_DB_PASSWORD         :", (os.getenv("MYW_DB_PASSWORD") or "Not Set")
            )
            self.progress(
                2, "MYW_COMMS_BASE_URL      :", (os.getenv("MYW_COMMS_BASE_URL") or "Not Set")
            )
            self.progress(
                2, "MYW_COMMS_BUILD_INI_FILE:", (os.getenv("MYW_COMMS_BUILD_INI_FILE") or "Not Set")
            )
            self.progress(
                2, "MYW_COMMS_SLACK_TOKEN:", (os.getenv("MYW_COMMS_SLACK_TOKEN") or "Not Set")
            )
            self.progress(
                2, "MYW_COMMS_SLACK_CHANNEL:", (os.getenv("MYW_COMMS_SLACK_CHANNEL") or "Not Set")
            )
        else:
            for key in sorted(os.environ):
                self.progress(3, key + " : " + os.environ[key])

    def __display_update_src(self):
        """
        Incorporate the logging from the update src step into our "master" one
        """
        update_src_log = self.update_src_log
        if os.path.exists(update_src_log):
            with open(update_src_log) as f:
                for line in f:
                    sys.stdout.write(line)
            os.remove(update_src_log)

    def _run_test_suite(self, suite, opt_name, cmd, *cmd_options):
        """
        Run the specified Test suite
        """

        test_name = suite + "." + opt_name

        log_file = os.path.join(self.log_dir, test_name + ".log")
        self.progress(1, "Log file :", log_file)
        
        # Write log files
        with io.open(log_file, "w") as f:
            self._run(*(cmd, "reset") + cmd_options, stream=f)
            self._run(
                *(cmd, "run", "*", "diff", "--trace", self.test_trace) + cmd_options,
                stream=f,
            )
            self._run(*(cmd, "check") + cmd_options, stream=f)

    def _restore_dev_db(self):
        """
        Restore the Dev DB from archive
        """

        # Restart apache (also kills firefox, selenium drivers and deletes apache log files on Windows)
        cmd = os.path.join(self.here, "restart_apache")
        self._run(cmd)
        self.disconnect_db_sessions()

        # restore_dev_db
        self.print_banner("Restoring Database")
        self._run(
            "myw_db",
            self.db_name,
            "restore",
            os.path.join(self.output_dir, "myw_dev_db." + self.platform + ".backup"),
        )
        self._safe_copy(
            os.path.join(self.output_dir, "myw_dev_db_tiles." + self.platform + ".sqlite"),
            os.path.join(os.environ["MYW_DEV_DB_DATA"], "tiles.sqlite"),
        )

    def _run(self, *cmd, **opts):
        """
        Run external command CMD
        """

        if self.dry_run:
            self.progress(1, "Dry run:", *cmd, **opts)
            return

        return super()._run(*cmd, **opts)

    def _unix2dos(self, filename):
        """
        Convert FILENAME to have DOS line endings
        """
        # ENH: Move this down to MywOsEngine ?
        if self.platform == "linux":
            text = open(filename, "rb").read().replace("\n", "\r\n")
            open(filename, "wb").write(text)

    def _write_zip(self, zip_name, path):
        """
        Write a ZIP file called ZIP_NAME with contents from PATH
        """
        self.progress(1, "Writing ZIP file {}".format(zip_name))

        with ZipFile(zip_name, "w", ZIP_DEFLATED) as zipfile:

            n_files = 0

            for dir, sub_dir, file_names in os.walk(path):
                for file_name in file_names:

                    # Build relative path
                    file_path = os.path.join(dir, file_name)
                    rel_path = os.path.relpath(file_path, path)

                    # Add file to zip
                    self.progress(2, "Adding " + rel_path + "...")
                    zipfile.write(file_path, rel_path)

            n_files += 1
        return n_files

    def _safe_copy(self, from_file, to_file):
        """
        Copy FROM_FILE, suppress taceback if it doesn't exist
        """
        # ENH: Move this down to MywOsEngine ?
        if os.path.exists(from_file):
            shutil.copy(from_file, to_file)
        else:
            self.progress(1, "File : " + from_file + " does not exist")

    def disconnect_db_sessions(self):
        """
        Disconnects all other sessions from database
        """
        # ENH: Duplicated with build_dev_db - share this somehow

        # Prevent hanging session from blocking build

        sql = "SELECT pid, CASE (SELECT pg_terminate_backend(pid)) WHEN True THEN 'killed' ELSE 'not killed' END  from pg_stat_activity WHERE datname = '{}' AND state = 'idle'"
        self._run(
            "psql", "-c", sql.format(self.db_name), regex=".*killed.*"
        )  # ,filter="could not find a \"psql\" to execute")


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
