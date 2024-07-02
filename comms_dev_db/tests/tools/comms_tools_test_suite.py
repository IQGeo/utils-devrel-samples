# Copyright: IQGeo Limited 2010-2023

import os, urllib.parse, urllib.error
from copy import copy

from sqlalchemy import create_engine

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.db.myw_postgres_db_server import MywPostgresDbServer
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.database.myw_upgrade_manager import MywUpgradeManager

from myworldapp.modules.dev_tools.server.test_framework.myw_test_suite import MywTestSuite


class CommsToolsTestSuite(MywTestSuite):
    default_database = os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"
    """
    Functional tests for command line tools
    """

    # Class constants
    test_names = [
        "upgrade_devdb_5211",
        "upgrade_devdb_6120",
        "db_validate",
        "db_list",
        "db_import",
        "db_export",
        "tasks",
    ]

    def __init__(self, db_session, cli_args):
        """
        Construct test suite operating on database session DB_SESSION

        Optional RESULT_SET gives database location and key for
        recording test results."""

        # for comms devcontainer to use vscode as diff tool
        self.APP_LOCATIONS["cdiff"] = {"Linux": ["cdiff"]}

        super(CommsToolsTestSuite, self).__init__(cli_args, db_session=db_session)

        # Init slots
        self.product = MywProduct()

        # Set location for reference results
        self_dir = os.path.dirname(__file__)
        self.resource_dir = os.path.join(self_dir, "resources")

        # Set args for myw_db command
        self.db_name = "comms_scratch"
        self.db_args = []
        if cli_args.username:
            self.db_args.extend(["--username", cli_args.username])
        if cli_args.password:
            self.db_args.extend(["--password", cli_args.password])
        if cli_args.host:
            self.db_args.extend(["--host", cli_args.host])
        if cli_args.port:
            self.db_args.extend(["--port", str(cli_args.port)])

        # Get DB connect spec (for making results machine independent)
        svr = MywPostgresDbServer(
            cli_args.host, cli_args.port, cli_args.username, cli_args.password
        )
        db_conn_spec = svr.connectSpecFor(self.db_name)
        db_engine = create_engine(db_conn_spec)
        url = MywPostgresDbServer.urlFor(db_engine, hideCredentials=True)

        # Set output mappings
        self.output_mappings[self.resource_dir] = "<resource_dir>"
        self.output_mappings[self.product.root_dir] = "<product_dir>"
        self.output_mappings[db_conn_spec] = "<conn_spec>"
        self.output_mappings[str(url)] = "<conn_spec>"
        self.output_mappings[self._temp_dir] = "<temp_dir>"
        self.output_mappings["\\"] = "/"

        # Set data locations etc
        self.test_data_dir = self.product.moduleOf(__file__).file("data")

    def ref_file_path(self, test_name):
        """
        Path of reference result for TEST_NAME

        Subclassed to support db-specific results"""

        os_type = self.os_type

        file_name = test_name
        file_name += ".txt"

        return self.resource_file("test_results", file_name)

    def data(self, *path):
        """
        Full path to test data resource file PATH
        """

        return self.resource_file("data", *path)

    def restore_dev_db(self):
        """
        Get a Dev DB to run tests on
        """

        archive_file = "myw_comms_dev_6120.backup"

        archive_path = self.data("databases", archive_file)
        self.restore_db(archive_path)

        upgrade_mgr = MywUpgradeManager(self.progress)

        for upgrade_id in upgrade_mgr.upgradesIn("core"):
            self.run_helper("myw_db", self.db_name, "upgrade", "core", str(upgrade_id))

        for upgrade_id in upgrade_mgr.upgradesIn("comms"):
            self.run_helper(
                "myw_db", self.db_name, "upgrade", "comms", str(upgrade_id), "--verbosity=4"
            )

    def restore_db(self, filename):
        """
        Run a restore command (discarding output)

        Requires special method because pg_restore always gives non-zero return codes"""

        self.run_helper("myw_db", self.db_name, "restore", filename)

    def create_db(self, load_specs=False):
        """
        Create an empty database with template model
        """

        self.run_helper("myw_db", self.db_name, "create", "--overwrite")
        self.run_helper("myw_db", self.db_name, "install", "core")
        self.run_helper("myw_db", self.db_name, "install", "comms")
        self.run_helper(
            "comms_db",
            self.db_name,
            "install",
            "structures",
            "routes",
            "conduits",
            "internals",
            "fiber",
            "ftth",
            "designs",
        )

        if load_specs:
            file_spec = os.path.join(self.test_data_dir, "specs", "*.csv")
            self.run_helper("myw_db", self.db_name, "load", file_spec)

    # ==============================================================================
    #                                   TESTS
    # ==============================================================================

    def test_upgrade_devdb_5211(self):
        """
        Exercise database upgrade
        """

        self._test_db_upgrade("myw_comms_dev_5211.backup", 5211, "design/test")

    def test_upgrade_devdb_6120(self):
        """
        Exercise database upgrade
        """

        self._test_db_upgrade("myw_comms_dev_6120.backup", 6120)

    def _test_db_upgrade(self, archive_file, db_version, *deltas_to_check):
        """
        Exercise database upgrade
        """

        self.show("Upgrading ", archive_file)

        # Restore the database
        archive_path = self.data("databases", archive_file)
        self.restore_db(archive_path)

        upgrade_mgr = MywUpgradeManager(self.progress)

        # Do the test
        for upgrade_id in upgrade_mgr.upgradesIn("core"):
            self.test_command("myw_db", self.db_name, "upgrade", "core", str(upgrade_id))

        for upgrade_id in upgrade_mgr.upgradesIn("comms"):
            self.test_command(
                "myw_db", self.db_name, "upgrade", "comms", str(upgrade_id), "--verbosity=4"
            )

        # Show the new state
        # ENH: Use memory DB to just show what was changed
        self.show_output_from("myw_db", self.db_name, "list")
        self.show_output_from(
            "myw_db", self.db_name, "list", "settings", "mywcom.*", "--full", "--layout=keys"
        )
        self.show_output_from(
            "myw_db", self.db_name, "list", "rights", "mywcom.*", "--full", "--layout=keys"
        )

        # Check new state is good
        self.test_command("comms_db", self.db_name, "validate", "config")
        self.test_command("comms_db", self.db_name, "validate", "data")
        for delta in deltas_to_check:
            self.test_command("comms_db", self.db_name, "validate", "data", "--delta", delta)

    def test_db_validate(self):
        """
        Exercise validation
        """

        self.restore_dev_db()

        # Config validation
        self.test_command("comms_db", self.db_name, "validate", "config")
        self.test_command(
            "comms_db", self.db_name, "validate", "config", "structures", "--verbosity=3"
        )  # Includes warnings

        # Data validation
        self.test_command("comms_db", self.db_name, "validate", "data")
        self.test_command(
            "comms_db",
            self.db_name,
            "validate",
            "data",
            "routes",
            "--delta=design/NB301",
            "--verbosity=4",
        )
        self.test_command(
            "comms_db",
            self.db_name,
            "validate",
            "data",
            "connections",
            "--delta=design/CC5462",
            "--verbosity=4",
        )

        area_type = "distribution_area"
        area_def = os.path.join(self.test_data_dir, "network", f"{area_type}.def")
        area_data = os.path.join(self.test_data_dir, "import", f"{area_type}.1.csv")

        self.test_command("myw_db", self.db_name, "load", area_def)
        self.test_command("myw_db", self.db_name, "load", area_data, "--delta", "design/NB120")

        self.test_command(
            "comms_db",
            self.db_name,
            "validate",
            "data",
            "--delta=design/NB120",
            f"--area={area_type}/2",
        )

    def test_db_list(self):
        """
        Exercise list data package
        """

        self.create_db()

        file_name = os.path.join(self.test_data_dir, "import", "milton.zip")

        # Do tests
        self.test_command("comms_db", self.db_name, "list", file_name, "metadata")
        self.test_command("comms_db", self.db_name, "list", file_name, "features")
        self.test_command("comms_db", self.db_name, "list", file_name, "fields")
        self.test_command("comms_db", self.db_name, "list", file_name)  # Data
        self.test_command("comms_db", self.db_name, "list", file_name, "records")
        self.test_command("comms_db", self.db_name, "list", file_name, "records", "--full")

    def test_db_import(self):
        """
        Exercise data import
        """

        self.create_db(load_specs=True)

        # ZIP file containing CSV files
        delta = "design/milton"
        file_name = os.path.join(self.test_data_dir, "import", "milton.zip")
        self.test_command("comms_db", self.db_name, "import", file_name, "--delta", delta)
        self.test_command("myw_db", self.db_name, "list", "records", "--delta", delta, "--full")

        # Directory containing CSV files
        delta = "design/minimal"
        file_name = os.path.join(self.test_data_dir, "import", "minimal")
        self.test_command("comms_db", self.db_name, "import", file_name, "--delta", delta)
        self.test_command("myw_db", self.db_name, "list", "records", "--delta", delta, "--full")

        # GeoPackage
        delta = "design/west_cambridge"
        file_name = os.path.join(self.test_data_dir, "import", "ucam_fex_network.gpkg")
        mapping_file = os.path.join(self.test_data_dir, "import", "ucam_fex_network.json")
        self.test_command(
            "comms_db",
            self.db_name,
            "import",
            file_name,
            "--delta",
            delta,
            "--mappings",
            mapping_file,
        )
        self.test_command("myw_db", self.db_name, "list", "records", "--delta", delta, "--full")
        self.test_command("comms_db", self.db_name, "list", file_name, "records", "--full")

        # SQLite file
        # Expect spec warnings as the test is done in a fresh database
        delta = "design/fex"
        file_name = os.path.join(self.test_data_dir, "import", "fex_network.sqlite")
        self.test_command(
            "comms_db", self.db_name, "import", file_name, "--delta", delta, "--reload"
        )
        self.test_command("myw_db", self.db_name, "list", "records", "--delta", delta, "--full")
        self.test_command("comms_db", self.db_name, "list", file_name, "records", "--full")
    
        #
        # Shape file. Test ogr feature package
        #      
        delta = "design/shape"

        # Update settings in scratch database to map shp file to ogr stream
        settings_file = os.path.join(self.test_data_dir, "import", "shp_config.settings")
        self.test_command("myw_db", self.db_name, "load", settings_file, "--update")

        # Load file
        file_name = os.path.join(self.test_data_dir, "import", "shp_file/OUT_DistributionPoints.shp")
        mapping_file = os.path.join(self.test_data_dir, "import", "shp_mapping.json")
        self.test_command("comms_db", self.db_name, "import", file_name, "--delta", delta, "--mappings", mapping_file)

        # Check results
        self.test_command("myw_db", self.db_name, "list", "records", "--delta", delta, "--full")
        self.test_command("comms_db", self.db_name, "list", file_name, "records", "--full")


    def test_db_export(self):
        """
        Exercise data export
        Note: The list of files zipped varies in order between DOS and Unix.
        """

        self.restore_dev_db()

        # Export data
        output_dir = self.temp_dir_empty("db_export", "to_dir")
        self.test_command(
            "comms_db", self.db_name, "export", output_dir, "--area=design/CC5462", "--overwrite"
        )

        # Show result
        self.show_files_under(output_dir)

        # ENH: Exercise zipping
        output_file = self.temp_file("db_export", "to_file.zip")
        self.test_command(
            "comms_db", self.db_name, "export", output_file, "--area=design/CC5462", "--overwrite"
        )

        # Export data for a delta. Will export all records in area for design and as well as modifications from delta
        # This design is included as it has internal cables.
        output_dir = self.temp_dir_empty("db_export", "to_dir_delta")
        self.test_command(
            "comms_db", self.db_name, "export", output_dir, "--delta=design/NB335", "--overwrite"
        )
        self.show_files_under(output_dir)

    def test_tasks(self):
        """
        Test task action. Queue is empty so just testing graceful handling
        of empty queue.
        """

        self.test_command("comms_db", self.db_name, "manage_tasks", "list")

        self.test_command("comms_db", self.db_name, "manage_tasks", "delete")

        self.test_command("comms_db", self.db_name, "manage_tasks", "run", "1")

        self.test_command("comms_db", self.db_name, "manage_tasks", "cancel", "1")

    # ==============================================================================
    #                                   HELPERS
    # ==============================================================================

    def run_helper(self, *cmd):
        """
        Run a myWorld utility (discarding output)
        """

        if cmd[0] == "myw_db" or "comms_db":
            verbosity = self.trace_level - 2
            if verbosity > 1:
                cmd = list(cmd) + ["--verbosity", str(verbosity)]

        return self.run_subprocess(cmd, self.db_args)

    def test_command(self, *cmd, **kwargs):
        """
        Run a shell command, sending command and output to result stream
        """

        self.show("COMMAND: ", " ".join(cmd))
        self.show_output_from(*cmd, **kwargs)

    def show_output_from(self, *cmd, **kwargs):
        """
        Run a shell command, sending output to result stream

        KWARGS is a dict with optional key 'env'"""

        env = kwargs.get("env", {})

        super().show_output_from(cmd, self.db_args, env=env)

    def show_files_under(self, dir, file_spec="*", max_lines=None):
        """
        Show the contents of all files under DIR (in repeatable order)
        """

        for path in self.walk_dir_tree(dir):

            self.show_file(path)
