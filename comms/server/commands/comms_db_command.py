###############################################################################
# Command line util for myWorld Comms module operations
###############################################################################
import argparse, warnings, logging, json, os, tempfile
from fnmatch import fnmatch
from contextlib import contextmanager
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
from sqlalchemy import exc

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_tabulation import MywTableFormatter
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from myworldapp.core.server.base.system.myw_localiser import MywLocaliser
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.database.myw_database_server import MywDatabaseServer
from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.core.server.commands.myw_command import MywCommand
from myworldapp.core.server.commands.myw_argparse_help_formatter import (
    MywArgparseHelpFormatter,
)

from myworldapp.modules.comms.server.config.config_loader import ConfigLoader
from myworldapp.modules.comms.server.config.config_validator import ConfigValidator
from myworldapp.modules.comms.server.validation.data_validator import DataValidator
from myworldapp.modules.comms.server.validation.delta_manager import DeltaManager
from myworldapp.modules.comms.server.data_import.data_importer import DataImporter
from myworldapp.modules.comms.server.data_import.data_exporter import DataExporter
from myworldapp.modules.comms.server.data_import.file_feature_package import (
    FeaturePackage,
)
from myworldapp.modules.comms.server.data_import.mapped_feature_package import (
    MappedFeaturePackage,
)
from myworldapp.modules.comms.server.api.data_import_manager import DataImportManager


def define_operation(arg_subparsers, operation, help):
    """
    Helper to add definition for an operation
    """
    op_def = arg_subparsers.add_parser(
        operation, help=help, formatter_class=MywArgparseHelpFormatter
    )
    op_def.set_defaults(operation=operation)
    return op_def


def add_standard_args(op_def):
    """
    Define the 'standard' arguments
    """
    op_def.add_argument(
        "--verbosity", type=int, metavar="LEVEL", default=2, help="Witterage level"
    )
    op_def.add_argument(
        "--summary", type=int, metavar="LEVEL", default=0, help="Summary output level"
    )

    grp = op_def.add_argument_group("connect spec")
    grp.add_argument(
        "--host",
        type=str,
        help="Server on which Postgres is running (default: localhost)",
    )
    grp.add_argument(
        "--port", type=int, help="Port on which server listens (default: from pg_env)"
    )
    grp.add_argument(
        "--username",
        "-U",
        type=str,
        help="Postgres user to connect as (default: from pg_env)",
    )
    grp.add_argument("--password", "-P", type=str, help="Password for Postgres user")


