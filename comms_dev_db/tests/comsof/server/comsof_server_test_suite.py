# Copyright:Ubisense Limited 2010-2017
import os, shutil, datetime, glob, base64

from collections import OrderedDict
import json

from sqlalchemy import create_engine

# This is needed just for these tests. For normal server operation the DLL is loaded at the right
# time. See PLAT-7496 for details.
from myworldapp.core.server.startup.myw_python_mods import injectsqlite3dll

injectsqlite3dll()

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.geom.myw_polygon import MywPolygon
from myworldapp.core.server.base.db.myw_postgres_db_server import MywPostgresDbServer

from myworldapp.modules.dev_tools.server.test_framework.myw_memory_database import (
    MywMemoryDatabase,
)
from myworldapp.modules.dev_tools.server.test_framework.myw_controller_test_suite import (
    MywControllerTestSuite,
    MywControllerTestJsonSorter,
)
from myworldapp.modules.dev_tools.server.test_framework.myw_test_suite import (
    MywTestJsonSorter,
)

from myworldapp.modules.comsof.server.sync.comsof_manager import ComsofManager

# Enable use of cdiff within container
# ENH: Do this somewhere further up
MywControllerTestSuite.APP_LOCATIONS['cdiff'] = { 'Linux': ['cdiff'] }


