import sys,os
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine


class ComsofDevDbBuilder:
    """
    Engine to add Comsof to the Comms Dev database
    """

    def __init__(self, db):
        """
        Init slots of self
        """

        self.db = db
        self.db_name = db.name()
        self.progress = db.progress
        self.os_engine = MywOsEngine(progress=self.progress)
        self.dev_db_data_dir = MywProduct().module("comms_dev_db").file("data","comsof")

    def run(self):
        """
        Do the steps in the build
        """

        self.configure_datamodel()
        self.configure_connection_params()
        self.configure_application()
        self.load_test_data()

    def configure_datamodel(self):
        """
        Add product data model
        """

        self.print_banner("Adding product data model")
        self.myw_db("install", "comsof")
        
        comms_db_cmd = MywProduct().module("comms").file("tools", "comms_db")
        self.run_subprocess(
            comms_db_cmd,
            self.db_name,
            "install",
            "example_mappings",
            "example_mappings_raw",
            "--module",
            "comsof",
        )
        
        self.run_subprocess(
            comms_db_cmd, self.db_name, "install", "cabinet_area", "--module", "comsof"
        )
        
        self.run_subprocess(
            comms_db_cmd, self.db_name, "install", "comsof_design", "--module", "comms_dev_db"
        )

    def configure_connection_params(self):
        """
        Configure connection parameters etc
        """
        
        self.print_banner("Configuring connection parameters")

        for filespec in ["*.settings", "*.enum"]:
            filename = os.path.join(self.dev_db_data_dir, "config", filespec)
            self.myw_db("load", filename, "--update")

    def configure_application(self):
        """
        Configure application
        """
        
        self.print_banner("Configuring application")

        self.myw_db("add", "application_layer", "mywcom", "comsof_*")

        self.grant_rights("Administrator", "mywcom", "comsof.openWorkspace", "comsof.viewRules")
        self.grant_rights("Designer", "mywcom", "comsof.openWorkspace", "comsof.viewRules")
        
        
    def load_test_data(self):
        """
        Load test data
        """
        
        self.print_banner("Loading test data")
        
        self.myw_db(
            "load",
            os.path.join(self.dev_db_data_dir, "*.csv"),
            "--update_sequence",
        )

    # -----------------------------------------
    #                 HELPERS
    # -----------------------------------------

    def grant_rights(self,role,application,*rights):
        """
        Add RIGHTS to ROLE
        """

        role_def = self.db.config_manager.roleDef(role)
        
        permissions = role_def['permissions'][application]
        for right in rights:
            if not right in permissions:
                self.progress(1,"Role",role,":","Adding right",right)
                permissions.append(right)

        self.db.config_manager.updateRole(role,role_def)
    
    def print_banner(self, msg):
        """
        Print MSG with banner lines
        """
        banner = (len(msg) + 2) * "-"

        print("")
        print(banner)
        print("", msg)
        print(banner)
        print("")

        sys.stdout.flush()

    def myw_db(self, *args, **opts):
        """
        Run a myw_db command
        """
        opts["stream"] = sys.stdout
        self.run_subprocess("myw_db", self.db_name, *args)

    def run_subprocess(self, *cmd, **opts):
        """
        Run a shell command, showing output
        """
        opts["stream"] = sys.stdout

        res = self.os_engine.run(*cmd, **opts)

        sys.stdout.flush()

        return res

# ==============================================================================
#                                   MAIN
# ==============================================================================

engine = ComsofDevDbBuilder(db)
engine.run()
