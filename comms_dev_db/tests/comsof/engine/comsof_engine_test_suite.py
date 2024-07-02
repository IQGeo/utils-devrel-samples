# Copyright: IQGeo Limited 2010-2022

import os, urllib.parse, urllib.error, json
from copy import copy
from zipfile import ZipFile

from sqlalchemy import create_engine

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.db.myw_postgres_db_server import MywPostgresDbServer
from myworldapp.core.server.base.system.myw_product import MywProduct

from myworldapp.modules.dev_tools.server.test_framework.myw_test_suite import MywTestSuite
from myworldapp.modules.dev_tools.server.test_framework.myw_memory_database import MywMemoryDatabase

from myworldapp.modules.comsof.server.sync.comsof_manager import ComsofManager

# Enable use of cdiff within container
# ENH: Do this somewhere further up
MywTestSuite.APP_LOCATIONS["cdiff"] = {"Linux": ["cdiff"]}


class ComsofEngineTestSuite(MywTestSuite):
    ##
    ## Functional tests for command line tool etc
    ##

    # Class constants
    test_names = [
        "import_tiny",
        "import_small",
        "import_maryland",
        "import_gilbert_extract",
        "import_alpha_poc",
        "import_feeder",
        "import_arbury_cdif",
        "import_chesterfield_cdif",
        "ws_tool_list",
        "ws_tool_initialise",
        # 'ws_tool_initialise_from', # Requires local install of comsof product
        "ws_tool_populate",
        # 'ws_tool_run_local',       # Requires local install of comsof product
        "ws_tool_run_cloud",
        "ws_tool_acquire_licence",
        "ws_tool_import",
        "ws_tool_import_broken",
        "ws_tool_clear",
        "ws_tool_accept",
        "ws_tool_rec",
        "ws_tool_execute",
    ]

    readonly_tests = [
        "import_tiny",
        "import_small",
        "import_maryland",
        "import_gilbert_extract",
        "import_alpha_poc",
        "ws_tool_list",
        "ws_tool_initialise",
        "ws_tool_initialise_from",
        "ws_tool_populate",
        "ws_tool_run_local",
        "ws_tool_run_cloud",
        "ws_tool_acquire_licence",
    ]

    default_database = os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"

    def __init__(self, db_session, cli_args):
        ##
        ## Construct test suite
        ##
        ## Optional RESULT_SET gives database location and key for
        ## recording test results.

        super().__init__(cli_args, db_session=db_session)

        # Init slots
        self.product = MywProduct()

        # Set location for reference results
        self_dir = os.path.dirname(__file__)
        self.resource_dir = os.path.join(self_dir, "resources")
        self.mgr = ComsofManager(self.db(), self.progress)

        # Set args for myw_db command
        self.db_name = self.default_database
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
        self.output_mappings[self.mgr.templates_dir] = "<templates_dir>"
        self.output_mappings[self.product.root_dir] = "<product_dir>"
        self.output_mappings[db_conn_spec] = "<conn_spec>"
        self.output_mappings[str(url)] = "<conn_spec>"
        self.output_mappings[self.default_database] = "<database>"
        self.output_mappings[self._temp_dir] = "<temp_dir>"
        self.output_mappings["\\"] = "/"

        self.output_mappings2[r'workspace \d+']    = 'workspace <id>'
        self.output_mappings2[r'calculation \d+']  = 'calculation <id>'
        self.output_mappings2[r'request \d+']      = 'request <id>'
        self.output_mappings2[r'licenses/\d+.lic'] = 'licenses/<id>.lic'
        self.output_mappings2[r'= \d+ sec']        = '= <n> sec'
        self.output_mappings2[r'@localhost:\d+']   = '@localhost:<port>'
        self.output_mappings2[r'/tmp/tmp[\w\d]+/'] = '/tmp/<tmp_dir>/'

        # Set environment variables for ws_tool tests
        os.environ["COMSOF_PRODUCT"] = "SA_DESIGNER"
        os.environ["COMSOF_VERSION"] = "23.2.1.60"
        os.environ["COMSOF_CLOUD_PROJECT"] = "IQGeo Integration"

    def ref_file_path(self, test_name):
        ##
        ## Path of reference result for TEST_NAME
        ##
        ## Subclassed to support db-specific results

        os_type = self.os_type

        file_name = test_name
        file_name += ".txt"

        return self.resource_file("test_results", file_name)

    def db(self):
        ##
        ## Dev database (a MywDatabase)
        ##

        from myworldapp.core.server.database.myw_database import MywDatabase
        from myworldapp.core.server.base.db.globals import Session

        return MywDatabase(Session)

    def data(self, *path):
        ##
        ## Full path to test data resource file PATH
        ##

        return self.resource_file("test_data", *path)

    @property
    def orig_db(self):
        ##
        ## Initial state of database (a myw_memory_database)
        ##

        if not self._orig_db:
            self._orig_db = MywMemoryDatabase(self.db_session, True, progress=self.progress)

        return self._orig_db

    def setup(self, name):
        ##
        ## Called before a test is run
        ##

        super().setup(name)

        # Save initial state (for differencing)
        if not name in self.readonly_tests:
            self.prev_db = self.orig_db

    def teardown(self, name):
        ##
        ## Called after a test is run
        ##

        super().teardown(name)

        # Restore initial database state
        if not name in self.readonly_tests:
            self.db_session.rollback()
            self.orig_db.restore_to(self.db_session)

    def show_database_changes(self, result_id, sort=False, schema_filter="d*"):
        ##
        ## Show records changed since last call
        ##

        self.show_db_changes(
            result_id, self.db_session, self.prev_db, sort=sort, schema_filter=schema_filter
        )
        self.prev_db = MywMemoryDatabase(self.db_session)

    def create_plain_db(self):
        ##
        ## Create an empty database with NM template model (but not Comsof data model)
        ##
        # TODO: Move import tests to NM product

        module = self.product.module("comsof")

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
            "ftth"
        )
        self.run_helper(
            "myw_db", self.db_name, "load", self.resource_file("test_data", "*.settings")
        )

    # ==============================================================================
    #                                   IMPORT TESTS
    # ==============================================================================

    def test_import_tiny(self):
        ##
        ## Exercise import for Dev DB workspace 4 (has co-incident structures)
        ##

        self._test_import('tiny','geopackage','v22.1')

    def test_import_small(self):
        ##
        ## Exercise import for small test dataset (has slacks but not connection considation)
        ##

        self._test_import('small','shapefile','v22.1',26985)

    def test_import_maryland(self):
        ##
        ## Exercise import for maryland test dataset
        ##

        self._test_import('maryland','geopackage','v22.1')

    def test_import_gilbert_extract(self):
        ##
        ## Exercise import of cut extract with fiber taps
        ##

        self._test_import('gilbert_extract','geopackage','v22.2',6405,'comsof_gilbert')

    def test_import_alpha_poc(self):
        ##
        ## Exercise import for alpha_poc dataset
        ##

        self._test_import('alpha_poc','shapefile','v22.1',26749)

    def test_import_feeder(self):
        ##
        ## Exercise import for maryland test dataset
        ##

        self._test_import('alpha_poc','shapefile','v22.1',26749,format='comsof_feeder')

    def _test_import(self,ws_name,ws_type,ws_version,srid=None,format='comsof',delta=None):
        ##
        ## Exercise import for workspace WS_NAME
        ##
        ## Creates a separate database

        zip_file = ".".join([ws_name,ws_type,ws_version,'zip'])
        self.progress(0,"Loading workspace",zip_file)
        
        data_path = self.data('workspaces',zip_file)

        self.db_name = "{}_{}".format('comsof_test',ws_name)

        self.create_plain_db()

        opts = [f"--format={format}"]
        if srid:
            opts.append("--coord_sys={}".format(srid))
        if delta:
            opts.append("--delta={}".format(delta))

        self.test_command("comms_db", self.db_name, "import", data_path, *opts)

        self.show_output_from("myw_db", self.db_name, "list", "data")

 
    # ==============================================================================
    #                                   CDIF IMPORT TESTS
    # ==============================================================================
 
    def test_import_arbury_cdif(self):
        ##
        ## Exercise import for arbury test area CDIF (common conduit with existing hub)
        ##

        self._test_import_cdif('comsof_design/arbury','arbury','geopackage','v23.2')

        
    def test_import_chesterfield_cdif(self):
        ##
        ## Exercise import for chesterfield CDIF (blown fiber with conduit reuse)
        ##

        self._test_import_cdif('comsof_design/chesterfield','chesterfield','geopackage','v23.2')

        
    def _test_import_cdif(self,delta,ws_name,ws_type,ws_version,srid=None,format='comsof'):
        ##
        ## Exercise import for workspace WS_NAME
        ##

        zip_file = ".".join([ws_name,ws_type,ws_version,'zip'])
        self.progress(0,"Loading workspace",zip_file)
        
        data_path = self.data('workspaces',zip_file)

        opts = [f"--format={format}"]
        if srid:
            opts.append("--coord_sys={}".format(srid))
        if delta:
            opts.append("--delta={}".format(delta))

        self.test_command("comms_db", self.db_name, "import", data_path, *opts)

        self.show_output_from("myw_db", self.db_name, "list", "deltas", delta, "--layout=records", "--full")
        
       # ENH: Show validation results

    # ==============================================================================
    #                                    TOOL TESTS
    # ==============================================================================

    def test_ws_tool_list(self):
        ##
        ## Exercise workspace listing
        ##

        db = self.db()
        ws_dir = self.data("test_workspace")

        # Run commands
        self._test_ws_tool(ws_dir, "list", "metadata")
        self._test_ws_tool(ws_dir, "list", "table_metadata", "*stru*")
        self._test_ws_tool(ws_dir, "list", "cs_catalogue", "3*", "--layout=records")
        self._test_ws_tool(ws_dir, "list", "features")
        self._test_ws_tool(ws_dir, "list", "fields", "*.avoid*")
        self._test_ws_tool(ws_dir, "list", "fields", "OUT_Dist*.loc*", "--layout=csv", "--raw")
        self._test_ws_tool(ws_dir, "list", "data", "--layout=keys")
        self._test_ws_tool(ws_dir, "list", "records", "*Acc*", "--limit=5")

    def test_ws_tool_initialise(self):
        ##
        ## Exercise workspace creation
        ##

        db = self.db()
        area_urn = "service_area/SP"

        # Set target workspace
        root_dir = self.temp_file("ws_tool_initialise")
        self.progress(0, "Workspace", root_dir)

        # Test auto-determine CS
        self._test_ws_tool(root_dir, "initialise", "--area", area_urn, "--overwrite")
        self._show_workspace(root_dir, ["data"])

        # Set explicit coord system
        self._test_ws_tool(
            root_dir,
            "initialise",
            "--area",
            area_urn,
            "--version=23.2.1.60",
            "--overwrite",
            "--coord_system=27700",
        )
        self._show_workspace(root_dir, ["metadata"])

    def test_ws_tool_initialise_from(self):
        ##
        ## Exercise workspace creation
        ##

        db = self.db()
        area_urn = "service_area/SP"

        # Set target workspace
        root_dir = self.temp_file("ws_tool_initialise_from")
        self.progress(0, "Workspace", root_dir)

        # Set source workspace (which may get cloud histpry file updated)
        src_dir = self.temp_workspace("test_ws_tool_initialise_from_src", "test_workspace")

        # Do test
        self._test_ws_tool(
            root_dir, "initialise", "--from", src_dir, "--area", area_urn, "--overwrite"
        )
        self._show_workspace(root_dir, ["data"])

    def test_ws_tool_populate(self):
        ##
        ## Exercise populate
        ##

        # Get database
        db = self.db()

        # Setup test data
        root_dir = self.temp_workspace("test_ws_tool_populate", "test_workspace")

        # Test populate
        self._test_ws_tool(root_dir,'populate','--delta=comsof_design/kings_hedges','--mappings=comsof.populate_config.addresses')
        self._show_workspace(root_dir,['data'])

    def test_ws_tool_run_local(self):
        ##
        ## Exercise run using local install
        ##

        # Get database
        db = self.db()

        # Setup test data
        root_dir = self.temp_workspace("test_ws_tool_run_local", "test_workspace")

        # Test operation
        self._test_ws_tool(root_dir, "run", "/streetDoubler", "/createTransitions")
        self._show_workspace(root_dir, ["data"])

    def test_ws_tool_run_cloud(self):
        ##
        ## Exercise run in cloud
        ##

        # Get database
        db = self.db()

        # Setup test data
        root_dir = self.temp_workspace("test_ws_tool_run_cloud", "test_workspace")

        # Test operation
        self._test_ws_tool(
            root_dir,
            "run",
            "/streetDoubler",
            "/createTransitions",
            "--engine=cloud",
            "--verbosity=1",
        )
        self._show_workspace(root_dir, ["data"])

    def test_ws_tool_acquire_licence(self):
        ##
        ## Exercise acquire licence
        ##

        # Get database
        db = self.db()

        # Setup test data
        root_dir = self.temp_workspace("test_ws_tool_acquire_licence", "test_workspace")

        # Test operation
        self._test_ws_tool(
            root_dir,
            "acquire_licence",
            "--company=IQGeo Integration",
            "--project=DESIGN Mode",
            "--verbosity=1",
        )

        # TODO: Show directory tree has licence file

    def test_ws_tool_import(self):
        ##
        ## Exercise import
        ##

        # Get database
        db = self.db()

        # Install 23.2.1 mappings
        self.progress(2, "Loading 23.2.1 mappings")
        self.run_helper("myw_db", self.db_name, "load", self.data("*.settings"), "--update")

        # Get source workspace
        root_dir = self.data('test_workspace')

        # Test operation
        self._test_ws_tool(root_dir,'import','--delta=comsof_design/arbury','--mappings=mywcom.import_config.comsof','--reload')
        self.show_database_changes('CHANGES')

    def test_ws_tool_import_broken(self):
        ##
        ## Exercise import on 'broken' data
        ##

        # Setup
        root_dir = self.data('test_workspace')

        # Install 23.2.1 mappings
        self.progress(2, "Loading 23.2.1 mappings")
        self.run_helper("myw_db", self.db_name, "load", self.data("*.settings"), "--update")

        self.subtest('MISSING BUILDING')
        self._test_ws_tool(root_dir,'import','--delta=comsof_design/kings_hedges','--mappings=mywcom.import_config.comsof','--reload')
        
        
    def test_ws_tool_clear(self):
        ##
        ## Exercise clear auto-created objects
        ##

        # Get database
        db = self.db()

        # Get source workspace
        root_dir = self.data('workspaces','test')

        # Test operation
        self._test_ws_tool(root_dir,'clear','--delta=comsof_design/kings_hedges')
        self.show_database_changes('CHANGES')
        
        
    def test_ws_tool_accept(self):
        ##
        ## Exercise accept auto-created objects
        ##

        # Get database
        db = self.db()

        # Get source workspace
        root_dir = self.data('workspaces','test')

        # Test operation
        self._test_ws_tool(root_dir,'accept','--delta=comsof_design/kings_hedges')
        self.show_database_changes('CHANGES')

    def test_ws_tool_rec(self):
        ##
        ## Exercise tool on a workspace record
        ##

        db = self.db()
        ws_id = "2"

        self._test_ws_tool(ws_id, "initialise", "--overwrite")
        self._test_ws_tool(ws_id, "populate")
        self._test_ws_tool(
            ws_id,
            "run",
            "/streetDoubler",
            "/createBuildingTrenches",
            "/createTransitions",
            "/processInput",
            "--verbosity=1")
        self._test_ws_tool(ws_id, "acquire_licence")
        self._test_ws_tool(ws_id, "run", "/calculate", "--verbosity=1")
        self._test_ws_tool(ws_id, "import", "--verbosity=1")

        # ENH: Show changes to workspace record

    def test_ws_tool_execute(self):
        ##
        ## Exercise run batch file
        ##

        db = self.db()
        ws_id = "2"
        ctrl_file = self.data("execute.ctrl")

        self._test_ws_tool(ws_id, "execute", ctrl_file)

        self.show_database_changes("AFTER EXECUTE")

    def _test_ws_tool(self, ws, op, *args):
        ##
        ## Run the workspace management command line tool (showing output)
        ##

        # Run command
        cmd = ["comsof_ws", self.default_database, ws, op, *args]
        self.test_command(*cmd)

    def _show_workspace(self, ws_dir, whats):
        ##
        ## Run the workspace management command line tool (showing output)
        ##

        # Show what we created
        for what in whats:
            cmd = ["comsof_ws", self.default_database, ws_dir, "list", what]
            self.show_output_from(*cmd)

    # ==============================================================================
    #                                   HELPERS
    # ==============================================================================

    def run_helper(self, *cmd):
        ##
        ## Run a myWorld utility (discarding output)
        ##

        if cmd[0] == "myw_db" or "comms_db":
            verbosity = self.trace_level - 2
            if verbosity > 1:
                cmd = list(cmd) + ["--verbosity", str(verbosity)]

        return self.run_subprocess(cmd, self.db_args)

    def test_command(self, *cmd, **kwargs):
        ##
        ## Run a shell command, sending command and output to result stream
        ##

        self.show("COMMAND: ", " ".join(cmd))
        self.show_output_from(*cmd, **kwargs)

    def show_output_from(self, *cmd, **kwargs):
        ##
        ## Run a shell command, sending output to result stream
        ##
        ## KWARGS is a dict with optional key 'env'

        env = kwargs.get("env", {})

        super().show_output_from(cmd, self.db_args, env=env)

    def show_files_under(self, dir, file_spec="*", max_lines=None):
        ##
        ## Show the contents of all files under DIR (in repeatable order)
        ##

        for path in self.walk_dir_tree(dir):
            self.show_file(path)

    def temp_workspace(self, target_name, ws_name):
        ##
        ## Populate temporary workspace TARGET_NAME from resource workspace WS_NAME
        ##
        
        src_dir  = self.data(ws_name)
        root_dir = self.temp_file(target_name)
        self.os_engine.copy_tree(src_dir, root_dir)
        self.progress(0, "Workspace", root_dir)

        return root_dir

    def unzip_tree(self, zip_path, target_dir):
        ##
        ## Extract ZIP_FILE to TARGET_DIR
        ##

        self.progress(4, "unzipping", zip_path, "to", target_dir)

        self.os_engine.remove_if_exists(target_dir)

        with ZipFile(zip_path, "r") as zip_file:
            zip_file.extractall(target_dir)