class ComsofServerTestSuite(MywControllerTestSuite):
    ##
    ## Functional tests for Comsof controller
    ##

    default_database = os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"
    uses_database = True

    # Class constants
    test_names = [
        "initialise",
        "populate",
        "run",
        "acquire_licence",
        "import",
        "execute",
        "clear",
        "accept",
        "features",
        "transaction",
        "view_rules",
        "file_status",
        "file_download",
        "workspace_download",
    ]

    # Just for speed
    readonly_tests = [
        "features",
        "view_rules",
        "file_status",
        "file_download",
        "workspace_download",
    ]

    @classmethod
    def get_cli_args(cls, cli_arg_def):
        super().get_cli_args(cli_arg_def)

    def __init__(self, db_session, cli_args):
        ##
        ## Init slots of self
        ##

        ini_file = os.getenv("COMSOF_INI_FILE") or "myworldapp.ini"

        # for comms devcontainer
        self.APP_LOCATIONS["cdiff"] = {"Linux": ["cdiff"]}

        super().__init__(db_session=db_session, cli_args=cli_args, ini_file=ini_file)

        self.db_session = db_session

        self.db_engine = self.db_session.bind
        self.http_opener = None
        self.base_url = ""  # For paster
        self._orig_db = None  # Init lazily

        # Set location for reference results
        self_dir = os.path.dirname(__file__)
        self.resource_dir = os.path.normcase(
            os.path.join(self_dir, "resources", "server_tests")
        )

        # Set location of test data
        self_module = MywProduct().moduleOf(__file__)
        self.test_data_dir = self_module.file("data")

        # Get location of workspaces
        self.workspaces_dir = self.db().setting("comsof.workspaces")
        self.templates_dir = self.db().setting("comsof.templates")

        # Set temp dirs
        self._temp_dir = self.temp_dir(self.db_dialect)

        # Get DB connect spec (for making results machine independent)
        svr = MywPostgresDbServer(
            cli_args.host, cli_args.port, cli_args.username, cli_args.password
        )
        db_conn_spec = svr.connectSpecFor(self.default_database)
        db_engine = create_engine(db_conn_spec)
        url = MywPostgresDbServer.urlFor(db_engine, hideCredentials=True)

        # Set strings to exclude from results
        self.output_mappings["\\\\\\\\"] = "\\"
        self.output_mappings["\\\\"] = "\\"
        self.output_mappings["\\"] = "/"
        self.output_mappings[self.workspaces_dir] = "<workspaces>"
        self.output_mappings[self.templates_dir] = "<templates>"
        self.output_mappings[db_conn_spec] = "<conn_spec>"
        self.output_mappings[str(url)] = "<conn_spec>"
        self.output_mappings[self.default_database] = "<database>"
        self.output_mappings2[r'"date": ".*"'] = '"date": "<date>"'
        self.output_mappings2[r"\[\d\d:\d\d:\d\d\]"] = "[<time>]"
        
        self.output_mappings2[r"request \d+"] = "request <req_no>"
        self.output_mappings2[r"workspace \d+"] = "workspace <workspace_no>"
        self.output_mappings2[r"calculation \d+"] = "calculation <calc_no>"
        
        self.output_mappings2[r"\d+\.lic"] = "<licence_no>.lic"
        self.output_mappings2[r'webui.*"'] = 'webui/<webui_params>"'
        self.output_mappings2[r'token": ".*"'] = 'token": <token>"'
        self.output_mappings2[r'upload_id": ".*"'] = 'upload_id": <upload_id>"'
        self.output_mappings2[r"upload_id=.*"] = "upload_id=<upload_id>"

    def db(self, session=Session, *args, **kwargs):
        ##
        ## The test database
        ##

        from myworldapp.core.server.database.myw_database import MywDatabase

        return MywDatabase(session, *args, **kwargs)

    @property
    def orig_db(self):
        ##
        ## Initial state of database (a myw_memory_database)
        ##

        if not self._orig_db:
            self._orig_db = MywMemoryDatabase(
                self.db_session, True, progress=self.progress
            )

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

        # Remove mako template files
        file_pattern = os.path.join(
            os.path.dirname(__file__),
            "..",
            "..",
            "..",
            "..",
            "..",
            "data",
            "templates",
            "*.html.py*",
        )
        for f in glob.glob(file_pattern):
            try:
                os.remove(f)
            except OSError as e:
                self.progress("error", str(e))

    def show_database_changes(self, result_id, sort=False, table_filter="*"):
        ##
        ## Show records changed since last call
        ##

        self.show_db_changes(
            result_id,
            self.db_session,
            self.prev_db,
            sort=sort,
            table_filter=table_filter,
            schema_filter="d*",
        )

        self.prev_db = MywMemoryDatabase(self.db_session)

    def _init_workspace(self, id, load_settings=False):
        ##
        ## Populate workspace ID with test data
        ##

        db = self.db()
        mgr = ComsofManager(db)

        src_dir = self.resource_file("test_data", "small_workspace")
        root_dir = os.path.join(mgr.workspaces_dir, str(id), "workspace")
        self.os_engine.copy_tree(src_dir, root_dir)
        self.progress(0, "Workspace", root_dir)

        # Install 23.2.1 mappings
        # ENH: Make more explicit .. or load as separate set in DB
        if load_settings:
            self.progress(2, "Loading 23.2.1 mappings")
            db.data_loader.loadFiles(
                self.resource_file("test_data"), "*.settings", update=True
            )

        return root_dir

    # ==============================================================================
    #                                    BULK OP TESTS
    # ==============================================================================

    def test_initialise(self):
        ##
        ## Exercise workspace tree initialisation
        ##

        self.login()

        self._execute(
            "comsof_design/arbury", 1, ["initialise", "initialised", {"overwrite": True}]
        )

        self.show_database_changes("AFTER INITIALISE")

    def test_populate(self):
        ##
        ## Exercise populate to workspace
        ##

        self.login()

        ws_dir = self._init_workspace(1)
        self._execute("comsof_design/arbury", 2, ["populate", "populated", {}])
        self.show_database_changes("AFTER POPULATE 2")

    def test_run(self):
        ##
        ## Exercise run operation
        ##

        self.login()

        # Set up test data
        ws_dir = self._init_workspace(1)

        # Do test
        comsofOps = ["/streetDoubler", "/createTransitions"]
        self._execute(
            "comsof_design/arbury",
            1,
            ["preprocess", "preprocessed", {"operations": comsofOps}],
            log_level=1
        )

        self.show_database_changes("AFTER RUN")

    def test_acquire_licence(self):
        ##
        ## Exercise run operation
        ##

        self.login()

        # Set up test data
        ws_dir = self._init_workspace(1)

        # Do test
        self._execute("comsof_design/arbury", 1, ["acquire_licence", "licenced", {}])

        self.show_database_changes("AFTER ACQUIRE LICENCE")

    def test_import(self):
        ##
        ## Exercise import from workspace
        ##

        self.login()

        ws_dir = self._init_workspace(1, True)

        self._execute("comsof_design/kings_hedges", 1, ["import", "imported", {}])

        self.show_database_changes("AFTER IMPORT", table_filter="comsof*")

    def test_execute(self):
        ##
        ## Exercise execute multiple workspace operations
        ##

        self.login()

        preprocess_ops = [
            "/createDemandPoints",
            "/streetDoubler",
            "/createBuildingTrenches",
        ]

        self._execute(
            "comsof_design/arbury",
            2,
            ["initialise", "initialise", {"overwrite": True}],
            ["populate", "populated", {}],
            ["preprocess", "preprocessed", {"operations": preprocess_ops}],
            log_level=1
        )

        self.show_database_changes("AFTER EXECUTE")

    def _execute(self, delta, ws_id, *ops, log_level=None):
        ##
        ## Run a bulk op
        ##

        url = f"/modules/comsof/workspace/{ws_id}/execute?delta={delta}"

        if log_level:
            url += f'&log_level={log_level}'

        return self._test_json_post_request(
            url, ops, response_format="json", show_response=True
        )

    def test_clear(self):
        ##
        ## Exercise remove auto-created onjects from workspace owner
        ##

        self.login()

        url = f"/modules/comsof/delta/comsof_design/kings_hedges/clear"

        self._test_json_post_request(
            url, {}, response_format="json", show_response=True
        )

        self.show_database_changes("AFTER CLEAR")

    def test_accept(self):
        ##
        ## Exercise accept auto-created onjects in workspace owner
        ##

        self.login()

        url = f"/modules/comsof/delta/comsof_design/kings_hedges/accept"

        self._test_json_post_request(
            url, {}, response_format="json", show_response=True
        )

        self.show_database_changes("AFTER ACCEPT")

    # ==============================================================================
    #                                    OTHER TESTS
    # ==============================================================================

    def test_features(self):
        ##
        ## Exercise feature retrevial
        ##

        self.login()

        # Set up test data
        ws_dir = self._init_workspace(1)

        # Do test
        self._test_get_request(
            "/modules/comsof/workspace/1/feature/OUT_AccessStructures",
            response_format="json",
            show_response=True,
        )

    def test_transaction(self):
        ##
        ## Test record update etc
        ##

        self.login()

        # Set up test data
        ws_dir = self._init_workspace(1)

        # ENH: Implement get by ID
        data = self._test_get_request(
            "/modules/comsof/workspace/1/feature/OUT_AccessStructures",
            response_format="json",
            show_response=False,
        )

        structs = {}
        for struct in data["ftrs"]:
            structs[struct["id"]] = struct

        # Build transaction
        struct_new = structs[2]
        struct_new["properties"]["fid_1"] = None

        struct5 = structs[5]
        struct5["properties"]["virtual"] = 0
        struct5["properties"]["layer"] = "test"
        struct5["geometry"] = {"type": "Point", "coordinates": [1.234, 2.432]}

        trans = [
            ["insert", "OUT_AccessStructures", struct_new],
            ["update", "OUT_AccessStructures", struct5],
            ["delete", "OUT_AccessStructures", structs[7]],
        ]

        self._test_json_post_request(
            "/modules/comsof/workspace/1/transaction",
            trans,
            response_format="json",
            show_response=True,
        )

        # Show workspace content
        self.show_output_from(
            [
                "comsof_ws",
                self.default_database,
                ws_dir,
                "list",
                "records",
                "OUT_AccessStructures",
            ]
        )

    def test_view_rules(self):
        ##
        ## Exercise upload of rules file to Comsof server
        ##

        self.login()

        ws_dir = self._init_workspace(2)

        # Upload rules file to cloud
        resp = self._test_post_request(
            "/modules/comsof/workspace/2/upload_rules",
            response_format="json",
            show_response=True,
        )

        upload_id = resp["upload_id"]
        token = resp["token"]

        # Get it back
        resp = self._test_post_request(
            f"/modules/comsof/workspace/2/download_rules?upload_id={upload_id}&token={token}",
            response_format="json",
            show_response=True,
        )

        rules_file = os.path.join(
            self.workspaces_dir,
            "2",
            "workspace",
            "input",
            "CalculationInput",
            "Rules.rules",
        )
        self.show_file(rules_file)

    def test_file_status(self):
        ##
        ## Exercise file status request
        ##

        self.login()

        ws_dir = self._init_workspace(1)

        self._test_get_request(
            "/modules/comsof/workspace/1/file_status"
            + self.param_string(filename="input/input.gpkg"),
            response_format="json",
            show_response=True,
        )

        self._test_get_request(
            "/modules/comsof/workspace/1/file_status",
            {"filename": "no_file"},
            response_format="json",
            show_response=True,
        )

    def test_file_download(self):
        ##
        ## Exercise file download request
        ##

        self.login()

        ws_dir = self._init_workspace(1)

        self._test_get_request(
            "/modules/comsof/workspace/1/file"
            + self.param_string(filename="input/input.gpkg"),
            response_format="file",
            show_response=True,
        )

        self._test_get_request(
            "/modules/comsof/workspace/1/file"
            + self.param_string(filename="no_file.dat"),
            response_format="file",
            show_response=True,
        )

        self._test_get_request(
            "/modules/comsof/workspace/1/file"
            + self.param_string(filename="../../../../../../secret.dat"),
            response_format="file",
            show_response=True,
        )

    def test_workspace_download(self):
        ##
        ## Exercise workspace download request
        ##

        self.login()

        ws_dir = self._init_workspace(1)

        self._test_get_request(
            "/modules/comsof/workspace/1", response_format="file", show_response=True
        )

    def param_string(self, **params):
        """
        Combine params into a string suitable for URL params
        """

        param_str = ""

        sep = "?"
        for (param, value) in params.items():
            param_str += "{}{}={}".format(sep, param, value)
            sep = "&"

        return param_str
