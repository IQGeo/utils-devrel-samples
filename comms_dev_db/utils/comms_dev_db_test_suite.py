# Test a select op
# Copyright: Ubisense Limited 2010-2018

import os, re, subprocess, shutil, tempfile
from sqlalchemy import exc
from myworldapp.modules.dev_tools.server.test_framework.myw_test_suite import MywTestSuite
from myworldapp.core.server.base.db.myw_db_server import MywDbServer
from myworldapp.modules.comms_dev_db.utils.design_builder import CommsDevDBDesignBuilder


class CommsDevDBTestSuite(MywTestSuite):
    """
    Passive tests for validating the Dev DB build
    """

    default_database = os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"
    uses_database = True

    @classmethod
    def get_cli_args(cls, cli_arg_def):
        super(CommsDevDBTestSuite, cls).get_cli_args(cli_arg_def)

        cli_arg_def.add_argument(
            "--module",
            help="module to test (default: comms)"
        )

    # Class constants
    test_names = [
        "modules",
        "schema_versions",
        "patches",
        "enums",
        "dd",
        "datasources",
        "layers",
        "networks",
        "applications",
        "roles",
        "users",
        "settings",
        "rights",
        "data",
        "deltas",
        "sequences",
        "structures",
        "routes",
        "conduits",
        "enclosures",
        "equipment",
        "cables",
        "circuits",
        "specs",
        "config",
        "data_integrity",
        "designs",
    ]

    def __init__(
        self,
        db_session,
        cli_args,
    ):
        """
        Construct test suite operating on database DB_ENGINE

        Optional RESULT_SET specifies database location and key for
        recording test result summary."""

        # for comms devcontainer
        self.APP_LOCATIONS["cdiff"] = {"Linux": ["cdiff"]}

        super(CommsDevDBTestSuite, self).__init__(cli_args, db_session=db_session)

        # Init slots

        # Set location for reference results
        # If module is specified, will use test_results and utils folders from that module
        self._dir = os.path.dirname(__file__)
        self.module_set = False
        if cli_args.module:
            self.module_set = True
            self._dir = os.path.join(cli_args.module, "_unshipped")

        self.resource_dir = os.path.normcase(self._dir)

        # Make temp results database-type-specific (useful when checking results of overnight build)
        self._temp_dir = self.temp_dir(self.db_dialect)

        url = MywDbServer.urlFor(self.db_engine, hideCredentials=True)

        self.db_name = MywDbServer.mywDatabaseNameFor(self.db_engine)
        self.db_args = MywDbServer.mywConnectSpecFor(self.db_engine)

        # Strings to exclude from results
        self.output_mappings[str(url)] = "<database>"

    # ==============================================================================
    #                                   TESTS
    # ==============================================================================

    def test_modules(self):
        """
        List versions of required modules
        """
        self.run_command("myw_product", "list", "versions", "dev_tools")

    def test_schema_versions(self):
        """
        List db schema versions
        """
        self.run_command("myw_db", self.db_name, "list", "versions", "*_schema")

    def test_patches(self):
        """
        List installed patches
        """

        self.run_command("myw_product", "list", "patches")

    def test_dd(self):
        """
        List myworld dd entries
        """

        self.run_command("myw_db", self.db_name, "list", "features", "--layout=keys", "--full")
        self.run_command("myw_db", self.db_name, "list", "fields", "--layout=keys", "--full")
        self.run_command("myw_db", self.db_name, "list", "field_groups", "--layout=keys", "--full")
        self.run_command("myw_db", self.db_name, "list", "queries", "--layout=keys")
        self.run_command("myw_db", self.db_name, "list", "searches", "--layout=keys")
        self.run_command("myw_db", self.db_name, "list", "filters", "--layout=keys", "--full")

        self.run_command("myw_db", self.db_name, "validate", "features")

    def test_external_dd(self):
        """
        List external dd entries
        """
        # ENH: support wildcards in datsource spec and remove this?

        for datasource in ["dev_esri_server", "dev_geoserver", "inspire.misoportal.com"]:
            self.run_command(
                "myw_db",
                self.db_name,
                "list",
                "features",
                datasource + "/*",
                "--full",
                "--layout=keys",
            )
            self.run_command(
                "myw_db",
                self.db_name,
                "list",
                "fields",
                datasource + "/*",
                "--full",
                "--layout=keys",
            )

    def test_enums(self):
        """
        List enumerator entries
        """

        self.run_command("myw_db", self.db_name, "list", "enums", "--full")

    def test_datasources(self):
        """
        List datasource entries
        """

        self.run_command("myw_db", self.db_name, "list", "datasources", "--full", "--layout=keys")
        self.run_command("myw_db", self.db_name, "validate", "datasources")

    def test_layers(self):
        """
        List layer entries
        """

        self.run_command("myw_db", self.db_name, "list", "layers", "--full", "--layout=keys")
        self.run_command(
            "myw_db", self.db_name, "list", "private_layers", "--full", "--layout=keys"
        )
        self.run_command("myw_db", self.db_name, "validate", "layers")

    def test_networks(self):
        """
        List network entries
        """

        self.run_command("myw_db", self.db_name, "list", "networks", "--full", "--layout=keys")

    def test_applications(self):
        """
        List application entries
        """

        self.run_command("myw_db", self.db_name, "list", "applications", "--full")

    def test_roles(self):
        """
        List role entries
        """

        self.run_command("myw_db", self.db_name, "list", "roles", "--full")

    def test_rights(self):
        """
        List rights entries
        """

        self.run_command("myw_db", self.db_name, "list", "rights", "--full")

    def test_users(self):
        """
        List user entries
        """

        self.run_command("myw_db", self.db_name, "list", "users", "--full")
        self.run_command("myw_db", self.db_name, "list", "groups", "--full")

    def test_settings(self):
        """
        List system settings
        """

        self.run_command("myw_db", self.db_name, "list", "settings")

    def test_data(self):
        """
        List feature counts
        """

        self.run_command("myw_db", self.db_name, "list")

    def test_deltas(self):
        """
        List feature deltas
        """

        self.run_command("myw_db", self.db_name, "list", "deltas", "--full", "--layout=keys")
        self.run_command("myw_db", self.db_name, "list", "data", "delta.*")
        self.run_command("myw_db", self.db_name, "list", "data", "base.*")

        """TBR: Remove sorting workaround once PLAT-6138 resolved"""
        #self.run_command('myw_db',self.db_name,'list','records','*','--full','--layout=keys', '--delta=*')
        self.list_delta_records()

    def test_sequences(self):
        """
        List ID generator values for feature tables
        """

        self.run_command("myw_db", self.db_name, "list", "sequences")

    def test_structures(self):
        """
        Check structures
        """

        self.run_command(
            "myw_db", self.db_name, "list", "records", "building", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "mdu", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "manhole", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "cabinet", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "pole", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "wall_box", "--full", "--layout=keys"
        )

    def test_routes(self):
        """
        Check routes
        """

        self.run_command(
            "myw_db",
            self.db_name,
            "list",
            "records",
            "mywcom_route_junction",
            "--full",
            "--layout=keys",
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "ug_route", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "oh_route", "--full", "--layout=keys"
        )

    def test_conduits(self):
        """
        Check conduits
        """
        self.run_command(
            "myw_db", self.db_name, "list", "records", "conduit", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db",
            self.db_name,
            "list",
            "records",
            "blown_fiber_bundle",
            "--full",
            "--layout=keys",
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "blown_fiber_tube", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db",
            self.db_name,
            "list",
            "records",
            "mywcom_conduit_run",
            "--full",
            "--layout=keys",
        )

    def test_enclosures(self):
        """
        Check equipment
        """

        self.run_command(
            "myw_db", self.db_name, "list", "records", "rack", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "fiber_shelf", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "slot", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "splice_closure", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db",
            self.db_name,
            "list",
            "records",
            "fiber_splice_tray",
            "--full",
            "--layout=keys",
        )

    def test_equipment(self):
        """
        Check equipment
        """

        self.run_command(
            "myw_db",
            self.db_name,
            "list",
            "records",
            "fiber_patch_panel",
            "--full",
            "--layout=keys",
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "fiber_olt", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "fiber_splitter", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "fiber_mux", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "fiber_tap", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "fiber_ont", "--full", "--layout=keys"
        )

    def test_cables(self):
        """
        Check cables and substructure
        """

        self.run_command(
            "myw_db", self.db_name, "list", "records", "fiber_cable", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db",
            self.db_name,
            "list",
            "records",
            "mywcom_fiber_segment",
            "--full",
            "--layout=keys",
        )
        self.run_command(
            "myw_db",
            self.db_name,
            "list",
            "records",
            "mywcom_fiber_connection",
            "--full",
            "--layout=keys",
        )

    def test_circuits(self):
        """
        Check circuits
        """

        self.run_command(
            "myw_db", self.db_name, "list", "records", "ftth_circuit", "--full", "--layout=keys"
        )

    def test_specs(self):
        """
        Check specifications
        """

        self.run_util("list_specs.py")
        self.run_util("check_specs.py")

    def test_data_integrity(self):
        """
        Show output from the integrity checker
        """

        self.run_util("check_data.py")

        for delta in CommsDevDBDesignBuilder.deltas():
            self.run_util("check_data.py", delta)

    def test_config(self):
        """
        Validate comms configuration"""

        self.run_util("check_config.py")

    def test_designs(self):
        """
        Check designs
        """

        self.run_command(
            "myw_db", self.db_name, "list", "records", "design", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "comsof_design", "--full", "--layout=keys"
        )
        self.run_command(
            "myw_db", self.db_name, "list", "records", "systest", "--full", "--layout=keys"
        )

    # ==============================================================================
    #                                   HELPERS
    # ==============================================================================

    def run_util(self, util, *args):
        """
        Run comms python utility UTIL, sending output to result stream
        """

        util_path = os.path.join(self._dir, util)
        if self.module_set:
            util_path = os.path.join(self._dir, "utils", util)

        self.run_command("myw_db", self.db_name, "run", util_path, *args)

    def run_command(self, *cmd):
        """
        Run a shell command, sending output to result stream
        """

        self.show_output_from(cmd)

    def list_delta_records(self):
        """
        List changes in deltas and sort output
        TBR: Remove once PLAT-6138 resolved
        """

        import io

        mem_stream = io.StringIO()

        self.show_output_from(
            [
                "myw_db",
                self.db_name,
                "list",
                "records",
                "*",
                "--full",
                "--layout=keys",
                "--delta=*",
            ],
            self.db_args,
            stream=mem_stream,
        )

        contents = mem_stream.getvalue()
        mem_stream.close()

        # Output sorted lines
        for line in sorted(contents.split("\n")):
            if line.strip() != "":
                self.show(line)
