# Copyright: Ubisense Limited 2010-2023

from contextlib import contextmanager
import os, unittest, time
import json,fnmatch

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities
import urllib

from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.modules.dev_tools.server.test_framework.myw_test_suite import test
from myworldapp.modules.dev_tools.server.test_framework.myw_gui_test_suite import MywGuiTestSuite
from myworldapp.modules.dev_tools.server.test_framework.myw_memory_database import MywMemoryDatabase
from myworldapp.modules.dev_tools.server.test_framework.myw_app_proxy import MywAppProxy
from myworldapp.modules.dev_tools.server.test_framework.myw_proxy import MywProxyError


class CommsClientTestSuite(MywGuiTestSuite):
    """
    GUI tests for Comms client application
    """

    default_database = os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"
    uses_database = True

    # Set this to get consistent date strings with old selenium tests
    # and selenium-container tests
    browser_lang = "en-US"

    @classmethod
    def get_cli_args(cls, cli_arg_def):
        super().get_cli_args(cli_arg_def)

        # Used to overwrite the base_url and remote_url that is set in
        # parent class.
        def _modify_default(parser, dest, default):
            for action in parser._actions:
                if action.dest == dest:
                    action.default = default

        cli_arg_def.add_argument(
            "--browser_name",
            type=str,
            default="chrome",
            choices=cls.browsers(),
            help="Browser to test on",
        )

        cli_arg_def.add_argument(
            "--metrics_file",
            type=str,
            default=None,
            help="Name of file to write performance metrics to",
        )

        # This is the list of tags to filter tests by. Tags are added to tests via the @test
        # decorator. If a test has multiple tags, it will be run if any of the tags are in the list.
        cli_arg_def.add_argument(
            "--tags",
            type=str,         
            help="List of tags to filter tests by",
        ) 

        _modify_default(cli_arg_def, "base_url", os.getenv("MYW_COMMS_BASE_URL"))
        _modify_default(cli_arg_def, "remote_url", os.getenv("MYW_COMMS_REMOTE_URL"))

    # Class constants
    _test_names = [
        "add_structure",
        "delete_structure",
        "add_route",
        "update_route",
        "split_route",
        "delete_route",
        "add_conduits",
        "update_conduits",
        "delete_conduits",
        "add_cable",
        "update_cable",
        "delete_cable",
        "cut_cable",
        "cable_fields",
        "structure_palette",
        "equipment_palette",
        "add_assembly",
        "equipment_tree_terminations",
        "equipment_tree_terminations_copper",
        "equipment_tree_circuits",
        "equipment_tree_otdr",
        "equipment_tree_proposed",
        "equipment_tree_options",
        "add_equipment_from_tree",
        "move_equipment",
        "copy_equipment",
        "connect_port",
        "connect_cables",
        "cable_tree",
        "slack_loops",
        "set_tick_mark",
        "fiber_color_schemes",
        "route_circuit",
        "schematics",
        "tools_palette",
        "tools_connect",
        "tools_vw",
        "spec_chooser",
        "spec_manager",
        "labor_costs_chooser",
        "labor_costs_manager",
        "import_data",
        "report_preview_dialog",
        "loop_makeup_report",
        # 'color_scheme_config', # TODO: Fix and enable
        "design_mode",
        "design_permissions",
        "design_toolbar",
        "design_toolbar_changes",
        "data_validation",
        "design_rules",
        "design_conflicts",
        "master_edit_no_right",
        "master_edit_with_right",
        "config_settings",
        "change_tracking",
        "user_groups_manager",
        "design_markup",
        "layout_strand",
        "layout_strand_split",
        "structure_replace",
        "create_feature",
        "pathfinder_to_and_from_generate",
        "pathfinder_include_and_generate",
        "pathfinder_avoid_and_generate",
        "pathfinder_error",
        "pathfinder_success",
        "pathfinder_cancel",
        "copper_network",
        "customer_address",
        "loc_edit",
        "add_marker"
    ]

    # Username to login for tests by default
    default_login = {"username": "designer", "password": "designer!"}

    viewer_login = {"username": "viewer", "password": "viewer!"}

    admin_login = {"username": "admin", "password": "_mywWorld_"}

    # Specific logins keyed on test name
    # Intended to test different rights
    specific_logins = {
        "config_settings": admin_login,
        "master_edit_with_right": admin_login,
        "spec_manager": admin_login,
        "labor_costs_manager": admin_login,
        "color_scheme_config": admin_login,
        "design_toolbar": admin_login,
        "design_toolbar_changes": admin_login,
        "data_validation": admin_login,
        "design_permissions": admin_login,
        "design_rules": admin_login,
        "design_conflicts": admin_login,
        "update_route": admin_login,
        "user_groups_manager": admin_login,
        "layout_strand": admin_login,
        "pathfinder_to_and_from_generate": admin_login,
        "pathfinder_include_and_generate": admin_login,
        "pathfinder_avoid_and_generate": admin_login,
        "pathfinder_error": admin_login,
        "pathfinder_success": admin_login,
        "pathfinder_cancel": admin_login,
    }

    tests_to_skip = {}

    browser_width = 1600
    browser_height = 950

    # Controls what is output by show_database_changes
    # For comms, show data and delta schemas
    db_schema_filter = "d*"

    def __init__(self, db_session, cli_args):
        """
        Construct test suite operating on database DB_SESSION

        BASE_URL is the server to connect to e.g. "//localhost".
        BROWSER_NAME is the name of the browser to test,
        one of 'chrome', 'firefox' or 'ie'.

        Optional RESULT_SET specifies database location and key for
        recording test result summary. PROXY_OPTIONS are passed into MywProxy()"""

        # for comms devcontainer
        self.APP_LOCATIONS["cdiff"] = {"Linux": ["cdiff"]}

        super().__init__(db_session, cli_args)

        # Init slots
        self.db_session = db_session
        self.base_url = cli_args.base_url
        self.remote_url = cli_args.remote_url
        self.tags = cli_args.tags.split(",") if cli_args.tags else None
        self.maximize_window = None
        self.db_engine = self.db_session.bind
        self.language = None
        self.metrics_file = cli_args.metrics_file

        self.feature_list = json.loads(
            list(
                self.db_session.execute(
                    "SELECT value from myw.setting where name = 'mywcom.equipment'"
                )
            )[0][0]
        )
        # Set location for reference results
        self_dir = os.path.dirname(__file__)
        self.resource_dir = os.path.normcase(os.path.join(self_dir, "resources"))

        # Set location of test data
        self_module = MywProduct().moduleOf(__file__)
        self.test_data_dir = self_module.file("data")

        # Make temp results db_type and browser-specific  (useful when checking results of overnight build)
        self._temp_dir = self.temp_dir(self.db_engine.dialect.name, cli_args.browser_name)

        # Set strings to exclude from results
        self.output_mappings[self.base_url] = "<base_url>"

        # Restart browser at each test or not
        self.restart = self.browser_name in ["ie", "firefox", "chrome"]
        self.do_login = not self.browser_name in ["android"]

    @property
    def test_names(self):
        """
        The test names matching TESTS

        Subclassed to apply browser-specific filtering"""

        names = self._test_names

        tests_to_skip = self.tests_to_skip.get(self.browser_name, [])
        for name in self.tests_to_skip.get(self.browser_name, []):
            names.remove(name)

        return names

    def test_names_matching(self, spec):
        """
        The test names matching TESTS
        """

        # Find matches
        res = fnmatch.filter(self.test_names, spec)
       
        if res and self.tags:
            res = [name for name in res if self.test_has_tags(name,self.tags)]

        # Hack to support running of 'hidden' tests
        if not res:
            res.append(spec)

        return res
    
    def test_has_tags(self, test_name, tags):
        """
        Check if test has tags
        """

        test_tags = self.test_property(test_name, "tags")
       
        return not set(tags).isdisjoint(set(test_tags)) if test_tags else False

    # ==============================================================================
    #                               SETUP AND TEARDOWN
    # ==============================================================================

    def suite_setup(self):
        """
        Called before tests are run
        """

        # Save initial database state
        print("Saving database state")
        self._orig_db = MywMemoryDatabase(self.db_session, True)

        # Init driver
        self.driver = self.get_driver()

        # Skip initial restart
        self.first_test = True

        self.open_metrics_file()

    def open_metrics_file(self):

        self.metrics_file_fp = None
        if self.metrics_file:
            metrics_path = self.temp_file("results", self.metrics_file)
            print("Saving performance metrics to ", metrics_path)
            self.metrics_file_fp = open(metrics_path, "w")
            self.metrics_file_fp.write("test_name,duration (secs)\n")
            self.metrics_file_fp.flush()

    def setup(self, name):
        """
        Called before a test is run
        """

        super().setup(name)

        # Save initial state (for differencing)
        self.prev_db = self._orig_db

        if self.restart and not self.first_test:
            self.restart_browser(name)
        else:
            # Make sure we are logged in as the correct user
            if self.do_login:
                login_details = self.test_login_details(name)
                app = MywAppProxy(self.driver, **self.proxy_options)
                app.login(self.base_url, login_details["username"], login_details["password"])

        self.first_test = False

    def teardown(self, name):
        """
        Called after a test is run
        """

        super().teardown(name)

        # Restore initial database state
        self._orig_db.restore_to(self.db_session)

    def run_test(self, test_name, diff_tool=None):
        """
        Run TEST_NAME and check the result (handling errors)

        If optional DIFF_TOOL is given, show failures using that tool"""

        with self.metrics_context(test_name):
            super().run_test(test_name, diff_tool=diff_tool)

    @contextmanager
    def metrics_context(self, test_name):
        """
        Provide context for capturing metrics and writing to file
        """

        start_time = time.time()
        yield
        elapsed_time = time.time() - start_time

        if self.metrics_file_fp:
            self.metrics_file_fp.write(f"{test_name},{elapsed_time:.2f}\n")
            self.metrics_file_fp.flush()

    # ==============================================================================
    #                                  WORKAROUNDS
    # ==============================================================================

    def show_file(self, file_name, max_lines=None):
        """
        Shows contents of text file FILE_NAME

        subclassed to file name only instead of full path to file so it can be used in
        in tests ran in multiple places on multiple OSs
        """

        indent = "   "
        chunk_size = 500  # Used to split very long lines (which confuse csdiff)

        self.show()

        self.show("FILE: ", os.path.basename(file_name))

        if not os.path.exists(file_name):
            self.show("***ERROR*** File not found")
            return

        with open(file_name, "r") as in_strm:

            i_line = 0
            for line in in_strm:
                line = line.rstrip()

                for chunk in range(0, len(line), chunk_size):
                    self.show(indent, line[chunk : chunk + chunk_size])
                i_line += 1

                if i_line == max_lines:
                    self.show(indent, "...")

        self.show()

    def click_palette_btn(self, app, btn_name):
        structure_menu = app.proxy_for("@mywcom-palette-container")
        structure_button = app.xpath(
            name=btn_name,
            xpath='//div[@id="{}-tooltip-container" and @class="paletteTooltip-container"]'.format(
                btn_name
            ),
        )
        structure_menu.click_element(name=btn_name, el=structure_button)

    # ==============================================================================
    #                                  HELPERS
    # ==============================================================================

    def get_driver(self):
        if self.remote_url is None:
            driver = self._instantiate_local_webdriver()
        else:
            driver = self._instantiate_remote_webdriver()
        return driver

    def restart_browser(self, test_name):
        """
        Restart browser and login again.
        TEST_NAME required to determine the correct login for the test"""

        if self.browser_name != "firefox":
            self.driver.quit()
        else:
            self.driver.close()
        self.driver = self.get_driver()
        app = MywAppProxy(self.driver, **self.proxy_options)

        self.driver.set_window_position(0, 0)
        self.driver.set_window_size(self.browser_width, self.browser_height)

        login_details = self.test_login_details(test_name)
        app.login(self.base_url, login_details["username"], login_details["password"])

    def application(
        self, application="mywcom", delta=None, basemap="None", layout="desktop", touchscreen=False
    ):
        """
        Moves client to a myWorld application and returns proxy for an application
        """

        url = self.base_url + "/{}.html?localstate=false&layout={}".format(application, layout)

        if delta:
            url = url + "&delta={}".format(delta)

        if basemap:
            url = url + "&basemap={}".format(basemap)

        if self.language:
            url = url + "&lang={}".format(self.language)

        touchscreen_url_param = "true" if touchscreen is True else "false"
        url = url + "&touchscreen={}".format(touchscreen_url_param)

        app = MywAppProxy(self.driver, name=application.title(), **self.proxy_options)

        app.goto(url)

        if application != "config":
            app.wait_until_present("Structures")  # Waits for map to complete

        self._app = app
        self._url = url

        return app

    def test_login_details(self, test_name):
        """
        Returns login username/password for test"""

        return self.specific_logins.get(test_name, self.default_login)

    def show_tree_node_titles(self, header, tree):
        """
        Print out title attribute of js tree leaf nodes. Will often be hover text
        """

        self.show(header)
        leaf_nodes = tree.find_elements_by_class("jstree-leaf-node")
        for node in leaf_nodes:
            title = node.get_attribute("title")
            if title:
                self.show("Title: ", title)

    # =======================================================================================
    #                                          TESTS
    # =======================================================================================

    @test(tags=["structures"])
    def test_add_structure(self):
        """
        Exercise insert of structure
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        self.subtest("REPLACE JUNCTION BY MANHOLE")
        app.search("WH-M-13")
        map.set_zoom(20)
        app.click("Add object")
        app.click("Manhole")
        app.wait_until_present("Save")
        map.click_at(52.2240452, 0.1333795)  # Junction 5 (near manhole 4)
        app.click("Save")
        app.wait_until_gone("Save")
        self.show_database_changes("AFTER PLACE MANHOLE ON JUNCTION")

        self.subtest("MOVE MANHOLE")
        app.search("WH-M-35")
        app.click("Edit")
        map.set_geometry([52.2241764, 0.1363836])
        app.click("Save")
        app.wait_until_gone("Save")
        self.show_database_changes("AFTER MOVE MANHOLE")

    @test(tags=["structures"])
    def test_delete_structure(self):
        """
        Exercise delete structure
        """

        app = self.application(delta="design/NB046")

        self.subtest("REPLACE MANHOLE BY JUNCTION")
        app.search("WH-M-13")
        app.click("Edit")
        app.wait_until_present("Delete")
        app.click("Delete")
        equipment_breakdown = app.proxy_for("@equipment-breakdown")
        self.show_page_content("AFTER SHOWN EQUIPMENT BREAKDOWN", equipment_breakdown)
        app.wait_until_present("OK")
        app.click("OK")
        app.wait_until_present("Nothing to display")
        self.show_database_changes("AFTER DELETE MANHOLE")

        self.subtest("DELETE STRUCTURE WITH EQUIPMENT")
        app.search("WH-M-248")
        app.click("Edit")
        app.wait_until_present("Delete")
        app.click("Delete")
        equipment_breakdown = app.proxy_for("@equipment-breakdown")
        self.show_page_content(
            "AFTER SHOWN EQUIPMENT BREAKDOWN WITH EQUIPMENT", equipment_breakdown
        )
        app.wait_until_present("OK")
        app.click("OK")
        app.wait_until_present("Nothing to display")
        self.show_database_changes("AFTER DELETE STRUCTURE WITH EQUIPMENT")

        self.subtest("DELETE STRUCTURE WITH SPLICES")
        app.search("WH-M-83")
        app.click("Edit")
        app.wait_until_present("Delete")
        app.click("Delete")
        equipment_breakdown = app.proxy_for("@equipment-breakdown")
        self.show_page_content("AFTER SHOWN EQUIPMENT BREAKDOWN WITH SPLICES", equipment_breakdown)
        app.wait_until_present("OK")
        app.click("OK")
        app.wait_until_present("Nothing to display")
        self.show_database_changes("AFTER DELETE STRUCTURE WITH SPLICES")

    @test(tags=["routes"])
    def test_add_route(self):
        """
        Exercise add route to network
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        # Set view
        app.search("home")

        self.subtest("ADD ROUTE BETWEEN STRUCTURES")
        app.click("Add object")
        app.click("Route (Underground)")
        map.click_at(52.2241862934783, 0.136455707252)  # WH-M-35
        map.click_at(52.2241567185678, 0.1366508379579)  # WH-M-33
        map.click_at(52.2241567185678, 0.1366508379579)  # Finish
        app.click("Save")
        self.show_database_changes("AFTER ADD ROUTE BETWEEN STRUCTURES")

        self.subtest("SPLIT ROUTE WITH ROUTE")
        app.click("Add object")
        app.click("Route (Underground)")
        map.click_at(52.2241444420074, 0.1363839345515)  # UG Route 20
        map.click_at(52.2240754346739, 0.1364916374789)  # UG Route 16
        map.click_at(52.2240754346739, 0.1364916374789)  # Finish
        app.click("Save")
        self.show_database_changes("AFTER SPLIT ROUTE WITH ROUTE")

        self.subtest("JOIN ROUTES AT ENDS")
        app.click("Add object")
        app.click("Route (Underground)")
        map.click_at(52.22416473, 0.13630584)
        map.click_at(52.22419759, 0.13636217)
        map.click_at(52.22419759, 0.13636217)  # Finish

        app.click("Save")

        app.click("Add object")
        app.click("Route (Underground)")
        map.click_at(52.22419759, 0.13636217)
        map.click_at(52.22414759, 0.13636217)
        map.click_at(52.22414759, 0.13636217)  # Finish

        app.click("Save")
        self.show_database_changes("AFTER JOIN ROUTES")

        # TODO: Update a route using map.click_at_direct() (see core triggers test)

    @test(tags=["routes"])
    def test_split_route(self):
        """
        Exercise spliting a route (including splitting of underlying cables)
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        # Go to data
        app.search("WH-M-04")
        map.set_zoom(20)

        self.subtest("ADD MANHOLE AT VERTEX")
        app.click("Add object")
        app.click("Manhole")
        map.click_at(52.2241614, 0.1330128)  # halfway between M-04 and junction
        app.click("Save")
        app.wait_until_gone("New Manhole")
        self.show_database_changes("AFTER ADD MANHOLE AT VERTEX")

        self.subtest("ADD MANHOLE ON SEGMENT")  # Contains foward cable
        app.click("Add object")
        app.click("Manhole")
        map.click_at(52.2240713209034, 0.1333043128252)  # halfway between M-04 and junction
        app.click("Save")
        app.wait_until_gone("New Manhole")
        self.show_database_changes("AFTER ADD MANHOLE AT VERTEX")

        self.subtest("CONNECT ROUTE ON SEGMENT")  # Contains reversed cable
        app.click("Add object")
        app.click("Route (Underground)")
        map.click_at(52.2243984518067, 0.1333862543106)
        map.click_at(52.224172227516, 0.1329954846705)
        map.click_at(52.224172227516, 0.1329954846705)  # Finish
        app.click("Save")
        app.wait_until_gone("New Route (Underground)")
        self.show_database_changes("AFTER ADD UNDERGROUND ROUTE")

    @test(tags=["routes"])
    def test_update_route(self):
        """
        Exercise route update validation
        """

        # Run in master so coord jitter reported in DB changes
        app = self.application()
        map = app.map()

        # Edit/save route that has coords with high precision to verify no jitter
        self.subtest("SAVE EDIT NO CHANGE")
        app.search("Route (Underground): 3")
        app.wait()
        app.click("Route (Underground): 3")
        app.click("Edit")
        app.click("Save")
        self.show_database_changes("AFTER SAVE EDIT NO CHANGE")

        # Check disconnect prevented if route has cables
        self.subtest("ATTEMPT DISCONNECT STRUCTURE")
        app.click("Edit")

        feature_editor = app.proxy_for("@feature-edit-container")
        app.right_click("@map_canvas")
        app.click("Delete last")
        app.click("Save")
        self.show_page_content("ATTEMPT DISCONNECT STRUCTURE", feature_editor)
        self.show_database_changes("ATTEMPT DISCONNECT STRUCTURE")

    @test(tags=["routes"])
    def test_delete_route(self):
        """
        Exercise route deletion validation
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        self.subtest("DELETE UG ROUTE WITH CABLE (NOT PERMITTED)")
        app.search("Route (Underground): 40")
        app.click("Route (Underground): 40")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        app.wait_until_present("Route contains cable")
        app.click("Cancel")
        self.show_database_changes("AFTER ATTEMPT DELETE UNDERGROUND ROUTE")

        self.subtest("DELETE UG ROUTE WITH CONDUIT")
        app.search("Route (Underground): 88")
        app.click("Route (Underground): 88")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        self.show_database_changes("AFTER DELETE UNDERGROUND ROUTE")

        self.subtest("DELETE OVERHEAD ROUTE WITH CABLE (PREVENTED)")
        app.search("Route (Overhead): 32")
        app.click("Route (Overhead): 32")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        app.wait_until_present("Route contains cable")
        self.show_database_changes("AFTER ATTEMPT DELETE OVERHEAD ROUTE")

        # ENH: Remove some drops from test data and delete an OH route

    @test(tags=["conduits"])
    def test_add_conduits(self):
        """
        Exercise conduit routing
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        # Go to data
        app.search("WH-M-14")
        map.set_zoom(19)

        # Route some conduits
        app.click("Add object")
        app.click("Conduit")

        # choose spec
        # ENH: Do this in spec test
        app.click("@spec-edit-btn")
        app.click("@spec-grid-conduit_spec/JDP-54MM-Grey")

        # show specced fields
        feature_editor = app.proxy_for("@feature-edit-container")
        self.show_page_content("Conduit feature editor with spec", feature_editor)

        map.click_at(52.2243968, 0.1336411)  #  WH-M-58
        map.click_at(52.2241684, 0.1328216)  #  WH-M-05
        map.click_at(52.2239507, 0.1335110)  #  WH-M-13
        map.click_at(52.2239507, 0.1335110)  # Finish

        # Preview the routing
        feature_editor.click("Preview")
        self.show_page_content("Conduit Routing Preview", feature_editor)

        app.click("Save")
        app.wait_until_gone("New Conduit")
        self.show_database_changes("AFTER ADD CONDUITS")

        # Route some blown fiber tubes
        app.click("Add object")
        app.click("Blown Fiber Tube")

        # Set attributes
        feature_editor = app.proxy_for("@feature-edit-container")
        feature_editor.set("Name", "Test")
        feature_editor.set("Bundle Size", 4)

        # Set trail on structures to route through
        map.click_at(52.2243968, 0.1336411)  #  WH-M-58
        map.click_at(52.2241684, 0.1328216)  #  WH-M-05
        map.click_at(52.2239507, 0.1335110)  #  WH-M-13
        map.click_at(52.2239507, 0.1335110)  # Finish

        # Preview the routing
        feature_editor.click("Preview")
        self.show_page_content("Blown Fiber Tube Routing Preview", feature_editor)

        app.click("Save")
        app.wait_until_gone("New Blown Fiber Tube")
        self.show_database_changes("AFTER ADD BLOWN FIBER TUBES")

    @test(tags=["conduits"])
    def test_update_conduits(self):
        """
        Exercise blown fiber tube joining and cutting
        """

        app = self.application(delta="design/NB046")
        details_pane = app.details_pane()

        app.search("WH-M-48")

        cable_tree = details_pane.proxy_for("Cables", 2)

        # Toggle to Show conduits mode
        cable_tree.click("@control-setting")
        app.click("Conduits")

        # Cut pass-through tubes
        app.wait_until_present("BF Tube: WH-BF-73 : 1 == BF Tube: WH-BF-73 : 1")
        cable_tree.right_click("BF Tube: WH-BF-73 : 1 == BF Tube: WH-BF-73 : 1")
        app.click("Cut")
        app.wait_until_present("BF Tube: WH-BF-77 : 2 == BF Tube: WH-BF-77 : 2")
        cable_tree.right_click("BF Tube: WH-BF-77 : 2 == BF Tube: WH-BF-77 : 2")
        app.click("Cut")

        self.show_page_content("EQUIPMENT TREE WITH CUT PASS THROUGH TUBES", cable_tree)
        self.show_database_changes("AFTER CUT PASS THROUGHS")

        # Now join cut tubes so tube 1 now joined to tube 2 passing through manhole
        cable_tree.right_click("BF Tube: WH-BF-73 : 1{1}")
        app.click("Join Conduits")

        join_dialog = app.proxy_for("@connections-dialog-form")
        join_dialog.click("BF Tube: WH-BF-77 : 2{2}")
        app.click("Connect")

        app.wait_until_gone("Connect Conduits")

        app.wait_until_present("BF Tube: WH-BF-73 : 1 == BF Tube: WH-BF-77 : 2")
        app.right_click("BF Tube: WH-BF-73 : 1 == BF Tube: WH-BF-77 : 2")
        app.click("Show Path")

        self.show_page_content("JOINED TUBE PATH", app)
        self.show_database_changes("AFTER JOIN TUBES")

    @test(tags=["conduits"])
    def test_delete_conduits(self):
        """
        Exercise conduit deletion validation
        """
        app = self.application(delta="design/NB046")

        app.search("WH-CND-016")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        app.wait_until_present("Conduit contains cable")
        feature_editor = app.proxy_for("@feature-edit-container")
        self.show_page_content("Conduit feature editor with 'contains cable' error", feature_editor)
        app.click("Cancel")

        # ENH: delete conduit with inner conduit

        # Test delete blown fiber tube with cable
        app.search("Route 350")
        app.click("Route (Underground): 350{0}")
        app.click("BF Tube: WH-BF-8 : 2")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        app.wait_until_present("Conduit contains cable")
        feature_editor = app.proxy_for("@feature-edit-container")
        self.show_page_content(
            "Blown fiber tube feature editor with 'contains cable' error", feature_editor
        )

        # Test delete blown fiber tube with no cable
        app.search("Route 350")
        app.click("Route (Underground): 350{0}")
        app.click("BF Tube: WH-BF-1 : 1")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        app.wait_until_present("Nothing to display")
        self.show_database_changes("AFTER BLOWN FIBER TUBE DELETE")

    @test(tags=["cables"])
    def test_add_cable(self):
        """
        Exercise equipment and cable trees
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        # Go to data
        app.search("WH-M-04")
        map.set_zoom(19)

        app.click("Add object")
        app.click("Fiber Cable")

        # choose spec
        # ENH: Do this in spec test
        app.click("@spec-edit-btn")
        app.click("@spec-grid-fiber_cable_spec/D-144-LA-8W-F12NS")

        # show specced fields
        feature_editor = app.proxy_for("@feature-edit-container")
        self.show_page_content("Cable Feature Editor with spec", feature_editor)

        map.click_at(52.2238809, 0.1336075)  # WH-C-04
        map.click_at(52.2241627, 0.1335888)  # WH-M-14
        map.click_at(52.2240822, 0.1329678)  # WH-M-06
        map.click_at(52.2240822, 0.1329678)  # Finish
        app.click("Save")
        app.wait_until_gone("Preview")
        self.show_database_changes("AFTER ADD CABLE")

        """add internal cable from equpipment tree"""
        app.search("Woodhead Hub")
        app.wait_until_present("Patch Panel: WH-ODF-01")
        equip_tree = app.proxy_for("Equipment", 2)
        equip_tree.right_click("Building: Woodhead Hub")
        app.hover("Add")
        app.wait_until_present("Fiber Cable")
        app.click("Fiber Cable")
        app.click("@spec-edit-btn")
        app.wait(1)
        app.click("@spec-grid-fiber_cable_spec/D-096-LA-8W-F12NS")
        app.click("Save")
        app.wait_until_gone("Preview")
        self.show_database_changes("AFTER ADD INTERNAL CABLE")

    @test(tags=["cables"])
    def test_update_cable(self):
        """
        Exercise cable update
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        self.subtest("NULL UPDATE")
        app.search("WH-FCB-021")
        app.click("Edit")
        app.wait_until_present("Save")
        app.click("Save")
        app.wait_until_gone("Preview")
        self.show_database_changes("AFTER SAVE CABLE NO CHANGES")

        self.subtest("CHANGE OF PATH")
        app.search("WH-FCB-020")
        app.click("Edit")
        app.right_click("@map_canvas")
        app.click("Clear")
        map.click_at(52.2263050233211, 0.1433643994437)  # WH-M-91
        map.click_at(52.2275423017197, 0.1403465867043)  # WH-M-88
        map.click_at(52.2269767208936, 0.1426023244858)  # WM-M-83
        map.click_at(52.2269767208936, 0.1426023244858)  # Finish
        app.click("Save")
        app.wait_until_gone("Preview")
        self.show_database_changes("AFTER SAVE CABLE CHANGES")

        self.subtest("CONNECTIONS CONSTRAINT")
        app.search("WH-FCB-021")
        app.click("Edit")
        cable_editor = app.proxy_for("@feature-edit-container")
        app.click("@spec-clear-btn")
        app.set("Fiber Count", 4)
        app.click("Save")
        app.wait_until_present("Would invalidate existing connections")
        self.show_database_changes("AFTER INVALID FIBER COUNT")
        app.click("Cancel")

        self.subtest("CIRCUITS CONSTRAINT")
        app.search("WH-FCB-006")
        app.click("Edit")
        app.right_click("@map_canvas")
        app.click("Clear")
        map.click_at(52.2240915, 0.1365579)  # WH-M-34
        map.click_at(52.2247117, 0.1373502)  # WH-0150
        map.click_at(52.2252522, 0.1383543)  # WM-M-37
        map.click_at(52.2252522, 0.1383543)  # Finish
        app.click("Save")
        app.wait_until_present("Cable has circuits")
        self.show_database_changes("AFTER INVALID RE-ROUTE")
        app.click("Cancel")

    @test(tags=["cables"])
    def test_delete_cable(self):
        """
        Exercise equipment and cable trees
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        self.subtest("DELETE")
        app.search("WH-FCB-018")
        app.wait_until_present("Edit")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        self.show_database_changes("AFTER DELETE CABLE")

        self.subtest("CIRCUITS CONSTRAINT")
        app.search("WH-FCB-006")
        app.wait_until_present("Edit")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        app.wait_until_present("Cable has circuits")
        self.show_database_changes("AFTER ATTEMPT DELETE CABLE WITH CIRCUITS")
        app.click("Cancel")

    @test(modifies_db=True,tags=["cables"])
    def test_cut_cable(self):
        """
        Exercise cable split functionality
        """

        app = self.application(delta="design/NB046")

        # Show the manhole and cable tree
        app.search("XX-M-220")
        app.wait_until_gone("Loading...")

        equip_tree = app.proxy_for("Equipment", 2)
        cable_tree = app.proxy_for("Cables", 2)

        cable_tree.click("@jstree-ocl{1}")
        app.right_click("A (0/72) @316")
        app.click("Cut cable")
        app.wait(1)
        cable_tree.click("@jstree-ocl{8}")  # Should be new cable
        self.show_page_content("AFTER CUT CABLE", cable_tree)
        self.show_database_changes("AFTER CUT CABLE")

        # Add splice to house connection
        equip_tree.right_click("Manhole: XX-M-220")
        app.hover("Add")
        app.wait_until_present("Mixed")
        app.hover("Mixed")
        app.click("Splice Closure")
        app.click("Save")
        app.wait(2)

        # Menu should now show cut and connect
        cable_tree.click("@jstree-ocl{3}")
        app.right_click("A (0/72) @316{2}")
        app.click("Cut cable and reconnect")
        app.wait_until_present("Splice: BB-FCB-018 -> BB-FCB-100001 (72)")

        # Cut and connection
        self.show_page_content("AFTER CUT AND CONNECT CABLE", equip_tree)
        self.show_page_content("AFTER CUT AND CONNECT CABLE", cable_tree)
        self.show_database_changes("AFTER CUT AND CONNECT CABLE")

    @test(modifies_db=False,tags=["cables"])
    def test_cable_fields(self):
        """
        Exercise cable calculated fields
        """
        # ENH: Could be replaced by JS API Test

        app = self.application()
        details_pane = app.details_pane()
        app.search("BB-FCB-017")
        details_pane.wait_until_present("Fiber Cable: BB-FCB-017 (72)")

        details_pane.click("Items{1}")  # Connections
        details_pane.wait_until_gone("Fiber Cable: BB-FCB-017 (72)")
        # self.show_page_content('AFTER CLICK CONNECTIONS',details_pane) Order unstable
        details_pane.click("Go back")
        details_pane.wait_until_present("Fiber Cable: BB-FCB-017 (72)")

        details_pane.click("Items{2}")  # Splices
        self.show_page_content("AFTER CLICK SPLICES", details_pane)

    @test(modifies_db=False,tags=["palette"])
    def test_structure_palette(self):
        """
        Exercise structures palette
        """
        app = self.application(delta="design/NB046")

        # Enter structure mode
        app.wait_until_present("Structure palette")
        app.click("Structure palette")
        structure_palette = app.proxy_for("@mywcom-structure-palette{0}")
        self.show_page_content("AFTER ENTER STRUCTURE MODE", structure_palette)

        # Check click activates editor
        self.click_palette_btn(app, "Manhole")
        self.show_page_content("AFTER CLICK PALETTE ENTRY: MANHOLE", app)

        # Exercise add item to palette
        app.right_click("Pole (Wood)")
        app.click("Add object")
        self.show_page_content("AFTER ADDING A POLE TO THE PALETTE", app)

        # Exercise button rename
        app.right_click("Manhole-1")
        app.click("Rename")
        dialog = app.proxy_for("Rename Palette Item", 2)
        dialog.set("Name", "Manhole (MCX)")
        app.click("OK")
        self.show_page_content("AFTER RENAMING A BUTTON", app)

        # Exercise removing a button
        app.right_click("Pole (Wood)")
        app.click("Remove")
        self.show_page_content("AFTER REMOVING A BUTTON", app)

        # Exercise reset to default
        app.right_click("Pole (Steel)")
        app.click("Reset to default")
        app.wait(10)
        app.click("OK")
        self.show_page_content("AFTER RESETTING TO DEFAULT", app)

    @test(modifies_db=False,tags=["palette"])
    def test_equipment_palette(self):
        """
        Exercise equipment palette
        """
        app = self.application(delta="design/NB046")

        # Access the toolbar button to enter equipment mode
        app.wait_until_present("Equipment palette")
        app.click("Equipment palette")
        self.show_page_content("AFTER ENTER EQUIPMENT MODE", app)

        # Select a manhole
        app.search("WH-M-35")
        app.wait_until_present("Fiber Cable: WH-FCB-004 (144)")
        self.show_page_content("AFTER SELECT MANHOLE", app)

        # Check palette entry activates edit with properties
        structure_menu = app.proxy_for("@mywcom-equipment-palette")
        structure_menu.click(
            "@Multiplexer 12-Way-tooltip-container{0}"
        )  # Not sure what this was supposed to click on
        self.show_page_content("AFTER CLICK PALETTE ENTRY: MULTIPLEXER 12-WAY", app)

        # Exercise add item to palette
        app.click("Go back")
        app.wait_until_gone("Loading...")
        app.click("WH-SC-001")
        app.wait_until_present("Multiplexer 8-Way")
        app.right_click("Multiplexer 8-Way")
        app.click("Add object")
        app.search("WH-M-35")

        self.show_page_content("AFTER ADDING A SPLICE CLOSURE TO THE PALETTE", app)

        # Exercise button rename
        app.right_click("Splice Closure-1")
        app.click("Rename")
        dialog = app.proxy_for("Rename Palette Item", 2)
        dialog.set("Name", "Splice Closure (EM1621)")
        app.click("OK")
        self.show_page_content("AFTER RENAMING A BUTTON", app)

        # Exercise removing a button
        app.right_click("Multiplexer 8-Way")
        app.click("Remove")
        self.show_page_content("AFTER REMOVING A BUTTON", app)

        # Exercise reset to default
        app.right_click("Multiplexer 12-Way")
        app.click("Reset to default")
        app.click("OK")
        self.show_page_content("AFTER RESETTING TO DEFAULT", app)

    @test(tags=["palette"])
    def test_tools_palette(self):

        app = self.application()
        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        tools_palette = app.proxy_for("@mywcom-tools-palette")
        self.show_page_content("No open design", tools_palette)  # No design open

        app.search("Design NB046")
        app.wait_until_present("Design: NB046")
        do_toolbar = app.proxy_for("@delta-owner-toolbar")
        do_toolbar.click("Open")
        self.show_page_content(
            "Design NB046 Open, Designing", tools_palette
        )  # Design open, editable

        app.click("Edit")
        feature_editor = app.proxy_for("@feature-edit-container")
        feature_editor.set_search_select("State", "New")
        app.click("Save")
        app.wait(1)
        self.show_page_content("Design NB046 Open, New", tools_palette)  # Design open, not editable

        app.click("Edit")
        feature_editor.set_search_select("State", "Designing")
        app.click("Save")
        app.wait(1)
        self.show_page_content(
            "Design NB046 Open, Designing", tools_palette
        )  # Design open, editable (again)
        do_toolbar.click("Close")

        self.show_page_content("No open design", tools_palette)  # No design open

    @test(modifies_db=False,tags=["equipment_tree"])
    def test_equipment_tree_terminations(self):
        """
        Exercise equipment tree readonly functionality
        """

        app = self.application()
        details_pane = app.details_pane()

        # Get a pole with equipment in it
        app.search("WH-P-006")
        app.wait_until_present("Splitter: WH-SPL-004")
        app.click("@jstree-ocl{4}")  # Arrow next to WH-SPL-001
        equip_tree = app.proxy_for("Equipment", 2)
        self.show_page_content("AFTER EXPAND SPLITTER", equip_tree)

        # Swap to a child equipment
        app.click("Splice Closure: WH-SC-012")
        app.wait_until_present("Splitter: WH-SPL-004")
        self.show_page_content("AFTER SELECT SPLICE CLOSURE", equip_tree)

        # Excercise show termination on single fiber
        app.click("@jstree-ocl{3}")  # Arrow next to WH-SPL-001
        app.double_click("OUT{1}")
        app.right_click("3 -> DROP-003 #1")
        app.click("Show terminations")
        app.wait(1)
        self.show_page_content("AFTER SINGLE FIBER SHOW TERMINATIONS", equip_tree)

        # Excercise show paths on sheath
        app.right_click("OUT{1}")
        app.click("Show terminations")
        app.wait(1)
        self.show_page_content("AFTER FIBER SHEATH SHOW TERMINATIONS", equip_tree)

        # Exercise trace upstream context menu item
        app.right_click("3 -> DROP-003 #1")
        app.click("Trace upstream")
        app.wait_until_present("@results-trace")

        self.show_page_content("AFTER TRACE UPSTREAM", details_pane)

        # Exercise state persistance
        app.click("Go back")
        app.wait_until_present("3 -> DROP-003 #1")
        self.show_page_content("AFTER PRESS BACK BUTTON", equip_tree)

        # Excercise trace downstream with multiple pin
        self.select_in_tree(app, ["3 -> DROP-003 #1", "4 -> DROP-004 #1", "5 -> DROP-005 #1"])
        app.right_click("3 -> DROP-003 #1")
        app.click("Trace downstream")
        app.wait(1)
        self.show_page_content("AFTER MULTIPLE TRACE DOWNSTEAM", details_pane)
        app.click("Go back")

    @test(modifies_db=False,tags=["equipment_tree"])
    def test_equipment_tree_terminations_copper(self):
        """
        Exercise equipment tree show terminations for copper
        """

        app = self.application()

        # Get manhole with copper cable
        app.search("WH-M-11")
        app.click("Manhole: WH-M-11")
        app.wait(2)

        app.click("@jstree-ocl{4}")  # Arrow next to cable
        cable_tree = app.proxy_for("Cables", 2)
        app.right_click("IN{1}")
        app.click("Show terminations")
        app.wait(1)

        self.show_page_content("AFTER COPPER SEGMENT SHOW TERMINATIONS", cable_tree)
        self.show_tree_node_titles("CABLE TREE HOVER TEXT", cable_tree)

    @test(modifies_db=False,tags=["equipment_tree","circuit"])
    def test_equipment_tree_circuits(self):
        """
        Exercise display of circuits on equipment tree
        """

        app = self.application()
        details_pane = app.details_pane()

        # Exercise show circuits on splice node
        app.search("WH-C-01")
        app.right_click("Splice: WH-FCB-023 -> WH-FCB-001 (24)")
        app.click("Show circuits")
        equip_tree = app.proxy_for("Equipment", 2)

        self.show_page_content("AFTER SPLICE NODE SHOW CIRCUITS", equip_tree)

        # Exercise show terminations on splice node
        app.right_click("Splice: WH-FCB-023 -> WH-FCB-001 (24)")
        app.click("Show terminations")
        self.show_page_content("AFTER SPLICE NODE SHOW TERMINATIONS", equip_tree)

    @test(modifies_db=False,tags=["equipment_tree","tracing"])
    def test_equipment_tree_otdr(self):
        """
        Exercise OTDR tracing from equipment tree
        """

        app = self.application()
        details_pane = app.details_pane()

        # Find a patch panel in hub with connected ports
        app.search("Woodhead Hub")
        app.wait_until_present("Building: Woodhead Hub{2}")
        equip_tree = app.proxy_for("Equipment", 2)

        # expand equipment tree for patch panel
        equip_tree.double_click("Patch Panel: WH-ODF-01")
        app.wait_until_present("OUT")
        equip_tree.double_click("OUT")
        equip_tree.right_click("8 -> WH-FCB-022 #8")  # Tree entry for port
        app.click("OTDR downstream")
        otdr_dlg = app.proxy_for("OTDR Downstream Trace")

        app.set("Distance", "3000")
        app.click("OK{last}")
        app.wait_until_present("@results-trace")

        self.show_page_content("AFTER OTDR DOWNSTREAM TRACE", details_pane)

        # Find a wall box at the end of the network
        app.search("WH-0015")

        # expand equipment tree for wall box
        equip_tree = app.proxy_for("Equipment", 2)
        equip_tree.double_click("ONT: WH-ONT-015")
        equip_tree.double_click("IN")
        equip_tree.right_click("1 <- DROP-015 #1")
        app.click("OTDR upstream")

        app.click("OK{last}")
        app.wait_until_present("@results-trace")

        self.show_page_content("AFTER OTDR UPSTREAM TRACE", details_pane)

    @test(modifies_db=False,tags=["equipment_tree","proposed"])
    def test_equipment_tree_proposed(self):
        """
        Exercise display of proposed features in equipment tree
        """

        app = self.application()

        # Show proposed equipment
        app.search("WH-M-07")
        equip_tree = app.proxy_for("Equipment", 2)
        if not list(equip_tree.visible_elements()):
            equip_tree.double_click("Manhole: WH-M-07")
        self.show_page_content("SHOW PROPOSED SPLICE CLOSURE", equip_tree)

        # Show proposed splices
        app.search("WH-C-11")
        app.wait_until_present("Splice Closure: WH-SC-039")
        equip_tree = app.proxy_for("Equipment", 2)
        self.show_page_content("SHOW PROPOSED SPLICE", equip_tree)

    @test(modifies_db=False,tags=["equipment_tree","settings"])
    def test_equipment_tree_options(self):
        """
        Exercise equipment tree settings
        - Toggling fiber colors
        """

        app = self.application()
        details_pane = app.details_pane()

        # Get a cabinet with equipment in it
        app.search("WH-C-01")
        app.wait_until_present("Splice: WH-FCB-023 -> WH-FCB-001 (24)")

        equip_tree = details_pane.proxy_for("Equipment", 2)
        equip_tree.double_click("Splice: WH-FCB-023 -> WH-FCB-001 (24)")
        self.show_page_content("EQUIPMENT TREE WITH FIBER COLORS", equip_tree)

        # Use the settings menu to toggle the fiber colors
        equip_tree.click("@control-setting")
        app.click("Fiber colors")

        app.wait_until_present("Splice: WH-FCB-023 -> WH-FCB-001 (24)")
        equip_tree = details_pane.proxy_for("Equipment", 2)
        self.show_page_content("EQUIPMENT TREE WITHOUT FIBER COLORS", equip_tree)

        app.search("WH-M-07")
        equip_tree = app.proxy_for("Equipment", 2)
        self.show_page_content("SHOW EQUIPMENT WITH PROPOSED OBJECTS", equip_tree)

        # Use the settings menu to toggle proposed objects
        equip_tree.click("@control-setting")
        app.click("Proposed objects")

        equip_tree = app.proxy_for("Equipment", 2)
        self.show_page_content("SHOW EQUIPMENT WITHOUT PROPOSED OBJECTS", equip_tree)

    @test(tags=["equipment_tree"])
    def test_add_equipment_from_tree(self):
        """
        Exercise adding equipment to structures and equipment from the equipment trees
        """

        app = self.application(delta="design/NB046")
        app.wait_until_present("Details")
        details_pane = app.details_pane()

        # Get a pole with equipment in it
        app.search("WH-P-006")
        app.wait_until_present("Splitter: WH-SPL-004")
        equip_tree = app.proxy_for("Equipment", 2)

        # Add a equipment on to a structure
        equip_tree.right_click("Pole: WH-P-006")
        app.hover("Add")
        app.wait_until_present("Mixed")
        app.hover("Mixed")
        app.click("Splice Closure")
        app.click("Save")
        app.wait_until_present("Pole: WH-P-006")

        # Add a equipment on to another equipment
        equip_tree.right_click("Splice Closure: WH-SC-012")
        app.hover("Add")
        app.wait_until_present("Fiber")
        app.hover("Fiber")
        app.click("Multiplexer")

        app.set("In Ports", 5)
        app.click("Save")

        app.wait_until_present("Pole: WH-P-006")

        self.show_page_content("AFTER ADDING EQUIPMENT FROM CONTEXT MENU", equip_tree)
        self.show_database_changes("AFTER ADDING EQUIPMENT")

    @test(tags=["palette"])
    def test_add_assembly(self):
        """
        Exercise palette assembly functions
        """

        app = self.application(delta="design/NB046")

        # Select hub
        app.search("Woodhead Hub")
        app.wait_until_gone("Loading...")

        # Activate palette
        app.click("Equipment palette")
        app.wait_until_present("@mywcom-equipment-palette")
        palette = app.proxy_for("@mywcom-equipment-palette")
        app.wait_until_gone("Loading...")
        # Add assembly to palette
        app.click("Rack: WH-R-01")
        app.wait(1)
        app.right_click("@mywcom-equipment-palette")
        app.click("Add assembly")
        app.wait_until_gone("Loading...")
        self.show_page_content("AFTER ADD TO PALETTE", palette)

        # Place new assembly in hub
        app.wait(1)
        palette = app.proxy_for("@mywcom-equipment-palette")
        palette.click("@Rack-tooltip-container{0}")
        app.click("Save")
        app.wait(1)

        self.show_database_changes("AFTER ADD RACK ASSEMBLY")

    @test(tags=["equipment"])
    def test_move_equipment(self):
        """
        Exercise moving equipment
        """

        app = self.application(delta="design/NB046")
        details_pane = app.details_pane()

        # First test moving equipment between structures, this will will delete any
        # fiber connections

        # Find a structure with some equipment that has fiber connections
        app.search("WH-P-009")
        app.click("Pole: WH-P-009{1}")

        # Cut splitter to clipboard
        app.right_click("Fiber Splitter: WH-SPL-008 (8 way)")
        app.click("Cut")

        # Select different structure to move it to
        app.search("WH-M-247")
        app.click("Manhole: WH-M-247{1}")

        # Paste it into splice closure
        app.right_click("Splice Closure: WH-SC-029")
        app.click("Paste: Fiber Splitter: WH-SPL-008 (8 way)")

        # Confirm deletion
        app.click("OK")

        self.show_database_changes("AFTER MOVE EQUIPMENT TO DIFFERENT STRUCTURE")

        # Now move some equipment to different housings at the same structure
        # This does not delete fiber connections

        # Find a structure with a couple of splice closures, and move some equipment with fiber
        # connections between the closures
        app.search("WH-P-005")
        app.click("Pole: WH-P-005{1}")

        # Cut splitter to clipboard
        app.right_click("Fiber Splitter: WH-SPL-012 (4 way)")
        app.click("Cut")

        # Select different splice closure at same structure to move it to
        # It will just go ahead and move it retaining connections with no confirmation
        app.right_click("Splice Closure: WH-SC-015")
        app.click("Paste: Fiber Splitter: WH-SPL-012 (4 way)")

        self.show_database_changes("AFTER MOVE EQUIPMENT WITHIN SAME STRUCTURE")

        # TODO: test drag/drop of equipment within same structure

    @test(tags=["equipment"])
    def test_copy_equipment(self):
        """
        Exercise copying equipment

        This copies the equipment and children but does not copy any fiber connections"""

        app = self.application(delta="design/NB046")

        # Find a structure with some equipment that has fiber connections
        app.search("WH-P-004")
        app.click("Pole: WH-P-004{1}")

        # Copy splice closure that has equipment & connections to clipboard
        app.right_click("Splice Closure: WH-SC-013")
        app.click("Copy")

        # Select different structure to move it to
        app.search("WH-M-244")
        app.click("Manhole: WH-M-244{1}")

        # Paste it to the structure
        app.right_click("Manhole: WH-M-244{2}")
        app.click("Paste copy of: Splice Closure: WH-SC-013")

        self.show_database_changes("AFTER COPY EQUIPMENT BETWEEN STRUCTURES")

    @test(tags=["connections"])
    def test_connect_port(self):
        """
        Exercise connect / disconnect port
        """

        app = self.application(delta="design/NB046")

        # # Find a pole with free ports
        app.search("WH-P-004")
        details_pane = app.details_pane()
        equip_tree = details_pane.proxy_for("Equipment", 2)

        # Close details pane (prevents problems with context menu later)
        app.click("Pole: WH-P-004{1}")  # ENH: Find a cleaner way

        # Connect out port -> fiber
        equip_tree.click("@jstree-ocl{4}")  # arrow next to splitter WH-SPL-003
        equip_tree.double_click("OUT")
        equip_tree.right_click("6")  # Tree entry for port
        app.click("Connect")
        app.wait(5)

        conn_dialog = app.proxy_for("@connections-dialog-form")
        conn_dialog.double_click("DROP-018 (1/4)")
        conn_dialog.click("3{3}")  # Fiber on drop cable
        app.click("Connect")
        app.wait_until_present("6 -> DROP-018 #3")
        self.show_database_changes("AFTER CONNECT PORT -> FIBRE DOWNSTREAM")

        # Connect in port -> fiber
        app.search("WH-M-34")
        app.wait_until_present("Multiplexer: WH-MUX-002 (24 way)")
        equip_tree.click("@jstree-ocl{3}")  # arrow next to multiplexer WH-MUX-002
        equip_tree.double_click("IN")
        equip_tree.right_click("6{1}")  # Tree entry for port
        app.click("Connect")

        conn_dialog = app.proxy_for("@connections-dialog-form")
        conn_dialog.wait_until_present("WH-FCB-003 (0/144)")
        conn_dialog.double_click("WH-FCB-003 (0/144)")
        conn_dialog.click("137")
        app.wait(1)
        app.click("Connect")
        app.wait_until_present("6 <- WH-FCB-003 #1")
        self.show_database_changes("AFTER CONNECT PORT -> FIBRE UPSTREAM")
        # ENH: Check tree has updated

        # Disconnect out port -> fiber
        app.search("WH-P-004")
        app.wait_until_present("Splitter: WH-SPL-002 (8 way)")
        equip_tree.click("@jstree-ocl{3}")  # arrow next to splitter WH-SPL-002
        equip_tree.double_click("OUT{1}")
        equip_tree.right_click("3 -> DROP-018 #1")  # Tree entry for port
        app.click("Disconnect")
        equip_tree.wait_until_gone("3 -> DROP-018 #1")
        self.show_database_changes("AFTER DISCONNECT PORT -> FIBRE DOWNSTREAM")

        # Attempt disconnect out with circuit
        equip_tree.right_click("2 -> DROP-017 #1")  # Tree entry for port
        app.click("Disconnect")
        app.wait_until_present("Connection has circuits")
        app.click("Close{0}")

        # Connect port -> port
        # exercises connection exchange side to disribution side connection
        app.search("Woodhead Hub")
        app.wait_until_present("Patch Panel: WH-ODF-01E")
        equip_tree.click("@jstree-ocl{5}")  # arrow next to patch panel WH-ODF-01E
        equip_tree.double_click("OUT")
        equip_tree.right_click("46{1}")
        app.click("Connect")
        conn_dialog = app.proxy_for("@connections-dialog-form")
        conn_dialog.click("Equipment")
        app.wait(1)
        conn_dialog.double_click("Patch Panel: WH-ODF-01")
        conn_dialog.double_click("IN")
        conn_dialog.click("46{1}")
        app.wait(1)
        app.click("Connect")
        app.wait_until_present("46 -> WH-ODF-01 #IN:46")
        self.show_database_changes("AFTER CONNECT PORT -> PORT")

    def test_connect_cables(self):
        """
        Exercise splice connect / disconnect
        """

        app = self.application(delta="design/NB046")

        # Find a splice closure
        app.search("WH-M-245")
        equip_tree = app.details_pane().proxy_for("Equipment", 2)

        # Open splice (so we can check later that display updated itself)
        equip_tree.double_click("Splice: WH-FCB-021 -> RISER-002 (3)")

        # Open dialog
        equip_tree.right_click("Splice Closure: WH-SC-027")
        app.click("Connect Cables")
        conn_dialog = app.proxy_for("@connections-dialog-form")  # ENH: Nicer to use title

        # Exercise pinned mode
        # --------------------
        conn_dialog.click("Pin")

        # Expand 'from' cables
        conn_dialog.double_click("BB-FCB-016{1}")  # Expand 'from' cable
        conn_dialog.double_click("Z (0/72){1}")

        # Expand 'to' cable
        conn_dialog.double_click("BB-FCB-016{2}")  # Expand 'to' cable
        conn_dialog.double_click("A (0/72){2}")

        # Connect
        conn_dialog.click(" 5{1}")
        conn_dialog.click(" 4{2}")
        app.wait_until_present("Connect")
        app.click("Connect")
        self.show_database_changes("AFTER CONNECT BB FIBRE -> BB FIBRE")
        # ENH Show content of dialog tree

        # Close trees
        conn_dialog.double_click("BB-FCB-016{1}")
        conn_dialog.double_click("BB-FCB-016{2}")

        conn_dialog.click("Unpin")

        # Exercise un-pinned mode
        # -----------------------

        # Expand 'from' and 'to' cables
        conn_dialog.double_click("WH-FCB-021 (3/144)")
        conn_dialog.double_click("RISER-002 (3/4)")

        # Disconnect a 'from' fiber
        conn_dialog.right_click(" 2 -> RISER-002 #3")
        app.click("Disconnect")
        self.show_database_changes("AFTER DISCONNECT SIDE FROM")

        # Connect and close
        conn_dialog.click("8{1}")
        conn_dialog.click(" 4")
        app.click("Connect")

        app.wait_until_present("8 -> RISER-002 #4")
        self.show_database_changes("AFTER CONNECT FIBRE -> FIBRE")

        # ENH Show content of equipment tree

        # Exercise disconnect from equipment tree
        # ---------------------------------------
        # Disconnect two fibers
        app.search("WH-C-01")
        app.wait_until_present("Splice: WH-FCB-023 -> WH-FCB-001 (24)")
        equip_tree.double_click("Splice: WH-FCB-023 -> WH-FCB-003 (12)")

        equip_tree.right_click("28 -> WH-FCB-003 #16")
        app.click("Disconnect")
        equip_tree.wait_until_gone("28 -> WH-FCB-003 #16")
        self.show_database_changes("AFTER EQUIP TREE DISCONNECT")

    @test(modifies_db=False,tags=["cable_tree"])
    def test_cable_tree(self):
        """
        Exercise cable tree view
        """

        app = self.application()
        details_pane = app.details_pane()

        # Pole with connected cables
        app.search("WH-P-006")
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        self.show_page_content("STRUCTURE", cable_tree)

        # Wallbox with connected cables
        app.search("WH-0022")
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        self.show_page_content("STRUCTURE WITH NO OUT SEGMENTS FIELD", cable_tree)

        # Overhead route with cables
        app.search("Route (Overhead): 14")
        app.click("Route (Overhead): 14")
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        self.show_page_content("OVERHEAD ROUTE", cable_tree)

        # Underground route with conduits and cables
        app.search("Route (Underground): 52")  # Route Junction to WH-M-34
        app.click("Route (Underground): 52{0}")
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        self.show_page_content("UG ROUTE WITH CONDUITS", cable_tree)

        # Excercise show paths on cable tree
        app.right_click("Fiber Cable: BB-FCB-017 (72)")
        app.click("Show terminations")
        app.wait(2)
        self.show_page_content("SHOW TERMINATIONS ON FIBER CABLE", cable_tree)

        # Show proposed cables
        app.search("WH-C-11")
        app.wait_until_present("Splice Closure: WH-SC-039")
        cable_tree = app.proxy_for("Cables", 2)
        self.show_page_content("SHOW PROPOSED CABLES", cable_tree)

        # TODO: Exercise drag & drop

    @test(tags=["slack"])
    def test_slack_loops(self):
        """
        Exercise slack loops
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        self.subtest("ADD SLACK LOOP AFTER")
        app.search("WH-M-01")
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        cable_tree.wait_until_present("Fiber Cable: WH-FCB-003 (144)")
        cable_tree.click("@jstree-ocl{1}")  # Arrow next to WH-FCB-003 No circuits
        app.right_click("IN")
        app.click("Add slack")
        app.set("Length", "1000 m")
        app.set_search_select("Type", "Snowshoe")
        app.click("Save")
        app.wait_until_present("Equipment")
        equip_tree = app.proxy_for("Equipment", 2)
        self.show_page_content("AFTER ADD SLACK LOOP AFTER - CABLE TREE", app)
        self.show_database_changes("AFTER ADD SLACK LOOP AFTER")

        self.subtest("ADD SLACK LOOP BEFORE")
        app.wait_until_present("Cables")
        cable_tree.wait_until_present("Fiber Cable: WH-FCB-003 (144)")
        app.right_click("OUT")
        app.click("Add slack")
        app.set("Length", "2000 m")
        app.set_search_select("Type", "Snowshoe")
        app.click("Save")
        app.wait_until_present("Equipment")
        equip_tree = app.proxy_for("Equipment", 2)
        self.show_page_content("AFTER ADD SLACK LOOP BEFORE - CABLE TREE", app)
        self.show_database_changes("AFTER ADD SLACK LOOP BEFORE")

        self.subtest("CHECK SLACK LOOP")
        cable_tree.click("Slack 3280")
        app.wait_until_present("Fiber Slack")
        self.show_page_content("AFTER CHECK SLACK LOOP - CURRENT FEATURE", app)

        self.subtest("UPDATE SLACK LOOP")
        app.search("WH-M-01")
        app.wait(5)
        cable_tree.right_click("Slack 3280")
        app.click("Edit")
        app.wait_until_present("Save")
        app.set("Length", "500 m")
        app.click("Save")
        self.show_database_changes("AFTER UPDATE SLACK LOOP")

        self.subtest("SPLIT SLACK LOOP")
        app.search("WH-M-01")
        app.wait(5)
        cable_tree.right_click("Slack 656")
        app.click("Split")
        split_dlg = app.proxy_for("@split-slack-dlg")
        split_dlg.set("Split at", "300 ft")

        # Hack to get around odd myw.UnitInput behavior w/ selenium
        app.click("OK")
        app.wait_until_gone("Invalid number")
        app.click("OK")
        app.wait(5)

        app.wait_until_present("Slack 300.0 ft")
        self.show_page_content("AFTER SPLIT SLACK LOOP", app)
        self.show_database_changes("AFTER SPLIT SLACK LOOP")

        self.subtest("DELETE SLACK LOOP")
        app.search("WH-C-03")
        app.wait(2)
        cable_tree.click("@jstree-ocl{1}")  # Arrow next to WH-FCB-003
        cable_tree.right_click("Slack")  # No circuits
        app.click("Edit")
        app.wait_until_present("Delete")
        app.click("Delete")
        app.click("OK")
        app.wait_until_present("Nothing to display")
        self.show_database_changes("AFTER DELETE SLACK")

    @test(tags=["tick"])
    def test_set_tick_mark(self):
        """
        Excersize set tick mark dialog
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        app.search("WH-M-45")
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        cable_tree.click("@jstree-ocl{1}")  # Arrow next to cable WH-FCB-008
        cable_tree.right_click("IN (0/24) @184")

        app.click("Set tick mark")
        set_tick_dlg = app.proxy_for("@set-tick-mark-dlg")

        set_tick_dlg.set("Tick mark", "750")
        app.click("OK")
        self.show_page_content("AFTER SET INVALID TICK MARK", set_tick_dlg)

        set_tick_dlg.set("Tick mark", "165")
        app.click("OK")
        self.show_page_content("AFTER SET VALID TICK MARK", cable_tree)
        self.show_database_changes("AFTER SET TICK MARK")

        # From Struct Conduit Tree
        cable_tree.click("@control-setting")
        app.click("Conduits")
        cable_tree.click("@jstree-ocl{2}")  # Arrow next to conduit WH-CND-069
        cable_tree.right_click("IN (0/24) @165")
        app.click("Set tick mark")
        set_tick_dlg = app.proxy_for("@set-tick-mark-dlg")
        set_tick_dlg.set("Tick mark", "180")
        app.click("OK")
        self.show_page_content("AFTER SET FROM CONDUIT TREE", cable_tree)
        self.show_database_changes("AFTER SET FROM CONDUIT TREE")

    @test(tags=["circuit"])
    def test_route_circuit(self):
        """
        Exercise circuit routing
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        # Go to data
        app.search("WH-0018")
        map.set_zoom(19)

        # Add circuit
        self.subtest("ADD CIRCUIT")
        app.click("Add object")
        app.click("Circuit")
        ed = app.proxy_for("@feature-edit-container")
        ed.set("Name", "Test")

        map.click_at(52.2245028, 0.1397773)  # Wallbox
        ed.click("Set Route")
        chooser = app.proxy_for("Circuit Termination", 2)
        chooser.double_click("ONT: WH-ONT-018")
        chooser.double_click("IN")
        chooser.click("1 <- DROP-018")
        app.click("Set")

        ed.click("Save")
        app.wait_until_gone("Save")
        self.show_database_changes("AFTER ADD CIRCUIT")

        # TODO: Reroute circuit

        # Delete circuit
        self.subtest("DELETE CIRCUIT")
        app.search("WH-FTTH-003")
        app.click("Edit")
        app.click("Delete")
        app.click("OK")
        app.wait_until_gone("Delete")
        self.show_database_changes("AFTER DELETE CIRCUIT")

    @test(tags=["color_scheme"])
    def test_fiber_color_schemes(self):
        """
        Exercise display of fiber colours
        """

        app = self.application()

        # Scheme TIA-598-C
        app.search("WH-M-44")
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        cable_tree.click(
            "@jstree-ocl{1}"
        )  # Arrow next to cable WH-FCB-004 (spec D-144-LA-8W-F12NS)
        cable_tree.click("@jstree-ocl{2}")  # OUT side
        self.show_page_content("Scheme TIA-598-C", cable_tree)

        # Scheme DIN VDE 0888 (has stripes on 13-24)
        app.search("WH-M-45")
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        cable_tree.click(
            "@jstree-ocl{1}"
        )  # Arrow next to cable WH-FCB-008 (spec NETCONNECT 24 Count OS2)
        cable_tree.click("@jstree-ocl{2}")  # OUT side
        self.show_page_content("Scheme DIN VDE 0888", cable_tree)

        # Scheme FIN2012
        app.search("Gladeside")
        app.click("MDU: Gladeside")  # Because search also shows Gladeside PArk
        app.wait_until_present("Cables")
        cable_tree = app.proxy_for("Cables", 2)
        cable_tree.click(
            "@jstree-ocl{2}"
        )  # Arrow next to cable WH-INT-11 (spec NETCONNECT 12 Count OM4)
        cable_tree.click("@jstree-ocl{3}")  # Internal node
        cable_tree.click("@jstree-ocl{4}")  # IN side
        self.show_page_content("Scheme ", cable_tree)

    @test(tags=["tools"])
    def test_tools_connect(self):
        """
        Exercise the customer connection tool
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        app.click("Layers")
        app.click("Addresses")
        app.search("WH-P-009")
        map.set_zoom(21)
        app.click("@customerConnection.activate-tooltip-container{0}")

        map.click_at(52.2261368, 0.1426922)  # Address 489
        app.click("Create")
        app.wait(10)
        self.show_page_content("CUSTOMER CONNECTION TOOL", app)
        self.show_database_changes("AFTER CONNECT CUSTOMER")
        app.click("Close{0}")

    @test(tags=["tools"])
    def test_tools_vw(self):
        """
        Exercise the virtual walkout tool
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        app.search("WH-P-009")
        map.set_zoom(18)
        map.click_at(52.2257926, 0.1424521)  # Underground route 44
        map.click_at(52.2256011, 0.1421142, ctrl=True)  # Add underground route 291
        map.click_at(52.2255034, 0.1419371, ctrl=True)  # Add underground route 295
        app.click("@virtualWalkout.activate-tooltip-container{0}")
        app.wait(8)
        self.show_page_content("VIRTUAL WALKOUT", app)
        app.click("Close{0}")

    @test(tags=["schematics"])
    def test_schematics(self):
        """
        Exercise schematic building
        """

        from myworldapp.modules.dev_tools.server.test_framework.myw_map_proxy import MywMapProxy

        app = self.application()
        details_pane = app.details_pane()

        app.click("Schematic view")
        schematic = MywMapProxy(app.driver, "@shematic", name="Schematic", **app.options)

        # Structure Connectivity
        # ----------------------
        self.subtest("STRUCTURE CONNECTIVITY")

        # Build schematic
        app.search("WH-M-28")

        # Check interaction
        # ENH: Enable when Core issue 18932 is fixed
        # schematic.click_at(0.00003,0.000156)  # Slack
        # self.show_page_content('STRUCTURE CONNECTIVITY: AFTER SELECT SLACK',app)
        app.wait(2)

        # Pin Trace
        # ----------------------
        self.subtest("PIN TRACE")

        # Build schematic
        app.search("WH-0007")
        equip_tree = app.proxy_for("Equipment", 2)
        equip_tree.double_click("ONT: WH-ONT-007")
        equip_tree.double_click("IN")
        equip_tree.right_click("DROP-007{first}")
        app.click("Trace upstream")

        # Check interaction
        # TODO
        app.wait(2)

    @test(tags=["specs"])
    def test_spec_chooser(self):
        """
        Exercise Spec Chooser dialog
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        self.subtest("Spec Chooser All")
        app.wait_until_present("Add object")
        app.click("Add object")
        app.click("Fiber Cable")

        app.click("@spec-edit-btn")
        spec_grid = app.proxy_for("@spec-grid")

        # show all available specs
        self.show_page_content("Spec Chooser Render: All", spec_grid)

        app.click("Close{1}")
        app.click("Cancel")

        self.subtest("Spec Chooser Filtered")
        app.search("WH-FCB-001")
        app.click("Edit")

        app.click("@spec-edit-btn")
        spec_grid = app.proxy_for("@spec-grid")

        self.show_page_content("Spec Chooser Render: Filtered", spec_grid)

        app.click("@close-tag{1}")
        self.show_page_content("Spec Chooser Render: type filter removed", spec_grid)

        app.click("@close-tag{1}")
        self.show_page_content("Spec Chooser Render: fiber count filter removed", spec_grid)

        app.click("@close-tag{1}")
        self.show_page_content("Spec Chooser Render: Diameter filter removed", spec_grid)

        app.click("Close{1}")
        app.click("Cancel")

        self.subtest("Spec Chooser: From Palette")
        app.click("Equipment palette")
        app.click("@Cable (x144)-tooltip-container{0}")

        app.click("@spec-edit-btn")
        spec_grid = app.proxy_for("@spec-grid")

        self.show_page_content("Spec Grid Render: From Palette", spec_grid)
        app.click("Close{1}")
        app.click("Cancel")

    @test(tags=["specs"])
    def test_spec_manager(self):
        """
        Exercise the specification manager dialog
        """
        app = self.application()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")
        app.click("@specManagerDialog.dialog-tooltip-container{0}")
        spec_dialog = app.proxy_for("@spec-manager")
        spec_dialog.click("Structures")
        spec_dialog.click("Cabinet Spec")
        self.show_page_content("Cabinet Specs", spec_dialog)

        spec_dialog.click("Equipment")
        spec_dialog.click("Splice Closure Spec")
        self.show_page_content("Splice Closure Specs", spec_dialog)

        self.subtest("Filter")
        spec_dialog.set("@text{1}", "NNN")
        spec_dialog.set("@spec-retire-checkbox", "true")
        self.show_database_changes("AFTER RETIRING A SPEC")

        self.subtest("Add")
        spec_dialog.click("Add")
        add_dialog = app.proxy_for("@feature-edit-container")
        add_dialog.set("Name", "CS-A-1100-TEST")
        add_dialog.set("Description", "Test cabinet")
        add_dialog.set("Retired", "true")
        add_dialog.click(
            "Save", return_proxy=False
        )  # return_proxy set to false to handle save button disappearing from dom
        self.show_database_changes("AFTER ADDING A SPEC")
        self.show_page_content("AFTER ADDING A SPEC", spec_dialog)

        self.subtest("Edit")
        spec_dialog.click("Structures")
        spec_dialog.click("Cabinet Spec")
        spec_dialog.click("@edit-spec-props{1}")
        edit_dialog = app.proxy_for("@feature-edit-container")
        edit_dialog.set("Cost", 100)
        edit_dialog.click("Save", return_proxy=False)
        self.show_database_changes("AFTER EDITING A SPEC")
        self.show_page_content("AFTER EDITING A SPEC", spec_dialog)

    @test(tags=["labor_costs"])
    def test_labor_costs_chooser(self):
        """
        Exercise Labor Costs Chooser dialog
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        self.subtest("Labor Costs Chooser All")
        app.wait_until_present("Add object")
        app.click("Add object")
        app.click("Manhole")
        map.click_at(52.2237183, 0.1364071)  # near woodhead hub

        app.click("@labor-costs-edit-btn")
        labor_costs_grid = app.proxy_for("@labor-costs-grid")
        app.click("fiber_connect")

        # show all available labor costs
        self.show_page_content("Labor Costs Chooser Render: All", labor_costs_grid)
        app.click("Save")
        app.wait()
        self.show_database_changes("AFTER ADDING LABOR COSTS TO MANHOLE")

        self.subtest("Labor Costs Chooser: From Palette")
        app.click("Structure palette")
        app.click("@Manhole-tooltip-container{0}")

        app.click("@labor-costs-edit-btn")
        labor_costs_grid = app.proxy_for("@labor-costs-grid")

        self.show_page_content("Labor Costs Grid Render: From Palette", labor_costs_grid)
        app.click("Close{1}")
        app.click("Cancel")

    @test(tags=["labor_costs"])
    def test_labor_costs_manager(self):
        """
        Exercise the labor costs manager dialog
        """
        app = self.application()

        app.wait_until_present("@a-tools-mode")
        app.click("@a-tools-mode")
        app.click("@laborCostsManagerDialog.dialog-tooltip-container{0}")
        labor_costs_mgr_dialog = app.proxy_for("@labor-costs-manager")
        labor_costs_mgr_dialog.click("Unit labor costs")
        self.show_page_content("Unit Labor Costs", labor_costs_mgr_dialog)

        self.subtest("Filter")
        labor_costs_mgr_dialog.set("@text{1}", "fiber")
        self.show_page_content("Unit Labor Costs", labor_costs_mgr_dialog)
        self.show_database_changes("AFTER FILTER")

        self.subtest("Add")
        labor_costs_mgr_dialog.click("Add")
        add_dialog = app.proxy_for("@feature-edit-container")
        add_dialog.set("Name", "CS-A-1100-TEST")
        add_dialog.set("Description", "Test labor cost")
        add_dialog.click(
            "Save", return_proxy=False
        )  # return_proxy set to false to handle save button disappearing from dom
        self.show_database_changes("AFTER ADDING A LABOR COST")
        self.show_page_content("AFTER ADDING A LABOR COST", labor_costs_mgr_dialog)

        self.subtest("Edit")
        labor_costs_mgr_dialog.click("@edit-labor-costs-props{1}")
        edit_dialog = app.proxy_for("@feature-edit-container")
        edit_dialog.set("Cost", 100)
        edit_dialog.click("Save", return_proxy=False)
        self.show_database_changes("AFTER EDITING A LABOR COST")
        self.show_page_content("AFTER EDITING A LABOR COST", labor_costs_mgr_dialog)

    @test(tags=["import"])
    def test_import_data(self):
        """
        Exercise the import data dialog in a design. Includes drag and drop.
        """

        # TBR: Hack to restore encodestring until we upgrade our Selenium version (PLAT-8653)
        import base64

        base64.encodestring = base64.encodebytes

        app = self.application(delta="design/NB046")
        filepath = os.path.join(self.test_data_dir, "import", "minimal.zip")

        app.wait_until_present("Design: NB046")
        app.click("Design: NB046")
        app.click("Import data")
        import_dialog = app.proxy_for("@data-import-dialog")
        self.show_page_content("AFTER OPENING IMPORT DIALOG", import_dialog)
        import_dialog.set_search_select("@ui-select{1}", "CDIF")

        self.drag_and_drop_file(filepath, import_dialog, "@data_import_dialog_file")

        import_dialog.click("Preview")
        app.wait_until_present("Found")
        self.show_page_content("AFTER PREVIEW IMPORT DIALOG", import_dialog)

        import_dialog.click("Import")
        app.wait_until_present("Import complete")
        self.show_database_changes("AFTER DATA UPLOAD")

    @test(modifies_db=False,tags=["reports"])
    def test_report_preview_dialog(self):
        """
        Exercise the preview dialog for report streams
        Exercise displaying:"""
        #       1. feature report (connectivity)
        #       2. featureSetReport
        #       3. BOM report
        #       4. feature report from cable tree (cable report)
        """"""

        app = self.application()
        app.search("WH-P-007")
        app.wait_until_present("Splice Closure: WH-SC-016")
        equip_tree = app.proxy_for("Equipment", 2)

        # Feature report
        equip_tree.right_click("Pole: WH-P-007")
        app.click("Connectivity Report")
        app.wait_until_present("Connectivity Report:")
        preview_dialog = app.proxy_for("Connectivity Report:", 2)

        # Test changing formats of preview dialog
        self.set_search_select(app, "@format_item", "pdf")
        self.show_page_content("PREVIEW DIALOG PDF", preview_dialog)
        self.set_search_select(app, "@format_item", "csv")
        self.show_page_content("PREVIEW DIALOG CSV", preview_dialog)
        self.set_search_select(app, "@format_item", "html")
        self.show_page_content("PREVIEW DIALOG HTML", preview_dialog)
        app.click("Close{last}")

        # Feature set report
        app.search("Design NB335")
        app.click("Open")
        app.hover("@list-export{1}")
        app.click("System")

        # Click ok and then close on the changes filter. More complete tests
        # for the filter should go into test_design_toolbar_changes
        changes_filter = app.proxy_for("Changes Filter")
        app.click("OK")
        app.wait(2)
        app.click("Close{last}")

        app.click("More...")
        app.wait(2)
        app.click("Generate report")
        change_dialog = app.proxy_for("Change Set Report:{last}", 2)
        self.show_page_content("FEATURE CHANGE DIALOG", change_dialog)
        app.click("Close{last}")

        # BOM report
        app.click("Design: NB335")
        app.click("Generate BOM report")
        app.click("OK")
        app.wait_until_present("Bill of Materials:")
        bom_preview_dialog = app.proxy_for("Bill of Materials:", 2)
        self.show_page_content("BOM REPORT DIALOG", bom_preview_dialog)
        app.click("Close{last}")

        # Feature report from cable tree
        app.search("WH-CND-075")
        cable_tree = app.proxy_for("Cables", 2)
        cable_tree.right_click("Fiber Cable: WH-FCB-022 (288)")
        app.click("Cable Report")
        app.wait_until_present("Cable Report:")
        preview_dialog = app.proxy_for("Cable Report:", 2)
        self.show_page_content("CABLE REPORT DIALOG", preview_dialog)

    @test(modifies_db=False,tags=["reports","copper","tracing"])
    def test_loop_makeup_report(self):
        app = self.application()

        app.search("Woodhead Hub")
        app.click("Building: Woodhead Hub")
        app.wait_until_present("Building: Woodhead Hub{0}")
        app.right_click("Building: Woodhead Hub{0}")
        app.click("Loop Makeup Report")
        app.wait_until_present("Loop Makeup Report: Building: Woodhead Hub")
        self.show_page_content("Loop makeup report", app)

    @test(modifies_db=False,tags=["color_scheme"])
    def test_color_scheme_config(self):
        """
        Excercise editing the fiber color scheme bundling config
        """
        app = self.application()

        app.click("Tools palette")
        app.click("Spec manager")
        spec_dialog = app.proxy_for("@spec-manager")
        spec_dialog.click("Cables")
        spec_dialog.click("Fiber Cable Spec")
        self.show_page_content("Fiber Cable Specs", spec_dialog)

        spec_dialog.click("@color-scheme-select{1}")
        spec_dialog.click("FIN2012{1}")
        self.show_database_changes("AFTER UPDATING COLOR SCHEME FOR A SPEC")

        spec_dialog.click("@edit-btn{1}")
        color_scheme_dialog = app.proxy_for("@simple-bundle-dialog")
        self.show_page_content("COLOR SCHEME CONFIG", color_scheme_dialog)

        color_scheme_dialog.set("@ui-input{1}", 2)
        color_scheme_dialog.set("@ui-select{1}", "Ribbons")
        color_scheme_dialog.set("@ui-input{2}", 2)
        color_scheme_dialog.set("@ui-select{2}", "Tubes")
        color_scheme_dialog.click(
            "Save", return_proxy=False
        )  # return_proxy set to false to handle save button disappearing from dom

        self.show_database_changes("AFTER UPDATING COLOR SCHEME CONFIG FOR A SPEC")

        spec_dialog.click("@edit-btn{1}")
        color_scheme_dialog = app.proxy_for("@simple-bundle-dialog")
        self.show_page_content("UPDATED COLOR SCHEME CONFIG", color_scheme_dialog)

    @test(tags=["designs"])
    def test_design_mode(self):
        """
        Test stateManagerPlugin disables GU based on design state
        """

        app = self.application(delta="design/NB112")  # State 'New'
        map = app.map()
        app.click("Layers")

        app.click("Structure palette")
        self.show_page_content("AFTER CLICK STRUCTURE PALETTE BUTTON", app)

        app.click("Equipment palette")
        self.show_page_content("AFTER CLICK EQUIPMENT PALETTE BUTTON", app)

        # ENH: Check context menu items etc

        # Note: Editable state already exercised by functional tests

    @test(tags=["designs"])
    def test_design_permissions(self):
        app = self.application()

        # Admin updates NB046 and sets group to Admin Group
        app.search("NB046")
        app.click("Open")
        app.click("Edit")
        edit_view = app.proxy_for("@feature-edit-container")
        edit_view.set("Group", "Admin Group")
        edit_view.click("Save")
        app.wait(2)
        self.show_page_content("AFTER SAVE", app)

        app = MywAppProxy(self.driver, **self.proxy_options)
        
        app.login(
            self.base_url, self.default_login.get("username"), self.default_login.get("password")
        )
        
        basemap = None
        url = self.base_url + "/{}.html?localstate=false&basemap={}".format('mywcom', basemap)
        app.goto(url)
        app.search("NB046")
        app.wait(1)
        app.search(
            "NB046"
        )
        app.click("Edit")
        self.show_page_content("AFTER CLICK EDIT - WITHOUT PERMISSION", app)

        app.search("NB335")
        app.click("Edit")
        self.show_page_content("AFTER CLICK EDIT - WITH PERMISSION", app)

    @test(tags=["designs"])
    def test_design_toolbar(self):
        """
        Exercise the design toolbar
        """

        # Currently the design builder makes changes in master afer this design is built to move WH-M-27.
        # this results in an un-auto-fixable technical conflict.
        has_unfixable_conflicts = True

        app = self.application(delta="design/NB120")  # Has conflicts
        map = app.map()
        details = app.details_pane()

        # Open design viewer
        map.click("Design: NB120")
        tb = app.proxy_for("@delta-owner-toolbar{1}")
        self.show_page_content("ADMIN TOOLBAR", tb)

        # Redraw Bounds
        tb.click("Redraw Bounds")
        app.wait(5)
        app.click("OK")
        app.wait(5)
        self.show_database_changes("AFTER DESIGN BOUNDS")

        # Check for conflicts
        tb.click("Check design")
        app.click("Start")
        app.wait_until_present("warnings found")
        app.wait(1.5)
        self.show_page_content("AFTER CHECK DESIGN", details)
        app.click("@ant-modal-close-x")
        app.click("Design: NB120")

        # Fix conflicts
        tb.click("Fix conflicts")
        app.click("OK")
        app.wait(1.5)
        self.show_page_content("AFTER FIX CONFLICTS", details)
        self.show_database_changes("AFTER FIX CONFLICTS")

        # Publish
        app.click("Design: NB120{1}")
        tb.click("Publish")
        app.click("OK")
        app.wait(1.5)
        # With more conflicts feature set is shown but no dialogs.
        if not has_unfixable_conflicts:
            app.click("OK")
            app.wait(2)
            app.click("Close{last}")
        self.show_page_content("AFTER PUBLISH", details)
        self.show_database_changes("AFTER PUBLISH")

        # Test publish button is not visible when logged in as designer
        app = MywAppProxy(self.driver, **self.proxy_options)
        app.login(
            self.base_url, self.default_login.get("username"), self.default_login.get("password")
        )
        basemap = None
        url = self.base_url + "/{}.html?localstate=false&delta={}&basemap={}".format("mywcom", "design/NB120", basemap)
        app.goto(url)
        app.wait_until_present("Zoom in")
        app.wait(3)
        map = app.map()
        map.click("Design: NB120")
    
        tb = app.proxy_for("@delta-owner-toolbar{1}")
        self.show_page_content("DESIGNER TOOLBAR", tb)

        # Test publish, merge and import data buttons are not visible when logged in as designer
        app = MywAppProxy(self.driver, **self.proxy_options)
        app.login(
            self.base_url, self.viewer_login.get("username"), self.viewer_login.get("password")
        )
        
        basemap = None
        url = self.base_url + "/{}.html?localstate=false&delta={}&basemap={}".format("mywcom", "design/NB120", basemap)
        app.goto(url)
        app.wait_until_present("Zoom in")
        app.wait(3)
        map = app.map()
        map.click("Design: NB120")
     
        tb = app.proxy_for("@delta-owner-toolbar{1}")
        self.show_page_content("DESIGNER TOOLBAR", tb)

    @test(tags=["designs"])
    def test_design_toolbar_changes(self):
        """
        Show design changes
        """

        app = self.application(delta="design/NB120")
        map = app.map()
        details = app.details_pane()

        # Open design viewer
        map.click("Design: NB120")
        tb = app.proxy_for("@delta-owner-toolbar{1}")
        self.show_page_content("ADMIN TOOLBAR", tb)

        # Show design content
        tb.hover("@list-export")
        tb.click("System")

        # Click ok and then close on the changes filter
        changes_filter = app.proxy_for("Changes Filter")
        app.click("OK")
        app.wait(2)
        app.click("Close{last}")

        app.wait(1.5)
        self.show_page_content(
            "AFTER SELECT OBJECTS", details
        )  # TODO: Make order stable (Core issue)
        app.click("Design: NB120{1}")

    @test(tags=["validation"])
    def test_data_validation(self):
        """
        Exercise the data validation toolbar button
        """
        app = self.application(delta="design/NB301")  # Has conflicts
        details_pane = app.details_pane()

        app.click("Design: NB301")
        details_pane.click("Zoom to object")

        app.click("Tools palette")
        app.click("@validation.dialog-tooltip-container{0}")
        dialog = app.proxy_for("@ant-modal-content")
        self.show_page_content("DIALOG BEFORE VALIDATING", dialog)
        dialog.click("Start")
        dialog.wait_until_present("Start")
        app.wait(2)

        self.show_page_content("DIALOG AFTER VALIDATING", dialog)
        app.wait(2)
        self.show_page_content("ERRORS", details_pane)

    @test(modifies_db=False,tags=["validation"])
    def test_design_rules(self):
        """
        Exercise the design rules toolbar
        """
        app = self.application(delta="design/NB301")
        details_pane = app.details_pane()

        app.click("Design: NB301")
        details_pane.click("Zoom to object")

        # Test example running of design rules on state change
        app.click("Edit")

        # Set attributes
        feature_editor = app.proxy_for("@feature-edit-container")
        feature_editor.set_search_select("State", "Awaiting Approval")

        app.click("Save")
        app.wait_until_present("warnings found")
        self.show_page_content("Editor after failing design rules", feature_editor)
        self.show_page_content("ERRORS", details_pane)

    @test(modifies_db=True,tags=["validation","conflicts"])
    def test_design_conflicts(self):
        """
        Exercise manual conflict resolution
        """

        app = self.application(delta="design/NB335")  # Has conflicts
        details_pane = app.details_pane()

        app.click("Design: NB335")
        details_pane.click("Check design")

        dialog = app.proxy_for("@ant-modal-content")
        self.show_page_content("DIALOG BEFORE VALIDATING", dialog)
        dialog.click("Start")
        dialog.wait_until_present("Start")
        app.wait(2)

        self.show_page_content("DIALOG AFTER VALIDATING", dialog)
        app.wait(2)

        details_pane.click("Manhole: WH-M-54")
        details_pane.click("Edit")
        details_pane.right_click("Point(1)")
        app.click("Set to master:")
        details_pane.click("Save")

        self.show_database_changes("AFTER CONFLICT SET TO MASTER")

    @test(modifies_db=False,tags=["settings"])
    def test_master_edit_no_right(self):
        """
        Checks user without edit master right cannot edit features in master
        """

        app = self.application()

        app.search("WH-M-58")
        app.click("Edit")  # This should do nothing as edit disabled
        self.show_page_content("AFTER CLICK EDIT", app)

        # Check Add equiment in equipment tree
        app.search("WH-P-006")
        app.wait_until_present("Splitter: WH-SPL-004")
        equip_tree = app.proxy_for("Equipment", 2)

        equip_tree.right_click("Pole: WH-P-006")
        app.hover("Add")
        app.wait_until_present("Mixed")
        app.hover("Mixed")
        app.click("Splice Closure")

        details_pane = app.details_pane()
        self.show_page_content(
            'DETAILS PANE AFTER CLICK ON DISABLED "Add - Splice Closure" CONTEXT MENU ITEM',
            details_pane,
        )

        # Check connect/disconnect in equipment tree etc
        equip_tree.click("@jstree-ocl{4}")  # Arrow next to WH-SPL-004
        equip_tree.double_click("IN (1/1)")
        equip_tree.right_click("1 <- RISER-001 #2")
        app.click("Disconnect")
        self.show_page_content('AFTER CLICK ON DISABLED "Disconnect" CONTEXT MENU ITEM', equip_tree)

        equip_tree.click("1 <- RISER-001 #2")  # To hide the context menu
        equip_tree.double_click("OUT (7/8)")
        equip_tree.right_click("8")
        app.click("Connect")
        self.show_page_content('AFTER CLICK ON DISABLED "Connect" CONTEXT MENU ITEM', app)

    @test(modifies_db=False,tags=["settings"])
    def test_master_edit_with_right(self):
        """
        Checks user with edit master right can edit features in master
        """

        app = self.application()

        app.search("WH-M-58")
        app.click("Edit")  # This should activate the feature editor
        self.show_page_content("AFTER CLICK EDIT", app)

    @test(tags=["settings"])
    def test_config_settings(self):
        """
        Exercise the comms setting page
        """
        # ENH: Split into test per tab + exercise all functions

        app = self.application("config")
        app.click("Settings")
        app.wait(3)
        app.click("Comms")
        app.wait(3)

        # Structures
        self.show_page_content("STRUCTURES - INITIAL VIEW", app)
        app.click("Add")

        new_row = app.proxy_for("@ant-table-row-level-0{last}", 0)
        new_row.click("@ant-select{first}")
        app.click("address")
        new_row.set("@ant-input{first}", "modules/comms/images/features/route.svg")
        new_row.set("@ant-checkbox{1}", "true")
        app.save()

        self.show_page_content("AFTER ADD TO STRUCTURES", app)

        # Delete a structure entry
        app.hover("@ant-table-row-level-0{last}")
        # Work around for this breaking at chrome 83.0.4103.106 and Web Driver 83.0.4103.39
        # TODO: on a later version of chrome or web driver see if clicking the delete icon can
        # be replaced with app.click('@delete-row-btn-nested')
        elements = app.find_elements_by_class("delete-row-btn-nested")
        elements[-1].click()
        app.save()
        self.show_page_content("AFTER EDIT STRUCTURE", app)

        # Routes
        app.click("Routes")
        self.show_page_content("ROUTES - INITIAL VIEW", app)

        # Equipment
        app.click("Equipment")
        self.show_page_content("EQUIPMENT - INITIAL VIEW", app)
        app.wait_until_present("two_way_splitter")
        app.click("Add")

        new_row = app.proxy_for("@ant-table-row-level-0{last}", 0)
        new_row.click("@ant-select{first}")
        
        app.click("address")
        new_row.set("@ant-input{1}", "modules/comms/images/features/route.svg")
        new_row.click("@icon-pencil")

        housings_modal = app.proxy_for("@ant-modal-content")
        app.click("Add{2}")
        housings_modal.click("@ant-select{first}")
        app.click("cabinet")
        app.click("Add{2}")
        housings_modal.click("@ant-select-selector{last}")
        app.click("building")
        app.click("OK")
        app.save()

        self.show_page_content("AFTER EDIT EQUIPMENT", app)

        # Cables
        app.click("Cables")
        self.show_page_content("CABLES - INITIAL VIEW", app)

        app.click("Circuits")
        self.show_page_content("CIRCUITS - INITIAL VIEW", app)

        # Specs
        app.click("Specs")
        self.show_page_content("SPECS - INITIAL VIEW", app)

        app.click("Fiber Color Schemes")
        self.show_page_content("FIBER COLOR SCHEMES - INITIAL VIEW", app)

        app.click("Fiber Colors")
        self.show_page_content("FIBER COLORS - INITIAL VIEW", app)

        # Styles
        app.click("Styles")
        self.show_page_content("CABLE PREVIEW STYLES - INITIAL VIEW", app)

        app.click("@icon-pencil{1}")
        self.show_page_content("CABLE PREVIEW STYLES - INSERT STYLE", app)
        app.click("OK")

        app.click("@icon-pencil{2}")
        self.show_page_content("CABLE PREVIEW STYLES - DELETE STYLE", app)
        app.click("OK")

        app.click("@icon-pencil{3}")
        self.show_page_content("CABLE PREVIEW STYLES - KEEP STYLE", app)
        app.click("OK")

        app.click("@icon-pencil{4}")
        self.show_page_content("CABLE PREVIEW STYLES - AFFECTED STRUCTURE TEXT STYLE", app)
        app.click("OK")

        app.click("@icon-pencil{5}")
        self.show_page_content("CABLE PREVIEW STYLES - AFFECTED STRUCTURE ICON STYLE", app)
        app.click("OK")

        # Import Engine
        app.click("Import Formats")
        self.show_page_content("IMPORT FORMATS - INITIAL VIEW", app)
        app.click("CDIF")
        self.show_page_content("IMPORT FORMATS - CDIF OPEN", app)

    @test(tags=["designs"])
    def test_change_tracking(self):
        """
        Exercise design change tracking
        """

        app = self.application(delta="design/CC4970")
        map = app.map()
        app.wait(2.0)
        details = app.details_pane()

        # Open design viewer
        map.click("Design: CC4970")
        tb = app.proxy_for("@delta-owner-toolbar{1}")
        self.show_page_content("ADMIN TOOLBAR", tb)

        # Show user changes content
        tb.hover("@list-export")
        tb.click("User")
        app.wait(2.0)
        app.click("OK")
        app.wait(1.5)
        self.show_page_content("AFTER SELECT OBJECTS 1", details)

        # Modify some things
        # Change 2 fields on route
        # Move Wallbox
        app.search("Route (Underground): 5600")
        app.wait(1)
        app.click("Route (Underground): 5600{2}")
        app.click("Edit")
        feature_editor = app.proxy_for("@feature-edit-container")
        feature_editor.set_search_select("Cover", "Brick")
        feature_editor.set("Measured Length", 62)
        app.click("Save")
        app.wait(1)

        app.search("WH-5600")
        app.wait(1)
        app.click("WH-5600")
        app.click("Edit")
        map.set_geometry([52.2226985622421, 0.13749934718285342])
        app.click("Save")
        app.wait_until_gone("Save")

        # Show user changes
        map.click("Design: CC4970")
        tb = app.proxy_for("@delta-owner-toolbar{1}")
        tb.hover("@list-export")
        tb.click("User")
        app.click("OK")
        app.wait(1.5)
        self.show_page_content("AFTER SELECT OBJECTS 2", details)

    @test(tags=["groups"])
    def test_user_groups_manager(self):
        app = self.application()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")
        app.click("@userGroupManagerDialog.dialog-tooltip-container{0}")
        user_groups_manager_dialog = app.proxy_for("@user-groups-manager")
        self.show_page_content("User Groups", user_groups_manager_dialog)

        self.subtest("Filter")
        user_groups_manager_dialog.set("@ant-input{1}", "designer")
        self.show_page_content("User Groups", user_groups_manager_dialog)

        self.subtest("Add")
        user_groups_manager_dialog.click("Add User Group")
        add_dialog = app.proxy_for("@create-user-group-form")
        add_dialog.set("name", "Test Group")
        add_dialog.set("description", "Test User Group")
        add_dialog.click("Add")
        add_dialog.set("@text{3}", "designer")
        add_dialog.click("Save", return_proxy=False)
        self.show_page_content("Added User Group", user_groups_manager_dialog)

        user_groups_manager_dialog.click("@ant-btn{2}")
        update_dialog = app.proxy_for("@user-group-editor")
        update_dialog.click("@remove-btn{2}")
        update_dialog.click("Update", return_proxy=False)
        self.show_page_content("Updated User Group", user_groups_manager_dialog)

    @test(tags=["markup"])
    def test_design_markup(self):
        """
        Exercise design markup
        """

        app = self.application(delta="design/CC4970")
        map = app.map()
        details_pane = app.details_pane()
        app.click("Layers")

        # Open design viewer
        map.click("Design: CC4970")
        app.click("Zoom to object")

        # Open markup palette
        app.click("Markup palette")
        markup_palette = app.proxy_for("@iqgapp-markup-palette")
        self.show_page_content("MARKUP PALETTE", markup_palette)

        # Click an item in list
        app.click("Markup Line")
        self.show_page_content("MARKUP LINE DETAIL", details_pane)
        map.click_at(52.222678299529605, 0.1381456006193898)
        map.click_at(52.222546850868696, 0.13805172330386856)
        app.click("Save")
        self.show_database_changes("AFTER ADD MARKUP LINE")

        # Click to select (ensure we can interact with map)
        map.click_at(52.222678299529605, 0.1381456006193898)
        self.show_page_content("LINE SELECTED", details_pane)

        # Add item to palette
        app.wait_until_present("Markup Polygon")
        app.right_click("Markup Polygon")
        app.click("Add object")
        self.show_page_content("AFTER ADDING LINE TO THE PALETTE", markup_palette)

        # Exercise reset to default
        app.wait_until_present("Markup Polygon")
        app.right_click("Markup Polygon")
        app.click("Reset to default")
        app.click("OK")
        self.show_page_content("AFTER RESETTING TO DEFAULT", markup_palette)

    @test(tags=["layout_strand"])
    def test_layout_strand(self):
        app = self.application(delta="design/NB120")
        map = app.map()

        # Open design viewer
        app.wait_until_present("Design: NB120")
        map.click("Design: NB120")
        app.click("Zoom to object")

        app.click("Tools palette")
        app.click("@layoutStrand.dialog-tooltip-container{0}")

        layout_strand_content = app.proxy_for("@layout-strand-content")
        self.show_page_content("Layout Strand", layout_strand_content)

        layout_strand_content.set("@overheadFeatures", "Pole")
        layout_strand_content.set("@overheadRoutes", "Route (Overhead)")
        layout_strand_content.set("@type", "Wood")
        layout_strand_content.set("@height", "20")
        layout_strand_content.click("@addStructure")
        layout_strand_content.click("Start")
        self.show_page_content("Layout Strand Start", layout_strand_content)

        app.wait(2)

        map.click_at(52.22366, 0.13714)
        map.click_at(52.22377, 0.13737)
        map.click_at(52.22388, 0.13758)

        layout_strand_content.click("Done")
        self.show_page_content("Layout Strand Done", layout_strand_content)
        self.show_database_changes("AFTER POLE INSERT")

    @test(tags=["layout_strand"])
    def test_layout_strand_split(self):
        """ 
        Adds structures before invoking layout_strand tool, instead of using add structure option
        then adds a route w/ 3 clicks
        Make sure that route splits at middle structure 
        """
        app = self.application(delta="design/NB120")
        map = app.map()

        # Open design viewer
        app.wait_until_present("Design: NB120")
        map.click("Design: NB120")
        app.click("Zoom to object")

        # add poles
        coords = [[52.22366, 0.13714],[52.22377, 0.13737],[52.22388, 0.13758]]
        for coord in coords:
            app.click("Add object")
            app.click("Pole")
            map.click_at(*coord) 
            app.wait_until_present("Save")
            app.click("Save")
            app.wait_until_gone("Save")
  
        # invoke layout strand tool
        app.click("Tools palette")
        app.click("@layoutStrand.dialog-tooltip-container{0}")
        layout_strand_content = app.proxy_for("@layout-strand-content")
        self.show_page_content("Layout Strand", layout_strand_content)
        layout_strand_content.set("@overheadFeatures", "Pole")
        layout_strand_content.set("@overheadRoutes", "Route (Overhead)")
        layout_strand_content.set("@type", "Wood")
        layout_strand_content.set("@height", "20")
        layout_strand_content.click("Start")
        self.show_page_content("Layout Strand Start", layout_strand_content)

        app.wait(2)

        map.click_at(52.22366, 0.13714)
        map.click_at(52.22377, 0.13737)
        map.click_at(52.22388, 0.13758)

        layout_strand_content.click("Done")
        self.show_page_content("Layout Strand Done", layout_strand_content)
        self.show_database_changes("AFTER ROUTE INSERT")

    @test(tags=["structures"])
    def test_structure_replace(self):
        app = self.application(delta="design/NB120")
        details_pane = app.details_pane()
        map = app.map()
        map.click_at(52.2241257, 0.1366852)

        app.click("Edit")
        app.wait(1)
        app.click("@selected{1}")
        app.wait(1)
        app.set("@selected{2}", "Pole")
        app.click("Save")
        app.click("OK")
        app.wait_until_present("Pole: WH-P-100000{2}")

        self.show_page_content("AFTER REPLACING MANHOLE WITH POLE", details_pane)
        self.show_database_changes("AFTER REPLACING MANHOLE WITH POLE")

    @test(tags=["features"])
    def test_create_feature(self):
        app = self.application()

        app.click("Add object")

        menu = app.proxy_for("Add Object")
        contents = app.proxy_for("@createFeature-dialog")
        self.show_page_content("Add Object", contents)
        menu.click("Close")

        app.search("Design NB046")
        app.wait_until_present("Design: NB046")
        do_toolbar = app.proxy_for("@delta-owner-toolbar")
        do_toolbar.click("Open")
        app.click("Add object")
        contents = app.proxy_for("@createFeature-dialog")
        self.show_page_content("With Design Open", contents)
        menu.click("Close")

        app.search("WH-C-11")
        app.click("Add object")
        contents = app.proxy_for("@createFeature-dialog")
        self.show_page_content("With Cabinet Open", contents)
        menu.click("Close")

    def set_search_select(self, proxy, name, value, exact=False, manual_clear=False):
        """
        Set value for select box (which allows search) with NAME to VALUE
        Modified from myw_proxy.py to specify we just want first occurance.
        ENH: Talk to platform about fixing this.
        """
        proxy.trace(1, "Set:", name, "=", value)

        # Find element
        el = proxy._find_element_fuzzy(name)

        proxy._scroll_to(el)

        # Find element that has the select arrow
        xpaths = []
        xpath = ""
        for i in range(1, 4):
            xpath = "../" + xpath
            xpaths.append(xpath + ".//span[@class='ant-select-arrow']")  # For ant framework select

        el = proxy._find_element(name + "_input_item", el, xpaths, occurance=["first"])

        # Say what we're about to do
        proxy.trace(2, "Found input item:", el)

        # Set value
        try:
            proxy._set_ant_select(el, value)
        except Exception as cond:
            err_msg = str(cond)
            proxy.error(err_msg)

        proxy.trace(4, "Updated item", el, "to:", value)
        return el

    @test(tags=["pathfinder"])
    def test_pathfinder_to_and_from_generate(self):
        app = self.application()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        app.wait_until_present("Path Finder")
        app.click("@pathfinderMode.toggle-tooltip-container{0}")

        pathfinder = app.proxy_for("@ant-modal{0}")
        # Move modal to centre so selenium can detect buttons
        self.driver.execute_script(
            'var modal = document.getElementsByClassName("ant-modal")[0]; modal.style.right = "0px"'
        )
        self.show_page_content("Pathfinder", pathfinder)

        # Search for cabinet
        app.search("SP-C-45")
        app.wait(1)
        app.click("SP-C-45")

        pathfinder.click("Set{1}")
        app.wait(3)
        from_modal = app.proxy_for(
            "@ui-dialog ui-corner-all ui-widget ui-widget-content ui-front ui-dialog-buttons ui-draggable"
        )

        # Delete antd overlay in modal
        self.driver.execute_script(
            'var overlay = document.getElementsByClassName("ui-widget-overlay ui-front")[0]; overlay.remove();'
        )

        # Select from equipment
        from_modal.click("@jstree-icon jstree-ocl{7}")
        app.wait(1)
        from_modal.click("@jstree-icon jstree-ocl{9}")
        app.wait(1)
        from_modal.click("@j3_16")
        from_modal.click("@primary-btn set-path-btn ui-button ui-corner-all ui-widget")

        # Search for cabinet
        app.search("SP-C-46")
        app.wait(1)
        app.click("SP-C-46")
        pathfinder.click(
            "@primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0{2}"
        )

        pathfinder.click("Generate")
        app.wait(15)

        self.show_page_content("After generate", pathfinder)

    @test(tags=["pathfinder"])
    def test_pathfinder_include_and_generate(self):
        app = self.application()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        app.wait_until_present("Path Finder")
        app.click("@pathfinderMode.toggle-tooltip-container{0}")

        pathfinder = app.proxy_for("@ant-modal{0}")
        # Move modal to centre so selenium can detect buttons
        self.driver.execute_script(
            'var modal = document.getElementsByClassName("ant-modal")[0]; modal.style.right = "0px"'
        )
        self.show_page_content("Pathfinder", pathfinder)

        # Search for cabinet
        app.search("SP-C-45")
        app.wait(1)
        app.click("SP-C-45")

        pathfinder.click("Set{1}")
        app.wait(3)
        from_modal = app.proxy_for(
            "@ui-dialog ui-corner-all ui-widget ui-widget-content ui-front ui-dialog-buttons ui-draggable"
        )

        # Delete antd overlay in modal
        self.driver.execute_script(
            'var overlay = document.getElementsByClassName("ui-widget-overlay ui-front")[0]; overlay.remove();'
        )

        # Select from equipment
        from_modal.click("@jstree-icon jstree-ocl{7}")
        app.wait(1)
        from_modal.click("@jstree-icon jstree-ocl{9}")
        app.wait(1)
        from_modal.click("@j3_16")
        from_modal.click("@primary-btn set-path-btn ui-button ui-corner-all ui-widget")

        # Search for cabinet
        app.search("SP-C-46")
        app.wait(1)
        app.click("SP-C-46")
        pathfinder.click(
            "@primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0{2}"
        )

        # Include object
        app.search("SP-M-165")
        app.wait(1)
        app.click("SP-M-165")
        pathfinder.click("@include-and-avoid__button hover-cursor{1}")

        pathfinder.click("Generate")
        app.wait(15)

        self.show_page_content("After generate", pathfinder)

    @test(tags=["pathfinder"])
    def test_pathfinder_avoid_and_generate(self):
        app = self.application()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        app.wait_until_present("Path Finder")
        app.click("@pathfinderMode.toggle-tooltip-container{0}")

        pathfinder = app.proxy_for("@ant-modal{0}")
        # Move modal to centre so selenium can detect buttons
        self.driver.execute_script(
            'var modal = document.getElementsByClassName("ant-modal")[0]; modal.style.right = "0px"'
        )
        self.show_page_content("Pathfinder", pathfinder)

        # Search for cabinet
        app.search("SP-C-45")
        app.wait(1)
        app.click("SP-C-45")

        pathfinder.click("Set{1}")
        app.wait(3)
        from_modal = app.proxy_for(
            "@ui-dialog ui-corner-all ui-widget ui-widget-content ui-front ui-dialog-buttons ui-draggable"
        )

        # Delete antd overlay in modal
        self.driver.execute_script(
            'var overlay = document.getElementsByClassName("ui-widget-overlay ui-front")[0]; overlay.remove();'
        )

        # Select from equipment
        from_modal.click("@jstree-icon jstree-ocl{7}")
        app.wait(1)
        from_modal.click("@jstree-icon jstree-ocl{9}")
        app.wait(1)
        from_modal.click("@j3_16")
        from_modal.click("@primary-btn set-path-btn ui-button ui-corner-all ui-widget")

        # Search for cabinet
        app.search("SP-C-46")
        app.wait(1)
        app.click("SP-C-46")
        pathfinder.click(
            "@primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0{2}"
        )

        # Include object
        app.search("SP-M-165")
        app.wait(1)
        app.click("SP-M-165")
        pathfinder.click("@include-and-avoid__button hover-cursor{0}")

        pathfinder.click("Generate")
        app.wait(15)

        self.show_page_content("After generate", pathfinder)

    @test(tags=["pathfinder"])
    def test_pathfinder_error(self):
        app = self.application()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        app.wait_until_present("Path Finder")
        app.click("@pathfinderMode.toggle-tooltip-container{0}")

        pathfinder = app.proxy_for("@ant-modal{0}")
        # Move modal to centre so selenium can detect buttons
        self.driver.execute_script(
            'var modal = document.getElementsByClassName("ant-modal")[0]; modal.style.right = "0px"'
        )
        self.show_page_content("Pathfinder", pathfinder)

        # Search for cabinet
        app.search("SP-C-45")
        app.wait(1)
        app.click("SP-C-45")

        pathfinder.click("Set{1}")
        app.wait(3)
        from_modal = app.proxy_for(
            "@ui-dialog ui-corner-all ui-widget ui-widget-content ui-front ui-dialog-buttons ui-draggable"
        )

        # Delete antd overlay in modal
        self.driver.execute_script(
            'var overlay = document.getElementsByClassName("ui-widget-overlay ui-front")[0]; overlay.remove();'
        )

        # Select from equipment
        from_modal.click("@jstree-icon jstree-ocl{7}")
        app.wait(1)
        from_modal.click("@jstree-icon jstree-ocl{9}")
        app.wait(1)
        from_modal.click("@j3_16")
        from_modal.click("@primary-btn set-path-btn ui-button ui-corner-all ui-widget")

        # Search for cabinet
        app.search("WH-C-25")
        app.wait(1)
        app.click("WH-C-25")
        pathfinder.click(
            "@primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0{2}"
        )

        pathfinder.click("Generate")
        app.wait_until_present("@results__error")
        self.show_page_content("Pathfinder done", pathfinder)

    @test(tags=["pathfinder"])
    def test_pathfinder_success(self):
        app = self.application()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        app.wait_until_present("Path Finder")
        app.click("@pathfinderMode.toggle-tooltip-container{0}")

        pathfinder = app.proxy_for("@ant-modal{0}")
        # Move modal to centre so selenium can detect buttons
        self.driver.execute_script(
            'var modal = document.getElementsByClassName("ant-modal")[0]; modal.style.right = "0px"'
        )
        self.show_page_content("Pathfinder", pathfinder)

        # Search for cabinet
        app.search("SP-C-45")
        app.wait(1)
        app.click("SP-C-45")

        pathfinder.click("Set{1}")
        app.wait(3)
        from_modal = app.proxy_for(
            "@ui-dialog ui-corner-all ui-widget ui-widget-content ui-front ui-dialog-buttons ui-draggable"
        )

        # Delete antd overlay in modal
        self.driver.execute_script(
            'var overlay = document.getElementsByClassName("ui-widget-overlay ui-front")[0]; overlay.remove();'
        )

        # Select from equipment
        from_modal.click("@jstree-icon jstree-ocl{7}")
        app.wait(1)
        from_modal.click("@jstree-icon jstree-ocl{9}")
        app.wait(1)
        from_modal.click("@j3_16")
        from_modal.click("@primary-btn set-path-btn ui-button ui-corner-all ui-widget")

        # Search for cabinet
        app.search("SP-C-46")
        app.wait(1)
        app.click("SP-C-46")
        pathfinder.click(
            "@primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0{2}"
        )

        pathfinder.click("Generate")
        app.wait(15)
        pathfinder.click("@path-item{1}")
        app.wait(1)
        pathfinder.click("Create")
        app.wait(1)

        app.set("@text ui-input{1}", "test")
        app.click("Save")
        app.wait(1)
        app.click("OK")

        self.show_page_content("After circuit insert", app)
        self.show_database_changes("AFTER CIRCUIT INSERT")

    @test(tags=["pathfinder"])
    def test_pathfinder_cancel(self):
        app = self.application()

        app.wait_until_present("Tools palette")
        app.click("Tools palette")

        app.wait_until_present("Path Finder")
        app.click("@pathfinderMode.toggle-tooltip-container{0}")

        pathfinder = app.proxy_for("@ant-modal{0}")
        # Move modal to centre so selenium can detect buttons
        self.driver.execute_script(
            'var modal = document.getElementsByClassName("ant-modal")[0]; modal.style.right = "0px"'
        )
        self.show_page_content("Pathfinder", pathfinder)

        # Search for cabinet
        app.search("SP-C-45")
        app.wait(1)
        app.click("SP-C-45")

        pathfinder.click("Set{1}")
        app.wait(3)
        from_modal = app.proxy_for(
            "@ui-dialog ui-corner-all ui-widget ui-widget-content ui-front ui-dialog-buttons ui-draggable"
        )

        # Delete antd overlay in modal
        self.driver.execute_script(
            'var overlay = document.getElementsByClassName("ui-widget-overlay ui-front")[0]; overlay.remove();'
        )

        # Select from equipment
        from_modal.click("@jstree-icon jstree-ocl{7}")
        app.wait(1)
        from_modal.click("@jstree-icon jstree-ocl{9}")
        app.wait(1)
        from_modal.click("@j3_16")
        from_modal.click("@primary-btn set-path-btn ui-button ui-corner-all ui-widget")

        # Search for cabinet
        app.search("SP-C-46")
        app.wait(1)
        app.click("SP-C-46")
        pathfinder.click(
            "@primary-btn ui-button ui-corner-all ui-widget font-size-normal margin-0{2}"
        )

        # Will only work on multithreaded server
        pathfinder.click("Generate")
        pathfinder.click("Cancel")
        self.show_page_content("After cancel", app)

    @test(tags=["copper"])
    def test_copper_network(self):
        """
        Test creation of copper cables, equipment and connections. Have these in a single test
        to make dev-test cycle easier
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        # Go to data
        app.search("WH-M-04")
        map.set_zoom(19)
        map = app.map()

        # Add copper cable
        app.click("Add object")
        app.click("Copper Cable")
        app.click("@spec-edit-btn")
        app.click("@spec-grid-copper_cable_spec/100-19-C")


        map.click_at(52.2238809, 0.1336075)  # WH-C-04
        map.click_at(52.2241627, 0.1335888)  # WH-M-14
        map.click_at(52.2240822, 0.1329678)  # WH-M-06
        map.click_at(52.2240822, 0.1329678)  # Finish
        app.click("Save")
        app.wait_until_gone("Preview")
        self.show_database_changes("AFTER ADD COPPER CABLE 1")

        # Add copper cable to end
        app.click("Add object")
        app.click("Copper Cable")
        app.click("@spec-edit-btn")
        app.click("@spec-grid-copper_cable_spec/100-19-BFC")


        map.click_at(52.2240822, 0.1329678)  # WH-M-06
        map.click_at(52.2236381, 0.1336176)  # WH-M-07
        map.click_at(52.2236381, 0.1336176)  # Finish
        app.click("Save")
        app.wait_until_gone("Preview")
        self.show_database_changes("AFTER ADD COPPER CABLE 2")

        #
        # Connect cables
        #
        self.add_equipment_at(app, "WH-M-06", "Manhole: WH-M-06", "Copper Splice Closure")
        app.wait_until_present("Manhole: WH-M-06")
        #app.wait_until_present("Copper Splice Closure: {2}")
        equip_tree = app.proxy_for("Equipment", 2)
        equip_tree.right_click("Copper Splice Closure: WH-CSC")
        app.click("Connect Cables")
        conn_dialog = app.proxy_for("@connections-dialog-form")  # ENH: Nicer to use title

        # Expand from and to cables
        conn_dialog.double_click("WH-CC-100000{1}")
        conn_dialog.double_click("WH-CC-100001{1}")

        # Select pairs to connect
        conn_dialog.click(" 1{1}")
        conn_dialog.click(" 1{2}")

        # ENH: Don't know why we need return_proxy=False
        # while in connect_cables we don't
        app.click("Connect", return_proxy=False)

        self.show_database_changes("AFTER CONNECT CABLES")

        #
        # Add DSLAM and connect to fiber and copper
        #

        self.add_equipment_at(app, "WH-C-04", "Cabinet: WH-C-04", "Rack")
        app.wait_until_present("Rack:{2}")
        equip_tree.right_click("Rack:")
        app.hover("Add")
        app.wait_until_present("Mixed")
        app.hover("Mixed")
        app.click("DSLAM")
        app.set("In Ports", 2)
        app.set("Out Ports", 25)
        app.click("Save")
        app.wait_until_gone("Preview")
        self.show_database_changes("AFTER DSLAM")

        # Connect fiber -> in port
        equip_tree.double_click("DSLAM:")
        equip_tree.double_click("IN")
        equip_tree.right_click("1{1}")  # Tree entry for port
        app.click("Connect")

        conn_dialog = app.proxy_for("@connections-dialog-form")
        app.wait_until_present("WH-FCB-002 (0/72)")
        conn_dialog.double_click("WH-FCB-002")
        conn_dialog.click("11{1}")
        app.click("Connect", return_proxy=False)
        app.wait_until_present("1 <- WH-FCB-002 #11")
        self.show_database_changes("AFTER CONNECT FIBER -> PORT")

        # Connect out port -> copper
        equip_tree.double_click("OUT")
        equip_tree.right_click("1")  # Tree entry for port
        app.click("Connect")

        # TODO: Fix this. Skip this as fails on click
        # conn_dialog = app.proxy_for("@connections-dialog-form")
        # app.wait_until_present("WH-CC-100000 (0/100)")
        # conn_dialog.double_click("WH-CC-100000")
        # conn_dialog.click("1{1}")
        # app.click("Connect", return_proxy=False)
        # app.wait_until_present("1 -> WH-CC-100000 #1")
        # self.show_database_changes("AFTER CONNECT PORT -> COPPER")

        #
        # Add copper terminal and connect
        #
        # self.add_equipment_at(app, "WH-M-07", "Manhole: WH-M-07", "Copper Terminal")

        # TODO:
        #  Connect terminal to copper cable
        #  Do a trace and schematic from cabinet

    @test(tags=["address"])
    def test_customer_address(self):
        """
        Test functionality at customer address especially comms equipment reference
        editor
        """

        app = self.application(delta="design/NB046")
        map = app.map()

        app.search("294 Milton")   
        app.click('Edit')  
        app.click("@reference-field-selector{1}")
        app.wait(2)
        
        # ENH: Get handle on actual dialog and click Clear/Done on that
        app.click("Clear")
        app.click("Done")

        app.click("Save")
        
        self.show_database_changes("AFTER REF CLEAR")

        # ENH: Add selecting pole and then splitter in the equipment tree.

    @test(tags=["loc"])
    def test_loc_edit(self):

        app = self.application(delta="design/NB046")
        app.search("Woodhead Hub")
        app.wait_until_present("Patch Panel: WH-ODF-01")
        equip_tree = app.proxy_for("Equipment", 2)

        equip_tree.double_click("Patch Panel: WH-ODF-01")
        app.wait_until_present("OUT")
        equip_tree.right_click("OUT")      
        app.click("Edit LOC")

        app.proxy_for("Edit LOC")
        app.click("Add")
        app.set("Count Name", "WH-XX")
        app.click("Ripple")

        app.wait_until_present("Confirm Update")
        app.click("OK")
        app.wait_until_gone("Running update")

        self.show_database_changes("AFTER RIPPLE OF SINGLE LOC")
        
    @test(tags=["fms_integration"])
    def test_add_marker(self):

        lng = 0.1472517
        lat = 52.2220577
        zoom = 18
        marker_text = "fiber break"
        app = self.application()

        # add query params for initial map view (core) and addMarkerPlugin
        url = f'{self._url}&ll={lat},{lng}&z={zoom}&addMarker={marker_text}'
        app.goto(url)
        map = app.map()
        details = map.map_details()
        self.show(details)

        has_graphic = self.driver.execute_script(
            "return myw.app.map.getLayers().getArray().find(layer => layer.get('name') == 'alerts').values_.source.getFeatures().some(feature => {return feature._myw_tooltip == 'fiber break';});"
        )
        self.show("Map has new alert: ", has_graphic)

    def add_equipment_at(self, app, struct_name, struct_title, equip_type):
        tech = self.feature_list[equip_type.lower().replace(" ", "_")]["tech"].capitalize()
        app.search(struct_name)
        app.wait_until_present('Equipment')
        app.wait(2)
        equip_tree = app.proxy_for("Equipment", 2)
        equip_tree.right_click(struct_title)
        app.hover("Add")
        try:
            app.wait_until_present(tech)
            app.hover(tech)
        except:
            pass
        app.click(equip_type)
        app.click("Save")

    def select_in_tree(self, app, names):
        """
        Select multiple nodes in tree
        """

        if not names:
            return

        # We need to find the IDs of the jstree nodes we want selected and the
        # ID of the parent node.
        treeIds = []
        for name in names:
            ele = app._find_element_fuzzy(name)
            parent = ele.find_element(By.XPATH, "..")
            treeIds.append(parent.get_attribute("id"))
            gid = parent.get_attribute("id")

        treeIds = ",".join(treeIds)

        self.driver.execute_script(f"$('#{gid}').parent().jstree('deselect_all')")
        self.driver.execute_script(f"$('#{gid}').parent().jstree('select_node', [{treeIds}])")
