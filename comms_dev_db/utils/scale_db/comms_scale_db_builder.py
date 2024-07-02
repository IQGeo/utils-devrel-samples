from myworldapp.modules.comms_dev_db.utils.myw_batch_utility import MywBatchUtility

from myworldapp.modules.comms_dev_db.build.comms_dev_db_build_util import CommsDevDbBuildUtil
import site, os, sys, codecs, time
import argparse, shutil, zipfile


class CommsScaleDbBuilder(MywBatchUtility):

    """
    Builds scalability testing database
    """

    def __init__(self, trace, db_name, db_type="postgres", suite_name=None, suppress_timings=False):
        """
        Init slots of self
        """
        super().__init__(trace, suppress_timings)
        self.db_name = db_name
        self.sync_url = "https://engineering-1.sandbox.iqgeo.cloud/"

    def run(self):

        self._run("myw_db", self.db_name, "load", "design.csv", "--update")
        self._run("myw_db", self.db_name, "run", "comms_build_fiber_rings.py", "--commit")

        # Long-haul fibre
        self._run("myw_db", self.db_name, "run", "comms_build_long_haul.py", "--commit")

        # Load OSM data for Derby and convert to routes/manholes
        for f in ["streets_osm.def", "streets_osm.layer", "streets_osm.1.csv", "streets_osm.2.csv"]:
            self._run("myw_db", self.db_name, "load", f, "--update")
        self._run("myw_db", self.db_name, "run", "convert_street_osm.py", "--commit")

        # Load FP data
        # fp_package = "fp_big"
        # self._run("comms_db", self.db_name, "import", fp_package, "--delta", "design/fp_big")

        # Init database for replication and add extract region FEXBHM01
        self._run(
            "myw_db",
            self.db_name,
            "initialise",
            "/opt/iqgeo/anywhere/extracts",
            self.sync_url,
            "--download_dir",
            "/opt/iqgeo/anywhere/extracts",
        )
        self._run("myw_db", self.db_name, "load", "myw_extract_region.csv", "--update")

        # Run this on a pod to create extract
        print("This needs to be run on pod: sh /shared-data/scripts/mk_extract FEXBHM01")
        # And then these
        # myw_db ${db} configure_extract FEXBHM01 'Administrator'
        # myw_db ${db} configure_extract FEXBHM01 'Designer'
        # myw_db ${db} configure_extract FEXBHM01 --writable_by_default

        # Add users for locust testing
        self._run(
            "myw_db", self.db_name, "run", "../../tests/scalability/setup_users.py", "--commit"
        )

    def validate(self):

        for d in ["perf_small", "perf_tiny", "perf_medium"]:
            self._run("comms_db", self.db_name, "validate", "data", "--delta", f"design/{d}")


if __name__ in ["__main__", "builtins"]:

    database = os.getenv("MYW_COMMS_SCALE_DB") or "iqg_comms_scale"

    b = CommsScaleDbBuilder(0, database)
    b.run()
