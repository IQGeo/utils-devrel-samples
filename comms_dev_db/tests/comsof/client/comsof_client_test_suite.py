# Copyright: Ubisense Limited 2010-2015

import os, unittest, time
from zipfile import ZipFile

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

# Enable use of cdiff within container
# ENH: Do this somewhere further up
MywGuiTestSuite.APP_LOCATIONS['cdiff'] = { 'Linux': ['cdiff'] }


class ComsofClientTestSuite(MywGuiTestSuite):
    ##
    ## GUI tests for Comsof client application
    ##
        
    # Class constants
    _test_names = [
        "layer_list",
        "workspace_list",
        "ws_object_edit",
        "ws_object_bulk_edit",
        "ws_object_delete",
        "ws_dialog_warnings"
    ]

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
        _modify_default(cli_arg_def, "base_url", os.getenv("MYW_COMMS_BASE_URL"))
        _modify_default(cli_arg_def, "remote_url", os.getenv("MYW_COMMS_REMOTE_URL"))

    # Username to login for tests by default
    default_login = {"username": "designer", "password": "designer!"}
    viewer_login = {"username": "viewer", "password": "viewer!"}
    admin_login = {"username": "admin", "password": "_mywWorld_"}

    # Specific logins keyed on test name
    # Intended to test different rights
    specific_logins = {}

    tests_to_skip = {}

    browser_width = 1600
    browser_height = 950

    # Controls what is output by show_database_changes
    # For comms, show data and delta schemas
    db_schema_filter = "d*"

    
    def __init__(self, db_session, cli_args):
        ##
        ## Construct test suite operating on database DB_SESSION
        ## 
        ## BASE_URL is the server to connect to e.g. "//localhost".
        ## BROWSER_NAME is the name of the browser to test,
        ## one of 'chrome', 'firefox' or 'ie'.
        ## 
        ## Optional RESULT_SET specifies database location and key for
        ## recording test result summary. PROXY_OPTIONS are passed into MywProxy()

        # for comms devcontainer
        self.APP_LOCATIONS["cdiff"] = {"Linux": ["cdiff"]}

        super().__init__(db_session, cli_args)

        # Init slots
        self.db_session = db_session
        self.base_url = cli_args.base_url
        self.remote_url = cli_args.remote_url
        self.maximize_window = None
        self.db_engine = self.db_session.bind
        self.language = None

        # Set location for reference results
        self_dir = os.path.dirname(__file__)
        self.resource_dir = os.path.normcase(os.path.join(self_dir, "resources"))

        # Set location of test data
        self_module = MywProduct().moduleOf(__file__)
        self.test_data_dir = self_module.file("data")

        # Make temp results db_type and browser-specific  (useful when checking results of overnight build)
        self._temp_dir = self.temp_dir(self.db_engine.dialect.name, cli_args.browser_name)

        # Get location of workspaces
        self.ws_dir = self.db().setting('comsof.workspaces')
        
        # Set strings to exclude from results
        self.output_mappings[self.base_url] = "<base_url>"

        # Restart browser at each test or not
        self.restart = self.browser_name in ["ie", "firefox", "chrome"]
        self.do_login = not self.browser_name in ["android"]

    
    def db(self):
        ##
        ## Dev database (a MywDatabase)
        ##

        from myworldapp.core.server.database.myw_database import MywDatabase
        from myworldapp.core.server.base.db.globals import Session
        return MywDatabase(Session)

        
    @property
    def test_names(self):
        ##
        ## The test names matching TESTS
        ## 
        ## Subclassed to apply browser-specific filtering

        names = self._test_names

        tests_to_skip = self.tests_to_skip.get(self.browser_name, [])
        for name in self.tests_to_skip.get(self.browser_name, []):
            names.remove(name)

        return names

    # ==============================================================================
    #                               SETUP AND TEARDOWN
    # ==============================================================================

    def suite_setup(self):
        ##
        ## Called before tests are run
        ##

        # Save initial database state
        print("Saving database state")
        self._orig_db = MywMemoryDatabase(self.db_session, True)

        # Init driver
        self.driver = self.get_driver()

        # Skip initial restart
        self.first_test = True

        
    def setup(self, name):
        ##
        ## Called before a test is run
        ##

        super().setup(name)

        # Save initial state (for differencing)
        self.prev_db = self._orig_db

        if self.restart and not self.first_test:
            self.restart_browser(name)
        else:
            # Make sure we are logged in as the correct user
            if self.do_login:
                login_details = self.login_details_for(name)
                app = MywAppProxy(self.driver, **self.proxy_options)
                app.login(self.base_url, login_details["username"], login_details["password"])

        # Init test workspace
        src = self.resource_file('workspaces','2.zip')
        dst = os.path.join(self.ws_dir,'2','workspace')
        self.progress(1,'Resetting:',dst)
        self.unzip_tree(src,dst)
        
        self.first_test = False

        
    def teardown(self, name):
        ##
        ## Called after a test is run
        ##

        super().teardown(name)

        # Restore initial database state
        self._orig_db.restore_to(self.db_session)

         

    def unzip_tree(self,zip_path,target_dir):
        ##
        ## Extract ZIP_FILE to TARGET_DIR
        ##
 
        self.progress(4,'unzipping',zip_path,'to',target_dir)
        
        self.os_engine.remove_if_exists(target_dir)
                
        with ZipFile(zip_path, "r") as zip_file:
            zip_file.extractall(target_dir)

        
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
        ##
        ## Restart browser and login again.
        ## TEST_NAME required to determine the correct login for the test

        if self.browser_name != "firefox":
            self.driver.quit()
        else:
            self.driver.close()
        self.driver = self.get_driver()
        app = MywAppProxy(self.driver, **self.proxy_options)

        self.driver.set_window_position(0, 0)
        self.driver.set_window_size(self.browser_width, self.browser_height)

        login_details = self.login_details_for(test_name)
        app.login(self.base_url, login_details["username"], login_details["password"])

        
    def application(
        self, application="mywcom", delta=None, basemap="None", layout="desktop", touchscreen=False
    ):
        ##
        ## Moves client to a myWorld application and returns proxy for an application
        ##

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
            app.wait_until_present("Zoom in")  # Waits for map to complete

        self._app = app

        return app

    
    def login_details_for(self, test_name):
        ##
        ## Returns login username/password for test
        ##

        return self.specific_logins.get(test_name, self.default_login)

    
    def add_layers(self,app,*layer_names):
        ##
        ## Add LAYER_NAMES to the visible layers
        ##

        app.click('Layers')
        layer_list = app.proxy_for('Layers',2)

        layer_list.click('Add layers')

        dialog = app.proxy_for('Add Layers',2)
        for layer_name in layer_names:
            dialog.click(layer_name)

        dialog.click('Close{1}')
        
    
    # =======================================================================================
    #                                          TESTS
    # =======================================================================================

    def test_layer_list(self):
        ##
        ## Check default layer list
        ##

        app = self.application(delta='comsof_design/Arbury')
        map = app.map()
        
        self.add_layers(app,'Workspace IN',
                            'Workspace OUT',
                            'Workspace Clusters')

        app.click('Layers')
        layer_list = app.proxy_for('Layers',2)

        # Expand layer groups
        grp = layer_list.proxy_for('Workspace IN')
        grp.click('@expandLayerGroup')
        
        grp = layer_list.proxy_for('Workspace Clusters')
        grp.click('@expandLayerGroup')
        
        grp = layer_list.proxy_for('Workspace OUT')
        grp.click('@expandLayerGroup')
       
        self.show_page_content('LAYER LIST',layer_list)

        
    def test_workspace_list(self):
        ##
        ## Exercise workpace list component
        ##

        app = self.application()
        map = app.map()
        details_pane = app.proxy_for('Details',2)

        # Display workspace list
        app.search('arbury design')
        app.click('Open')
        self.show_page_content('WORKSPACE LIST',details_pane)
 
        # Exercise download
        details_pane.right_click('2')
        app.click('Download')

        # Exercise add workspace
        app.click('New workspace')
        details_pane.set('Name','Test')
        # TODO: Change some settings
        self.show_page_content('BEFORE SAVE',details_pane)
        details_pane.click('Save')

        # Show what we created
        details_pane.click('Options')
        self.show_page_content('AFTER SAVE',details_pane)
       
        # TODO: Exercise right click, BOM, Rules edit
      
        
    def test_ws_object_edit(self):
        ##
        ## Exercise update of workspace object
        ##

        app = self.application()
        map = app.map()
        details_pane = app.proxy_for('Details',2)
        
        self.add_layers(app,'Workspace IN')

        # Open workspace
        # ENH: Quicker to use URL params
        app.search('arbury design')
        app.click('Open')
        app.click('Test Area')
        app.click('Open')
        app.wait() # Allows layers to load

        # Select a workspace object
        # TODO: Exercise select line, area
        coord = [52.23220,0.13717]
        map.click_at(*coord)  # IN_Demand 60
        self.show_page_content('AFTER SELECT DEMAND POINT',details_pane)

        # Open its editor
        details_pane.click('Edit')
        self.show_page_content('AFTER EDIT DEMAND POINT',details_pane)

        # Make changes and save
        # TODO: Exercise update boolean
        # TODO: Exercise update geometry
        details_pane.set('Include',False)
        details_pane.set('pon_homes',4)
        details_pane.set('bldg_id',12345)
        details_pane.click('Save')
        app.wait_until_gone('Changes saved')
        self.show_page_content('AFTER SAVE DEMAND POINT',details_pane)

        # Check map object updated
        map.click_at(*coord)
        self.show_page_content('AFTER RE-SELECT DEMAND POINT',details_pane)
       
        
    def test_ws_object_bulk_edit(self):
        ##
        ## Exercise bulk update of workspace objects
        ##

        app = self.application()
        map = app.map()
        details_pane = app.proxy_for('Details',2)
        
        self.add_layers(app,'Workspace IN')

        # Turn off non-editable layers
        app.click('Layers')
        layer_list = app.proxy_for('Layers',2)
        grp = layer_list.proxy_for('Workspace IN')
        grp.click('@expandLayerGroup')
        layer_list.click('Streets')
        layer_list.click('Potential Routes (Underground)')
        
        # Open workspace
        # ENH: Quicker to use URL params
        app.search('arbury design')
        app.click('Open')
        app.click('Test Area')
        app.click('Zoom to object')
        app.click('Open')
        app.wait() # Allows layers to load

        # Select some demand points
        map.click_and_drag(52.2301469,0.1358622, 52.2312377,0.1376861, True)
        self.show_page_content('AFTER SELECT DEMAND POINTS',details_pane)

        # Open its editor
        details_pane.click('Bulk Edit')
        bulk_dlg = app.proxy_for('Bulk Edit - 11 objects',2)
        self.show_page_content('DEMAND POINTS BULK EDITOR',bulk_dlg)
        
        # Make changes and save
        bulk_dlg.set('Include',False)
        bulk_dlg.set('pon_homes',4)
        bulk_dlg.set('bldg_id',12345)
        bulk_dlg.click('Save')
        app.click('OK')
        app.wait_until_gone('Changes saved')
        self.show_page_content('AFTER SAVE DEMAND POINTS',details_pane)

        # Check map object updated
        app.click('Clear selections')
        map.click_at(52.23067,0.13680)  
        self.show_page_content('AFTER RE-SELECT DEMAND POINT',details_pane)

        
    def test_ws_object_delete(self):
        ##
        ## Exercise delete of workspace object
        ##

        app = self.application()
        map = app.map()
        details_pane = app.proxy_for('Details',2)
         
        self.add_layers(app,'Workspace IN')
 
        # Open workspace
        # ENH: Quicker to use URL params
        app.search('arbury design')
        app.click('Open')
        app.click('Test Area')
        app.click('Zoom to object')
        app.click('Open')
        app.wait() # Allows layers to load

        # Select a workspace object
        # TODO: Exercise select line, area
        coord = [52.23097,0.137644]
        map.click_at(*coord)  # IN_Demand 18
        self.show_page_content('AFTER SELECT DEMAND POINT',details_pane)

        # Delete it
        details_pane.click('Edit')
        details_pane.click('Delete')
        app.click('Delete{2}')
        self.show_page_content('AFTER DELETE DEMAND POINT',details_pane)

        # Check map object gone
        map.click_at(*coord)
        self.show_page_content('AFTER ATTEMPT RE-SELECT DEMAND POINT',details_pane)

    def test_ws_dialog_warnings(self):
        ##
        ## Exercise update of workspace object
        ##

        app = self.application()
        map = app.map()
        app.wait_until_present("Layers")
        self.add_layers(app,'Workspace IN', 'Workspace OUT')
        
        app.search('arbury design')
        app.wait_until_present("Open")
        app.click('Open')
        app.wait_until_present("Full Area")
        app.click("Full Area")
        app.wait_until_present("Open")
        app.click('Open')
        ws = app.proxy_for("@ui-dialog ui-corner-all ui-widget ui-widget-content ui-front ui-dialog-buttons ui-draggable")
        app.wait_until_present("@initialise")
        app.click("@initialise")
        app.click("@populate")
        app.click("@preprocess")
        app.click("@validate")
        app.click("@acquire_licence")
        app.click("@calculate")
        app.click("Run")
        self.show_page_content('RUN WS', ws)
