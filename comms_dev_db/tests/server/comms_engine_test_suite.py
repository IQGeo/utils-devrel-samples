# Copyright: Ubisense Limited 2010-2023
import os

from sqlalchemy import create_engine

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.db.myw_postgres_db_server import MywPostgresDbServer

from myworldapp.modules.dev_tools.server.test_framework.myw_test_suite import test, MywTestSuite
from myworldapp.modules.dev_tools.server.test_framework.myw_memory_database import MywMemoryDatabase

from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.validation.delta_manager import DeltaManager
from myworldapp.modules.comms.server.data_import.cdif_data_importer import CdifDataImporter
from myworldapp.modules.comms.server.data_import.file_feature_package import FileFeaturePackage

from myworldapp.modules.comms_dev_db.utils.circuit_routing_engine import CircuitRoutingEngine
from myworldapp.modules.comms.server.base.coord_system_utils import CoordSystemUtils
from myworldapp.modules.comms.server.data_import.gpkg_database import GpkgDatabase

from myworldapp.modules.comms.server.data_import.db_feature_package import DbFeaturePackage


class CommsEngineTestSuite(MywTestSuite):
    """
    Functional tests for comms server engines

    Relies on data in CommsDevDB"""

    default_database = os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"
    tests_modify_database = True

    # Class constants
    test_names = [
        "route_network",
        "fiber_trace_directed",
        "fiber_trace_undirected",
        "fiber_trace_bulk",
        "fiber_paths",
        "delta_validate",
        "delta_conflicts",
        "delta_merge_nb301",
        "delta_merge_nb120",
        "delta_merge_nu23",
        "delta_merge_cc4827",
        "delta_merge_cc5462",
        "delta_merge_conflicts1",
        "delta_merge_nb335",
        "delta_connections",
        "delta_bounds",
        "data_preview",
        "data_import",
        "circuit_path_update",
        "circuit_conflicts",
        "cable_split",
        "coord_system_utils",
        "gpkg_db_read",
        "gpkg_db_create",
        "gpkg_db_update",
        "db_feature_package",
        "copper_trace_directed",
        "copper_trace_bulk",
        "coax_trace_directed",
        "custom_mgr_class"
    ]

    def __init__(self, db_session, cli_args):
        """
        Init slots of self

        Optional RESULT_SET specifies database location and key for
        recording test result summary. LOG_LEVELS is a dict of log levels (DEBUG,
        INFO, etc) keyed by logger name. These override values in
        the .ini file"""

        # for comms devcontainer to use vscode as diff tool
        self.APP_LOCATIONS["cdiff"] = {"Linux": ["cdiff"]}

        super(CommsEngineTestSuite, self).__init__(cli_args, db_session=db_session)

        self.db_session = db_session

        # Set location for reference results
        self_dir = os.path.dirname(__file__)
        self.resource_dir = os.path.normcase(os.path.join(self_dir, "resources", "engine_tests"))

        # Set location of test data
        self.test_data_dir = MywProduct().moduleOf(__file__).file("data")

        (db_url, db_conn_spec) = self.set_db_args(cli_args)

        self.output_mappings[db_conn_spec] = "<conn_spec>"
        self.output_mappings[str(db_url)] = "<conn_spec>"

    def db(self, session=Session, *args, **kwargs):
        # Importing this at the top of the file causes circular import issues, so as a workaround, do it here
        from myworldapp.core.server.database.myw_database import MywDatabase

        return MywDatabase(session, *args, **kwargs)

    def show_database_changes(self, result_id, sort=False, schema_filter="d*"):
        """
        Show records changed since last call
        """

        self.db_session.commit()
        self.show_db_changes(
            result_id, self.db_session, self.prev_db, sort=sort, schema_filter=schema_filter
        )
        self.prev_db = MywMemoryDatabase(self.db_session)

    def data(self, *path):
        ##
        ## Full path to test data resource file PATH
        ##

        return self.resource_file("test_data", *path)

    def show_output_from(self, *cmd, **kwargs):
        ##
        ## Run a shell command, sending output to result stream
        ##
        ## KWARGS is a dict with optional key 'env'

        env = kwargs.get("env", {})

        super().show_output_from(cmd, self.db_args, env=env)

    def set_db_args(self, cli_args):

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
        db_url = MywPostgresDbServer.urlFor(db_engine, hideCredentials=True)

        return (db_url, db_conn_spec)

    def show_output_from_list_gpkg(self, *args):

        self.show_output_from(
            "list_geopackage", *args, env={"COMSOF_DEV_DB": self.default_database}
        )

    # ==============================================================================
    #                                    TESTS
    # ==============================================================================

    @test(modifies_db=False)
    def test_route_network(self):
        """
        Exercise the route network tracing engine
        """

        db = self.db()

        # Trace out
        self._test_network_tracing("trace out", db, "mywcom_routes", "manhole/WH-M-01")

        # Shortest path (on design)
        self._test_network_tracing(
            "delta",
            db,
            "mywcom_routes",
            "manhole/WH-M-D20:1",
            to="manhole/WH-M-D20:2",
            delta="design/NB120",
        )

    @test(modifies_db=False)
    def test_delta_validate(self):
        """
        Exercise integrity check
        """

        db = self.db()
        self._test_delta_validate(db, "design/NB046")
        self._test_delta_validate(db, "design/NB120")
        self._test_delta_validate(db, "design/NB301")
        self._test_delta_validate(db, "design/CC5462")
        self._test_delta_validate(db, "design/CC4827")
        self._test_delta_validate(db, "design/NU23")
        self._test_delta_validate(db, "systest/conflicts1")

    def _test_delta_validate(self, db, delta):
        """
        Exercise integrity check
        """

        self.subtest("VALIDATE ", delta)

        db_view = db.view(delta)
        engine = DeltaManager(db_view, self.progress)

        errors = engine.validate()
        for featureErrors in errors.values():
            for error in featureErrors.values():
                self.show(error)
                self.show("   ", error.details())

    @test(modifies_db=False)
    def test_delta_conflicts(self):
        """
        Check delta conflicts
        """
        db = self.db()

        self._test_delta_conflicts(db, "design/NMC3205","Cable Segment Split")
        self._test_delta_conflicts(db, "design/NMC1753", "Change Structure Type")
        self._test_delta_conflicts(db, "design/NMC3206", "Delete Cable")
        self._test_delta_conflicts(db, "design/NMC3208","Delete Cable Slack")
        self._test_delta_conflicts(db, "design/NMC2623","Unpublished Structure")
        self._test_delta_conflicts(db, "design/NMC2818","Delete Structure")

    def _test_delta_conflicts(self, db, delta, description = ""):
        """
        Retrieve conflicts and errors for specified delta
        """

        delta_description = f"{delta} - {description}" if description else delta
        self.subtest("SHOW CONFLICTS AND ERRORS ", delta_description)
        db_view = db.view(delta)
        self.show_conflicts(delta,db_view)
    
    # ==============================================================================
    #                                 FIBER TRACE TESTS
    # ==============================================================================

    @test(modifies_db=False)
    def test_fiber_trace_directed(self):
        """
        Exercise the fiber network trace engine on directed cables
        """

        db = self.db()

        self._test_network_tracing(
            "TRACE OUT",
            db,
            "mywcom_fiber",
            "fiber_patch_panel/WH-ODF-01",
            qualifiers={"pins": "out:2"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM",
            db,
            "mywcom_fiber",
            "fiber_ont/WH-ONT-001",
            qualifiers={"pins": "in:1"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE BOTH",
            db,
            "mywcom_fiber",
            "fiber_splitter/WH-SPL-003",
            qualifiers={"pins": "out:1"},
            direction="both",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM TO DEAD",
            db,
            "mywcom_fiber",
            "fiber_splitter/WH-SPL-005",
            qualifiers={"pins": "in:1"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM FROM SEG IN",
            db,
            "mywcom_fiber",
            "mywcom_fiber_segment/154",
            qualifiers={"pins": "in:2"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM FROM SEG OUT",
            db,
            "mywcom_fiber",
            "mywcom_fiber_segment/154",
            qualifiers={"pins": "out:2"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE DOWNSTREAM FROM SEG IN",
            db,
            "mywcom_fiber",
            "mywcom_fiber_segment/154",
            qualifiers={"pins": "in:2"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE DOWNSTREAM FROM SEG OUT",
            db,
            "mywcom_fiber",
            "mywcom_fiber_segment/154",
            qualifiers={"pins": "out:2"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE BOTH FROM SEG IN",
            db,
            "mywcom_fiber",
            "mywcom_fiber_segment/154",
            qualifiers={"pins": "in:2"},
            direction="both",
        )

        self._test_network_tracing(
            "TRACE TO DIST SIMPLE",
            db,
            "mywcom_fiber",
            "fiber_patch_panel/WH-ODF-01",
            qualifiers={"pins": "out:2"},
            direction="downstream",
            max_dist=80,
        )
        self._test_network_tracing(
            "TRACE TO DIST MULTISEG",
            db,
            "mywcom_fiber",
            "fiber_patch_panel/WH-ODF-01",
            qualifiers={"pins": "out:2"},
            direction="downstream",
            max_dist=200,
        )
        self._test_network_tracing(
            "TRACE TO DIST BRANCHING",
            db,
            "mywcom_fiber",
            "fiber_patch_panel/WH-ODF-01",
            qualifiers={"pins": "out:2"},
            direction="downstream",
            max_dist=255,
        )
        self._test_network_tracing(
            "TRACE TO DIST REVERSED",
            db,
            "mywcom_fiber",
            "fiber_patch_panel/WH-ODF-02",
            qualifiers={"pins": "out:1"},
            direction="downstream",
            max_dist=412,
        )
        self._test_network_tracing(
            "TRACE TO DIST SLACK",
            db,
            "mywcom_fiber",
            "fiber_patch_panel/WH-ODF-02",
            qualifiers={"pins": "out:1"},
            direction="downstream",
            max_dist=120,
        )

    @test(modifies_db=False)
    def test_fiber_trace_undirected(self):
        """
        Exercise the fiber network trace engine on undirected cables
        """

        db = self.db()

        self._test_network_tracing(
            "TRACE BB WESTWARDS UPSTREAM",
            db,
            "mywcom_fiber",
            "fiber_shelf/WH-S-013",
            qualifiers={"pins": "in:2"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE BB WESTWARDS DOWNSTREAM",
            db,
            "mywcom_fiber",
            "fiber_shelf/WH-S-013",
            qualifiers={"pins": "out:3"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE BB EASTWARDS UPSTREAM",
            db,
            "mywcom_fiber",
            "fiber_shelf/WH-S-014",
            qualifiers={"pins": "in:1"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE BB EASTWARDS DOWNSTREAM",
            db,
            "mywcom_fiber",
            "fiber_shelf/WH-S-014",
            qualifiers={"pins": "out:5"},
            direction="downstream",
        )

        self._test_network_tracing(
            "TRACE BB TO DIST DOWNSTREAM",
            db,
            "mywcom_fiber",
            "fiber_shelf/WH-S-014",
            qualifiers={"pins": "out:5"},
            direction="downstream",
            max_dist=300,
        )
        self._test_network_tracing(
            "TRACE BB TO DIST UPSTREAM",
            db,
            "mywcom_fiber",
            "fiber_shelf/WH-S-014",
            qualifiers={"pins": "in:1"},
            direction="upstream",
            max_dist=300,
        )

    @test(modifies_db=False)
    def test_fiber_trace_bulk(self):
        """
        Exercise bulk fiber network tracing
        """

        db = self.db()

        self._test_network_tracing(
            "TRACE DOWNSTREAM FROM PORTS",
            db,
            "mywcom_fiber",
            "fiber_patch_panel/WH-ODF-01",
            qualifiers={"pins": "out:2:6"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE MESH DOWNSTREAM FROM PORTS",
            db,
            "mywcom_fiber",
            "fiber_shelf/SP-S-015",
            qualifiers={"pins": "in:10:16"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE MESH DOWNSTREAM FROM SEGMENT",
            db,
            "mywcom_fiber",
            "mywcom_fiber_segment/340",
            qualifiers={"pins": "in:1:16"},
            direction="downstream",
        )

    @test(modifies_db=False)
    def test_fiber_paths(self):
        """
        Exercise leaf node finding
        """

        db = self.db()

        network_def = db.config_manager.networkDef("mywcom_fiber")
        network_engine = MywNetworkEngine.newFor(db.view(), network_def, progress=self.progress)

        self._test_network_termination(
            "SEGMENT TERMINATION UPSTREAM",
            db,
            network_engine,
            "mywcom_fiber_segment/338",
            "out:1:20",
            "upstream",
        )
        self._test_network_termination(
            "SEGMENT TERMINATION DOWNSTREAM",
            db,
            network_engine,
            "mywcom_fiber_segment/338",
            "out:1:20",
            "downstream",
        )
        self._test_network_termination(
            "PORT TERMINATION UPSTREAM VIA SPLITTER 1",
            db,
            network_engine,
            "fiber_ont/WH-ONT-007",
            "in:1",
            "upstream",
        )
        self._test_network_termination(
            "PORT TERMINATION UPSTREAM VIA SPLITTER 3",
            db,
            network_engine,
            "fiber_ont/WH-ONT-025",
            "in:1:4",
            "upstream",
        )

    # ==============================================================================
    #                                 COAX TRACE TESTS
    # ==============================================================================


    @test(modifies_db=False)
    def test_coax_trace_directed(self):
        """
        Exercise the fiber network trace engine on directed cables
        """

        db = self.db()

        self._test_network_tracing(
            "TRACE DOWNSTREAM",
            db,
            "mywcom_coax",
            "optical_node/WH-ON-001",
            qualifiers={"pins": "out:1"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM",
            db,
            "mywcom_coax",
            "coax_tap/WH-CTAP-013",
            qualifiers={"pins": "in:1"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE BOTH",
            db,
            "mywcom_coax",
            "two_way_splitter/WH-2WSPL-001",
            qualifiers={"pins": "in:1"},
            direction="both",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM FROM SEG IN",
            db,
            "mywcom_coax",
            "mywcom_coax_segment/11",
            qualifiers={"pins": "in:1"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM FROM SEG OUT",
            db,
            "mywcom_coax",
            "mywcom_coax_segment/11",
            qualifiers={"pins": "out:1"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE DOWNSTREAM FROM SEG IN",
            db,
            "mywcom_coax",
            "mywcom_coax_segment/11",
            qualifiers={"pins": "in:1"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE DOWNSTREAM FROM SEG OUT",
            db,
            "mywcom_coax",
            "mywcom_coax_segment/11",
            qualifiers={"pins": "out:1"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE BOTH FROM SEG IN",
            db,
            "mywcom_coax",
            "mywcom_coax_segment/11",
            qualifiers={"pins": "in:1"},
            direction="both",
        )

    # ==============================================================================
    #                                 COPPER TRACE TESTS
    # ==============================================================================

    @test(modifies_db=False)
    def test_copper_trace_directed(self):
        """
        Exercise the fiber network trace engine on directed cables
        """

        db = self.db()

        self._test_network_tracing(
            "TRACE DOWNSTREAM",
            db,
            "mywcom_copper",
            "copper_shelf/S-1",
            qualifiers={"pins": "out:2"},
            direction="downstream",
         )
        self._test_network_tracing(
            "TRACE UPSTREAM",
            db,
            "mywcom_copper",
            "copper_terminal/WH-T-1",
            qualifiers={"pins": "in:1"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE BOTH",
            db,
            "mywcom_copper",
            "copper_load_coil/WH-LC-2",
            qualifiers={"pins": "out:1"},
            direction="both",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM FROM SEG IN",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/11",
            qualifiers={"pins": "in:2"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE UPSTREAM FROM SEG OUT",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/11",
            qualifiers={"pins": "out:2"},
            direction="upstream",
        )
        self._test_network_tracing(
            "TRACE DOWNSTREAM FROM SEG IN",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/11",
            qualifiers={"pins": "in:2"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE DOWNSTREAM FROM SEG OUT",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/11",
            qualifiers={"pins": "out:2"},
            direction="downstream",
        )
        self._test_network_tracing(
            "TRACE BOTH FROM SEG IN",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/11",
            qualifiers={"pins": "in:2"},
            direction="both",
        )

        self._test_network_tracing(
            "COPPER TRACE TO EWL DIST SIMPLE",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/4",
            qualifiers={"pins": "out:1"},
            direction="downstream",
            max_dist=8,
            
        )

        self._test_network_tracing(
            "TRACE TO DIST MULTISEG",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/4",
            qualifiers={"pins": "out:2"},
            direction="downstream",
            max_dist=65,
        )

        self._test_network_tracing(
            "TRACE TO DIST BRANCHING",
            db,
            "mywcom_copper",
            "copper_shelf/S-1",
            qualifiers={"pins": "out:25:30"},
            direction="downstream",
            max_dist=255,
        )

        self._test_network_tracing(
            "TRACE TO DIST REVERSED",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/4",
            qualifiers={"pins": "out:2"},
            direction="upstream",
            max_dist=20,
        )


    @test(modifies_db=False)
    def test_copper_trace_bulk(self):
        """
        Exercise 'bulk' copper network tracing (both pins)
        """

        db = self.db()

        self._test_network_tracing(
            "TRACE DOWNSTREAM FROM PORTS",
            db,
            "mywcom_copper",
            "copper_shelf/S-1",
            qualifiers={"pins": "out:25:30"},
            direction="downstream",
        )

        
        self._test_network_tracing(
            "TRACE MESH DOWNSTREAM FROM SEGMENT",
            db,
            "mywcom_copper",
            "mywcom_copper_segment/4",
            qualifiers={"pins": "in:1:2"},
            direction="downstream",
        )

    # ==============================================================================
    #                                 MERGE TESTS
    # ==============================================================================

    def test_delta_merge_nb301(self):
        self._test_delta_merge("design/NB301")

    def test_delta_merge_nb120(self):
        self._test_delta_merge("design/NB120")

    def test_delta_merge_nu23(self):
        self._test_delta_merge("design/NU23")

    def test_delta_merge_cc4827(self):
        self._test_delta_merge("design/CC4827")

    def test_delta_merge_cc5462(self):
        self._test_delta_merge("design/CC5462")

    def test_delta_merge_conflicts1(self):
        self._test_delta_merge("systest/conflicts1")

    def test_delta_merge_nb335(self):
        self._test_delta_merge("design/NB335")

    def _test_delta_merge(self, delta):
        """
        Exercise merge
        """

        db = self.db()
        db_view = db.view(delta)

        # Do merge
        engine = DeltaManager(db_view, self.progress)
        changes = engine.merge()

        # Show merge report
        self.show("MERGE REPORT " + delta)
        for change in changes:
            self.show("   ", change)
            for reason in change.reasons:
                self.show("   " * 2, reason)
        self.show()

        # Show what got changed
        self.show_database_changes("AFTER MERGE", schema_filter="[db]*")

        # Show remaining conflicts and integrity errors
        self.show_conflicts("AFTER MERGE", db_view)

    # ==============================================================================
    #                               CHANGE FINDING TESTS
    # ==============================================================================

    def test_delta_connections(self):
        """
        Exercise connection change finding
        """

        db = self.db()

        self._test_delta_connections(db, "design/NB46")
        self._test_delta_connections(db, "design/NB120")
        self._test_delta_connections(db, "design/NB301")
        self._test_delta_connections(db, "design/NB335")
        self._test_delta_connections(db, "design/NU23")
        self._test_delta_connections(db, "design/CC4827")
        self._test_delta_connections(db, "design/CC5462")

    def _test_delta_connections(self, db, delta):
        """
        Show connection changes in design DELTA
        """

        self.subtest(delta)

        db_view = db.view(delta)
        nw_view = NetworkView(db_view, progress=self.progress)
        conn_mgr = nw_view.connection_mgr

        conn_tables = [
            "mywcom_fiber_connection",
            "mywcom_coax_connection",
            "mywcom_copper_connection",
        ]

        for conn_table in conn_tables:
            tab = db_view.table(conn_table)
            recs = tab._delta_recs.order_by("id")
            (connects, disconnects) = conn_mgr.flattenChanges(recs)
            (connects, disconnects) = conn_mgr.consolidate(connects, disconnects)

            for conn in disconnects:
                self.show("disconnect ", conn)

            for conn in connects:
                self.show("connect    ", conn)

    def _test_delta_bounds(self, db, delta):

        db_view = db.view(delta)

        # Do merge
        engine = DeltaManager(db_view, self.progress)
        bounds = engine.bounds()

        # Show merge report
        self.show("BOUNDS FOR " + delta)
        if "geometry" in bounds:
            self.show(bounds["geometry"].wkt)
        else:
            self.show("No geometry")

    def test_delta_bounds(self):

        db = self.db()

        self._test_delta_bounds(db, "design/NB46")
        self._test_delta_bounds(db, "design/NB120")
        self._test_delta_bounds(db, "design/NB301")
        self._test_delta_bounds(db, "design/NB335")
        self._test_delta_bounds(db, "design/NU23")
        self._test_delta_bounds(db, "design/CC4827")
        self._test_delta_bounds(db, "design/CC5462")

    # ==============================================================================
    #                                 IMPORT TESTS
    # ==============================================================================

    @test(modifies_db=False)
    def test_data_preview(self):
        """
        Exercise data import
        """

        db = self.db()

        file_name = os.path.join(self.test_data_dir, "import", "minimal")
        delta = "design/milton"

        # Find data
        feature_pgk = FileFeaturePackage(file_name)

        # Find preview
        db_view = db.view(delta)
        engine = CdifDataImporter(db_view, feature_pgk, progress=self.progress)

        for ftr in engine.detachedFeatures(["ug_route", "fiber_cable"]):
            self.show(ftr, " ", ftr._field("path").encode("wkt"))

    def test_data_import(self):
        """
        Exercise data import
        """

        db = self.db()

        file_name = os.path.join(self.test_data_dir, "import", "minimal")
        delta = "design/milton"

        # Find data
        feature_pgk = FileFeaturePackage(file_name)

        # Import data
        db_view = db.view(delta)
        engine = CdifDataImporter(db_view, feature_pgk, progress=self.progress)
        engine.run()
        db.commit()

        self.show_database_changes("AFTER IMPORT MILTON")
        self.show_conflicts("AFTER IMPORT MILTON", db_view)

    def test_circuit_path_update(self):
        """
        Exercise updating of circuit path geometry by updating structures and routes
        """

        db = self.db()
        db_view = db.view()
        nw_view = NetworkView(db_view)

        # Move Wallbox at end of FTTH circuit
        self._test_circuit_path_struct_update(
            db_view, nw_view, "wall_box/7", MywPoint(0.13897088249568626, 52.223486529525076)
        )

        # Move Pole with many circuits
        self._test_circuit_path_struct_update(
            db_view, nw_view, "pole/4", MywPoint(0.13998442406744224, 52.22433891836701)
        )

        # Move Woodend Hub
        self._test_circuit_path_struct_update(
            db_view, nw_view, "building/1", MywPoint(0.1365420955535415, 52.22385413360243)
        )

        # Update route ...
        self._test_circuit_path_route_update(
            db_view,
            nw_view,
            "ug_route/393",
            MywLineString(
                [
                    [0.1390565925754, 52.223902610934],
                    [0.139362886548, 52.2240690206274],
                    [0.1394342814571936, 52.22419247833318],
                    [0.1399828121066, 52.2243978356659],
                ]
            ),
        )

        # Split route ...
        self.show("SPLITTING ROUTE")
        pt = MywPoint(0.14061101283981364, 52.22475694603921)
        route_rec = db_view.get("ug_route/324")
        table = db_view.table("manhole")
        det_rec = table._new_detached()
        det_rec._primary_geom_field.set(pt)
        rec = table.insert(det_rec)
        self.show_circuit_paths(db_view, nw_view, route_rec, "BEFORE SPLIT")
        nw_view.struct_mgr.structPosInsertTrigger(rec)
        self.show_circuit_paths(db_view, nw_view, route_rec, "AFTER SPLIT")
        self.show_database_changes("AFTER SPLIT")

    def test_circuit_conflicts(self):
        """
        Test detection and fixing of circuit conflicts
        We construct data here rather than include it in dev db build to make it easier to
        build/test in one place.
        """

        db = self.db()
        delta = "design/CC4975"

        # Show, fix and show conflicts
        db_view = db.view(delta)
        self.show_conflicts("CIRCUIT CONFLICTS", db_view)
        self._test_delta_merge(delta)

    def test_cable_split(self):
        """
        Test cable splitting. This test matches closely the JS API tests. Both these tests
        bookend the functionality.
        """

        self._test_cable_split(
            "CUT CABLE", "fiber_cable/6", "mywcom_fiber_segment/70", True, None
        )  # WH-M-59
        self._test_cable_split(
            "CUT CABLE BACKWARD", "fiber_cable/17", "mywcom_fiber_segment/127", False, None
        )  # WH-M-82
        self._test_cable_split(
            "CUT CABLE AND CONNECT",
            "fiber_cable/6",
            "mywcom_fiber_segment/63",
            True,
            "splice_closure/35",
        )  # WH-M-24

    def _test_cable_split(self, tag, cable, segment, forward, splice):
        db = self.db()
        db_view = db.view("design/NB046")
        nw_view = NetworkView(db_view)
        cable_mgr = nw_view.cable_mgr

        cable = db_view.get(cable)
        seg = db_view.get(segment)

        splice = db_view.get(splice) if splice else None

        cable_mgr.splitCableAt(cable, seg, forward, splice)

        self.show_database_changes(tag)

    # ==============================================================================
    #                                    HELPERS
    # ==============================================================================

    def _test_circuit_path_route_update(self, db_view, nw_view, urn, new_route):

        self.show("MOVING ", urn, " TO ", new_route)

        rec = db_view.get(urn)

        self.show_circuit_paths(db_view, nw_view, rec, "BEFORE ROUTE MOVE")
        old_rec = rec._clone()

        rec._primary_geom_field.set(new_route)
        db_view.table(rec.feature_type).update(rec)

        nw_view.struct_mgr.routePosUpdateTrigger(rec, old_rec)

        self.show_circuit_paths(db_view, nw_view, rec, "AFTER ROUTE MOVE")

        self.show_database_changes("AFTER UPDATE")

    def _test_circuit_path_struct_update(self, db_view, nw_view, urn, new_point):

        self.show("MOVING ", urn, " TO ", new_point)

        struct = db_view.get(urn)

        self.show_circuit_paths(db_view, nw_view, struct, "BEFORE STRUCT MOVE")
        old_struct = struct._clone()

        struct._primary_geom_field.set(new_point)
        db_view.table(struct.feature_type).update(struct)

        nw_view.struct_mgr.structPosUpdateTrigger(struct, old_struct)

        self.show_circuit_paths(db_view, nw_view, struct, "AFTER STRUCT MOVE")

        self.show_database_changes("AFTER UPDATE")

    def show_circuit_paths(self, db_view, nw_view, struct, label):

        self.show(label)
        if struct.feature_type in ["ug_route", "oh_route"]:
            circuit_segs = nw_view.circuit_mgr.circuitSegmentsIn(struct, False)
        else:
            circuit_segs = nw_view.circuit_mgr.circuitSegmentsAt(struct)
        circuit_segs.sort(key=lambda x: x["circuit_urn"])

        for c in circuit_segs:
            c_rec = db_view.get(c["circuit_urn"])
            geom = c_rec._primary_geom_field.geom().coords
            self.show("{} {}".format(c["circuit_urn"], list(geom)))

    def _format_dict(self, items):
        """
        Returns keyed list ITEMS as a string (recursive)
        """

        string = sep = ""

        for key in sorted(items.keys()):
            value = items[key]

            if hasattr(value, "keys"):
                value = self._format_dict(value)

            string += "{}{}={}".format(sep, key, value)
            sep = " "

        return "{" + string + "}"

    def _test_network_tracing(
        self,
        test_name,
        db,
        network_name,
        feature_ident,
        direction="both",
        max_dist=None,
        to=None,
        filters={},
        qualifiers={},
        max_nodes=None,
        delta="",
    ):
        """
        Exercise the network tracing engine on NETWORK_NAME
        """

        db = self.db()

        test_desc = "{} from {} {}".format(network_name, feature_ident, direction)

        if max_dist:
            test_desc += " to distance {}m".format(max_dist)

        if to:
            test_desc += " to feature {}".format(to)

        if filters:
            test_desc += " with extra filters {}".format(filters)

        if max_nodes:
            test_desc += " max nodes {}".format(max_nodes)

        self.subtest(test_name + " : " + test_desc)  # ENH: Support separate description

        # Create engine
        network_def = db.config_manager.networkDef(network_name)
        engine = MywNetworkEngine.newFor(
            db.view(delta), network_def, extra_filters=filters, progress=self.progress
        )

        # Find from feature
        from_urn = self.find_object(db, feature_ident, delta)._urn()

        # Build from URN
        sep = "?"
        for key, val in qualifiers.items():
            from_urn += "{}{}={}".format(sep, key, val)
            sep = "&"

        # Do test
        if to:
            to_urn = self.find_object(db, to, delta)._urn()
            res = engine.shortestPath(from_urn, to_urn, max_dist=max_dist, max_nodes=max_nodes)
        else:
            res = engine.traceOut(from_urn, direction, max_dist=max_dist, max_nodes=max_nodes)

        if res:
            res = res.tidy()

        self.show_trace_result(res)
        self.show()

    def show_trace_result(self, node, indent=""):
        """
        Show feature set result
        """

        if not node:
            return

        self.show(indent, node.__ident__(), "   ", node.feature._title())

        num_children = len(node.children)

        if num_children == 0:
            return

        elif num_children == 1:
            self.show_trace_result(node.children[0], indent)

        else:
            # Basic sort of children so that we get consistent result ordering
            sorted_child_nodes = sorted(
                node.children, key=lambda child_node: child_node.__ident__()
            )

            for child_node in sorted_child_nodes:
                self.show(indent, "Path:")
                self.show_trace_result(child_node, indent + "   ")

    def _test_network_termination(
        self, test_name, db, network_engine, feature_urn, pin_spec, direction, delta=""
    ):
        """
        Exercise trace termination finding (paths)
        """

        self.subtest(test_name, " : ", feature_urn, " ", pin_spec)

        # Find object
        feature = self.find_object(db, feature_urn, delta)
        pins = PinRange.parse(pin_spec)

        # Find paths
        tree = network_engine.traceOutRaw(feature, pins, direction)
        trace_pins = tree.terminations()

        # Show result, ensure order
        for pin in sorted(trace_pins.keys()):
            self.show(pin, " -> ", trace_pins[pin])

    def find_object(self, db, feature_ident, delta=""):
        """
        Find a feature from database

        FEATURE_IDENT is a string of the form:
           <feature_type>/<name>"""

        # ENH: Share with server tests

        (feature_type, name) = feature_ident.split("/")

        table = db.view(delta).table(feature_type)

        for field_name in ["name", "label", "description", "id"]:
            if field_name in table.descriptor.fields:
                break

        if not field_name:
            raise MywInternalError("Cannot find name field for:", feature_type)

        recs = table.filterOn(field_name, name).all()

        if not recs:
            raise MywInternalError("No such object:", feature_type, name)

        if len(recs) > 1:
            raise MywInternalError("More than one object:", feature_type, name)

        return recs[0]

    def show_conflicts(self, title, db_view):
        """
        Show conflicts and integrity errors in DB_VIEW
        """

        engine = DeltaManager(db_view)

        self.show("CONFLICTS " + title)

        # Show conflicts
        # ENH: Add __ident__() and details() on conflict
        for conflict_set in engine.conflicts().values():

            for conflict in conflict_set.values():
                conflict_type = conflict.master_change + "/" + conflict.delta_rec.myw_change_type
                self.show("   ", "conflict", " ", conflict.delta_rec, " ", conflict_type)

                if conflict_type == "update/update":
                    master_fields = conflict.changedFields(conflict.base_rec, conflict.master_rec)
                    delta_fields = conflict.changedFields(conflict.base_rec, conflict.delta_rec)
                    self.show("   " * 2, "master_fields: ", ",".join(master_fields))
                    self.show("   " * 2, "delta_fields : ", ",".join(delta_fields))

        # Show integrity errors
        errors = engine.validate()
        for featureErrors in errors.values():
            for error in featureErrors.values():
                self.show(
                    "   ", "integrity_error ", error
                )  # ENH: Improve __ident__() on integrity error
                self.show("   " * 2, error.details())

        self.show()

    # ==============================================================================
    #                               GEOPACKAGE DATABASE
    # ==============================================================================

    @test(modifies_db=False)
    def test_coord_system_utils(self):
        ##
        ## Exercise coordinate system helper functions
        ##

        wgs84_coords = {
            "norwich_uk": [1.28, 52.6],
            "new_york_usa": [-74.1, 40.8],
            "santiago_chile": [-70.56, -33.55],
        }

        for name, wgs84_coord in wgs84_coords.items():
            self.show(name, " ", wgs84_coord)

            proj_coord_sys = CoordSystemUtils.projectedCSFor(wgs84_coord, "m")
            self.show("projectedCSFor() -> ", proj_coord_sys)

            wkt_def = CoordSystemUtils.wktDefOf(proj_coord_sys)
            self.show("wkt_def:", wkt_def)

            self.show("")

    @test(modifies_db=False)
    def test_gpkg_db_read(self):
        ##
        ## Exercise GeoPackage record update and delete
        ##

        # Get test database
        src_file_name = self.data("input.gpkg")
        file_name = self.temp_file("geopackage_update.gpkg")
        self.os_engine.copy_file(src_file_name, file_name, True)

        # Open database
        gpkg_db = GpkgDatabase(file_name, "r", progress=self.progress)
        tab = gpkg_db.table("IN_DemandPoints")

        id = 76
        self.subtest("GET RECORD:", tab.name, " ", id)
        rec = tab.getRec(id)
        for key, val in rec.items():
            self.show(key, ": ", val)

        self.subtest("GET_RECS")
        key_fld = tab.descriptor().key_field_name
        for rec in tab.getRecs():
            for key, val in rec.items():
                self.show(rec[key_fld], " ", key, ": ", val)
            self.show()

        self.subtest("GET_RECS_WITH_OFFSET")
        key_fld = tab.descriptor().key_field_name
        for rec in tab.getRecs(offset=33, limit=6):
            for key, val in rec.items():
                self.show(rec[key_fld], " ", key, ": ", val)
            self.show()

    @test(modifies_db=False)
    def test_gpkg_db_create(self):
        ##
        ## Exercise GeoPackage create
        ##

        coord_sys = MywCoordSystem(27700)

        # Create database
        file_name = self.temp_file("geopackage_create.gpkg")
        self.progress(0, "Creating", file_name)
        gpkg_db = GpkgDatabase(file_name, "W", coord_sys=coord_sys, progress=self.progress)

        # Write some records to it
        db_view = self.db().view()
        for ft in ["manhole", "fiber_cable", "service_area"]:
            db_tab = db_view.table(ft)
            gpkg_tab = gpkg_db.addTable(ft, db_tab.descriptor.storedFields())

            recs = db_tab.orderBy(db_tab.descriptor.key_field_name).limit(5)
            gpkg_tab.insertRecs(recs)

        # Show what we created
        for what in ["features", "fields", "data", "records"]:
            self.show_output_from_list_gpkg(file_name, what)  # TODO: Use gpkg_db direct

        # Change coordinate system
        self.subtest("Set coord system")
        coord_sys = MywCoordSystem("epsg:32618")
        gpkg_db.setCoordSystem(coord_sys)
        self.show_output_from_list_gpkg(file_name, "metadata")

    @test(modifies_db=False)
    def test_gpkg_db_update(self):
        ##
        ## Exercise GeoPackage update
        ##

        # Get test database
        src_file_name = self.data("input.gpkg")
        file_name = self.temp_file("geopackage_update.gpkg")
        self.os_engine.copy_file(src_file_name, file_name, True)

        # Open database
        gpkg_db = GpkgDatabase(file_name, "r", progress=self.progress)

        # Show initial state
        self.show("INITIAL STATE")
        self.show("   COORD_SYS: ", gpkg_db.coord_sys)

        for ft in gpkg_db.featureTypes():
            tab = gpkg_db.table(ft)
            self.show("   ", "TABLE ", ft, " count=", tab.count())
            for fld, desc in tab.descriptor().fields.items():
                self.show("      ", desc)

        # Write some data to existing table
        self.subtest("BULK INSERT")
        tab = gpkg_db.table("IN_Buildings")
        tab.truncate()

        data = [
            dict(bldg_id="test/3", streetname="test_street3"),
            dict(bldg_id="test/4", streetname="test_street4", geometry=MywPoint(1.2, 3.4)),
        ]

        recs = tab.insertRecs(data)

        for what in ["data", "records"]:
            self.show_output_from_list_gpkg(file_name, what, tab.name)

        # Insert a record
        self.subtest("RECORD INSERT")
        rec = dict(bldg_id="test/7", streetname="test_street7", geometry=MywPoint(2.1, -4.3))
        tab.insertRec(rec)

        self.show_output_from_list_gpkg(file_name, "records", tab.name)

        # Update a record
        self.subtest("RECORD UPDATE")
        id = 4
        rec = tab.getRec(id)
        rec["bldg_id"] = "test/4 updated"
        rec["pon_homes"] = 27
        rec["streetname"] = None
        rec["geometry"] = MywPoint(4.5, -6.7)
        tab.updateRec(rec)

        self.show_output_from_list_gpkg(file_name, "records", tab.name)

        # Update a record
        self.subtest("RECORD DELETE")
        tab.deleteRec(3)

        self.show_output_from_list_gpkg(file_name, "records", tab.name)

    def test_custom_mgr_class(self):
        """
        Tests that manager classes are loaded correctly    
        """

        db = self.db()
        nw_view = NetworkView(db.view(),self.progress)

        for mgr_type, mgr_class in nw_view.manager_classes.items():
            self.show("MGR CLASS ", mgr_type, " ", mgr_class)

        for trigger_type, trigger_details in nw_view.triggers.items():
            self.show("TRIGGERS ", trigger_type, " ", trigger_details)

    # ==============================================================================
    #                                FEATURE PACKAGE TESTS
    # ==============================================================================

    @test(modifies_db=False)
    def test_db_feature_package(self):
        ##
        ## Exercise database feature package (used for populate via mappings)
        ##

        # Get source view
        db = self.db()
        rec = db.view().get("service_area/SP")
        region = rec._field("boundary").geom()

        # Exercise
        pkg = DbFeaturePackage(db.view())
        self._test_feature_package("MASTER", pkg, True)

        pkg = DbFeaturePackage(db.view("design/NB120"))
        self._test_feature_package("DELTA NB120", pkg)

        pkg = DbFeaturePackage(db.view("design/NB120"), region)
        self._test_feature_package("DELTA NB120+REGION", pkg)

    def _test_feature_package(self, test, pkg, include_metadata=False):
        ##
        ## Exercise feature package PKG
        ##

        self.subtest(test)

        # Show metadata
        if include_metadata:

            for key, val in pkg.metadata.items():
                self.show("METADATA: ", key, ": ", val)
            self.show()

            for ft in pkg.featureTypes(sort=True):
                self.show("FEATURE: ", ft)
            self.show()

            for ft in pkg.featureTypes("p*", sort=True):
                for fld, desc in pkg.featureDesc(ft).fields.items():
                    self.show("FIELD: ", ft + "." + fld, " : ", desc.type)
            self.show()

        for ft in pkg.featureTypes(sort=True):
            self.show("DATA: ", ft, " : ", pkg.featureCount(ft))
        self.show()
