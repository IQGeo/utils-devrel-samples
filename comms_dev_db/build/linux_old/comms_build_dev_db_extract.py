# Utility to build the Dev DB myWorld database

import site, os, subprocess, re, argparse, sys
from datetime import datetime
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

from myworldapp.core.server.base.system.myw_product import MywProduct
from myw_batch_utility import MywBatchUtility


class CommsDevDbExtractBuilder(MywBatchUtility):
    """
    Utility to build the Comms Dev extract
    """

    cli_arg_def = argparse.ArgumentParser()
    cli_arg_def.add_argument(
        "step", type=str, nargs="?", default="", help="Step(s) in process to perform"
    )
    cli_arg_def.add_argument("--skip", type=str, nargs="+", help="Steps to skip")
    cli_arg_def.add_argument(
        "--trace", type=int, default=1, help="Controls amount of progress tracing output"
    )
    cli_arg_def.add_argument(
        "--database", type=str, help="Name of database (default: MYW_COMMS_DEV_DB)"
    )
    cli_arg_def.add_argument("--sync_dir", type=str, help="Directory to store update packages in")
    cli_arg_def.add_argument(
        "--sync_url", type=str, default="", help="URL of master myWorld server"
    )
    cli_arg_def.add_argument("--extract_name", type=str, default="", help="Name for extract")

    steps = OrderedDict()
    steps["init"] = "Initialising  Master Database"
    steps["configure_extract_dir"] = "Configure Extract Directory"
    steps["create_extract"] = "Create Extract"
    steps["configure_extract"] = "Configure Extract Downloads"

    def __init__(self, trace, db_name, sync_dir, sync_url, extract_name):
        """
        Init slots of self
        """

        super().__init__(trace, True)

        self.use_shell = os.name == "nt"
        self.db_type = os.getenv("MYW_DB_TYPE") or "postgres"
        self.db_name = db_name
        self.sync_dir = sync_dir
        self.sync_url = sync_url
        self.extract_db = os.path.basename(sync_dir) + ".db"
        self.extract_name = extract_name

    def run(self, step=None, steps_to_skip=[]):
        """
        Do the build
        """

        if step:
            steps = step.split(",")
        else:
            steps = self.steps.keys()

        if not self._suppress_timings:
            self.progress(0, "Build started: {}".format(datetime.now().strftime("%H:%M:%S")))

        for step in steps:
            if not step in steps_to_skip:
                self.run_step(step)

        if not self._suppress_timings:
            self.progress(0, "Build finished: {}".format(datetime.now().strftime("%H:%M:%S")))

    def init(self):
        """
        Initialize database for replication
        """

        download_dir = os.path.dirname(self.sync_dir)
        self.run_subprocess(
            "myw_db",
            self.db_name,
            "initialise",
            self.sync_dir,
            self.sync_url,
            "--download_dir",
            download_dir,
        )

    def configure_extract_dir(self):
        """
        Empty the sync/extract directory
        """

        self.progress(1, "Emptying " + self.sync_dir)
        self.os_engine.ensure_exists(self.sync_dir, ensure_empty=True)

    def create_extract(self):
        """
        Create extract from master
        """

        extract_path = os.path.join(self.sync_dir, self.extract_db)
        extract_desc = "Comms 6012 " + datetime.now().strftime("%Y_%m_%d_%H%M")
        self.run_subprocess(
            "myw_db",
            self.db_name,
            "extract",
            extract_path,
            extract_desc,
            "full",
            "full",
            self.extract_name,
            "--zipped",
            "--include_deltas",
        )

    def configure_extract(self):
        """
        Configure extract downloads
        """

        self.run_subprocess(
            "myw_db", self.db_name, "configure_extract", self.extract_name, "Administrator"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "configure_extract", self.extract_name, "Designer"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "configure_extract", self.extract_name, "--writable_by_default"
        )

    # -----------------------------------------
    #                 HELPERS
    # -----------------------------------------

    def run_subprocess(self, *cmd, **opts):
        """
        Run a shell command, showing output
        """
        opts["stream"] = sys.stdout

        res = self.os_engine.run(*cmd, **opts)

        sys.stdout.flush()

        return res


if __name__ == "__main__":
    """
    MAIN
    """

    # Parse args
    cli_args = CommsDevDbExtractBuilder.cli_arg_def.parse_args()

    # Deal with defaults
    database = cli_args.database or os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_nightly"
    sync_dir = (
        cli_args.sync_dir
        or os.getenv("MYW_COMMS_DEV_DB_SYNC_DIR")
        or "/opt/myworld/offline/comms_latest_nightly"
    )
    sync_url = (
        cli_args.sync_url
        or os.getenv("MYW_COMMS_BASE_URL")
        or "https://appsdev.us.iqgeo.com/6x/nm/comms/latest_nightly"
    )
    extract_name = cli_args.extract_name or "full_comms_latest_nightly"
    # Run build
    builder = CommsDevDbExtractBuilder(cli_args.trace, database, sync_dir, sync_url, extract_name)
    builder.run(cli_args.step, cli_args.skip or [])
