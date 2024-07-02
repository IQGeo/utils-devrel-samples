# Utility to build the Dev DB myWorld database

import site, os, subprocess, re, argparse, sys, tempfile
from datetime import datetime
from timeit import Timer
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


class CommsDevDbBuilder(MywBatchUtility):
    """
    Utility to build the Comms Dev database
    """

    # ENH: Reformulate as database upgrade

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

    steps = OrderedDict()
    steps["init"] = "Initialising Database"
    steps["configure_landbase"] = "Configure Landbase"
    steps["configure_network"] = "Configure Network"
    steps["configure_designs"] = "Configure Designs"
    steps["configure_application"] = "Configure Application"
    steps["load_landbase"] = "Load Landbase"
    steps["add_specs"] = "Add Specs"
    steps["load_labor_costs"] = "Load Labor Costs"
    steps["load_network"] = "Load Network"
    steps["build_routes"] = "Build Routes"
    steps["add_cables"] = "Add Cables"
    steps["add_conduits"] = "Add Conduits"
    steps["build_circuits"] = "Build Circuits"
    steps["set_properties"] = "Set Properties"
    steps["add_tick_marks"] = "Add Tick Marks"
    steps["add_comsof"] = "Add Comsof"
    steps["add_copper_network"] = "Add Copper Network"
    steps["add_line_of_count"] = "Add LOC Data"
    steps["build_deltas"] = "Build Deltas"
    steps["tidy"] = "Tidy"
    steps["run_tests"] = "Running Validation Tests"

    def __init__(self, trace, db_name):
        """
        Init slots of self

        ETL_DATA is location of of the ETL data"""

        super().__init__(trace, True)

        self.use_shell = os.name == "nt"
        self.db_type = os.getenv("MYW_DB_TYPE") or "postgres"
        self.db_name = db_name
        self.data_dir = MywProduct().moduleOf(os.path.realpath(__file__)).file("data")
        self.utils_dir = os.path.dirname(__file__)
        self.modules = os.path.join(os.path.dirname(__file__), "..", "..")

    def run(self, step=None, steps_to_skip=[]):
        """
        Do the build
        """

        if step == "raw":
            steps = ["init", "configure_network", "configure_application", "load_network"]

        elif step:
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
        Create database and install data-model
        """

        # TODO: Hangs .. compare with DevDB and fix
        self.progress(1, "Disconnecting processes...")
        self.disconnect_db_sessions()

        self.progress(1, "Creating database...")
        self.run_subprocess("myw_db", self.db_name, "create", "--overwrite")

        self.progress(1, "Installing schema ...")
        self.run_subprocess("myw_db", self.db_name, "install", "core", "--verbosity=1")
        self.run_subprocess("myw_db", self.db_name, "install", "comms")

        self.progress(1, "Adding sample model ...")
        comms_db_cmd = os.path.join(self.modules, "comms", "tools", "comms_db")
        self.run_subprocess(
            comms_db_cmd,
            self.db_name,
            "install",
            "structures",
            "routes",
            "conduits",
            "internals",
            "fiber",
            "ftth",
            "copper",
            "coax",
            "designs",
        )
        self.run_subprocess(
            comms_db_cmd,
            self.db_name,
            "install",
            "systest_design",
            "ftth",
            "--module",
            "comms_dev_db",
        )

    def configure_landbase(self):
        """
        Configure addresses, building etc
        """
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("landbase", "*.enum"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("landbase", "*.def"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("landbase", "*.layer"), "--update"
        )

    def configure_network(self):
        """
        Add custom enums, fields, layers etc
        """

        # Add custom fields etc
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("network", "*.enum"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("circuits", "*.enum"), "--update"
        )
        self.run_subprocess("myw_db", self.db_name, "run", self.util("add_fields.py"), "--commit")

        # Add custom objects and layers
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("network", "*.def"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("network", "*.layer"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("circuits", "*.def"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("circuits", "*.layer"), "--update"
        )

        # Update config settings
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("configure_circuits.py"), "--commit"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("configure_tmf.py"), "--commit"
        )

        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("configure_path_finder.py"), "--commit"
        )

    def configure_designs(self):
        """
        Add design support model
        """

        # Load design objects
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("design", "*.enum"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("design", "*.config"), "--update"
        )

    def configure_application(self):
        """
        Configure Application
        """

        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("config", "*.config"), "--update"
        )

        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("config", "*.layer"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("config", "*.datasource"), "--update"
        )

        # TBR: Do not delete standard application. Temporary workaround for PLAT-9273
        #self.run_subprocess("myw_db", self.db_name, "drop", "applications", "standard")

        self.run_subprocess("myw_db", self.db_name, "add", "application_layer", "mywcom", "streets")
        self.run_subprocess(
            "myw_db", self.db_name, "add", "application_layer", "mywcom", "Buildings (OSM)"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "add", "application_layer", "mywcom", "Addresses", "--snap"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "add", "application_layer", "mywcom", "bb_circuits"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "add", "application_layer", "mywcom", "Service Areas"
        )
        self.run_subprocess("myw_db", self.db_name, "add", "application_layer", "mywcom", "designs")
        self.run_subprocess(
            "myw_db", self.db_name, "add", "application_layer", "mywcom", "delta_cables"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "add", "application_layer", "mywcom", "delta_structures"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "add", "application_layer", "mywcom", "systests"
        )

        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("config", "*.application"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("config", "*.role"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("config", "*.user"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("config", "*.group"), "--update"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("config", "*.settings"), "--update"
        )

        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("import", "*.settings"), "--update"
        )

    def load_landbase(self):
        """
        Load landbase data
        """

        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("landbase", "osm_*.csv"), "--direct"
        )
        self.run_subprocess(
            "myw_db",
            self.db_name,
            "load",
            self.data("landbase", "address*.csv"),
            "--update_sequence",
        )
        self.run_subprocess(
            "myw_db",
            self.db_name,
            "load",
            self.data("landbase", "*.csv"),
            "--update_sequence",
        )

    def add_specs(self):
        """
        load spec data
        """

        self.run_subprocess("myw_db", self.db_name, "load", self.data("specs", "*.csv"))

    def load_labor_costs(self):
        """
        load labor cost data
        """

        self.run_subprocess("myw_db", self.db_name, "load", self.data("labor_costs", "*.csv"))
        # Update config settings
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("configure_labor_costs.py"), "--commit"
        )

    def load_network(self):
        """
        Load raw network data
        """

        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("network", "*.csv"), "--update_sequence"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("internals", "*.csv"), "--update_sequence"
        )

    def build_routes(self):
        """
        Build structure connectivity, set names, ...
        """

        self.run_subprocess("myw_db", self.db_name, "run", self.util("build_routes.py"), "--commit")
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("enter_equipment.py"), "--commit"
        )
        self.run_subprocess("myw_db", self.db_name, "run", self.util("set_names.py"), "--commit")

    def add_cables(self):
        """
        Add cables
        """

        self.run_subprocess("myw_db", self.db_name, "run", self.util("add_cables.py"), "--commit")

        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("add_coax_cables.py"), "--commit"
        )

        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("add_internal_cables.py"), "--commit"
        )
        self.run_subprocess("myw_db", self.db_name, "run", self.util("add_slacks.py"), "--commit")
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("add_hfc_fiber_cables.py"), "--commit"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("add_internal_cables_2.py"), "--commit"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("connect_cables.py"), "--commit"
        )

        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("connect_coax_cables.py"), "--commit"
        )

    def add_copper_network(self):
        """
        Add copper equipment and cables
        """
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("add_copper_network.py"), "--commit"
        )
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("set_segment_containment.py"), "--commit"
        )

    def add_line_of_count(self):
        """
        Add line of count data. Alternative was to use a builder but this was fragile
        """

        self.run_subprocess(
            "myw_db", self.db_name, "load", self.data("line_of_count", "*.csv"), "--update_sequence"
        )

    def add_conduits(self):
        """
        Add conduits
        """

        self.run_subprocess("myw_db", self.db_name, "run", self.util("add_conduits.py"), "--commit")
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("move_cables_into_conduits.py"), "--commit"
        )
        self.run_subprocess("myw_db", self.db_name, "run", self.util("add_bf_tubes.py"), "--commit")

    def build_circuits(self):
        """
        Build circuits
        """

        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("build_circuits.py"), "--commit"
        )

    def set_properties(self):
        """
        Populate network object properties
        """

        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("set_properties.py"), "--commit"
        )

    def add_tick_marks(self):
        """
        Add tick marks to cables
        """

        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("add_tick_marks.py"), "--commit"
        )

    def add_comsof(self):
        """
        Add Comsof data model and test data
        """

        self.run_subprocess(
            "myw_db",
            self.db_name,
            "run",
            self.util("comsof", "comsof_add_dev_db_items.py"),
            "--commit",
        )

    def build_deltas(self):
        """
        Build example designs
        """

        self.run_subprocess("myw_db", self.db_name, "load", self.data("design", "*.csv"))
        self.run_subprocess(
            "myw_db", self.db_name, "run", self.util("build_designs.py"), "--commit"
        )

    def tidy(self):
        """
        Wipe transaction logs etc
        """

        self.run_subprocess("myw_db", self.db_name, "maintain", "transaction_logs")
        self.run_subprocess("myw_db", self.db_name, "maintain", "statistics")

    def run_tests(self):
        """
        Run the validation tests
        """
        comms_validation_cmd = os.path.join(
            self.modules, "comms_dev_db", "utils", "comms_validation_tests"
        )
        self.run_subprocess(comms_validation_cmd, "run", "*", "diff", "--database", self.db_name)
        self.run_subprocess(comms_validation_cmd, "check", "--database", self.db_name)

    # -----------------------------------------
    #                 HELPERS
    # -----------------------------------------

    def disconnect_db_sessions(self):
        """
        Disconnects all other sessions from database
        """

        port = os.getenv("MYW_DB_PORT") or 1522

        # Prevent hanging session from blocking build
        sql = "SELECT pid, CASE (SELECT pg_terminate_backend(pid)) WHEN True THEN 'killed' ELSE 'not killed' END  from pg_stat_activity WHERE datname = '{}' AND state = 'idle'"
        self.run_subprocess(
            "psql", "-p", str(port), "-c", sql.format(self.db_name), regex=".*killed.*"
        )  # ,filter="could not find a \"psql\" to execute")

    def data(self, *path):
        """
        Returns absolute path to resource file PATH
        """

        return os.path.join(self.data_dir, *path)

    def util(self, *path):
        """
        Returns absolute path to util file PATH
        """

        return os.path.join(self.utils_dir, *path)

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
    cli_args = CommsDevDbBuilder.cli_arg_def.parse_args()

    # Deal with defaults
    database = cli_args.database or os.getenv("MYW_COMMS_DEV_DB") or "myw_comms_dev"

    # Run build
    builder = CommsDevDbBuilder(cli_args.trace, database)
    builder.run(cli_args.step, cli_args.skip or [])