class CommsDBCommand(MywCommand):
    """
    Command line util for performing Comms-specific database operations
    """

    # ==============================================================================
    #                                  SHARED ARGS
    # ==============================================================================

    # Definition of command syntax (gets extended in operation clauses below)
    arg_parser = argparse.ArgumentParser(
        prog="comms_db", formatter_class=MywArgparseHelpFormatter
    )
    arg_parser.add_argument(
        "--version",
        action="version",
        version="%(prog)s " + MywProduct().moduleOf(__file__).version,
    )
    arg_parser.epilog = "Comms module database management utility"

    arg_parser.add_argument("db_name", type=str, help="Name of database")
    arg_subparsers = arg_parser.add_subparsers(
        dest="operation", help="Operation to perform", required=True
    )

    def define_operation(arg_subparsers, operation, help):
        """
        Helper to add definition for an operation
        """
        op_def = arg_subparsers.add_parser(
            operation, help=help, formatter_class=MywArgparseHelpFormatter
        )
        op_def.set_defaults(operation=operation)
        return op_def

    def add_standard_args(op_def):
        """
        Define the 'standard' arguments
        """
        op_def.add_argument(
            "--verbosity", type=int, metavar="LEVEL", default=2, help="Witterage level"
        )
        op_def.add_argument(
            "--summary",
            type=int,
            metavar="LEVEL",
            default=0,
            help="Summary output level",
        )

        grp = op_def.add_argument_group("connect spec")
        grp.add_argument(
            "--host",
            type=str,
            help="Server on which Postgres is running (default: localhost)",
        )
        grp.add_argument(
            "--port",
            type=int,
            help="Port on which server listens (default: from pg_env)",
        )
        grp.add_argument(
            "--username",
            "-U",
            type=str,
            help="Postgres user to connect as (default: from pg_env)",
        )
        grp.add_argument(
            "--password", "-P", type=str, help="Password for Postgres user"
        )

    # ==============================================================================
    #                                  RUNNING
    # ==============================================================================

    def run_method(self, meth):
        """
        Execute method METH

        Subclassed to report database errors neatly and also makes the database connections"""

        self.progress = MywSimpleProgressHandler(self.args.verbosity)

        self.db_server = MywDatabaseServer(
            db_type=None,
            host=self.args.host,
            port=self.args.port,
            username=self.args.username,
            password=self.args.password,
            progress=self.progress,
        )

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=exc.SAWarning)
            warnings.simplefilter("error", category=UnicodeWarning)

            try:
                super().run_method(meth)

            except IOError as cond:
                if self.args.verbosity > 10:
                    raise
                raise MywError("I/O error: " + str(cond))

            except exc.OperationalError as cond:
                if self.args.verbosity > 10:
                    raise
                raise MywError("Database error: " + str(cond))

        if self.args.summary:
            self.progress.print_statistics(self.args.summary)

    def open_db(self):
        """
        Open database
        """

        self._setup_db_logger()

        self.progress(4, "Opening database")

        self.db = self.db_server.open(self.args.db_name)

    def _setup_db_logger(self, level=logging.WARN):
        """
        Configures a logger for postgres with the given level

        This can be useful for seeing things such the output of NOTICE messages"""
        # ENH: Could tie to verbosity level
        logger = logging.getLogger("sqlalchemy.dialects.postgresql")
        logger.addHandler(logging.StreamHandler())
        logger.setLevel(level)

    # ==============================================================================
    #                                OPERATION INSTALL
    # ==============================================================================

    op_def = define_operation(
        arg_subparsers, "install", help="Load network feature definitions"
    )
    op_def.add_argument("model", nargs="+", help="Template model to install")
    op_def.add_argument(
        "--module", default="comms", help="Module containing the template model"
    )
    op_def.add_argument(
        "--lang",
        help="Language pack to take external names from (default: system language)",
    )
    add_standard_args(op_def)

    def operation_install(self):
        """
        Load Comms feature definitions and associated configuration
        """

        self.open_db()

        lang = self.args.lang or self.defaultLanguage()
        module = MywProduct().module(self.args.module, True)

        for model_name in self.args.model:
            model_path = module.file("models", model_name)
            localiser = MywLocaliser(lang, "models", module.path)

            engine = ConfigLoader(self.db, model_path, localiser, self.progress)
            with self.progress.operation("Installing model:", model_name):
                engine.run()

    def defaultLanguage(self):
        """
        The language specified when the database was created
        """
        lang = self.db.setting("core.language")
        return lang.split(",")[0]

    # ==============================================================================
    #                                OPERATION VALIDATE
    # ==============================================================================
    op_def = define_operation(
        arg_subparsers, "validate", help="Check data or configuration"
    )
    op_def.add_argument("what", choices=["config", "data"], help="What to validate")
    op_def.add_argument(
        "category",
        nargs="?",
        choices=[
            "structures",
            "routes",
            "equipment",
            "conduits",
            "conduit_runs",
            "cables",
            "segments",
            "connections",
            "circuits",
            "designs",
            "specs",
            "fiberColors",
            "fiberColorSchemes",
            "line_of_count",
            "*",
        ],
        help="Object types to check",
    )
    op_def.add_argument(
        "--area",
        type=str,
        help="Geographic region to check (long/lat bounds, file or URN)",
    )
    op_def.add_argument("--delta", help="Design to check")
    add_standard_args(op_def)

    def operation_validate(self):
        """
        Check comms configuration
        """

        self.open_db()

        if self.args.what == "config":
            self._validate_config(self.args.category, self.progress.level > 2)
        elif self.args.what == "data":
            self._validate_data(self.args.category, self.args.delta)

    def _validate_config(self, category, include_warnings):
        """
        Check configuration
        """

        # Run check
        self.progress(1, "------------------------------")
        self.progress(1, " Checking Comms Configuration ")
        self.progress(1, "------------------------------")

        engine = ConfigValidator(self.db, self.progress, warn=include_warnings)
        engine.run(category or "*")

    def _validate_data(self, category, delta=None):
        """
        Check data
        """

        if category == "structures":
            self.progress(
                "warning", "Structure objects do not require validation, skipping"
            )
            return

        # Get view
        if delta and not self.db.view().get(delta, error_if_bad=False):
            raise MywError("No such delta:", delta)
        db_view = self.db.view(delta)

        # Get list of categories
        if category == "equipment":
            category = "equips"
        categories = None
        if category:
            categories = [category]

        # Get area to check
        area = self.args.area or self.args.delta
        region_geom = self.parse_polygon_arg("area", area, db_view)

        # Say what we are about to do
        self.progress(1, "------------------------------")
        self.progress(1, " Checking Comms Data")
        self.progress(1, "------------------------------")
        self.progress(1, "Data version:", delta or "Master")

        # Check conflicts
        if delta:
            with self.progress.operation("Checking for conflicts"):
                delta_mgr = DeltaManager(db_view, self.progress)
                conflicts = delta_mgr.conflicts(
                    bounds=region_geom, categories=categories
                )

        # Check integrity
        with self.progress.operation("Checking integrity"):
            engine = DataValidator(db_view, progress=self.progress, polygon=region_geom)
            engine.run(categories)

        # ENH: Check design rules

        # ENH: Show summary as table

    # ==============================================================================
    #                                OPERATION LIST
    # ==============================================================================

    op_def = define_operation(
        arg_subparsers, "list", help="Show contents of a data package"
    )
    op_def.add_argument("file", help="Data package file")
    op_def.add_argument(
        "what",
        choices=["metadata", "features", "fields", "data", "records"],
        nargs="?",
        default="data",
        help="Type of information to list",
    )
    op_def.add_argument(
        "names", nargs="?", default="*", help="Feature types to show info for"
    )
    op_def.add_argument(
        "--format", default="cdif", help="Data package format (see database settings)"
    )
    op_def.add_argument(
        "--files",
        nargs="+",
        help="Data files within package e.g. *.csv (default: from package def)",
    )
    op_def.add_argument(
        "--mappings", help="File containing field mappings (default: from package def)"
    )
    op_def.add_argument("--full", action="store_true", help="Show full details")
    op_def.add_argument(
        "--limit", type=int, metavar="N_RECS", help="Maximum number of records to show"
    )
    op_def.add_argument(
        "--layout",
        type=str,
        choices=MywTableFormatter.layouts,
        default="columns",
        help="Format for ouput",
    )
    add_standard_args(op_def)

    def operation_list(self):
        """
        List content of a data package
        """

        # Open database
        self.open_db()

        with self.unzipIfNecessary(self.args.file) as root_dir:

            # Get package definition (applying overrides)
            pkg_def = self.featurePackageDef(
                self.args.format, self.args.files, self.args.mappings
            )

            # Open data package
            feature_pkg = self.featurePackage(
                root_dir, pkg_def.get("file_specs"), pkg_def.get("mappings")
            )

            # Show contents
            if self.args.what == "metadata":
                self.list_metadata(
                    feature_pkg, self.args.names, self.args.layout, self.args.full
                )
            elif self.args.what == "features":
                self.list_features(
                    feature_pkg, self.args.names, self.args.layout, self.args.full
                )
            elif self.args.what == "fields":
                self.list_fields(
                    feature_pkg, self.args.names, self.args.layout, self.args.full
                )
            elif self.args.what == "data":
                self.list_data(
                    feature_pkg, self.args.names, self.args.layout, self.args.full
                )
            elif self.args.what == "records":
                self.list_records(
                    feature_pkg,
                    self.args.names,
                    self.args.layout,
                    self.args.full,
                    self.args.limit,
                )
            else:
                raise MywInternalError("Bad value:", self.args.what)

    def list_metadata(self, feature_pkg, name_spec, layout, full):
        """
        List feature types in FEATURE_PKG
        """

        # Build data
        rows = []

        for name, value in feature_pkg.metadata.items():
            rows.append({"name": name, "value": value})

        cols = ["name", "value"]

        # Display it
        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_features(self, feature_pkg, name_spec, layout, full):
        """
        List feature types in FEATURE_PKG
        """

        # Get data to display
        rows = []
        for feature_type in feature_pkg.featureTypes(name_spec):
            feature_desc = feature_pkg.featureDesc(feature_type)

            geom_type = None
            if feature_desc.primary_geom_field:
                geom_type = feature_desc.primary_geom_field.type

            row = {
                "name": feature_type,
                "geom_type": geom_type,
                "n_fields": len(feature_desc.fields),
            }

            rows.append(row)

        cols = ["name", "geom_type"]
        if full:
            cols += ["n_fields"]

        # Display it
        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_fields(self, feature_pkg, name_spec, layout, full):
        """
        List feature field meta-data
        """

        # Get data to display
        rows = []
        for feature_type in feature_pkg.featureTypes():
            feature_desc = feature_pkg.featureDesc(feature_type)

            for name, fld_desc in feature_desc.fields.items():
                full_name = feature_type + "." + name

                if fnmatch(full_name, name_spec):
                    row = {
                        "name": full_name,
                        "type": fld_desc.type,
                        "unit": fld_desc.unit,
                    }
                    rows.append(row)

        # Display it
        cols = ["name", "type"]
        if full:
            cols += ["unit"]
        tab_fmtr = MywTableFormatter(*cols)

        self.print_lines(tab_fmtr.format(rows, layout))

    def list_data(self, feature_pkg, name_spec, layout, full):
        """
        List feature counts in FEATURE_PKG
        """

        # Get data to display
        rows = []
        for feature_type in feature_pkg.featureTypes(name_spec):
            row = {
                "feature_type": feature_type,
                "n_recs": feature_pkg.featureCount(feature_type),
            }

            rows.append(row)

        cols = ["feature_type", "n_recs"]  # ENH: If mapped, add source files

        # Display it
        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def list_records(self, feature_pkg, name_spec, layout, full, limit=None):
        """
        List feature data
        """

        if full:
            self._list_records_full(feature_pkg, name_spec, layout, limit)
        else:
            self._list_records_basic(feature_pkg, name_spec, layout, limit)

    def _list_records_basic(self, feature_pkg, name_spec, layout, limit=None):
        """
        List feature data (just title)
        """

        # Get data
        rows = []
        for feature_type in feature_pkg.featureTypes(name_spec):
            n_recs = 0

            for rec in feature_pkg.features(feature_type):
                rec["feature_type"] = feature_type
                rows.append(rec)

                if limit and n_recs == limit:
                    break
                n_recs += 1

        # Show it
        cols = ["feature_type", "id"]
        tab_fmtr = MywTableFormatter(*cols)
        self.print_lines(tab_fmtr.format(rows, layout))

    def _list_records_full(self, feature_pkg, name_spec, layout, limit=None):
        """
        List feature data (all fields)
        """

        for feature_type in feature_pkg.featureTypes(name_spec):

            # Get data
            rows = []
            for rec in feature_pkg.features(feature_type):
                rec["feature_type"] = feature_type
                rows.append(rec)

                if limit and len(rows) == limit:
                    break

            # Determine column names
            feature_desc = feature_pkg.featureDesc(feature_type)
            cols = ["feature_type"]
            for name in feature_desc.fields:
                cols.append(name)

            # Show data
            tab_fmtr = MywTableFormatter(*cols)

            self.print_lines(tab_fmtr.format(rows, layout))
            print()

    # ==============================================================================
    #                                OPERATION IMPORT
    # ==============================================================================

    op_def = define_operation(arg_subparsers, "import", help="Import a data package")
    op_def.add_argument("file", help="Data package to load (a zip file or directory)")
    op_def.add_argument("--delta", help="Design to import data into")
    op_def.add_argument(
        "--format", default="cdif", help="Data package format (see database settings)"
    )
    op_def.add_argument(
        "--coord_system", metavar="NAME", help="Coordinate system of data (epsg name)"
    )
    op_def.add_argument(
        "--engine",
        choices=DataImporter.engines().keys(),
        help="Engine to use (default from package definition)",
    )
    op_def.add_argument(
        "--files",
        nargs="+",
        help="Data files within package e.g. *.csv (default: from package def)",
    )
    op_def.add_argument(
        "--mappings",
        help="File containing package mappings (default from package definition)",
    )
    op_def.add_argument(
        "--reload", action="store_true", help="Clear existing data before loading"
    )
    op_def.add_argument(
        "--force", action="store_true", help="Allow --reload when loading into master"
    )
    add_standard_args(op_def)

    def operation_import(self):
        """
        Import content of a data package
        """

        # Open database
        # ENH: Check delta owner exists?
        self.open_db()
        db_view = self.db.view(self.args.delta)

        # Get package definition (applying overrides)
        pkg_def = self.featurePackageDef(
            self.args.format, self.args.files, self.args.mappings, self.args.engine
        )

        # Get coordinate system override
        coord_sys = None
        if self.args.coord_system:
            coord_sys = MywCoordSystem(self.args.coord_system)

        # Clear existing data (if requested)
        if self.args.reload:

            # Prevent accidental wipe of master data
            if not self.args.delta and not self.args.force:
                raise MywError("Reload would drop all master data")

            # Drop data
            with self.progress.operation("Dropping existing data ..."):
                for feature_type in self.db.dd.featureTypes(
                    "myworld", versioned_only=True
                ):
                    self.progress(3, feature_type)
                    tab = db_view.table(feature_type)
                    tab.truncate()

        # Import data
        with self.unzipIfNecessary(self.args.file) as root_dir:
            feature_pkg = self.featurePackage(
                root_dir, pkg_def.get("file_specs"), pkg_def.get("mappings")
            )

            name = pkg_def["engine"]
            engine = DataImporter.engineFor(
                name,
                db_view,
                feature_pkg,
                options=pkg_def.get("options", {}),
                coord_sys=coord_sys,
                progress=self.progress,
            )

            self.progress(1, "Import engine:", name)
            engine.run()

        self.db.commit()

    # ==============================================================================
    #                                OPERATION EXPORT
    # ==============================================================================

    op_def = define_operation(
        arg_subparsers, "export", help="Dump data as a data package"
    )
    op_def.add_argument("file", help="Data package to create (a zip file or directory)")
    op_def.add_argument(
        "--area",
        type=str,
        help="Geographic region to dump (long/lat bounds, file or URN)",
    )
    op_def.add_argument("--delta", help="Design to export")
    op_def.add_argument(
        "--overwrite",
        action="store_true",
        help="Replace existing package (if there is one)",
    )
    add_standard_args(op_def)

    def operation_export(self):
        """
        Export content of a data package
        """

        # Open database
        self.open_db()
        db_view = self.db.view(self.args.delta)

        # Check for target already exists
        if os.path.exists(self.args.file) and not self.args.overwrite:
            raise MywError("File already exists:", self.args.file)

        # Determine area to export
        area = self.args.area or self.args.delta
        region_geom = self.parse_polygon_arg("area", area, db_view)

        # Export data
        with self.zipIfNecessary(self.args.file) as path:
            engine = DataExporter(
                db_view, path, region=region_geom, progress=self.progress
            )
            engine.run()

    # ==============================================================================
    #                                OPERATION RUN TASK
    # ==============================================================================

    op_def = define_operation(arg_subparsers, "manage_tasks", help="Manage tasks")
    op_def.add_argument(
        "action",
        choices=["run", "delete", "list", "cancel"],
        help="Action on tasks. Delete action removes all tasks that are not WAITING or WORKING",
    )
    op_def.add_argument("task_id", type=str, help="Task ID", default=None, nargs="?")
    op_def.add_argument(
        "--layout",
        type=str,
        choices=MywTableFormatter.layouts,
        default="columns",
        help="Format for ouput",
    )
    # Results and log fields can be very large. This will allow user to output full value to CSV for example.
    op_def.add_argument(
        "--max_len",
        type=int,
        default=1000,
        help="Maximum line length for records or csv layout.",
    )
    add_standard_args(op_def)

    def operation_manage_tasks(self):

        self.open_db()

        # Import after db open to setup Session correctly
        from myworldapp.modules.comms.server.task_manager.task_worker import TaskWorker

        if self.args.action == "run":

            if not self.args.task_id:
                raise MywError("Task ID is required for this action.")

            worker = TaskWorker(self.db, self.args.task_id, progress=self.progress)
            worker.run()
        elif self.args.action == "list":
            worker = TaskWorker(self.db, self.args.task_id, progress=self.progress)
            rows = worker.all_tasks()

            if self.args.layout in ["records", "csv"]:
                cols = [
                    "id",
                    "status",
                    "error_msg",
                    "log",
                    "result",
                    "args",
                    "func_name",
                    "exc_info",
                ]
                max_len = self.args.max_len
            else:
                cols = ["id", "status", "error_msg", "log", "result"]
                max_len = None

            tab_fmtr = MywTableFormatter(*cols)
            print()
            self.print_lines(
                tab_fmtr.format(rows, self.args.layout, max_val_len=max_len)
            )
        elif self.args.action == "delete":
            # Deletes non-active tasks
            worker = TaskWorker(self.db, self.args.task_id, progress=self.progress)
            ndels = worker.delete_tasks()
            print(f"Deleted {ndels} task records.")
        elif self.args.action == "cancel":

            if not self.args.task_id:
                raise MywError("Task ID is required for this action.")

            worker = TaskWorker(self.db, self.args.task_id, progress=self.progress)
            worker.cancel()

    # ==============================================================================
    #                                HELPERS
    # ==============================================================================

    def parse_polygon_arg(self, arg_name, arg_str, db_view):
        """
        Returns value of polygon specifier ARG_STR to a Shapely polygon

        ARG_STR is one of:
          (min_x,min_y):(max_x,max_y)   # Bounding box
          <file_path>.json              # File containing a JSON list of coords
          <feature_type>/<id>           # URN of a polygon feature

        Returns a MywPolygon (or none). Throws MywError if parse fails"""

        # ENH: Add support for urn in Core and remove this

        # Try URN (safe because super identifies file names by '.json')
        if arg_str and MywReference.parseUrn(arg_str):
            ftr = db_view.get(arg_str)
            if not ftr:
                raise MywError(arg_name, ":", "No such feature:", arg_str)

            return ftr.primaryGeometry()  # ENH: Check is polygon

        # Try the rest
        return super().parse_polygon_arg(arg_name, arg_str)

    def featurePackageDef(
        self, format, file_specs=None, mappings_file=None, engine=None
    ):
        """
        The database definition for data package format FORMAT
        """
        # ENH: Implement ImportFormatDescriptor

        # Get definition from DB
        mgr = DataImportManager(self.db, self.progress)
        pkg_def = mgr.importFormatDef(format)

        # Override file type
        if file_specs:
            pkg_def["file_specs"] = file_specs

        # Override mappings
        if mappings_file:
            try:
                with open(mappings_file) as strm:
                    pkg_def["mappings"] = json.load(strm)
            except Exception as cond:
                raise MywError("Error reading mappings file:", mappings_file, ":", cond)

        # Override engine
        if engine:
            pkg_def["engine"] = engine

        self.progress(6, "Package definition:", pkg_def)

        return pkg_def

    def featurePackage(self, data_path, file_specs, mappings):
        """
        Build feature package, applying mappings (if requested)
        """

        file_type_config = self.db.setting("mywcom.import_file_types") or {}

        # Build package
        feature_pkg = FeaturePackage.newFor(
            file_type_config, data_path, file_specs=file_specs, progress=self.progress
        )

        # Apply mappings
        if mappings:
            feature_pkg = MappedFeaturePackage(feature_pkg, mappings)

        return feature_pkg

    @contextmanager
    def unzipIfNecessary(self, file_name):
        """
        Unzip feature package FILE_NAME to a temporary directory (if necessary)

        Yields path to directory"""

        # ENH: Support tar and 7zip
        # ENH: Implement ZippedFeaturePackage to read zip direct and get rid of this

        base_name = os.path.basename(file_name)
        zipped = base_name.endswith(".zip")  # ENH: allow override with arg

        if zipped:
            with ZipFile(file_name, "r") as zip_file:
                with tempfile.TemporaryDirectory("w") as temp_dir:

                    self.progress(3, "Unzipping:", base_name, "...")
                    self.progress(5, "Unzipping to:", temp_dir)

                    zip_file.extractall(temp_dir)  # ENH: Check for bad paths

                    yield temp_dir
        else:
            yield file_name

    @contextmanager
    def zipIfNecessary(self, file_name):
        """
        Handling zipping of output (if necessary)

        Yields path of directory to write to"""

        # ENH: Support tar and 7zip

        base_name = os.path.basename(file_name)
        zipped = "." in base_name  # ENH: allow override with arg

        if zipped:
            with tempfile.TemporaryDirectory("w") as temp_dir:
                yield temp_dir
                self.build_zip(file_name, temp_dir)
        else:
            yield file_name

    def build_zip(self, zip_file_name, src_dir):
        """
        Add files from SRC_DIR to ZIP_FILE
        """

        with self.progress.operation("Building zip:", zip_file_name):
            self.progress(4, "Find files under:", src_dir)

            with ZipFile(zip_file_name, "w", ZIP_DEFLATED) as zip_file:
                for dir, dir_names, dir_file_names in os.walk(src_dir):

                    for file_name in dir_file_names:
                        file_path = os.path.join(dir, file_name)
                        self.progress(4, "Processing file:", file_path)

                        zip_path = os.path.relpath(file_path, src_dir)
                        info = ZipInfo.from_file(file_path, zip_path)
                        self.progress(1, "Adding file:", zip_path)

                        with open(file_path, "rb") as contents:
                            zip_file.writestr(info, contents.read())
