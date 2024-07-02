import site, os, sys, codecs, time
import argparse, shutil, zipfile
from datetime import datetime
from collections import OrderedDict
from zipfile import *

# Add the product root dir to the module search path
product_root_dir = os.getenv("MYW_PRODUCT_ROOT_DIR")
print("ADDING", product_root_dir)
if product_root_dir:
    site.addsitedir(product_root_dir)

# Add myWorld modules to module search path and ensure they have priority over default python paths
from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

site_dirs = os.getenv("MYW_PYTHON_SITE_DIRS")
if site_dirs:
    for site_dir in site_dirs.split(";"):
        addprioritysitedir(site_dir)

from comms_dev_db_build_util import CommsDevDbBuildUtil


class CommsDevDbBuilder(CommsDevDbBuildUtil):
    """
    Utility to build a myWorld Coms Dev DB
    """

    # Define signature
    cli_arg_def = argparse.ArgumentParser()

    cli_arg_def.add_argument("--step", type=str, default="", help="Operation to perform")
    cli_arg_def.add_argument(
        "--trace", type=int, default=3, help="Controls amount of progress tracing output"
    )
    cli_arg_def.add_argument(
        "--database", type=str, help="The database name (default: MYW_COMMS_DEV_DB)"
    )
    cli_arg_def.add_argument(
        "--db_type", type=str, default="postgres", help="The database type to use"
    )

    steps = {}
    # steps['restart_apache']   = 'Restart Apache'
    steps["build_db"] = "Build DB"
    steps["validate"] = "Validate"
    steps["archive_database"] = "Archive database"
    steps["no_op"] = "Dummy Step for debugging purposes"

    def __init__(self, trace, db_name, db_type, suppress_timings=False):
        """
        Init slots of self
        """

        super().__init__(
            trace,
            suppress_timings=suppress_timings,
            db_name=db_name,
            db_type=db_type,
            suite_name="dev_db_build",
        )
        self.db_name = db_name
        self.print_banner("Building Comms Dev DB")

    def restart_apache(self):
        """
        Restart Apache
        """
        # restart_apache script, on windows, also kills firefox, selenium drivers and deletes the apache log files

        cmd = os.path.join(self.here, "restart_apache")
        self._run(cmd)

    def build_db(self):
        """
        Build the database
        """

        with self.progress.operation("Building database..."):
            cmd_dir = os.path.join(
                os.environ["MYW_HOME"], "WebApps", "myworldapp", "modules", "comms_dev_db", "utils"
            )
            with self.pushd(cmd_dir):
                self._run(
                    os.path.join(cmd_dir, "comms_build_dev_db"),
                    "--database",
                    self.db_name,
                    "--skip",
                    "run_tests",
                    "--trace",
                    self.test_trace,
                )

    def validate(self):
        """
        Validate what we built
        """

        cmd = os.path.join(
            os.environ["MYW_HOME"],
            "WebApps",
            "myworldapp",
            "modules",
            "comms_dev_db",
            "utils",
            "comms_validation_tests",
        )
        self._run_test_suite("validation", self.platform, cmd)

    def archive_database(self):
        """
        Archive the database and tilestore to the output directory
        """
        self.progress(1, "Archiving database for", self.platform)

        archive_dir = os.path.abspath(self.output_dir)

        # Reomve old archive
        # ENH: Do this in init
        self.progress(1, "Deleting old archive...")
        files = os.listdir(archive_dir)
        for file in files:
            if file.endswith(".backup"):
                os.remove(os.path.join(archive_dir, file))

        # Create new archive
        archive_name = "comms_dev_db." + self.platform + ".backup"
        backup_file = os.path.join(self.output_dir, archive_name)

        self.progress(1, "Creating backup file...")
        self._run("myw_db", self.db_name, "backup", backup_file)

    def _get_timestamp(self):
        now = datetime.now()
        timestamp = now.strftime("%Y-%m-%d-%H-%M")

        return timestamp

    def no_op(self):
        """Dummy step for debugging/skipping"""
        pass


if __name__ == "__main__":
    cli_args = CommsDevDbBuilder.cli_arg_def.parse_args()

    database = cli_args.database or os.getenv("MYW_COMMS_DEV_DB") or "myw_comms_dev"

    b = CommsDevDbBuilder(cli_args.trace, database, cli_args.db_type)
    b.run(cli_args.step)
