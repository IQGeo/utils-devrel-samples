# Copyright:Ubisense Limited 2010-2023
import os, shutil, datetime, glob, base64, time

from collections import OrderedDict
import json

from myworldapp.core.server.base.core.myw_error import MywError, MywInternalError
from myworldapp.core.server.base.db.globals import Session
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.geom.myw_polygon import MywPolygon

from myworldapp.modules.dev_tools.server.test_framework.myw_memory_database import MywMemoryDatabase
from myworldapp.modules.dev_tools.server.test_framework.myw_controller_test_suite import (
    MywControllerTestSuite,
    MywControllerTestJsonSorter,
)
from myworldapp.modules.dev_tools.server.test_framework.myw_test_suite import MywTestJsonSorter

from myworldapp.modules.comms.server.validation.delta_manager import DeltaManager
from myworldapp.modules.comms.server.validation.delta_manager import DataValidator
from myworldapp.modules.comms.server.api.path_finder_manager import PathFinderManager
from myworldapp.modules.comms.server.controllers.tmf_helpers.comms_schema_validator import CommsSchemaValidator


# Just to make cut-and-paste from browser easier
null = None
true = True
false = False


class CommsCableReouteJsonSorter(MywControllerTestJsonSorter):
    """
    Helper class to prune cable re-routing response
    """

    # ENH: Replace by something more generic

    @classmethod
    def sort(self, data, el_type=None, depth=0):
        """
        Returns a copy of JSON structure data with dict elements sorted by key (recursive)

        EL_TYPE is the key of the current element within the structure
        DEPTH is depth of current element with the structure"""

        feature_props = ["add_routes", "remove_routes", "same_routes"]

        # Flatten features
        if el_type in feature_props and isinstance(data, list):
            items = []
            for item in data:
                items.append(
                    "{}({})    {}".format(
                        item["myw"]["feature_type"], item["id"], item["myw"]["title"]
                    )
                )

            return sorted(items)

        if el_type in feature_props and isinstance(data, dict):
            items = []
            for key, item in data.items():
                items.append(
                    "{}: {}({})    {}".format(
                        key, item["myw"]["feature_type"], item["id"], item["myw"]["title"]
                    )
                )
            return sorted(items)

        if el_type == "feature" and isinstance(data, dict):
            return "{}: {}({})    {}".format(
                el_type, data["myw"]["feature_type"], data["id"], data["myw"]["title"]
            )

        if el_type == "coordinates" and isinstance(data[0], list):
            str = ""
            for coord in data:
                str += " [{} {}] ".format(coord[0], coord[1])
            return str

        if el_type in ["connection_updates", "connection_deletes", "deleted_segs"] and isinstance(data, list):
            return sorted(data)

        # Sort dicts and lists
        data = super().sort(data, el_type, depth)

        return data


class CommsStructCablesJsonSorter(MywControllerTestJsonSorter):
    """
    Helper class to sort structure cables requests
    """

    @classmethod
    def sort(self, data, el_type=None, depth=0):
        """
        Returns a copy of JSON structure data with dict elements sorted by key (recursive)

        EL_TYPE is the key of the current element within the structure
        DEPTH is depth of current element with the structure"""

        sort_by_feature = ["circuits"]

        # Sort by urn properties
        if el_type in sort_by_feature and isinstance(data, list):
            data = sorted(data, key=lambda o: o["urn"])

        return super().sort(data, el_type, depth)


class CommsSkipJsonSorter(MywControllerTestJsonSorter):
    """
    Helper class to compress conflict results (omitting geometry)
    """

    @classmethod
    def sort(self, data, el_type=None, depth=0):
        """
        Returns a copy of JSON structure data with dict elements sorted by key (recursive)

        EL_TYPE is the key of the current element within the structure
        DEPTH is depth of current element with the structure"""

        skip_property = ["geometry"]

        if isinstance(data, list):
            return list(map(lambda o: self.sort(o, el_type, depth + 1), data))
        elif isinstance(data, dict):
            new_data = {}
            for key, val in data.items():
                if key in skip_property:
                    new_data[key] = "<skipped>"
                else:
                    new_data[key] = self.sort(val, el_type, depth + 1)
            return new_data

        return data


class CommsContainmentJsonSorter(MywControllerTestJsonSorter):
    """
    Helper class to sort containment contents results
    """

    @classmethod
    def sort(self, data, el_type=None, depth=0):
        """
        Returns a copy of JSON structure data with dict elements sorted by key (recursive)

        EL_TYPE is the key of the current element within the structure
        DEPTH is depth of current element with the structure"""

        # ENH: Remove need for this

        sort_by_feature = ["circuits"]

        # Sort by urn properties
        if el_type in sort_by_feature and isinstance(data, list):
            data = sorted(data, key=lambda o: o["circuit_urn"])

        if isinstance(data, dict) and "seg_circuits" in data and data["seg_circuits"]:
            data["seg_circuits"] = sorted(
                data["seg_circuits"],
                key=lambda o: (o["circuit_urn"], o["seg_urn"], o["low"], o["high"]),
            )

        if isinstance(data, dict) and "port_circuits" in data and data["port_circuits"]:
            data["port_circuits"] = sorted(
                data["port_circuits"],
                key=lambda o: (o["circuit_urn"], o["equip_urn"], o["side"], o["low"], o["high"]),
            )

        return super().sort(data, el_type, depth)


class CommsTmfControllerSorter(MywTestJsonSorter):
    @classmethod
    def sort(self, data, el_type=None, depth=0):

        # sort features in a collection by id
        if el_type == "features" and isinstance(data, list):
            # sort by the number portion of the id string
            return sorted(data, key=lambda x: int(x['id'].split("/")[1]))

        return super().sort(data, el_type, depth)
    
class CommsListJsonSorter(MywTestJsonSorter):
    """
    Sort list components as well if they contain strings
    """
    @classmethod
    def sort(self, data, el_type=None, depth=0):
      
        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], str):
            res = []
            for value in sorted(data):
                res.append(self.sort(value, None, depth + 1))
            return res
          

        return super().sort(data, el_type, depth)    

class CommsServerTestSuite(MywControllerTestSuite):
    """
    Functional tests for server

    Sends pre-canned queries to the server, shows results"""

    default_database = os.getenv("MYW_COMMS_DEV_DB") or "iqg_comms_dev"
    uses_database = True

    @classmethod
    def get_cli_args(cls, cli_arg_def):
        super().get_cli_args(cli_arg_def)

    # Class constants
    test_names = [
        "structure_contents",
        "structure_add",
        "structure_update",
        "structure_delete",
        "structure_replace",
        "route_contents",
        "route_update",
        "route_delete",
        "route_split",
        "conduit_update",
        "conduit_delete",
        "conduit_path",
        "conduit_routing",
        "conduit_move_to",
        "conduit_chain",
        "conduit_connect",
        "conduit_disconnect_at",
        "copper_network",
        "equipment_cables",
        "equipment_delete",
        "equipment_assemblies",
        "slack_add",
        "slack_delete",
        "slack_update",
        "cable_insert",
        "cable_path",
        "cable_routing",
        "cable_rerouting",
        "cable_delete",
        "cable_split",
        "cable_offset",
        "fiber_network",
        "fiber_trace",
        "fiber_paths",
        "fiber_connect",
        "fiber_disconnect",
        "fiber_path_finder",
        "fiber_path_finder_circuit",
        "fiber_path_finder_async",
        "fiber_path_finder_multipaths",
        "fiber_path_finder_ftth",
        "circuit_routing",
        "circuit_unrouting",
        "delta_validation",
        "delta_changes",
        "delta_revert",
        "delta_merge_feature",
        "delta_merge",
        "delta_conflicts",
        "delta_bounds",
        "validation_area",
        "feature_transaction",
        "data_import_configs",
        "data_preview",
        "data_import",
        "update_setting",
        "validate_setting",
        "loc_get",
        "loc_ripple",
        "loc_update",
        "loc_conflicts",
        "loc_maintain",
        "loc_disconnect_rename_design",
        "loc_disconnect_split_design",
        "loc_overlap_designs",
        "tmf_network_trace",
        "tmf_get",
        "tmf_get_many", 
        "tmf_delete",
        "tmf_create",
        "tmf_update",
        "tmf_metadata",
        "tmf_circuit"
    ]

    # Just for speed
    readonly_tests = [
        "fiber_network",
        "fiber_trace",
        "fiber_paths",
        "delta_validation",
        "delta_conflicts",
        "validation_area",
        "data_import_configs",
        "data_preview",
        "fiber_path_finder",
        "api_network_trace"
    ]

    def __init__(self, db_session, cli_args):
        """
        Init slots of self

        Optional RESULT_SET specifies database location and key for
        recording test result summary. LOG_LEVELS is a dict of log levels (DEBUG,
        INFO, etc) keyed by logger name. These override values in
        the .ini file"""

        ini_file = os.getenv("MYW_COMMS_BUILD_INI_FILE") or "myworldapp.ini"

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
        self.resource_dir = os.path.normcase(os.path.join(self_dir, "resources", "server_tests"))

        # Set location of test data
        self_module = MywProduct().moduleOf(__file__)
        self.test_data_dir = self_module.file("data")

        # Set temp dirs
        self._temp_dir = self.temp_dir(self.db_dialect)

        # Set strings to exclude from results
        self.output_mappings["\\\\\\\\"] = "\\"
        self.output_mappings["\\\\"] = "\\"
        self.output_mappings["\\"] = "/"
        self.output_mappings2['"date": ".*"'] = '"date": "<date>"'
        self.output_mappings2["/snapshots/tmp.*/"] = "/snapshots/<tmp_dir>/"
        self.output_mappings2["\?token=[^&]+&"] = "?token=<token>&"
        self.output_mappings2["mywcom_data_upload_\d+"] = "<upload_id>"

    def db(self, session=Session, *args, **kwargs):
        # Importing this at the top of the file causes circular import issues, so as a workaround, do it here
        from myworldapp.core.server.database.myw_database import MywDatabase

        return MywDatabase(session, *args, **kwargs)

    def run_test(self, test_name, diff_tool=None):
        """
        Run TEST_NAME and check the result

        Optional DIFF_TOOL is the tool to use for displaying results (see .check_test())

        Subclassed to supress DDL warnings"""
        with self.progress.operation("Test", test_name):  # ENH: Move this onto super
            super().run_test(test_name, diff_tool)

    def suite_teardown(self):
        """
        Called after all tests are run
        """

        # ENH: move to superclass ?
        if self.trace_level > 1:
            self.progress.print_statistics(self.trace_level)

        super().suite_teardown()

    @property
    def orig_db(self):
        """
        Initial state of database (a myw_memory_database)
        """

        if not self._orig_db:
            self._orig_db = MywMemoryDatabase(self.db_session, True, progress=self.progress)

        return self._orig_db

    def setup(self, name):
        """
        Called before a test is run
        """

        super().setup(name)

        # Save initial state (for differencing)
        if not name in self.readonly_tests:
            self.prev_db = self.orig_db

    def teardown(self, name):
        """
        Called after a test is run
        """

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

    def show_database_changes(self, result_id, sort=False, schema_filter="d*"):
        """
        Show records changed since last call
        """

        self.show_db_changes(
            result_id, self.db_session, self.prev_db, sort=sort, schema_filter=schema_filter
        )
        self.prev_db = MywMemoryDatabase(self.db_session)

    # ==============================================================================
    #                                    TESTS
    # ==============================================================================

    # ------------------------------------------------------------------------------
    #                                 STRUCTURES
    # ------------------------------------------------------------------------------

    def test_structure_contents(self):
        """
        Exercise containment contents for structures
        """

        self.login()

        self.subtest("STRUCTURES")
        self._test_get_request(
            "/modules/comms/structure/cabinet/1/contents", result_sorter=CommsContainmentJsonSorter
        )
        self._test_get_request(
            "/modules/comms/structure/cabinet/2/contents", result_sorter=CommsContainmentJsonSorter
        )
        self._test_get_request(
            "/modules/comms/structure/manhole/39/contents", result_sorter=CommsContainmentJsonSorter
        )
        self._test_get_request(
            "/modules/comms/structure/cabinet/11/contents", result_sorter=CommsContainmentJsonSorter
        )

        self._test_get_request(
            "/modules/comms/structure/cabinet/1/contents?include_proposed=true",
            result_sorter=CommsContainmentJsonSorter,
        )
        self._test_get_request(
            "/modules/comms/structure/cabinet/2/contents?include_proposed=true",
            result_sorter=CommsContainmentJsonSorter,
        )
        self._test_get_request(
            "/modules/comms/structure/manhole/39/contents?include_proposed=true",
            result_sorter=CommsContainmentJsonSorter,
        )
        self._test_get_request(
            "/modules/comms/structure/cabinet/11/contents?include_proposed=true",
            result_sorter=CommsContainmentJsonSorter,
        )
        self._test_get_request(
            "/modules/comms/structure/building/2/contents?include_proposed=true",
            result_sorter=CommsContainmentJsonSorter,
        )  # Exercises include_delta hook

    def test_structure_add(self):
        """
        Exercise route splitting and junction replacement
        """

        self.login()

        # Split route with reversed segment
        self._test_feature_post_request(
            "SPLIT ROUTE 301",  # Has reversed segment
            "manhole",
            {"geometry": {"type": "Point", "coordinates": [0.1373186027688656, 52.22466601215945]}},
        )

        # Split route at vertex
        self._test_feature_post_request(
            "SPLIT ROUTE 6 AT VERTEX",  # Has conduits, connected cables (directed and non), circuits
            "manhole",
            {"geometry": {"type": "Point", "coordinates": [0.1366344, 52.2240861]}},
        )

        # Split route in segment
        self._test_feature_post_request(
            "SPLIT ROUTE 4 IN DELTA",  # Has conduits, connected cables (directed and non), circuits
            "manhole",
            {"geometry": {"type": "Point", "coordinates": [0.1376818, 52.2237026]}},
            "design/NB046",
        )

        # Split route with cable segments with explicit containment
        self._test_feature_post_request(
            "SPLIT ROUTE 8",  # Has cables with explicit containment
            "manhole",
            {"geometry": {"type": "Point", "coordinates": [0.1365160, 52.2241529]}},
        )

        # Add structure at end of route
        # ENH: Add some bare routes in the DevDB
        self._test_feature_post_request(
            "ADD BARE ROUTE",
            "ug_route",
            {
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[0.1363344, 52.2238058], [0.1368091, 52.2237910]],
                }
            },
        )

        self._test_feature_post_request(
            "CONNECT TO ROUTE START",
            "manhole",
            {"geometry": {"type": "Point", "coordinates": [0.1363344, 52.2238058]}},
        )

        self._test_feature_post_request(
            "CONNECT TO ROUTE END",
            "manhole",
            {"geometry": {"type": "Point", "coordinates": [0.1368091, 52.2237910]}},
        )

        # Test for splitting a route containing a continuous conduit inside a conduit
        # Move bf tube into conduit
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/195/move_to/conduit/70",
            show_response=False,
            response_format="json",
        )
        # Move cable into bf tube
        self._test_post_request(
            "/modules/comms/conduit/mywcom_fiber_segment/75/move_to/blown_fiber_tube/195",
            show_response=False,
            response_format="json",
        )
        # Split conduit containing bf tube
        self._test_feature_post_request(
            "SPLIT CONDUIT CONTAINING BF TUBE",
            "manhole",
            {"geometry": {"type": "Point", "coordinates": [0.1351218830682835, 52.2251880899918]}},
        )

        # Make the new structure slight off from junction. Snapping will occur in structure_manager
        self._test_feature_post_request(
            "REPLACE JUNCTION",
            "manhole",
            {"geometry": {"type": "Point", "coordinates": [0.1373439448174852, 52.2246495]}},
            "design/NB046",
        )

    def test_structure_update(self):
        """
        Exercise update of route feature substructure
        """

        self.login()

        self._test_feature_put_request(
            "MOVE MANHOLE",
            "manhole/35",  # Has conduits, cables and reversed circuits
            [0.1364312, 52.224202],
        )

        self._test_feature_put_request(
            "MOVE POLE IN DELTA",
            "pole/5",  # Has nested equipment, connections and circuit ports
            [0.1410567, 52.2249688],
            delta="design/NB217",
        )

        self._test_feature_put_request(
            "MOVE MANHOLE IN DELTA",
            "manhole/253",  # Has splices, slacks and circuit segs on slacks
            [0.137647, 52.2253325],
            delta="design/NB217",
        )

        self._test_feature_put_request(
            "MOVE MDU IN DELTA",
            "mdu/1",  # Has internal cable, patch panel and equipment
            [0.134532, 52.22408565],
            delta="design/NB217",
        )

    def test_structure_delete(self):
        """
        Exercise equipment delete trigger
        """

        self.login()

        delta = "design/NB217"

        self._test_feature_delete_request("DELETE MANHOLE WITH SPLICES", "manhole/23", delta=delta)
        self._test_feature_delete_request("DELETE CABINET WITH SLACK", "cabinet/3", delta=delta)
        self._test_feature_delete_request(
            "ATTEMPT DELETE HUB WITH CIRCUITS", "building/1", delta=delta
        )
        self._test_feature_delete_request(
            "DELETE WALL BOX WITH PROPOSED CIRCUIT",
            "wall_box/147",
            [
                [0.1366271981829816, 52.22568359000871],
                [0.1365181779254323, 52.22574652945053],
                [0.1365785276282673, 52.22578103227539],
                [0.1366862067813092, 52.22571727138583],
                [0.1366271981829816, 52.22568359000871],
            ],
        )
        self._test_feature_delete_request(
            "ATTEMPT DELETE MANHOLE WITH WITH CIRCUITS", "manhole/24", delta=delta
        )
        self._test_feature_delete_request("DELETE MDU WITH INTERNAL CABLE", "mdu/5", delta=delta)

    def test_structure_replace(self):
        self.login()

        data = {
            "feature": json.dumps(
                {
                    "type": "Feature",
                    "properties": {
                        "installation_date": "2022-09-14",
                        "specification": "FPM-CCANN-MCX",
                        "labor_costs": "hole_dig",
                        "size_x": 850,
                        "size_y": 1300,
                        "size_z": 900,
                    },
                }
            ),
            "delta": "design/NB046",
        }
        self._test_post_request(
            "/modules/comms/structure/{}/{}/replace/{}".format("cabinet", 1, "manhole"),
            data=data,
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER REPLACING STRUCTURE")
        self.show_validation_errors("AFTER REPLACING STRUCTURE", "design/NB046")

    # ------------------------------------------------------------------------------
    #                                 ROUTES
    # ------------------------------------------------------------------------------

    def test_route_contents(self):
        """
        Exercise containment contents for routes
        """

        self.login()

        self.subtest("ROUTES")
        urn = self._get_route_urn_at([0.1364962, 52.2241623])  # ug_route 8
        self._test_get_request(
            "/modules/comms/route/{}/contents".format(urn), result_sorter=CommsContainmentJsonSorter
        )
        urn = self._get_route_urn_at([0.1367362, 52.2255922])  # ug_route 335
        self._test_get_request(
            "/modules/comms/route/{}/contents?include_proposed=true".format(urn),
            result_sorter=CommsContainmentJsonSorter,
        )

    def test_route_update(self):
        """
        Exercise update of route feature substructure
        """

        self.login()

        self._test_feature_put_request(
            "NULL UPDATE",
            "ug_route/318",
            [[0.1365170627832413, 52.22541342951382], [0.1364546682522194, 52.22544555637065]],
        )  # Same coords as before update

        self._test_feature_put_request(
            "MOVE ROUTE",
            "ug_route/8",  # Has conduits, cables and circuits
            [
                [0.1365757361054, 52.2241189283759],
                [0.1365, 52.224118],
                [0.136455707252, 52.2241862934783],
            ],
        )

        self._test_feature_put_request(
            "MOVE ROUTE IN DELTA",
            "ug_route/2",  # Has conduits, cables and reversed circuits
            [
                [0.1365757361054, 52.2241189283759],
                [0.1366, 52.22413],
                [0.1366508379579, 52.2241567185678],
            ],
            delta="design/NB217",
        )

        urn = self._get_route_urn_at([0.1368381, 52.2257534])  # ug_route 352
        self._test_feature_put_request(
            "MODIFY ROUTE PATH",
            urn,  # Has BF conduits (forward and reverse) and cables
            [
                [0.1369107211955, 52.2257156788577],
                [0.13686220, 52.2257508],
                [0.1367960125208, 52.2257781750423],
            ],
            delta="design/NB217",
        )

        self._test_feature_put_request(
            "CONNECT CABLE END TO NEW STRUCTURE",
            "ug_route/58",
            [[0.1354820653796, 52.224957288012], [0.1345939189196, 52.2249287405042]],
            delta="design/NB217",
        )

        # Expected to fail as cable has connections

        urn = self._get_route_urn_at([0.1365847, 52.2240715])  # ug_route 273
        self._test_feature_put_request(
            "DISCONNECT CABLE CONNECTIONS",
            urn,  # Has cable
            [[0.1365579664707, 52.2240476609155], [0.1364935934544, 52.224057930009]],
            delta="design/NB217",
        )

        # Expected to fail as last point will be moved off structure
        self._test_feature_put_request(
            "DISCONNECT CABLE FROM STRUCTURE",
            "ug_route/59",
            [[0.1353989169002, 52.2249192931235], [0.13464538380507593, 52.2249324373048]],
            delta="design/NB217",
        )

        self._test_feature_put_request(
            "DISCONNECT CABLE FROM STRUCTURE",
            "ug_route/46",  # Only has cable connection
            [[0.1379653233735, 52.2233384715684], [0.134842, 52.2213888]],
            delta="design/NB217",
        )

        # Expected to fail as first point will be moved off structure
        self._test_feature_put_request(
            "MOVE FIRST POINT OFF STRUCTURE",
            "ug_route/8",
            [[0.13572575232452225, 52.225660862990395], [0.1359339, 52.2255569]],
            delta="design/NB217",
        )

    def test_route_delete(self):
        """
        Exercise route delete trigger
        """

        self.login()
        delta = "design/NB217"
        self._test_delete_request(
            "/modules/comms/feature/ug_route/3" + self.param_string(delta=delta)
        )  # Will fail as conduit has cable
        self.show_database_changes("DELETE FAIL: CONDUIT HAS CABLE")
        self.show_validation_errors("DELETE FAIL: CONDUIT HAS CABLE", delta)

        self._test_delete_request(
            "/modules/comms/feature/manhole/97" + self.param_string(delta=delta)
        )  # To create route junction at end of route
        self._test_delete_request(
            "/modules/comms/feature/ug_route/134" + self.param_string(delta=delta)
        )  # Check route junction deleted
        self.show_database_changes("DELETE ROUTE JUNCTION")
        self.show_validation_errors("DELETE ROUTE JUNCTION", delta)

        self._test_delete_request(
            "/modules/comms/feature/ug_route/322" + self.param_string(delta=delta)
        )  # Will succeed
        self.show_database_changes("DELETE SUCCESS")
        self.show_validation_errors("DELETE SUCCESS", delta)

        self._test_delete_request(
            "/modules/comms/feature/ug_route/130" + self.param_string(delta=delta)
        )  # Nested conduits should all be delteed
        self.show_database_changes("DELETE SUCCESS")
        self.show_validation_errors("DELETE SUCCESS", delta)

    def test_route_split(self):
        """
        Exercise splitting of route on insert
        """

        self.login()
        delta = "design/NB046"

        # Insert route to attempt to split
        self.subtest("DONT SPLIT")
        result = self._test_feature_post_request(
            "INSERT FEATURE TO SPLIT",
            "ug_route",
            {
                "properties": {},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [0.1357392221689, 52.225674666480586],
                        [0.1367960125208, 52.22577817504228],
                    ],
                    "world_name": "geo",
                },
            },
            "design/NB046",
        )

        route_id = result.get("id")
        self._test_post_request(
            "/modules/comms/route/ug_route/{}/split".format(route_id)
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("DONT SPLIT")
        self.show_validation_errors("DONT SPLIT", delta)

        # Route to be split into two
        self.subtest("SPLIT ONCE")
        result = self._test_feature_post_request(
            "INSERT FEATURE TO SPLIT",
            "ug_route",
            {
                "properties": {},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [0.1357392221689, 52.225674666480586],
                        [0.1362562179565, 52.2255937489052],
                        [0.1367960125208, 52.22577817504228],
                    ],
                    "world_name": "geo",
                },
            },
            "design/NB046",
        )

        route_id = result.get("id")
        self._test_post_request(
            "/modules/comms/route/ug_route/{}/split".format(route_id)
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("SPLIT ONCE")
        self.show_validation_errors("SPLIT ONCE", delta)

        # Route to be split into five
        self.subtest("SPLIT FIVE TIMES")

        result = self._test_feature_post_request(
            "INSERT FEATURE TO SPLIT",
            "ug_route",
            {
                "properties": {"bundle_size": 1},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [0.1417909562588, 52.223820097192515],
                        [0.1419773697853, 52.22383488476231],
                        [0.1419988274574, 52.223810238809904],
                        [0.1421128213406, 52.22376074148099],
                        [0.1423890888691, 52.224034516472216],
                        [0.1426237036337231, 52.22404052547691],
                        [0.14269209996360285, 52.223957551100426],
                    ],
                    "world_name": "geo",
                },
            },
            "design/NB046",
        )

        route_id = result.get("id")
        self._test_post_request(
            "/modules/comms/route/ug_route/{}/split".format(route_id)
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("SPLIT FIVE TIMES")
        self.show_validation_errors("SPLIT FIVE TIMES", delta)

    # ------------------------------------------------------------------------------
    #                                 CONDUITS
    # ------------------------------------------------------------------------------

    def test_conduit_update(self):
        """
        Insert equipment on conduit then move equipment on conduit
        """

        delta = "design/NB046"
        self.login()

        self.subtest("SPLIT")

        # Split UG route 376 (has multiple tubes, cables, tubes going different directions)
        self._test_json_post_request(
            "/modules/comms/feature/manhole" + self.param_string(delta=delta),
            data={
                "type": "Feature",
                "properties": {
                    "myw_orientation_location": 0,
                    "specification": "",
                    "size_x": null,
                    "size_y": null,
                    "size_z": null,
                    "lockable": null,
                    "powered": null,
                    "installation_date": "",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [0.1368060708046, 52.2256463248086],
                    "world_name": "geo",
                },
            },
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("SPLIT")
        self.show_validation_errors("SPLIT", delta)

        # Drag route junction at end of tubes, segments just split
        self.subtest("MOVE")

        self._test_feature_put_request(
            "MOVE ROUTE JUNCTION",
            "mywcom_route_junction/53",  # Has blown fiber tubes, bf bundles, cables
            [0.1365794, 52.2256250],
            delta=delta,
        )

        self.show_database_changes("MOVE")
        self.show_validation_errors("MOVE", delta)

    def test_conduit_delete(self):
        """
        Test feature delete. Delete a conduit with cables inside (should fail to be deleted). Then delete a conduit without cables
        """

        delta = "design/NB046"
        self.login()

        self.subtest("DELETE FAIL")

        self._test_delete_request(
            "/modules/comms/feature/blown_fiber_tube/44" + self.param_string(delta=delta)
        )

        self.show_database_changes("DELETE FAIL")
        self.show_validation_errors("DELETE FAIL", delta)

        self.subtest("DELETE SUCCESS")
        self._test_delete_request(
            "/modules/comms/feature/blown_fiber_tube/105" + self.param_string(delta=delta)
        )

        self.show_database_changes("DELETE SUCCESS")
        self.show_validation_errors("DELETE SUCCESS", delta)

    def test_conduit_path(self):
        """
        Exercise conduit path service
        """
        delta = "design/NB046"
        self.login()

        self.subtest("FIND PATH")
        self._test_post_request(
            "/modules/comms/conduit/path" + self.param_string(delta=delta),
            data={
                "structures": self.structUrnsStr(delta, "WH-M-35", "WH-M-24", "WH-M-36"),
                "feature_type": "conduit",
            },
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("FIND PATH")
        self.show_validation_errors("FIND PATH", delta)

        self.show_database_changes("ROUTE SINGLE PATH")
        self.show_validation_errors("ROUTE SINGLE PATH", delta)

        self.subtest("BLOWN FIBER FIND PATH")
        self._test_post_request(
            "/modules/comms/conduit/path" + self.param_string(delta=delta),
            data={
                "structures": self.structUrnsStr(delta, "WH-M-35", "WH-M-24", "WH-M-36"),
                "feature_type": "blown_fiber_tube",
            },
            show_response=True,
            response_format="json",
        )

        # Confirm no database changes
        self.show_database_changes("BLOWN FIBER FIND PATH")
        self.show_validation_errors("BLOWN FIBER FIND PATH", delta)

    def test_conduit_routing(self):
        """
        Exercise conduit route service
        """

        delta = "design/NB046"
        self.login()

        # Route single path of conduits
        self.subtest("ROUTE SINGLE PATH")
        self._test_post_request(
            "/modules/comms/conduit/conduit/route" + self.param_string(delta=delta, num_paths=1),
            data={
                "structures": self.structUrnsStr(delta, "WH-M-35", "WH-M-24", "WH-M-36"),
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {"bundle_size": 1},
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.136455707252, 52.2241862934783],
                                [0.1374568417668, 52.2247063157682],
                                [0.1380164176226, 52.2250326615595],
                            ],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("ROUTE SINGLE PATH")
        self.show_validation_errors("ROUTE SINGLE PATH", delta)

        # Route multiple paths of conduits
        self.subtest("ROUTE MULTIPLE PATHS")
        self._test_post_request(
            "/modules/comms/conduit/conduit/route" + self.param_string(delta=delta, num_paths=6),
            data={
                "structures": self.structUrnsStr(delta, "WH-M-35", "WH-M-24", "WH-M-36"),
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {"bundle_size": 6},
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.136455707252, 52.2241862934783],
                                [0.1374568417668, 52.2247063157682],
                                [0.1380164176226, 52.2250326615595],
                            ],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("ROUTE MULTIPLE PATHS")
        self.show_validation_errors("ROUTE MULTIPLE PATHS", delta)

        # Route single tube
        self.subtest("ROUTE SINGLE TUBE")
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/route"
            + self.param_string(delta=delta, num_paths=1),
            data={
                "structures": self.structUrnsStr(delta, "WH-M-35", "WH-M-24", "WH-M-36"),
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {"bundle_size": 1},
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.136455707252, 52.2241862934783],
                                [0.1374568417668, 52.2247063157682],
                                [0.1380164176226, 52.2250326615595],
                            ],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("ROUTE SINGLE TUBE")
        self.show_validation_errors("ROUTE SINGLE TUBE", delta)

        # Route multiple tubes
        self.subtest("ROUTE MULTIPLE TUBES")
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/route"
            + self.param_string(delta=delta, num_paths=12),
            data={
                "structures": self.structUrnsStr(delta, "WH-M-35", "WH-M-24", "WH-M-36"),
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {"bundle_size": 12},
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.136455707252, 52.2241862934783],
                                [0.1374568417668, 52.2247063157682],
                                [0.1380164176226, 52.2250326615595],
                            ],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("ROUTE MULTIPLE TUBES")
        self.show_validation_errors("ROUTE MULTIPLE TUBES", delta)

        # Route a single tube from a customer wallbox to manhole
        self.subtest("ROUTE WALLBOX TUBE")
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/route"
            + self.param_string(delta=delta, num_paths=1),
            data={
                "structures": self.structUrnsStr(delta, "WH-0150", "WH-M-24"),
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {"bundle_size": 1, "name": "WB BF"},
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.137292891740799, 52.224682697194275],
                                [0.1374568417668, 52.2247063157682],
                            ],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("ROUTE WALLBOX TUBE")
        self.show_validation_errors("ROUTE WALLBOX TUBE", delta)

    def test_conduit_move_to(self):
        """
        Exercize conduit move_to service
        """

        delta = "design/NB046"
        self.login()

        # Move a conduit into another
        self.subtest("MOVE TO HOUSING")
        self._test_post_request(
            "/modules/comms/conduit/conduit/79/move_to/conduit/80" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("MOVE TO HOUSING")
        self.show_validation_errors("MOVE TO HOUSING", delta)

        # Move a conduit into another
        self.subtest("CABLE INTO TUBE NOT IN CONDUIT")
        self._test_post_request(
            "/modules/comms/conduit/mywcom_fiber_segment/395/move_to/blown_fiber_tube/100"
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CABLE INTO TUBE NOT IN CONDUIT")
        self.show_validation_errors("CABLE INTO TUBE NOT IN CONDUIT", delta)

        # Move a cable into an unsuitable conduit
        self.subtest("CABLE INTO CONTINUOUS CONDUIT")
        self._test_post_request(
            "/modules/comms/conduit/mywcom_fiber_segment/417/move_to/blown_fiber_tube/149"
            + self.param_string(delta=delta),  # WH-BF-145:7 in ug_route 341
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CABLE INTO CONTINUOUS CONDUIT")
        self.show_validation_errors("CABLE INTO CONTINUOUS CONDUIT", delta)

        # Will fail (moving a cable into a proposed conduit is not supported)
        self.subtest("CABLE INTO PROPOSED CONDUIT")
        self._test_post_request(
            "/modules/comms/conduit/fiber_cable/12/move_to/blown_fiber_tube/5204",
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CABLE INTO PROPOSED CONDUIT")

        # Move a cable with slack into conduit (will fail)
        self.subtest("CABLE WITH SLACK INTO TUBE")
        self._test_post_request(
            "/modules/comms/conduit/mywcom_fiber_segment/79/move_to/blown_fiber_tube/100"
            + self.param_string(delta=delta),  # WH-BF-97:1 in ug route 328
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CABLE WITH SLACK INTO TUBE")
        self.show_validation_errors("CABLE WITH SLACK INTO TUBE", delta)

        # Move cable into conduit (without problems)
        self.subtest("CABLE INTO TUBE SUCCESS")
        self._test_post_request(
            "/modules/comms/conduit/mywcom_fiber_segment/98/move_to/blown_fiber_tube/45"
            + self.param_string(delta=delta),  # WH-BF-105:2 in ug route 329
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CABLE INTO TUBE SUCCESS")
        self.show_validation_errors("CABLE INTO TUBE SUCCESS", delta)

        # Move conduit out of bundle (to test updating of other conduits within run)
        self.subtest("CONDUIT OUT OF BUNDLE")
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/186/move_to/ug_route/365"
            + self.param_string(delta=delta),  # WH-BF-185:3 in ug route 365
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CONDUIT OUT OF BUNDLE")
        self.show_validation_errors("CONDUIT OUT OF BUNDLE", delta)

        self.subtest("CONDUIT INTO BUNDLE")
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/184/move_to/blown_fiber_bundle/50000"
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CONDUIT INTO BUNDLE")
        self.show_validation_errors("CONDUIT INTO BUNDLE", delta)

        self.subtest("BACKFEED CABLE INTO CONDUIT")  # To test case 21012
        self._test_post_request(
            "/modules/comms/conduit/mywcom_fiber_segment/85/move_to/blown_fiber_tube/78"
            + self.param_string(
                delta=delta
            ),  # BF tube 77:2 in ug_route 79 (between wh-m-39 and rj 54)
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("BACKFEED CABLE INTO CONDUIT")
        self.show_validation_errors("BACKFEED CABLE INTO CONDUIT", delta)

        self.subtest("BACKFEED CABLE INTO CONDUIT REVERSED GEOM")
        self._test_post_request(
            "/modules/comms/conduit/mywcom_fiber_segment/83/move_to/blown_fiber_tube/73"
            + self.param_string(
                delta=delta
            ),  # BF tube 77:2 in ug_route 79 (between wh-m-39 and rj 54)
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("BACKFEED CABLE INTO CONDUIT REVERSED GEOM")
        self.show_validation_errors("BACKFEED CABLE INTO CONDUIT REVERSED GEOM", delta)

        self.subtest("CONTINUOUS CONDUIT INTO CONDUIT")
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/195/move_to/conduit/70"
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CONTINUOUS CONDUIT INTO CONDUIT")
        self.show_validation_errors("CONTINUOUS CONDUIT INTO CONDUIT", delta)

        self.subtest("CABLE OUT OF CONTINUOUS CONDUIT")
        self._test_post_request(
            "/modules/comms/conduit/mywcom_fiber_segment/435/move_to/ug_route/353"
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("CABLE OUT OF CONTINUOUS CONDUIT")
        self.show_validation_errors("CABLE OUT OF CONTINUOUS CONDUIT", delta)

    def test_conduit_chain(self):
        """
        Exercise conduit chain service
        """

        delta = "design/NB046"
        self.login()

        # Show the path for one tube
        self.subtest("SHOW TUBE PATH")
        self._test_get_request(
            "/modules/comms/conduit/blown_fiber_tube/100/chain" + self.param_string(delta=delta)
        )

        # Show the path for all tubes in bundle
        self.subtest("SHOW BUNDLE PATH")
        self._test_get_request(
            "/modules/comms/conduit/blown_fiber_bundle/17/chain" + self.param_string(delta=delta)
        )

    def test_conduit_connect(self):
        """
        Exercise conduit connect service
        """

        delta = "design/NB046"
        self.login()

        self.subtest("CONNECT TUBES")
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/35/connect/blown_fiber_tube/28/at/manhole/253"
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CONNECT TUBES")
        self.show_validation_errors("CONNECT TUBES", delta)

    def test_conduit_disconnect_at(self):
        """
        Exercise conduit disconnect service
        """

        delta = "design/NB046"
        self.login()

        self.subtest("CUT TUBE")

        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/114/disconnect_at/manhole/253"
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CUT TUBE")
        self.show_validation_errors("CUT TUBE", delta)

        # Disconnect conduit containing cable (WH-BF-105:2 == WH-BF-164 in drop point 002)
        self._test_post_request(
            "/modules/comms/conduit/blown_fiber_tube/107/disconnect_at/drop_point/2"
            + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("CUT TUBE CONTAINING CABLE")
        self.show_validation_errors("CUT TUBE CONTAINING CABLE", delta)

    def test_copper_network(self):
        """
        Exercise copper network actions
        """

        self.login()

        delta = "design/NB217"

        resp = self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "insert",
                    "copper_cable",
                    {
                        "type": "Feature",
                        "properties": {
                            "type": "",
                            "specification": "100-19-ASPICF",
                            "copper_count": 100,
                            "diameter": 6,
                            "gauge": 19,
                            "directed": "true",
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.1366049051285, 52.2240164428564],
                                [0.1390426978469, 52.2238950619052],
                            ],
                            "world_type": "geo",
                        },
                    },
                ]
            ],
        )
        cable_id = resp["ids"][0]

        self._test_post_request(
            f"/modules/comms/cable/copper_cable/{cable_id}/route?delta=design/NB217",
            data={"structures": self.structUrnsStr("Woodhead Hub", "WH-M-252")},
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("COPPER CABLE INSERT TRANSACTION")

        # TODO
        # Insert equipment at Hub
        # Connect to cable
        # Do a trace

    # ------------------------------------------------------------------------------
    #                                 EQUIPMENT
    # ------------------------------------------------------------------------------

    def test_equipment_cables(self):
        """
        Exercise equipment-related calls
        """

        self.login()

        self._test_get_request(
            "/modules/comms/equip/fiber_patch_panel/1/cables",
            result_sorter=CommsStructCablesJsonSorter,
        )
        self._test_get_request(
            "/modules/comms/equip/fiber_patch_panel/2/cables",
            result_sorter=CommsStructCablesJsonSorter,
        )

    def test_equipment_delete(self):
        """
        Exercise equipment delete trigger
        """

        self.login()

        delta = "design/NB217"


        self._test_feature_delete_request("DELETE SLOT WITH OLTS", "slot/16", delta=delta)

        self._test_feature_delete_request(
            "DELETE SPLICE CLOSURE WITH CABLE SEGMENTS", "splice_closure/1", delta=delta
        )

        self._test_feature_delete_request(
            "ATTEMPT DELETE PATCH PANEL WITH CIRCUITS", "fiber_patch_panel/1", delta=delta
        )

        self._test_feature_delete_request(
            "ATTEMPT DELETE SHELF WITH CHILDREN WITH CIRCUITS", "fiber_shelf/9", delta=delta
        )

        self._test_feature_delete_request(
            "ATTEMPT DELETE SPLICE CLOSURE WITH CIRCUITS", "splice_closure/35", delta=delta
        )

        self._test_feature_delete_request(
            "DELETE SHELF WITH LOC", "copper_shelf/1", delta=delta
        )
        
        self._test_feature_delete_request(
            "DELETE LOAD COIL WITH LOC", "copper_load_coil/2", delta=delta
        )

    def test_equipment_assemblies(self):
        """
        Exercise assembly services
        """

        delta = "design/NB046"

        self.login()

        # Move assembly containing equipment and connections
        self.subtest("MOVE")

        self._test_post_request(
            "/modules/comms/equip/rack/4/move_to/manhole/42" + self.param_string(delta=delta),
            response_format="text",
        )

        self.show_database_changes("MOVE")
        self.show_validation_errors("MOVE", delta)

        # Copy splice closure with multiplexer child
        self.subtest("COPY")

        self._test_post_request(
            "/modules/comms/equip/splice_closure/1/copy_to/manhole/33"
            + self.param_string(delta=delta),
            response_format="json",
            show_response=True,
        )

        self.show_database_changes("COPY")
        self.show_validation_errors("COPY", delta)

        # Attempt move assembly with circiuts
        self.subtest("ATTEMPT MOVE")

        self._test_post_request(
            "/modules/comms/equip/fiber_olt/25/move_to/fiber_shelf/15"
            + self.param_string(delta=delta),
            response_format="text",
        )

        self.show_database_changes("ATTEMPT MOVE")
        self.show_validation_errors("ATTEMPT MOVE", delta)

    # ------------------------------------------------------------------------------
    #                                   SLACK
    # ------------------------------------------------------------------------------

    def test_slack_add(self):
        """
        Exercise cable slack add
        """

        self.login()

        delta = "design/NB217"

        # Has connections and circuits
        self._test_post_request(
            "/modules/comms/slack/mywcom_fiber_slack/add" + self.param_string(delta=delta),
            data={
                "seg_urn": "mywcom_fiber_segment/63",
                "side": "in",
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {
                            "housing": "manhole/24",
                            "cable": "fiber_cable/6",
                            "root_housing": "manhole/24",
                            "myw_orientation_location": 0,
                            "length": 7.010400000000001,
                            "storage": "coil",
                            "job_id": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1374568417668, 52.2247063157682],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )

        coords = [0.1374568417668, 52.2247063157682]
        self.show_database_changes("AFTER ADD SLACK ON IN SIDE OF STRUCT, BEFORE CONNECTIONS")
        self.show_validation_errors(
            "AFTER ADD SLACK ON IN SIDE OF STRUCT, BEFORE CONNECTIONS",
            delta,
            self.bounds(coords, 0.0001),
        )

        # After connections
        self._test_post_request(
            "/modules/comms/slack/mywcom_fiber_slack/add" + self.param_string(delta=delta),
            data={
                "side": "out",
                "seg_urn": "mywcom_fiber_segment/64",
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {
                            "housing": "manhole/24",
                            "cable": "fiber_cable/6",
                            "root_housing": "manhole/24",
                            "myw_orientation_location": 0,
                            "length": 7.010400000000001,
                            "storage": "coil",
                            "job_id": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1374568417668, 52.2247063157682],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )
        coords = [0.1374568417668, 52.2247063157682]
        self.show_database_changes("AFTER ADD SLACK ON OUT SIDE OF STRUCT, AFTER CONNECTIONS")
        self.show_validation_errors(
            "AFTER ADD SLACK ON OUT SIDE OF STRUCT, AFTER CONNECTIONS",
            delta,
            self.bounds(coords, 0.0001),
        )

        # At start
        self._test_post_request(
            "/modules/comms/slack/mywcom_fiber_slack/add" + self.param_string(delta=delta),
            data={
                "side": "out",
                "seg_urn": "mywcom_fiber_segment/336",
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {
                            "housing": "manhole/43",
                            "cable": "fiber_cable/166",
                            "root_housing": "manhole/43",
                            "myw_orientation_location": 0,
                            "length": 7.010400000000001,
                            "storage": "coil",
                            "job_id": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1349852058691, 52.2213763836428],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )
        coords = [0.1349852058691, 52.2213763836428]
        self.show_database_changes("AFTER ADD SLACK AT START")
        self.show_validation_errors("AFTER ADD SLACK AT START", delta, self.bounds(coords, 0.0001))

        # At passthrough
        self._test_post_request(
            "/modules/comms/slack/mywcom_fiber_slack/add" + self.param_string(delta=delta),
            data={
                "side": "out",
                "seg_urn": "mywcom_fiber_segment/42",
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {
                            "housing": "manhole/1",
                            "cable": "fiber_cable/3",
                            "root_housing": "manhole/1",
                            "myw_orientation_location": 0,
                            "length": 7.010400000000001,
                            "storage": "coil",
                            "job_id": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1353556662798, 52.2235609031561],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )
        coords = [0.1353556662798, 52.2235609031561]
        self.show_database_changes("AFTER ADD SLACK AT PASSTHROUGH")
        self.show_validation_errors(
            "AFTER ADD SLACK AT PASSTHROUGH", delta, self.bounds(coords, 0.0001)
        )

        # At end
        self._test_post_request(
            "/modules/comms/slack/mywcom_fiber_slack/add" + self.param_string(delta=delta),
            data={
                "side": "in",
                "seg_urn": "mywcom_fiber_segment/73",
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {
                            "housing": "manhole/29",
                            "cable": "fiber_cable/7",
                            "root_housing": "manhole/29",
                            "myw_orientation_location": 0,
                            "length": 7.010400000000001,
                            "storage": "coil",
                            "job_id": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1379653233735, 52.2233384715684],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )
        coords = [0.1379653233735, 52.2233384715684]
        self.show_database_changes("AFTER ADD SLACK AT END")
        self.show_validation_errors("AFTER ADD SLACK AT END", delta, self.bounds(coords, 0.0001))

        # Internal in segment, connections after
        self._test_post_request(
            "/modules/comms/slack/mywcom_fiber_slack/add" + self.param_string(delta=delta),
            data={
                "side": "in",
                "seg_urn": "mywcom_fiber_segment/562",
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {
                            "housing": "mdu/2",
                            "cable": "fiber_cable/204",  # WH-INT-06
                            "root_housing": "mdu/2",  # Alice Bell
                            "myw_orientation_location": 0,
                            "length": 50,
                            "storage": "coil",
                            "job_id": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1373773813247681, 52.22541219726033],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )
        coords = [0.1373773813247681, 52.22541219726033]
        self.show_database_changes("AFTER ADD SLACK ON IN SIDE OF INTERNAL SEG")
        self.show_validation_errors(
            "AFTER ADD SLACK ON IN SIDE INTERNAL SEG", delta, self.bounds(coords, 0.0001)
        )

        # Internal out segment, connections after
        self._test_post_request(
            "/modules/comms/slack/mywcom_fiber_slack/add" + self.param_string(delta=delta),
            data={
                "side": "out",
                "seg_urn": "mywcom_fiber_segment/563",
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {
                            "housing": "mdu/2",
                            "cable": "fiber_cable/205",  # WH-INT-07
                            "root_housing": "mdu/2",  # Alice Bell
                            "myw_orientation_location": 0,
                            "length": 50,
                            "storage": "coil",
                            "job_id": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1373773813247681, 52.22541219726033],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=True,
            response_format="json",
        )
        coords = [0.1373773813247681, 52.22541219726033]
        self.show_database_changes("AFTER ADD SLACK ON OUT SIDE INTERNAL SEG")
        self.show_validation_errors(
            "AFTER ADD SLACK ON OUT SIDE INTERNAL SEG", delta, self.bounds(coords, 0.0001)
        )

    def test_slack_delete(self):
        """
        Exercise cable slack deletion
        """

        self.login()

        self._test_feature_delete_request(
            "DELETE SLACK", "mywcom_fiber_slack/5", delta="design/NB046"
        )
        self._test_feature_delete_request(
            "DELETE SLACK WITH CIRCUITS", "mywcom_fiber_slack/9", delta="design/NB046"
        )  # In WH-M-252
        self._test_feature_delete_request(
            "DELETE SLACK WITH UPSTREAM CONNECTION", "mywcom_fiber_slack/12", delta="design/NB046"
        )  # WH-M-26
        self._test_feature_delete_request(
            "DELETE SLACK WITH DOWNSTREAM CONNECTION", "mywcom_fiber_slack/7", delta="design/NB046"
        )  # WH-M-28 cable 17

    def test_slack_update(self):

        self.login()

        delta = "design/NB217"

        self.subtest("SPLIT SLACK")
        length = 15
        url = "/modules/comms/slack/mywcom_fiber_slack/split/1?length={}&delta={}".format(
            length, delta
        )
        self._test_post_request(url, show_response=True, response_format="json")
        self.show_database_changes("AFTER SPLIT SLACK")

    # ------------------------------------------------------------------------------
    #                                 CABLES
    # ------------------------------------------------------------------------------

    def test_cable_insert(self):
        """
        Exercise insert of different cable technologies
        """

        self.login()

        delta = "NB217"

        self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "insert",
                    "fiber_cable",
                    {
                        "type": "Feature",  # Split UG route 372 and run to new wall box location
                        "properties": {
                            "type": "Internal",
                            "specification": "D-096-LA-8W-F12NS",
                            "fiber_count": 96,
                            "diameter": 6,
                            "directed": "true",
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.1366049051285, 52.2240164428564],
                                [0.1366049051285, 52.2240164428564],
                            ],
                            "world_type": "geo",
                        },
                    },
                ]
            ],
        )
        self.show_database_changes("FIBER CABLE INSERT TRANSACTION")

        self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "insert",
                    "copper_cable",
                    {
                        "type": "Feature",  # Split UG route 372 and run to new wall box location
                        "properties": {
                            "type": "Internal",
                            "specification": "D-096-LA-8W-F12NS",
                            "copper_count": 96,
                            "diameter": 6,
                            "directed": "true",
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.1366049051285, 52.2240164428564],
                                [0.1366049051285, 52.2240164428564],
                            ],
                            "world_type": "geo",
                        },
                    },
                ]
            ],
        )
        self.show_database_changes("COPPER CABLE INSERT TRANSACTION")

    def test_cable_path(self):
        """
        Exercise cable path service on cable controller
        """
        self.login()

        self.subtest("FIND PATH")
        self._test_post_request(
            "/modules/comms/cable/path",
            data={"structures": self.structUrnsStr("", "WH-M-27", "WH-M-35", "WH-M-12", "WH-C-07")},
            show_response=True,
            response_format="json",
        )

        self.subtest("FIND PATH (DELTA)")
        self._test_post_request(
            "/modules/comms/cable/path?delta=design/NB120",
            data={"structures": self.structUrnsStr("design/NB120", "WH-M-D20:1", "WH-M-D20:2")},
            show_response=True,
            response_format="json",
        )

    def test_cable_routing(self):
        """
        Exercise cable routing
        """
        self.login()

        self.subtest("ROUTE DROP CABLE")
        self._test_post_request(
            "/modules/comms/cable/fiber_cable/3/route?delta=design/NB217",
            data={"structures": self.structUrnsStr("", "WH-0002", "WH-P-006")},
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER ROUTE CABLE")
        self.show_validation_errors("AFTER ROUTE CABLE", "design/NB217")

        self.subtest("ROUTE UNDERGROUND CABLE WITH VIA POINTS")
        self._test_post_request(
            "/modules/comms/cable/fiber_cable/3/route?delta=design/NB217",
            data={"structures": self.structUrnsStr("", "WH-M-27", "WH-M-35", "WH-M-12", "WH-C-07")},
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER ROUTE CABLE")
        self.show_validation_errors("AFTER ROUTE CABLE", "design/NB217")

    def test_cable_rerouting(self):
        """
        Exercise cable controller update service
        """

        self.login()

        self._test_cable_rerouting(
            "NULL UPDATE", "fiber_cable/2", ["WH-M-12", "WH-M-03", "WH-C-04", "WH-M-22"]
        )

        self._test_cable_rerouting(
            "RE-ROUTE DRY RUN",
            "fiber_cable/5",
            ["WH-C-01", "WH-M-02", "WH-M-28", "WH-M-29"],
            dry_run=True,
        )

        self._test_cable_rerouting(
            "RE-ROUTE", "fiber_cable/5", ["WH-C-01", "WH-M-02", "WH-M-28", "WH-M-29"]
        )

        self._test_cable_rerouting(
            "EXTEND", "fiber_cable/17", ["WH-M-60", "WH-M-61", "WH-M-81", "WH-M-246"]
        )

        self._test_cable_rerouting(
            "SHRINK END", "fiber_cable/23", ["Woodhead Hub", "mywcom_route_junction/37"]
        )

        self._test_cable_rerouting(
            "SHRINK START", "fiber_cable/24", ["mywcom_route_junction/37", "WH-C-01"]
        )

        self._test_cable_rerouting(
            "REVERSE", "fiber_cable/183", ["WH-M-249", "WH-M-90", "WH-M-89", "WH-M-87", "WH-M-91"]
        )

        self._test_feature_put_request(
            "UPDATE VIA TRIGGERS",
            "fiber_cable/183",
            [
                [0.1438370086014, 52.2265861085789],
                [0.1431488245726, 52.2274408509326],
                [0.141064748168, 52.2280733743244],
            ],
            delta="design/NB217",
        )

    def _test_cable_rerouting(self, test_name, cable_urn, structs, **url_opts):
        """
        Exercise re-routing an existing cable to STRUCTS (a list of structure names)
        """

        delta = "design/NB217"

        self.subtest(test_name)

        # Build URL
        url = "/modules/comms/cable/{}/reroute?delta={}".format(cable_urn, delta)

        for key, val in url_opts.items():
            url += "&{}={}".format(key, val)

        # Test request
        self._test_post_request(
            url,
            data={"structures": self.structUrnsStr(delta, *structs)},
            show_response=True,
            response_format="json",
            result_sorter=CommsCableReouteJsonSorter,
        )

        # Show database changes
        self.show_database_changes("AFTER " + test_name)
        self.show_validation_errors("AFTER " + test_name, "design/NB217")

    def test_cable_delete(self):
        """
        Exercise cable delete trigger
        """

        self.login()

        delta = "design/NB217"

        self._test_feature_delete_request("DELETE CABLE", "fiber_cable/8", delta=delta)
        self._test_feature_delete_request("DELETE CABLE WITH SLACK", "fiber_cable/3", delta=delta)
        self._test_feature_delete_request(
            "DELETE CABLE WITH CONNECTIONS", "fiber_cable/183", delta=delta
        )
        self._test_feature_delete_request(
            "ATTEMPT DELETE CABLE WITH CIRCUITS", "fiber_cable/6", delta=delta
        )

    def test_cable_split(self):
        """
        Exercise cut cable
        """

        self.login()
        delta = "design/NB217"

        self._test_cable_split(
            "SPLIT AND CONNECT CABLE IN WH-M-24",
            "fiber_cable/6",
            True,
            63,
            delta,
            "splice_closure/35",
        )

        self._test_cable_split(
            "SPLIT CABLE BACKWARDS IN WH-M-39", "fiber_cable/9", False, 85, delta, None
        )

    def test_cable_offset(self):

        self.login()

        delta = "NB217"

        self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "insert",
                    "coax_cable",
                    {
                        "type": "Feature",
                        "properties": {
                            "coax_count": 1,
                            "directed": "true",
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.1343874776141138, 52.22084239570779], # WH-M-266
                                [0.1362642655618129, 52.220555602979175] # WH-M-267
                            ],
                            "world_name": "geo",
                        },
                    },
                ]
            ],
        )
        self.show_database_changes("COAX CABLE INSERT WITH OFFSET")

    def test_cable_offset_update(self):

        self.login()

        delta = "NB217"

        self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "update",
                    "coax_cable",
                    {
                        "type": "Feature",
                        "properties": {"id": 5, "directed": "true"},
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.1365757361054, 52.2241189283759],
                                [0.1340685622237, 52.2235518662528],
                            ],
                            "world_name": "geo",
                        },
                    },
                ]
            ],
        )
        self.show_database_changes("COAX CABLE UPDATE WITH OFFSET")

    def test_cable_short_offset(self):

        self.login()

        delta = "NB217"

        self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "insert",
                    "coax_cable",
                    {
                        "type": "Feature",  # Split UG route 372 and run to new wall box location
                        "properties": {
                            "coax_count": 1,
                            "directed": "true",
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.1353345438838, 52.2234612917333],
                                [0.1342975348234, 52.2228256218243],
                            ],
                            "world_type": "geo",
                        },
                    },
                ]
            ],
        )
        self.show_database_changes("COAX CABLE INSERT WITH OFFSET - SHORT LENGT SEGMENT")

    def _test_cable_split(
        self, test_name, cable, forward, seg_id, delta, splice_housing, show_response=True
    ):

        self.subtest(test_name)

        # Build URL
        url = f"/modules/comms/cable/{cable}/split/{seg_id}/{forward}?delta={delta}"

        if splice_housing:
            data = {"splice_housing": splice_housing}
        else:
            data = {}

        # Test request
        self._test_post_request(
            url,
            data=data,
            show_response=show_response,
            response_format="json",
        )

        # Show database changes
        self.show_database_changes("AFTER " + test_name)
        self.show_validation_errors("AFTER " + test_name, delta)

    # ------------------------------------------------------------------------------
    #                                 FIBER
    # ------------------------------------------------------------------------------

    def test_fiber_network(self):
        """
        Exercise fiber connection points for trace dialog, connection menu and calculated fields
        """

        self.login()

        self.subtest("NETWORKS")
        self._test_get_request("/feature/fiber_splitter/1/networks")
        self._test_get_request("/feature/pole/6/networks")

        self.subtest("PINS")
        self._test_get_request("/modules/comms/fiber/connections/fiber_splitter/1/in")
        self._test_get_request("/modules/comms/fiber/connections/fiber_splitter/1/out")

        self.subtest("CABLES")
        self._test_get_request("/modules/comms/cable/fiber_cable/166/highest_connected")

        self.subtest("CABLE CALC FIELDS")
        self._test_get_request("/modules/comms/cable/fiber_cable/166/connections?sort=true")
        self._test_get_request(
            "/modules/comms/cable/fiber_cable/166/connections?sort=true&splice=true"
        )

    def test_fiber_trace(self):
        """
        Exercise fiber trace consolidation
        """

        self.login()

        self.subtest("TRACE OUT")
        self._test_get_request(
            "/network/mywcom_fiber/trace_out",
            {
                "from": "fiber_patch_panel/1?pins=out:2",
                "direction": "downstream",
                "result_type": "tree",
            },
        )

        self.subtest("TRACE UPSTREAM WITH REVERSE SEG")
        ont_005 = self.getRecord("", "WH-ONT-005", ["fiber_ont"])
        self._test_get_request(
            "/network/mywcom_fiber/trace_out",
            {"from": ont_005._urn(pins="in:1"), "direction": "upstream", "result_type": "tree"},
        )

        self.subtest("TRACE UPSTREAM WITH SPLICES")
        self._test_get_request(
            "/network/mywcom_fiber/trace_out",
            {"from": "fiber_splitter/1?pins=in:1", "direction": "upstream", "result_type": "tree"},
        )

        self.subtest("TRACE UPSTREAM FROM SPLICE")
        self._test_get_request(
            "/network/mywcom_fiber/trace_out",
            {
                "from": "mywcom_fiber_segment/51?pins=out:25",
                "direction": "upstream",
                "result_type": "tree",
            },
        )

    def test_fiber_paths(self):
        """
        Exercise fiber trace to endpoints
        """

        self.login()

        self.subtest("SEGMENT TERMINATIONS")
        self._test_get_request(
            "/modules/comms/fiber/paths/mywcom_fiber_segment/154", {"pins": "out:1:20"}
        )

        self.subtest("SHELF IN PORT TERMINATIONS")
        self._test_get_request(
            "/modules/comms/fiber/paths/fiber_shelf/13", {"pins": "in:1:10", "full": True}
        )

        self.subtest("PATCH PANEL PORTS")
        self._test_get_request(
            "/modules/comms/fiber/paths/fiber_patch_panel/1", {"pins": "out:1:30"}
        )

        self.subtest("SEGMENT PIN TERMINATIONS")
        self._test_get_request(
            "/modules/comms/fiber/mywcom_fiber_segment/154/circuits",
            {"pins": "in:1", "include_proposed": True},
        )

        self.subtest("SEGMENT PIN TERMINATIONS WITH PIN RANGE")
        self._test_get_request(
            "/modules/comms/fiber/mywcom_fiber_segment/154/circuits",
            {"pins": "in:1:20", "include_proposed": True},
        )

        """ENH add a proposed circuit to a pin w/ existing circuits in the dev_db"""
        self.subtest("SEGMENT PIN TERMINATIONS WITH PROPOSED")
        self._test_get_request(
            "/modules/comms/fiber/mywcom_fiber_segment/82/circuits",
            {"pins": "in:7", "include_proposed": True},
        )

        self.subtest("ONT PORT CIRCUITS")
        self._test_get_request(
            "/modules/comms/fiber/fiber_ont/139/circuits",
            {"pins": "in:1", "include_proposed": True},
        )

    def test_fiber_connect(self):
        """
        Exercise fiber network connection
        """

        self.login()

        self.subtest("CONNECT SPLITTER -> CABLE")
        self._test_post_request(
            "/modules/comms/fiber/connect?delta=design/NB217",
            data={
                "from": "fiber_splitter/4?pins=out:8",
                "to": "mywcom_fiber_segment/203?pins=in:2",  # WH-0005
                "housing": "fiber_splitter/4",
            },
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER CONNECT SPLITTER")
        self.show_validation_errors("AFTER CONNECT SPLITTER", "design/NB217")

        self.subtest("CONNECT CABLE ONE TO ONE")
        self._test_post_request(
            "/modules/comms/fiber/connect?delta=design/NB217",
            data={
                "from": "mywcom_fiber_segment/186?pins=out:37",  # WH-FCB-023
                "to": "mywcom_fiber_segment/33?pins=in:12",  # WH-FCB-003 (144)
                "housing": "cabinet/1",
            },  # WH-C-01
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER CONNECT CABLE ONE TO ONE")
        self.show_validation_errors("AFTER CONNECT CABLE ONE TO ONE", "design/NB217")

        self.subtest("SPLICE CABLE -> CABLE")
        self._test_post_request(
            "/modules/comms/fiber/connect?delta=design/NB217",
            data={
                "from": "mywcom_fiber_segment/73?pins=out:5",  # WH-FCB-007
                "to": "mywcom_fiber_segment/153?pins=in:127",  # WH-FCB-021
                "housing": "splice_closure/23",
            },  # In WH-M-29
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER SPLICE CABLES")
        self.show_validation_errors("AFTER SPLICE CABLES", "design/NB217")

        self.subtest("SPLICE CABLE -> CABLE")
        self._test_post_request(
            "/modules/comms/fiber/connect" + self.param_string(delta="design/NB046"),
            data={
                "from": "mywcom_fiber_segment/63?pins=out:2",
                "to": "mywcom_fiber_segment/394?pins=in:2",
                "housing": "splice_closure/35",
            },
            show_response=True,
            response_format="json",
        )

    def test_fiber_disconnect(self):
        """
        Exercise fiber network disconnection
        """

        self.login()

        self.subtest("DISCONNECT SPLITTER FROM OUT CABLE")
        self._test_post_request(
            "/modules/comms/fiber/disconnect?delta=design/NB217",
            data={"pins": "fiber_splitter/4?pins=out:8"},
            show_response=True,
        )
        self.show_database_changes("AFTER DISCONNECT SPLITTER FROM OUT CABLE")
        self.show_validation_errors("AFTER DISCONNECT SPLITTER FROM OUT CABLE", "design/NB217")

        self.subtest("DISCONNECT SPLITTER FROM IN CABLE")
        self._test_post_request(
            "/modules/comms/fiber/disconnect?delta=design/NB217",
            data={"pins": "fiber_splitter/8?pins=in:1"},
            show_response=True,
        )
        self.show_database_changes("AFTER DISCONNECT SPLITTER FROM IN CABLE")
        self.show_validation_errors("AFTER DISCONNECT SPLITTER FROM IN CABLE", "design/NB217")

        self.subtest("DISCONNECT PORT -> CABLE (PARTIAL RANGE)")
        self._test_post_request(
            "/modules/comms/fiber/disconnect?delta=design/NB217",
            data={"pins": "fiber_patch_panel/1?pins=out:12:13"},
            show_response=True,
        )
        self.show_database_changes("AFTER DISCONNECT PORT -> CABLE (PARTIAL RANGE)")
        self.show_validation_errors(
            "AFTER DISCONNECT PORT -> CABLE (PARTIAL RANGE)", "design/NB217"
        )

        self.subtest("DISCONNECT CABLE -> CABLE (PARTIAL RANGE)")
        self._test_post_request(
            "/modules/comms/fiber/disconnect?delta=design/NB217",
            data={"pins": "mywcom_fiber_segment/186?pins=out:28:32"},  # WH-FCB-023 -> WH-FCB-001
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER DISCONNECT CABLES")
        self.show_validation_errors("AFTER DISCONNECT CABLES", "design/NB217")

        self.subtest("DISCONNECT CABLE -> CABLE (FULL RANGE)")
        self._test_post_request(
            "/modules/comms/fiber/disconnect?delta=design/NB217",
            data={"pins": "mywcom_fiber_segment/190?pins=out:49:72"},  # WH-FCB-025 -> WH-FCB-006
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER DISCONNECT CABLES")
        self.show_validation_errors("AFTER DISCONNECT CABLES", "design/NB217")

        self.subtest("DISCONNECT SINGLE CABLE")
        self._test_post_request(
            "/modules/comms/fiber/disconnect?delta=design/NB217",
            data={"pins": "mywcom_fiber_segment/186?pins=out:36"},
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER DISCONNECT SINGLE CABLE")
        self.show_validation_errors("AFTER DISCONNECT SINGLE CABLE", "design/NB217")

    def test_fiber_path_finder(self):
        """
        Test fiber path finder
        """

        self.login()

        # Basic test
        self.show("BASIC TEST")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "max_paths": 2,
            },
            show_response=True,
            response_format="json",
        )
        self.show(f"SUMMARY: BASIC TEST num_paths={len(result['paths'])}")

        # Exercise no paths found
        self.show("NO PATHS")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "manhole/185",
                "application": "mywcom",
                "max_paths": 2,
            },
            show_response=True,
            response_format="json",
        )

        # Exercise no route paths found
        self.show("NO ROUTE PATHS")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/13",
                "application": "mywcom",
                "max_paths": 2,
            },
            show_response=True,
            response_format="json",
        )

        # Add avoid urn
        self.show("AVOID TEST")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "avoid_urns": "ug_route/218",
                "max_paths": 2,
            },
            show_response=True,
            response_format="json",
        )
        self.show(f"SUMMARY: AVOID TEST num_paths={len(result['paths'])}")

        # Add include urn
        self.show("INCLUDE TEST")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "include_urns": "ug_route/218",
                "max_paths": 2,
            },
            show_response=True,
            response_format="json",
        )
        self.show(f"SUMMARY: INCLUDE TEST num_paths={len(result['paths'])}")

        # Add avoid struct urn
        self.show("AVOID STRUCT TEST")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "avoid_urns": "manhole/190",
                "max_paths": 2,
            },
            show_response=True,
            response_format="json",
        )
        self.show(f"SUMMARY: AVOID STRUCT TEST num_paths={len(result['paths'])}")

        # Add include struct urn
        self.show("INCLUDE STRUCT TEST")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "include_urns": "manhole/190",
                "max_paths": 2,
            },
            show_response=True,
            response_format="json",
        )
        self.show(f"SUMMARY: INCLUDE STRUCT TEST num_paths={len(result['paths'])}")

        # Add include struct urn
        self.show("LONGER RUN FROM WH")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_olt/10?pins=out:8",
                "to_urn": "wall_box/54",
                "application": "mywcom",
                "max_paths": 5,
            },
            show_response=True,
            response_format="json",
        )
        self.show(f"SUMMARY: LONGER RUN FROM WH num_paths={len(result['paths'])}")

        # Sort by test
        self.show("SORT BY SHORTEST")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "max_paths": 1,
                "sort_by": "shortest",
            },
            show_response=True,
            response_format="json",
        )
        self.show("SORT BY SHORTEST")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "max_paths": 1,
                "sort_by": "least_new",
            },
            show_response=True,
            response_format="json",
        )

        self.show("INVALID START LOCATION")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "manhole/83",
                "to_urn": "manhole/86",
                "application": "mywcom",
                "max_paths": 1,
                "sort_by": "least_new",
            },
            show_response=True,
            response_format="json",
        )

        self.show("INVALID END LOCATION")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_splitter/17?pins=out:1",
                "to_urn": "manhole/83",
                "application": "mywcom",
                "max_paths": 1,
                "sort_by": "least_new",
            },
            show_response=True,
            response_format="json",
        )

    def test_fiber_path_finder_multipaths(self):
        """
        Additional set of tests for path finder using data from CDIF files.
        Including new data in dev db is destablising, and so for now import it for each test.

        ENH: Include data permanently.
        """

        self.login()

        delta = "design/pf_multiple_paths"
        self.import_package("path_finder", "MultiplePaths.zip", "4242", delta)

        start_shelf = self.getRecord(delta, "XX-S-6004", ["fiber_shelf"])
        end = self.getRecord(delta, "XX-C-6005", ["cabinet"])

        for sort_by in PathFinderManager.sort_props.keys():
            result = self._test_post_request(
                "/modules/comms/fiber_path/find",
                data={
                    "from_urn": f"{start_shelf._urn()}?pins=out:1",
                    "to_urn": end._urn(),
                    "application": "mywcom",
                    "sort_by": sort_by,
                    "delta": delta,
                    "exclude_similar": True,
                },
                show_response=False,
                response_format="json",
            )

            def map_fn(item):
                props = item["properties"]
                return (props["distance"], props["new_splices"], props["existing_splices"])

            dists = list(map(map_fn, result["paths"]))
            self.show(f"PROPERTIES sort_by={sort_by} {dists}")

        # Ensure we exit when there really is only one path - often the base if
        # tracing to a wall-box
        self.show("TEST FOR LOOP PREVENTION")
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_patch_panel/2?pins=out:37",
                "to_urn": "wall_box/6",
                "application": "mywcom",
                "sort_by": "shortest",
                "max_paths": 5,
                "exclude_similar": True,
            },
            show_response=False,
            response_format="json",
        )
        self.show(f"Routes found {len(result['paths'])}")

    def test_fiber_path_finder_ftth(self):
        """
        Additional set of tests for path finder using data from CDIF files.
        Including new data in dev db is destablising, and so for now import it for each test.

        ENH: Include data permanently.
        """

        self.login()

        delta = "design/FTTH"
        self.import_package("path_finder", "MiniFTTH.zip", "4242", delta)

        start_shelf = self.getRecord(delta, "XX-S-6000", ["fiber_shelf"])
        end = self.getRecord(delta, "XX-W-002", ["wall_box"])
        include = self.getRecord(delta, "XX-M-6004", ["manhole"])

        # First path should be the one that runs up to end of 48 and then connects to customer drop.

        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": f"{start_shelf._urn()}?pins=out:1",
                "to_urn": end._urn(),
                "application": "mywcom",
                "sort_by": "shortest",
                "includes": include._urn(),
                "delta": delta,
                "exclude_similar": False,
            },
            show_response=True,
            response_format="json",
        )

    def test_fiber_path_finder_circuit(self):

        self.login()

        # Basic test and add circuit using first path
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "max_paths": 2,
            },
            show_response=False,
            response_format="json",
        )
        path = result["paths"][0]["result"]

        circuit_feature = {"properties": {"name": "C1", "service_type": "Direct"}}

        result = self._test_post_request(
            "/modules/comms/fiber_path/create_circuit",
            data={
                "feature_type": "ftth_circuit",
                "feature": json.dumps(circuit_feature),
                "application": "mywcom",
                "path": json.dumps(path),
                "delta": "design/SP002",
            },
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER CREATING CIRCUIT 1")

        # Now route circuit to reuse existing SC
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:10",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "max_paths": 2,
                "delta": "design/SP002",
            },
            show_response=False,
            response_format="json",
        )
        path = result["paths"][0]["result"]

        circuit_feature = {"properties": {"name": "C2", "service_type": "Direct"}}

        result = self._test_post_request(
            "/modules/comms/fiber_path/create_circuit",
            data={
                "feature_type": "ftth_circuit",
                "feature": json.dumps(circuit_feature),
                "application": "mywcom",
                "path": json.dumps(path),
                "delta": "design/SP002",
            },
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER CREATING CIRCUIT 2")

    def test_fiber_path_finder_async(self):

        self.login()

        # Basic test
        result = self._test_post_request(
            "/modules/comms/fiber_path/find",
            data={
                "from_urn": "fiber_shelf/18?pins=out:1",
                "to_urn": "cabinet/46",
                "application": "mywcom",
                "max_paths": 2,
                "async": True,
            },
            show_response=True,
            response_format="json",
        )
        self.show(f"SUMMARY: BASIC TEST {result}")

        task_id = result["task_id"]

        # Do not show intermediate results as this number of these might vary between
        # runs.
        while True:
            time.sleep(1)
            url = f"{self.base_url}/modules/comms/task/{task_id}/status"
            resp = self.session.get(url, expect_errors=True)
            result = json.loads(resp.body)

            if result["status"] == "SUCCESS":
                break

        self.show(f"SUMMARY: BASIC TEST COMPLETE {result}")

    def test_circuit_routing(self):
        """
        Exercise circuit controller routing
        """

        self.login()

        delta = "design/NB217"

        # Routing
        self.subtest("ROUTE CIRCUIT")
        self.set_feature_props(
            "ftth_circuit/16", delta, out_feature="fiber_ont/16", out_pins="in:1"
        )

        self._test_post_request(
            "/modules/comms/circuit/ftth_circuit/16/route?delta=" + delta,
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER ROUTE CIRCUIT")
        self.show_validation_errors("AFTER ROUTE CIRCUIT", delta)

        # Partial re-routing
        self.subtest("RE-ROUTE CIRCUIT")
        self.set_feature_props(
            "ftth_circuit/44", delta, out_feature="fiber_ont/37", out_pins="in:1"
        )

        self._test_post_request(
            "/modules/comms/circuit/ftth_circuit/44/route?delta=" + delta,
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER RE-ROUTE CIRCUIT")
        self.show_validation_errors("AFTER RE-ROUTE CIRCUIT", delta)

        # Null re-routing
        self.subtest("NULL RE-ROUTE CIRCUIT")
        self._test_post_request(
            "/modules/comms/circuit/ftth_circuit/3/route?delta=" + delta,
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER NULL RE-ROUTE CIRCUIT")
        self.show_validation_errors("AFTER NULL RE-ROUTE CIRCUIT", delta)

        # Invalid Route (split path)
        self.subtest("TRY ROUTE INVALID PATH")
        self.set_feature_props(
            "bb_circuit/4", delta, out_feature="fiber_patch_panel/15", out_pins="in:1:8"
        )

        self._test_post_request(
            "/modules/comms/circuit/bb_circuit/4/route?delta=" + delta,
            show_response=True,
            response_format="json",
        )

    def test_circuit_unrouting(self):
        """
        Exercise circuit controller routing
        """

        self.login()

        delta = "design/NB217"

        # Routing
        self.subtest("UNROUTE CIRCUIT")
        self.set_feature_props(
            "ftth_circuit/16", delta, out_feature="fiber_ont/16", out_pins="in:1"
        )

        self._test_post_request(
            "/modules/comms/circuit/ftth_circuit/16/unroute?delta=" + delta,
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER UNROUTE CIRCUIT")
        self.show_validation_errors("AFTER UNROUTE CIRCUIT", delta)

        # Partial re-routing
        self.subtest("RE-UNROUTE CIRCUIT")
        self.set_feature_props(
            "ftth_circuit/44", delta, out_feature="fiber_ont/37", out_pins="in:1"
        )

        self._test_post_request(
            "/modules/comms/circuit/ftth_circuit/44/unroute?delta=" + delta,
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER RE-ROUTE CIRCUIT")
        self.show_validation_errors("AFTER RE-ROUTE CIRCUIT", delta)

        # Null re-routing
        self.subtest("NULL UNROUTE CIRCUIT")
        self._test_post_request(
            "/modules/comms/circuit/ftth_circuit/3/unroute?delta=" + delta,
            show_response=True,
            response_format="json",
        )

        self.show_database_changes("AFTER NULL RE-ROUTE CIRCUIT")
        self.show_validation_errors("AFTER NULL RE-ROUTE CIRCUIT", delta)

    # ==============================================================================
    #                         VALIDATION / MERGE TESTS
    # ==============================================================================

    def test_delta_validation(self):
        """
        Exercise design validation service
        """

        self.login()

        self.subtest("ALL ERRORS")
        self._test_get_request(
            "/modules/comms/delta/design/NB301/validate", show_response=True, response_format="json"
        )

        self.subtest("SUBSET OF ERRORS")
        self._test_get_request(
            "/modules/comms/delta/design/NB301/validate?max_errors=2",
            show_response=True,
            response_format="json",
        )

        self.subtest("WITH BOUNDS AND CATEGORIES")
        self._test_get_request(
            "/modules/comms/delta/design/NB301/validate?bounds=0.1326835,52.2232582,0.1339281,52.2239351&categories=routes,equipment",
            show_response=True,
            response_format="json",
        )

        self.subtest("WITH CATEGORIES")
        self._test_get_request(
            "/modules/comms/delta/design/NB301/validate?bounds=" "&categories=equipment",
            show_response=True,
            response_format="json",
        )

    def test_delta_changes(self):
        """
        Exercise design changes service
        """

        self.login()

        self.subtest("ALL CHANGES")
        self._test_post_request(
            "/modules/comms/delta/design/NU23/changes", show_response=True, response_format="json"
        )

        self.subtest("INSERTS AND UPDATES")
        self._test_post_request(
            "/modules/comms/delta/design/NU23/changes?change_types=insert,update",
            show_response=True,
            response_format="json",
        )

        self.subtest("IN BOUNDS")
        self._test_post_request(
            "/modules/comms/delta/design/NU23/changes?bounds=0.1362137,52.2236613,0.1383125,52.2243472",
            show_response=True,
            response_format="json",
        )

        self.subtest("INSERTS IN BOUNDS")
        self._test_post_request(
            "/modules/comms/delta/design/NU23/changes?change_types=insert&bounds=0.1362137,52.2236613,0.1383125,52.2243472",
            show_response=True,
            response_format="json",
        )

        self.subtest("INSERTS AND UPDATES WITH FEATURE TYPES")
        self._test_post_request(
            "/modules/comms/delta/design/NU23/changes?change_types=insert,update&feature_types=fiber_shelf,mywcom_fiber_connection",
            show_response=True,
            response_format="json",
        )

        self.subtest("FEATURE TYPES WITH LIMIT AND POLYGON")

        polys = [
            # This one won't include any changes
            "0.13850662605102,52.223100904332995,0.138588165106847,52.22296945694811,0.138781284483337,52.22307987269332,0.13871691146698,52.223186344915746,0.13850662605102,52.223100904332995",
            # This is the design's polygon
            "0.136959766120634,52.22284370519168,0.137710784644804,52.22322709348552,0.138253187094159,52.22286926449084,0.137543891621243,52.222454836574514,0.136959766120634,52.22284370519168",
        ]
        for poly in polys:
            self._test_post_request(
                f"/modules/comms/delta/design/CC4970/changes?feature_types=ug_route,wall_box&limit=3&bounds_poly={poly}",
                show_response=True,
                response_format="json",
            )

    def test_delta_revert(self):
        """
        Exercise design revert service
        """

        self.login()
        self.subtest("design/NB335")

        self._test_post_request(
            "/modules/comms/delta/design/NB335/revert/manhole/55",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER REVERT DELETED FEATURE")

        self._test_post_request(
            "/modules/comms/delta/design/NB335/revert/manhole/38",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER REVERT DELETE/DELETE FEATURE")

        self._test_post_request(
            "/modules/comms/delta/design/NB335/revert/mywcom_route_junction/5200",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER REVERT INSERTED FEATURE")

        self._test_post_request(
            "/modules/comms/delta/design/NB335/revert/mywcom_route_junction/5200",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER REVERT INSERTED FEATURE TWICE")

        self._test_post_request(
            "/modules/comms/delta/design/NB335/revert/manhole/54",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER REVERT UPDATED FEATURE")

    def test_delta_merge_feature(self):
        """
        Exercise design merge_feature service
        """

        self.login()
        self.subtest("design/NB335")

        self._test_post_request(
            "/modules/comms/delta/design/NB335/merge/manhole/55",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER MERGE DELETED FEATURE")

        self._test_post_request(
            "/modules/comms/delta/design/NB335/merge/manhole/54",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER MERGE UPDATED FEATURE WITH REAL CONFLICTS")

        self._test_post_request(
            "/modules/comms/delta/design/NB301/merge/ug_route/88",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER MERGE UPDATED FEATURE WITHOUT REAL CONFLICTS")

        self._test_post_request(
            "/modules/comms/delta/design/NB301/merge/ug_route/88",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER MERGE UPDATED FEATURE WITHOUT REAL CONFLICTS AGAIN")

        self._test_post_request(
            "/modules/comms/delta/design/NB301/merge/ug_route/4801",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER MERGE INSERTED INGERITY ERROR")

        self._test_post_request(
            "/modules/comms/delta/systest/conflicts1/merge/ug_route/89",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER MERGE INTEGRITY ERROR")

        self._test_post_request(
            "/modules/comms/delta/systest/conflicts1/merge/mywcom_fiber_segment/83",
            show_response=True,
            response_format="json",
        )
        self.show_database_changes("AFTER FAILED MERGE INTEGRITY ERROR")

    def test_delta_merge(self):
        """
        Exercise design merge service
        """

        self.login()

        self._test_delta_merge(
            "design/NB301"
        )  # Data correction conflict, structures and cables only, design has inserts only
        self._test_delta_merge(
            "design/NB120"
        )  # Data correction conflict, includes conduits and circuits, design has split route
        self._test_delta_merge("design/NU23")  # Data correction conflict (circuit re-route)
        self._test_delta_merge("design/CC5462")  # Data correction conflict + real conflict (ports)

    def _test_delta_merge(self, delta):
        """
        Exercise design merge service for DELTA
        """

        self.subtest(delta)

        url = "/modules/comms/delta/{}/merge".format(delta)
        self._test_post_request(url, show_response=True, response_format="json")
        self.show_database_changes("AFTER MERGE " + delta, schema_filter="[db]*")

    def test_delta_conflicts(self):

        self.login()

        self.subtest("All")

        self._test_get_request(
            "/modules/comms/delta/design/NB120/conflicts",
            show_response=True,
            response_format="json",
        )

        self.subtest("WITH BOUNDS")

        self._test_get_request(
            "/modules/comms/delta/design/NB120/conflicts?bounds=0.1373769,52.2233664,0.1383533,52.2236843",
            show_response=True,
            response_format="json",
        )

        self.subtest("WITH CATEGORIES")

        self._test_get_request(
            "/modules/comms/delta/design/NB120/conflicts?categories=segments,conduits",
            show_response=True,
            response_format="json",
        )

        self.subtest("WITH BOUNDS AND CATEGORIES")

        self._test_get_request(
            "/modules/comms/delta/design/NB120/conflicts?bounds=0.1372510,52.2236096,0.1383004,52.2239687&categories=routes",
            show_response=True,
            response_format="json",
        )

    def test_delta_bounds(self):
        """
        Exercise fetching bounds for a delta
        """

        self.login()

        # This design has no geometry
        self._test_get_request(
            "/modules/comms/delta/design/NB112/bounds",
            show_response=True,
            response_format="json",
        )

        self._test_get_request(
            "/modules/comms/delta/design/NB301/bounds",
            show_response=True,
            response_format="json",
        )

        self._test_get_request(
            "/modules/comms/delta/design/CC4827/bounds",
            show_response=True,
            response_format="json",
        )

    def test_validation_area(self):
        """
        Exercise spatial validation service
        """
        # Use design NB301 (which has conflict errors)

        self.login()

        # Basic call
        self._test_get_request(
            "/modules/comms/validate?bounds=0.1326835,52.2232582,0.1339281,52.2239351&delta=design/NB301",
            show_response=True,
            response_format="json",
        )

        # Exercise categories
        self._test_get_request(
            "/modules/comms/validate?bounds=0.1326835,52.2232582,0.1339281,52.2239351&categories=routes,connections&delta=design/NB301",
            show_response=True,
            response_format="json",
        )

    # ------------------------------------------------------------------------------
    #                                 FEATURES
    # ------------------------------------------------------------------------------

    def test_feature_transaction(self):
        """
        Exercise transaction services
        """

        delta = "design/NB046"

        self.login()

        self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "insert",
                    "ug_route",
                    {
                        "type": "Feature",  # Split UG route 372 and run to new wall box location
                        "properties": {
                            "myw_orientation_path": 0,
                            "cover_type": "Grass",
                            "length": null,
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.1372422491036751, 52.22553559170557],
                                [0.1371239125728608, 52.22545943361946],
                            ],
                            "world_name": "geo",
                        },
                    },
                ],
                [
                    "insert",
                    "wall_box",
                    {
                        "type": "Feature",  # Add wallbox at end of new route
                        "properties": {
                            "myw_orientation_location": 0,
                            "name": "",
                            "installation_date": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1371239125728608, 52.22545943361946],
                            "world_name": "geo",
                        },
                    },
                ],
                [
                    "delete",
                    "wall_box",
                    {
                        "type": "Feature",  # Remove wallbox at end of UG route 315
                        "properties": {
                            "id": 145,
                            "name": "WH-0145",
                            "specification": null,
                            "myw_orientation_location": 224.501421535347,
                            "installation_date": "1998-05-03",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1370134845002012, 52.22556915200117],
                            "world_name": "geo",
                            "world_type": "geo",
                        },
                    },
                ],
                [
                    "update",
                    "ug_route",
                    {
                        "type": "Feature",
                        "properties": {"id": 314},  # Adjust route 314 geometry, but not ends
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.137086617252149, 52.22562214654749],
                                [0.13706570232953522, 52.225585972632615],
                                [0.1370134845002012, 52.22556915200117],
                            ],
                            "world_name": "geo",
                        },
                    },
                ],
            ],
        )

        self.show_database_changes("TRANSACTION")
        self.show_validation_errors("TRANSACTION", delta)

        self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "insert",
                    "fiber_cable",
                    {
                        "type": "Feature",  # Split UG route 372 and run to new wall box location
                        "properties": {
                            "type": "Internal",
                            "specification": "D-096-LA-8W-F12NS",
                            "fiber_count": 96,
                            "diameter": 6,
                            "directed": "true",
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [
                                [0.1366049051285, 52.2240164428564],
                                [0.1366049051285, 52.2240164428564],
                            ],
                            "world_type": "geo",
                        },
                    },
                ]
            ],
        )
        self.show_database_changes("INTERNAL CABLE INSERT TRANSACTION")
        # ENH: Add test for update trigger

    # ------------------------------------------------------------------------------
    #                                 DATA IMPORT
    # ------------------------------------------------------------------------------

    def test_data_import_configs(self):
        """
        Exercise service to retrieve configured data import formats
        """

        self.login()
        self._test_get_request("/modules/comms/import/config", show_response=True)

    def test_data_preview(self):
        """
        Exercise upload and preview of a data package
        """

        self.login()

        # Exercise import
        zip_data = self.readFileContents(self.test_data_dir, "import", "minimal.zip")
        zip_data = base64.b64encode(zip_data)

        # Upload the file
        res = self._test_post_request(
            "/modules/comms/upload",
            data={"filedata": zip_data, "filename": "minimal.zip", "task_id": 2},
            response_format="json",
            show_response=True,
        )
        upload_id = res["id"]

        # Run the test
        url = "/modules/comms/upload/{}/preview".format(upload_id)

        params = {
            "engine": "cdif",
            "coord_system": 4326,
            "delta": "design/test",
            "filename": "minimal.zip",
            "task_id": 2723522,
        }

        self._test_get_request(url + self.param_string(**params))

    def test_data_import(self):
        """
        Exercise import of a data package
        """

        self.login()

        self.test_data_import_file("minimal.zip", 2)
        self.test_data_import_file("minimal.gpkg", 3)
        self.test_data_import_file("fex_network.sqlite", 3)

    def test_data_import_file(self, filename, task_id):

        # Exercise import
        zip_data = self.readFileContents(self.test_data_dir, "import", filename)
        zip_data = base64.b64encode(zip_data)

        # Upload the file
        res = self._test_post_request(
            "/modules/comms/upload",
            data={"filedata": zip_data, "task_id": task_id, "filename": filename},
            response_format="json",
            show_response=True,
        )
        upload_id = res["id"]

        # Import it
        url = "/modules/comms/upload/{}/import".format(upload_id)

        params = {
            "engine": "cdif",
            "coord_system": 4326,
            "delta": "design/test",
            "task_id": 25,
            "filename": filename,
        }

        self._test_post_request(url, data=params, show_response=True)

        self.show_database_changes(f"AFTER IMPORT MINIMAL FOR FILE {filename}")

        # ENH: Exercise mappings etc

    def readFileContents(self, root_dir, *path):
        """
        Get contents of a binary file
        """

        import base64

        file_name = os.path.join(root_dir, *path)

        with open(file_name, "rb") as file:
            data = file.read()

        return data

    # ------------------------------------------------------------------------------
    #                                 CONFIG
    # ------------------------------------------------------------------------------

    def test_update_setting(self):
        """
        Exercise update of configuration settings
        """

        db = self.db(self.db_session)
        self.login()

        self.subtest("UPDATE MYWCOM.STRUCTURES")
        config = db.setting("mywcom.structures")
        config["manhole"] = {
            "image": "/modules/comms/images/features/building.svg",
            "palette": false,
        }
        del config["pole"]
        self._test_json_put_request(
            "/modules/comms/config/update/structures", data={"config": config}
        )
        self.show_database_changes("AFTER UPDATE STRUCTURE SETTING", schema_filter="*")

        self.subtest("UPDATE MYWCOM.ROUTES")
        config = db.setting("mywcom.routes")
        config["ug_route"] = {"image": null, "palette": false}
        del config["oh_route"]
        self._test_json_put_request("/modules/comms/config/update/routes", data={"config": config})
        self.show_database_changes("AFTER UPDATE ROUTE SETTING", schema_filter="*")

        self.subtest("UPDATE MYWCOM.EQUIPMENT")
        config = db.setting("mywcom.equipment")
        config["fiber_patch_panel"] = {
            "image": null,
            "palette": false,
            "housings": ["building"],
            "function": "connector",
        }
        del config["fiber_splitter"]
        self._test_json_put_request(
            "/modules/comms/config/update/equipment", data={"config": config}
        )
        self.show_database_changes("AFTER UPDATE EQUIPMENT SETTING", sort=True, schema_filter="*")

        config = db.setting("mywcom.equipment")
        config["fiber_splitter"] = {
            "image": null,
            "palette": false,
            "housings": ["building"],
            "function": "connector",
        }  # Test adding equipment to test adding to fiber network
        self._test_json_put_request(
            "/modules/comms/config/update/equipment", data={"config": config}
        )
        self.show_database_changes("AFTER ADD EQUIPMENT SETTING", schema_filter="*")

        self.subtest("UPDATE MYWCOM.CONDUITS")
        config = db.setting("mywcom.conduits")
        config["conduit"] = {
            "image": null,
            "palette": false,
            "housings": ["ug_route"],
            "continuous": true,
            "bundle_type": "blown_fiber_bundle",
        }

        del config["blown_fiber_tube"]
        self._test_json_put_request(
            "/modules/comms/config/update/conduits", data={"config": config}
        )

        # Add feature that isn't conduit-like
        config = db.setting("mywcom.conduits")
        config["mywcom_fiber_segment"] = {
            "image": null,
            "palette": false,
            "housings": ["ug_route"],
            "continuous": true,
            "bundle_type": "blown_fiber_bundle",
        }
        self._test_json_put_request(
            "/modules/comms/config/update/conduits", data={"config": config}
        )

        self.show_database_changes("AFTER UPDATE CONDUIT SETTING", schema_filter="*")

        self.subtest("UPDATE MYWCOM.CABLES")
        config = db.setting("mywcom.cables")
        config["conduit"] = {"image": null, "palette": false, "housings": ["ug_route"]}
        self._test_json_put_request("/modules/comms/config/update/cables", data={"config": config})
        self.show_database_changes("AFTER UPDATE CABLE", schema_filter="*")

        self.subtest("UPDATE MYWCOM.CIRCUITS")
        config = db.setting("mywcom.circuits")
        config["ftth_circuit"] = {
            "image": null,
            "palette": false,
            "inEquips": ["fiber_olt"],
            "outEquips": ["fiber_ont"],
        }
        del config["bb_circuit"]
        self._test_json_put_request(
            "/modules/comms/config/update/circuits", data={"config": config}
        )
        self.show_database_changes("AFTER UPDATE CIRCUITS SETTING", schema_filter="*")

        self.subtest("BAD REQUEST")  # Exercise error handling
        self._test_json_put_request("/modules/comms/config/update/bad", data={"config": {}})
        self.show_database_changes("AFTER BAD REQUEST", schema_filter="*")

    def test_validate_setting(self):
        """
        Exercise validaton of configuration settings
        """

        db = self.db(self.db_session)
        self.login()

        self.subtest("VALIDATE MYWCOM.STRUCTURES")
        config = db.setting("mywcom.structures")
        # Invalid path as it an absolute path
        config["manhole"] = {
            "image": "/modules/comms/images/features/building.svg",
            "palette": false,
        }
        del config["pole"]
        self._test_json_post_request(
            "/modules/comms/config/validate/structures",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        self.subtest("VALIDATE MYWCOM.ROUTES")
        config = db.setting("mywcom.routes")
        config["ug_route"] = {"image": null, "palette": false}
        del config["oh_route"]
        self._test_json_post_request(
            "/modules/comms/config/validate/routes",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        self.subtest("VALIDATE MYWCOM.EQUIPMENT")
        config = db.setting("mywcom.equipment")
        config["fiber_patch_panel"] = {
            "image": null,
            "palette": false,
            "housings": ["building"],
            "function": "connector",
        }
        del config["fiber_splitter"]
        self._test_json_post_request(
            "/modules/comms/config/validate/equipment",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        self.subtest("VALIDATE MYWCOM.CONDUITS")
        config = db.setting("mywcom.conduits")
        config["conduit"] = {
            "image": null,
            "palette": false,
            "housings": ["ug_route"],
            "continuous": true,
            "bundle_type": "blown_fiber_bundle",
        }
        del config["blown_fiber_tube"]
        self._test_json_post_request(
            "/modules/comms/config/validate/conduits",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        # Add feature that isn't conduit-like
        config = db.setting("mywcom.conduits")
        config["manhole"] = {
            "image": null,
            "palette": false,
            "housings": ["ug_route"],
            "continuous": true,
            "bundle_type": "blown_fiber_bundle",
        }
        self._test_json_post_request(
            "/modules/comms/config/validate/conduits",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        self.subtest("VALIDATE MYWCOM.CABLES")
        config = db.setting("mywcom.cables")
        config["conduit"] = {"image": null, "palette": false, "housings": ["ug_route"]}
        self._test_json_post_request(
            "/modules/comms/config/validate/cables",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        self.subtest("VALIDATE MYWCOM.CIRCUITS")
        config = db.setting("mywcom.circuits")
        config["ftth_circuit"] = {
            "image": null,
            "palette": false,
            "inEquips": ["fiber_olt"],
            "outEquips": ["fiber_ont"],
        }
        del config["bb_circuit"]
        self._test_json_post_request(
            "/modules/comms/config/validate/circuits",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        self.subtest("VALIDATE MYWCOM.SPECS")
        config = db.setting("mywcom.specs")
        config["bb_circuit"] = config.pop("cabinet")
        config["not_a_real_feature"] = config.pop("manhole")

        self._test_json_post_request(
            "/modules/comms/config/validate/specs",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        self.subtest("VALIDATE MYWCOM.laborCosts")
        config = db.setting("mywcom.laborCosts")
        config["bb_circuit"] = config.pop("cabinet")
        config["not_a_real_feature"] = config.pop("manhole_spec")

        self._test_json_post_request(
            "/modules/comms/config/validate/laborCosts",
            data={"config": config},
            show_response=True,
            response_format="json",
        )

        self.subtest("VALIDATE MYWCOM.IMPORT_CONFIG")
        cdif_config = db.setting("mywcom.import_config.cdif")
        comsof_config = db.setting("mywcom.import_config.comsof")
        comsof_config.get("mappings").append(
            {
                "feature_type": "test_wrong_feature",
                "src_feature_type": "structures_cabinet",
                "field_mappings": {"id": "[fondid]", "name": "[fondid]", "location": "[geometry]"},
            }
        )

        self._test_json_post_request(
            "/modules/comms/config/validate/import_config",
            data={"config": {"cdif": cdif_config, "comsof": comsof_config}},
            show_response=True,
            response_format="json",
        )

    def test_loc_ripple(self):
        """
        Exercise line of count ripple service
        """

        self.login()

        loc_cfg = [
            {
                "name": "WH-1",
                "low": 1,
                "high": 144,
                "status": "Active",
                "origin": "mywcom_copper_segment/1",
            }
        ]

        self._loc_update("mywcom_copper_segment/1", loc_cfg)

        self.show_database_changes("AFTER INITIAL SETTING OF COPPER LOC")

        resp = self._test_get_request(
            "/modules/comms/loc/mywcom_copper_segment/1/ripple_trace", show_response=False
        )
        # self.show_json(resp, sorter=MywControllerTestJsonSorter)

        # Ripple down through splitters
        loc_cfg = [
            {
                "name": "WH-1",
                "low": 1,
                "high": 44,
                "status": "Active",
                "origin": "fiber_patch_panel/1",
            }
        ]

        self._loc_update("fiber_patch_panel/1", loc_cfg, side="out")

        self.show_database_changes("AFTER INITIAL SETTING OF FIBER LOC")

        resp = self._test_post_request(
            "/modules/comms/loc/fiber_patch_panel/1/ripple_trace_update?side=out",
            show_response=False,
        )
        # self.show_json(resp, sorter=MywControllerTestJsonSorter)

        urns = ["fiber_splitter/9", "fiber_splitter/4"]
        resp = self._test_post_request(
            f"/modules/comms/loc/get?application=mywcom&lang=en-GB",
            data={"urns": json.dumps(urns)},
            show_response=False,
        )
        self.show_json(json.loads(resp), sorter=MywControllerTestJsonSorter)

        self.show_database_changes("AFTER RIPPLE UPDATE")

    def test_loc_get(self):
        """
        Test fetching of line of count information
        """

        self.login()
        delta = "NB217"

        # Update a cable to have zero fiber count, get the loc for one of its segments
        self._test_json_post_request(
            "/modules/comms/feature" + self.param_string(delta=delta),
            show_response=True,
            response_format="json",
            data=[
                [
                    "update",
                    "fiber_cable",
                    {
                        "type": "Feature",
                        "properties": {
                            "id": 8,
                            "type": "Internal",
                            "specification": "",
                            "fiber_count": None,
                        },
                    },
                ]
            ],
        )

        urn_list = [
            "mywcom_copper_segment/1",
            "mywcom_fiber_segment/1",
            "mywcom_copper_segment/12",
            "mywcom_fiber_segment/75",
        ]

        self.subtest("GET LINE OF COUNT")
        resp = self._test_post_request(
            f"/modules/comms/loc/get?delta={delta}&application=mywcom&lang=en-GB",
            data={"urns": json.dumps(urn_list + ["copper_shelf/1"])},
            show_response=False,
        )
        resp = json.loads(resp)
        self.show_json(resp, sorter=MywControllerTestJsonSorter)

        self.subtest("GET LINE OF COUNT DETAILS")
        resp = self._test_post_request(
            f"/modules/comms/loc/get_details?delta={delta}&application=mywcom&lang=en-GB&include_proposed=true",
            data={"urns": json.dumps(urn_list + ["copper_shelf/1"])},
            show_response=False,
        )
        resp = json.loads(resp)
        self.show_json(resp, sorter=MywControllerTestJsonSorter)

    def test_loc_update(self):
        """
        Test line of count update service
        """

        self.login()

        loc_cfg = [
            {
                "name": "WH-001",
                "low": 1,
                "high": 10,
                "status": "Active",
                "origin": "mywcom_fiber_segment/184",
            }
        ]

        self._loc_update("mywcom_fiber_segment/184", loc_cfg)
        self.show_database_changes("AFTER INITIAL SETTING OF LOC")

        data = {"urns": json.dumps(["mywcom_fiber_segment/184"])}
        resp = self._test_post_request("/modules/comms/loc/get", data=data, show_response=True)

        loc_data = json.loads(resp)["mywcom_fiber_segment/184"]
        loc_data[0]["name"] = "WH-002"
        loc_data.append(
            {
                "name": "WH-003",
                "low": 1,
                "high": 5,
                "status": "Active",
                "origin": "mywcom_fiber_segment/184",
            }
        )

        self._loc_update("mywcom_fiber_segment/184", loc_data)
        self.show_database_changes("AFTER UPDATE LOC")

        loc_data = json.loads(resp)["mywcom_fiber_segment/184"]
        self._loc_update("mywcom_fiber_segment/184", loc_data[1:])
        self.show_database_changes("AFTER DELETE LOC")

        resp = self._test_post_request(
            "/modules/comms/loc/mywcom_fiber_segment/184/ripple_deletions",
            data=data,
            show_response=True,
        )
        self.show_database_changes("AFTER RIPPLE DELETE LOC")

        # LOC on equipment
        loc_cfg = [
            {
                "name": "DSLAM-2",
                "low": 1,
                "high": 12,
                "status": "Active",
                "origin": "copper_dslam/1",
            }
        ]

        # Cable WH-FCB-022
        self._loc_update("copper_dslam/1", loc_cfg, side="out")
        self.show_database_changes("AFTER INITIAL SETTING OF LOC ON DSLAM")

        # Replicates NMC-3064
        self.subtest("GET LINE DETAILS CONTIGUOUS LOGICAL RANGES")

        loc_cfg = [
            {
                "name": "XX",
                "low": 1,
                "high": 2,
                "status": "Active",
                "origin": "mywcom_copper_segment/18",
            },
            {
                "name": "YY",
                "low": 3,
                "high": 4,
                "status": "Active",
                "origin": "mywcom_copper_segment/18",
            }
        ]
        self._loc_update("mywcom_copper_segment/18", loc_cfg)

    def test_loc_conflicts(self):
        """
        In design assign LOC to first range of fibers and ripple
        In master assign LOC to second range of fibers and ripple
        In design check conflicts and resolve
        """

        self.login()

        # First segment of cable WH-FCB-022 leaving Woodhead Hub
        self._add_loc_and_ripple(
            "WH-1", 11, 20, "Active", "mywcom_fiber_segment/184", delta="design/NB217"
        )

        self._add_loc_and_ripple("WH-1", 1, 11, "Active", "mywcom_fiber_segment/184")

        self._test_get_request(
            "/modules/comms/delta/design/NB217/conflicts",
            show_response=True,
            response_format="json",
            result_sorter=CommsSkipJsonSorter,
        )

        self._test_get_request(
            "/modules/comms/validate?delta=design/NB217&bounds=0.1308347,52.2210578,0.1391710,52.2259673&application=mywcom&lang=en-GB",
            show_response=True,
            response_format="json",
            result_sorter=CommsSkipJsonSorter,
        )

    def test_loc_overlap_designs(self):
        """
        Testing when two different designs make overlapping assignments.
        """

        self.login()

        design1 = "design/NB217"  # Empty design
        design2 = "design/NB236"  # Has existing loc assigment at DSLAM

        # Assign in design 1 and ripple
        # First segment of WH-FCB-223 leaving WH
        loc_data = [
            {
                "name": "WH-2-DSL",
                "status": "Active",
                "low": 1,
                "high": 10,
                "origin": "mywcom_fiber_segment/596",
                "forward": true,
            }
        ]

        # data = {"loc_data": json.dumps(loc_data), "origin": True, "delta": design1}

        self._loc_update("mywcom_fiber_segment/596", loc_data, delta=design1)

        self._test_post_request(
            f"/modules/comms/loc/mywcom_fiber_segment/596/ripple_trace_update",
            data={"delta": design1},
            show_response=False,
        )

        # Get details at DSLAM. Should show proposed from other design
        resp = self._test_post_request(
            f"/modules/comms/loc/get_details?delta={design1}&side=in&application=mywcom&lang=en-GB&include_proposed=true",
            data={"urns": json.dumps(["copper_dslam/1"])},
            show_response=False,
        )
        resp = json.loads(resp)
        self.show_json(resp, sorter=MywControllerTestJsonSorter)

        # Publish/promote
        self._test_post_request(
            f"/delta/{design1}/promote?application=mywcom&lang=en_gb,show_response=False"
        )

        # Go to other design and validation should pick up overlap.
        self.subtest("ALL ERRORS")
        self._test_get_request(
            f"/modules/comms/validate?delta={design2}&bounds=0.1308347,52.2210578,0.1391710,52.2259673",
            show_response=True,
            response_format="json",
            result_sorter=CommsSkipJsonSorter,
        )

    def test_loc_disconnect_rename_design(self):
        """
        In design change downstream connectivity.
        In master rename loc and ripple
        Expect conflict on line of count that can be auto resolved.
        On sections, master ripple doesn't change mapping so no conflict with delta change

        """

        self.login()

        design = "design/NB217"  # Empty design

        # Change connections
        self._change_connections(design)

        # Rename in master
        loc_data = [
            {
                "name": "WH-42",
                "status": "Active",
                "loc_section_ref": "mywcom_line_of_count_section/1",
                "loc_ref": "mywcom_line_of_count/1",
                "low": 1,
                "high": 100,
                "origin": "copper_shelf/1",
                "forward": true,
            }
        ]
        self._update_copper_shelf_loc("copper_shelf/1", loc_data, "")

        self.show("EXPECT NAME/GEOM CONFLICT")
        self._test_get_request(
            f"/modules/comms/delta/{design}/conflicts",
            show_response=True,
            response_format="json",
            result_sorter=CommsSkipJsonSorter,
        )

    def test_loc_disconnect_split_design(self):
        """

        In design change downstream connectivity.
        In master split loc and ripple

        """

        self.login()

        design = "design/NB217"  # Empty design

        # Change connections
        self._change_connections(design)

        # split in master
        loc_data = [
            {
                "name": "WH-1",
                "status": "Active",
                "loc_section_ref": "mywcom_line_of_count_section/1",
                "loc_ref": "mywcom_line_of_count/1",
                "low": 1,
                "high": 10,
                "origin": "copper_shelf/1",
                "forward": true,
            },
            {
                "name": "WH-2",
                "low": 1,
                "high": 90,
                "status": "Active",
                "ref": "",
                "origin": "copper_shelf/1",
            },
        ]

        self._update_copper_shelf_loc("copper_shelf/1", loc_data, "")

        # Conflicts can be auto-resolved and overlap error no longer occurs.
        self.show("EXPECT NAME/GEOM CONFLICT")
        self._test_get_request(
            f"/modules/comms/delta/{design}/conflicts",
            show_response=True,
            response_format="json",
            result_sorter=CommsSkipJsonSorter,
        )

        self._test_get_request(
            f"/modules/comms/validate?delta={design}&bounds=0.1308347,52.2210578,0.1391710,52.2259673",
            show_response=True,
            response_format="json",
            result_sorter=CommsSkipJsonSorter,
        )

    def test_tmf_get(self):
        """
        test table mapping and single resource get
        """
        self.login()

        tmf_url = "/modules/comms/api/v1/resourceInventoryManagement/resource"
 
        self.subtest("Get")
        feature_params = self._tmfTableNames()
        for feature_type in feature_params:
            resp = self._test_get_request(f"{tmf_url}/{feature_type}/1", show_response=True)
            self._validateSchema(resp)
     
        self.subtest("Partial Representation")
        # none
        self._test_get_request(f"{tmf_url}/cable/1?fields=none", show_response=True, response_format="json")
        self._test_get_request(f"{tmf_url}/cable/1?fields=specification,name,technology", show_response=True, response_format="json")

        self.subtest("Errors")
        # feature type doesn't exist
        self._test_get_request(f"{tmf_url}/ABCD/1", show_response=True, response_format="json")
        # case sensitive?
        self._test_get_request(f"{tmf_url}/Cable/1", show_response=True, response_format="json")
        # feature doesn't exist
        self._test_get_request(f"{tmf_url}/cables/12345678", show_response=True, response_format="json")
        self._test_get_request(f"{tmf_url}/tap/1", show_response=True, response_format="json")
        # include calculated reference sets
        self._test_get_request(f"{tmf_url}/address/561?includeCalculatedReferenceSets=True", show_response=True, response_format="json")
        self._test_get_request(f"{tmf_url}/cable/1?includeCalculatedReferenceSets=True", show_response=True, response_format="json",result_sorter=CommsListJsonSorter)

    def test_tmf_get_many(self):

        self.login()
        
        tmf_url = "/modules/comms/api/v1/resourceInventoryManagement/resource"

        self.subtest("Get all")
        # use CommsSkipJsonSorter because missing 'myw' in new json causes crash in default sorter
        self._test_get_request(
            f"{tmf_url}/shelf", 
            show_response=True,
            response_format="json",
            result_sorter=CommsTmfControllerSorter
        )
        self._test_get_request(
            f"{tmf_url}/backboneCircuit", 
            show_response=True,
            response_format="json",
            result_sorter=CommsTmfControllerSorter
        )

        self.subtest("Partial Representation")
        self._test_get_request(
            f"{tmf_url}/cable?fields=name,laborCosts", 
            show_response=True,
            response_format="json",
            result_sorter=CommsTmfControllerSorter
        )

        self.subtest("Attribute Filtering using '&'")
        self._test_get_request(
            f"{tmf_url}/manhole?laborCosts='level_ground'&specification='FPM-CCANN-J4'&fields=name", 
            show_response=True,
            response_format="json",
            result_sorter=CommsTmfControllerSorter
        )

        self.subtest("Fetching address by details")
        self._test_get_request(
            f"{tmf_url}/address?streetName='Milton Road'&streetNr='294'&includeCalculatedReferenceSets=True", 
            show_response=True,
            response_format="json",
            result_sorter=CommsTmfControllerSorter
        )
    
    def test_tmf_delete(self):

        self.login()
        # update whitelist to allow editing
        all_edit_allowed = [
            "Cable",
            "Circuit",
            "Conduit",
            "Equipment",
            "Route",
            "Structure"
        ]
        db = self.db(self.db_session)
        db.setSetting("mywcom.tmf_edit_allowed", all_edit_allowed)

        tmf_url = "/modules/comms/api/v1/resourceInventoryManagement/resource"

        feature_params = ['backboneCircuit','fiberToTheHomeCircuit', 'multiplexer','opticalLineTerminal', 'manhole']
        for feature_type in feature_params:
            self._test_delete_request(
                f"{tmf_url}/{feature_type}/1")
            # try to get the feature we just deleted
            self._test_get_request(
                f"{tmf_url}/{feature_type}/1", 
                show_response=True)

        # these feature types will fail if associated with a circuit
        self._test_delete_request(f"{tmf_url}/cable/8")
        self._test_get_request(f"{tmf_url}/cable/8", show_response=True)
        
        self._test_delete_request(f"{tmf_url}/opticalNetworkTerminal/6")
        self._test_get_request(f"{tmf_url}/opticalNetworkTerminal/6", show_response=True)

        self._test_delete_request(f"{tmf_url}/patchPanel/3")
        self._test_get_request(f"{tmf_url}/patchPanel/3", show_response=True)

        self._test_delete_request(f"{tmf_url}/shelf/2")
        self._test_get_request(f"{tmf_url}/shelf/2", show_response=True)

        self._test_delete_request(f"{tmf_url}/spliceTray/3")
        self._test_get_request(f"{tmf_url}/spliceTray/3", show_response=True)

        self._test_delete_request(f"{tmf_url}/splitter/5")
        self._test_get_request(f"{tmf_url}/splitter/5", show_response=True)

        self._test_delete_request(f"{tmf_url}/undergroundRoute/100")
        self._test_get_request(f"{tmf_url}/undergroundRoute/100", show_response=True)

        self._test_delete_request(f"{tmf_url}/conduit/100")
        self._test_get_request(f"{tmf_url}/conduit/100", show_response=True)

        self.subtest("Errors")
        # trigger a 'Bad Gateway' error indicating a mywAbort because the cable belongs to a circuit
        self._test_delete_request(f"{tmf_url}/cable/1")

    def test_tmf_create(self):

        self.login()
        # update whitelist to allow editing
        all_edit_allowed = [
            "Cable",
            "Circuit",
            "Conduit",
            "Equipment",
            "Route",
            "Structure"
        ]
        db = self.db(self.db_session)
        db.setSetting("mywcom.tmf_edit_allowed", all_edit_allowed)

        tmf_url = "/modules/comms/api/v1/resourceInventoryManagement/resource"

        # create cable
        body = {"name": "WH-FCB-008","specification": "NETCONNECT 24 Count OS2","directed": true,"technology": "fiber","count": 24,"path": {"type": "LineString","coordinates": [[0.1353989169002,52.2249192931235],[0.1354820653796,52.224957288012],[0.1353549957275,52.2250408766523],[0.1352356374264,52.2251131694035],[0.1350572705269,52.2252306448731],[0.1350277662277,52.2252676126139],[0.134986191988,52.2253070448369],[0.1349472999573,52.2253366189812]]},"characteristic": [{"name": "type","value": "External"},{"name": "owner","value": "Acme Co"},{"name": "jobId","value": "24548"},{"name": "installationDate","value": "2014-05-15"},{"name": "diameter","value": 10.4},{"name": "comsofAuto","value": false},{"name": "secondaryGeometries","value": {"placement_path": {"type": "LineString","coordinates": [[0.1353989169002,52.2249192931235],[0.1349472999573,52.2253366189812]]}}}],"@type": "Cable","@baseType": "Feature"}
        self._test_json_post_request( f"{tmf_url}/cable", body, response_format="json", show_response=True)

        # create structure - situated NE of WH-M-01 and will split route and conduits
        body = {"name":"WH-M-TEST","specification":"FPM-CCANN-C2","laborCosts":"survey",
                "location":{"type":"Point","coordinates":[0.13552150901110255,52.22363341503777]},
                "characteristic":[{"name":"mywOrientationLocation","value":59.3813815475527},{"name":"sizeX","value":600.0},{"name":"sizeY","value":1200.0},{"name":"sizeZ","value":895.0},{"name":"installationDate","value":"2010-09-23"}],"@type":"Structure","@baseType":"Feature"}
        self._test_json_post_request( f"{tmf_url}/manhole", body, response_format="json", show_response=True)

        self.show_database_changes("AFTER CREATE STRUCTURE AND CABLE")
        
        self.subtest("Errors")
        # feature type doesn't exist
        self._test_json_post_request(
            f"{tmf_url}/ABCD", 
            body, 
            response_format="json",
            show_response=True
        )

        # schema mismatch
        errbody1 = {"name": "WH-FCB-001","directed": "xyz","@type": "Cable"}
        self._test_json_post_request(f"{tmf_url}/cable", errbody1, response_format="json", show_response=True)

    def test_tmf_update(self):

        # HACK using '_test_json_put_request' to use the dev tools test framework. 
        # paste.fixture.testapp does not support PATCH
        self.login()
        # update whitelist to allow editing
        all_edit_allowed = [
            "Cable",
            "Circuit",
            "Conduit",
            "Equipment",
            "Route",
            "Structure"
        ]
        db = self.db(self.db_session)
        db.setSetting("mywcom.tmf_edit_allowed", all_edit_allowed)

        tmf_url = "/modules/comms/api/v1/resourceInventoryManagement/resource"
        
        update_body1 = {"name": "___update name___"}
        feature_params = self._tmfTableNames()
        for feature_type in feature_params:
            self._test_json_put_request(f"{tmf_url}/{feature_type}/1", update_body1, response_format="json", show_response=True)
        
        self.subtest("Errors")
        # feature type doesn't exist
        self._test_json_put_request(f"{tmf_url}/ABCD/1", update_body1, response_format="json", show_response=True)

        # schema mismatch
        errbody1 = {"name": "WH-FCB-001","directed": "xyz","@type": "Cable"}
        self._test_json_put_request(
            f"/modules/comms/api/v1/resourceInventoryManagement/resource/cable/1", 
            errbody1, 
            response_format="json",
            show_response=True
        )

    def test_tmf_metadata(self):        
        """
        Test fetch of API specification and schemas
        """
        
        self.login()

        self._test_get_request( f"/modules/comms/api/v1/metadata/nmt_api.json", show_response=True)
        self._test_get_request( f"/modules/comms/api/v1/metadata/schema/Circuit.schema.json", show_response=True)


    def test_tmf_circuit(self):
        """
        Test circuit creation etc.
        """

        self.login()

        body = {"name" : "WH-FTTH-9999", 
                "inFeature" : "fiber_olt/25", "inPins" : "out:1", 
                "outFeature" : "fiber_ont/132", "outPins" : "in:1",
                "inputData" : { "orderId" : "1234", "technology" : "XGS-PON" } }

        resp = self._test_json_post_request(
            f"/modules/comms/api/v1/resourceInventoryManagement/resource/fiberToTheHomeCircuit", 
            body, 
            response_format="json",
            show_response=True
        )
        circuit_id = resp['id']

        self.show_database_changes("AFTER CREATE FTTH CIRCUIT")

        # Get circuit
        self._test_get_request(
            f"/modules/comms/api/v1/resourceInventoryManagement/resource/{circuit_id}", 
            body, 
            response_format="json",
            show_response=True
        )


        # Circuit has wrong end point
        body = {"name" : "WH-FTTH-9999", 
                "inFeature" : "fiber_olt/25", "inPins" : "out:1", 
                "outFeature" : "fiber_ont/132", "outPins" : "in:2",
                "inputData" : { "orderId" : "1234", "technology" : "XGS-PON" } }

        resp = self._test_json_post_request(
            f"/modules/comms/api/v1/resourceInventoryManagement/resource/fiberToTheHomeCircuit", 
            body, 
            response_format="json",
            show_response=True
        )

        # Update start and end
        self._test_json_put_request(    
            f"/modules/comms/api/v1/resourceInventoryManagement/resource/{circuit_id}",      
            { 
              "inFeature" : "fiber_olt/25", "inPins" : "out:4", 
              "outFeature" : "fiber_ont/149", "outPins" : "in:1"
            },
            response_format="json", show_response=True)
        self.show_database_changes("AFTER UPDATE")

        # Delete circuit
        self._test_delete_request(
            f"/modules/comms/api/v1/resourceInventoryManagement/resource/{circuit_id}"           
        )
        self.show_database_changes("AFTER DELETE")



    def _tmfTableNames(self):
        db = self.db(self.db_session)
        feature_params = db.setting("mywcom.tmf_tables")
        # add a couple default cases to dict (camel case to snake case)
        feature_params["conduit"] = "conduit"
        feature_params["manhole"] = "manhole"

        # no fiber tap in default db, testing missing features below
        if "tap" in feature_params:
            del feature_params["tap"]
        return feature_params

    def _change_connections(self, design):
        """
        Change connections in copper network
        """

        self._test_post_request(
            f"/modules/comms/copper/disconnect?delta={design}",
            data={"pins": "mywcom_copper_segment/6?pins=out:20:25"},
            show_response=False,
        )

        urn = "mywcom_copper_segment/6"
        self._test_post_request(
            f"/modules/comms/loc/{urn}/disconnect_loc?delta={design}",
            data={"ripple": "true"},
            show_response=False,
        )
    

    def _split_loc(self, urn, delta=""):
        """
        Split WH-1 line of count at copper shelf
        """

        loc_data = [
            {
                "name": "WH-1",
                "status": "Active",
                "loc_section_ref": "mywcom_line_of_count_section/1",
                "loc_ref": "mywcom_line_of_count/1",
                "low": 1,
                "high": 50,
                "origin": "copper_shelf/1",
                "forward": true,
            },
            {
                "name": "WH-2",
                "low": 1,
                "high": 50,
                "status": "Active",
                "ref": "",
                "origin": "copper_shelf/1",
            },
        ]

        self._update_copper_shelf_loc(urn, loc_data, delta)

    def _update_copper_shelf_loc(self, urn, loc_data, delta):

        self._loc_update(urn, loc_data, side="out", delta=delta)

        data = {"side": "out"}
        if delta:
            data["delta"] = delta

        resp = self._test_post_request(
            f"/modules/comms/loc/{urn}/ripple_trace_update", data=data, show_response=False
        )

    def test_loc_maintain(self):
        """
        Test that line of count information is maintained when network is moved, split, cut etc.
        """

        self.login()

        self._test_feature_put_request(
            "MOVE MANHOLE WITH LOC",
            "manhole/12",  # Has loc
            [0.1354240714196983, 52.2233812995124],
        )

        self.show_database_changes("AFTER MOVING MANHOLE WITH LOC")

        coord = [0.13494237925222172, 52.223365579378225]

        self._test_json_post_request(
            "/modules/comms/feature/manhole",
            data={
                "type": "Feature",
                "properties": {
                    "myw_orientation_location": 0,
                    "specification": "",
                    "size_x": null,
                    "size_y": null,
                    "size_z": null,
                    "lockable": null,
                    "powered": null,
                    "installation_date": "",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": coord,
                    "world_name": "geo",
                },
            },
            show_response=False,
            response_format="json",
        )

        self.show_database_changes("AFTER ROUTE SPLIT")

        coords = [0.1353345438838, 52.2234612917333]

        self._test_post_request(
            "/modules/comms/slack/mywcom_copper_slack/add",
            data={
                "seg_urn": "mywcom_copper_segment/4",
                "side": "out",
                "feature": json.dumps(
                    {
                        "type": "Feature",
                        "properties": {
                            "housing": "manhole/12",
                            "cable": "copper_cable/1",
                            "root_housing": "manhole/12",
                            "myw_orientation_location": 0,
                            "length": 7.010400000000001,
                            "storage": "coil",
                            "job_id": "",
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [0.1374568417668, 52.2247063157682],
                            "world_name": "geo",
                        },
                    }
                ),
            },
            show_response=False,
            response_format="json",
        )

        self.show_database_changes("AFTER ADD SLACK AT WH-M-12")

        delta = "design/NB217"

        # Position of WH-M-10
        coord = [0.1344953477383, 52.2233481246706]

        resp = self._test_json_post_request(
            "/modules/comms/feature/copper_splice_closure",
            data={
                "type": "Feature",
                "properties": {
                    "myw_orientation_location": 0,
                    "specification": "",
                    "size_x": null,
                    "size_y": null,
                    "size_z": null,
                    "lockable": null,
                    "powered": null,
                    "installation_date": "",
                    "housing": "manhole/10",
                    "root_housing": "manhole/10",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": coord,
                    "world_name": "geo",
                },
            },
            show_response=False,
            response_format="json",
        )

        self._test_cable_split(
            "SPLIT CABLE IN WH-M-10",
            "copper_cable/2",
            True,
            7,
            delta,
            f"copper_splice_closure/{resp['id']}",
            show_response=False,
        )

    def test_tmf_network_trace(self):
        """
        Test external API network trace

        Strictly speaking there isn't a TMF network trace but for convenience we group it for test purposes.
        """

        self.login()        

        requests = [

            # From feature and pins
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1", "maxDistance": 100 },
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1:5" },
            { "network" : "mywcom_fiber", "from" : "fiber_patch/1?pins=out:1", "maxDistance": 100 }, 
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pin=out:1", "maxDistance": 100 },
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:99990:99991", "maxDistance": 100 },
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:10:1", "maxDistance": 100 },
            { "network" : "mywcom_xxxx", "from" : "fiber_patch_panel/1?pins=out:1", "maxDistance": 100 },
            { "network" : "mywcom_fiber", "from" : "mywcom_fiber_segment/184?pins=in:1" },
            { "network" : "mywcom_fiber", "from" : "mywcom_fiber_segment/184?pins=in:99999" },

            # Max distance
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1", "maxDistance": -10 },
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1", "maxDistance": "nine" },

            # Max nodes
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1", "maxNodes": 5 },
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1", "maxNodes": -5 },
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1", "maxNodes": 5.1 },

            # Direction
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1", "direction": "sideways" },
            
            # Delta
            { "network" : "mywcom_fiber", "from" : "fiber_patch_panel/1?pins=out:1", "delta": "test_design" },
            { "network" : "mywcom_fiber", "from" : "mywcom_fiber_segment/5604?pins=out:1", "direction" : "upstream" },
            { "network" : "mywcom_fiber", "from" : "mywcom_fiber_segment/5604?pins=out:1", "direction" : "upstream" , "delta" : "design/CC4970"},
        ]

        for params in requests:
            url = "/modules/comms/api/v1/networkTrace"

            resp = self._test_get_request(url, show_response=True, response_format="json", params=params)
            if isinstance(resp, dict):
                self._validateSchema(resp)
            else:
                self.show_json(json.loads(resp))


    # ==============================================================================
    #                                    HELPERS
    # ==============================================================================
    # ENH: Pass in struct URNs and remove some of these

    def set_feature_props(self, urn, delta="", **props):
        """
        Update properties of feature URN
        """
        # ENH: Do directly to self.db?

        url = "/feature/" + urn

        if delta:
            url += "?delta=" + delta

        data = self._test_get_request(url, show_response=False, response_format="json")
        if not "properties" in data:
            raise MywError("No such feature:", urn)

        for prop, val in props.items():
            data["properties"][prop] = val

        data = self._test_json_put_request(
            url, data=data, show_response=False, response_format="json"
        )

    def _validateSchema(self,resp,schema=None):
        """
        Validate response against schema with name SCHEMA. If not provided will extract from @type field in response
        """

        validator = CommsSchemaValidator()

        if not schema:
            schema = resp["@type"]

        invalid = validator.validate(schema,resp)
        if invalid:
            self.show("VALIDATION ERROR: ",invalid)


    def _test_feature_post_request(self, test_name, feature_type, data, delta=""):
        """
        Exercise feature insert service
        """

        self.subtest(test_name)

        url = "/modules/comms/feature/" + feature_type
        if delta:
            url += "?delta=" + delta

        data["type"] = "Feature"

        response = self._test_json_post_request(
            url, data, show_response=True, response_format="json"
        )

        coords = data["geometry"]["coordinates"]
        self.show_database_changes("AFTER " + test_name)
        self.show_validation_errors("AFTER " + test_name, delta, self.bounds(coords, 0.0001))

        return response

    def _test_feature_put_request(self, test_name, urn, coords, delta=""):
        """
        Exercise feature update service
        """

        self.subtest(test_name, " : ", urn)

        data = self._test_get_request("/feature/" + urn, show_response=false)
        data["geometry"]["coordinates"] = coords

        url = "/modules/comms/feature/" + urn
        if delta:
            url += "?delta=" + delta

        self._test_json_put_request(url, data, show_response=True, response_format="json")

        self.show_database_changes("AFTER " + test_name)
        self.show_validation_errors("AFTER " + test_name, delta, self.bounds(coords, 0.0001))

    def _test_feature_delete_request(self, test_name, urn, coords=None, delta=""):
        """
        Exercise feature delete service
        Provide COORDS or DELTA to support validation
        """

        self.subtest(test_name, " : ", urn)

        url = "/modules/comms/feature/" + urn
        if delta:
            url += "?delta=" + delta

        self._test_delete_request(url)

        self.show_database_changes("AFTER " + test_name)

        bounds = None
        if not delta:
            bounds = self.bounds(coords, 0.0001)

        self.show_validation_errors("AFTER " + test_name, delta, bounds)

    def show_validation_errors(self, test_name, delta, bounds=None):
        """
        Show output from data validator for area BOUNDS
        """

        db = self.db(self.db_session)

        # Find integrity errors
        if bounds:
            self.progress(4, "Validating area", bounds, delta)
            poly = MywPolygon.newBox(*bounds)
            engine = DataValidator(db.view(delta), polygon=poly)
            errors = engine.run()

        else:
            self.progress(4, "Validating design", delta)
            engine = DeltaManager(db.view(delta), self.progress)
            errors = engine.validate()

        # Show them
        self.show("VALIDATION ERRORS: ", test_name)
        for field in errors.values():
            for err in field.values():
                self.show("   ", err)
                self.show("   ", err.details())

    def structUrnsStr(self, delta, *names):
        """
        Returns JSON-encoded URNS of structures NAMES
        """

        urns = []

        for name in names:
            urns.append(self.findStruct(delta, name)._urn())

        return json.dumps(urns)

    def findStruct(self, delta, name):
        """
        Returns the structure identified by NAME
        """

        # Try by URN
        if "/" in name:
            db_view = self.db(self.db_session).view(delta)
            rec = db_view.get(name)
            if rec:
                return rec

        # Try by name
        structure_types = ("building", "manhole", "cabinet", "pole", "wall_box")

        return self.getRecord(delta, name, structure_types)

    def _get_route_urn_at(self, coord, zoom=20, delta=""):
        """
        Returns first route (ug or oh) at COORD
        """
        # ENH: Get direct from database using getRecord()

        params = OrderedDict()
        params["lat"] = coord[1]
        params["lon"] = coord[0]
        params["zoom"] = zoom
        params["layers"] = "mywcom_st"
        params["delta"] = delta
        params["pixel_tolerance"] = 8

        req = "/select"
        sep = "?"
        for (param, value) in list(params.items()):
            req += "{}{}={}".format(sep, param, value)
            sep = "&"
        self.progress(2, "Request: GET: ", req)
        response = self.session.get(self.base_url + req, expect_errors=True)
        features = json.loads(response.body)["features"]

        for feature in features:
            feature_type = feature["myw"]["feature_type"]
            if feature_type in ["ug_route", "oh_route"]:
                id = feature["properties"]["id"]
                return "{}/{}".format(feature_type, id)
        return None

    def getRecord(self, delta, name, feature_types, **additional_filter):
        """
        Returns record identified by name in feature types

        Can include additional filter : fieldname == value
        """

        db_view = self.db(self.db_session).view(delta)

        for feature_type in feature_types:
            table = db_view.table(feature_type)

            pred = table.field("name") == name

            for fname, fval in additional_filter.items():
                pred = pred & (table.field(fname) == fval)

            recs = table.filter(pred).all()

            if recs:

                if len(recs) > 1:
                    print("TOO MANY ", delta, name, feature_types, additional_filter)

                return recs[0]

        raise MywError("Cannot find record:", name)

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

    def bounds(self, coords, pad):
        """
        Bounding box of COORDS (expanded by PAD)
        """
        # ENH: Provide bounds object in Core

        # Hack for point geoms
        if isinstance(coords[0], float):
            coords = [coords]

        bounds = [coords[0][0], coords[0][1], coords[0][0], coords[0][1]]

        for coord in coords:
            bounds[0] = min(bounds[0], coord[0])
            bounds[1] = min(bounds[1], coord[1])
            bounds[2] = max(bounds[2], coord[0])
            bounds[3] = max(bounds[3], coord[1])

        bounds[0] -= pad
        bounds[1] -= pad
        bounds[2] += pad
        bounds[3] += pad

        return bounds

    def import_package(self, data_dir, filename, task_id, delta_name):
        """
        Utility for importing package of data to be used for testing
        """

        # Exercise import
        zip_data = self.readFileContents(self.test_data_dir, data_dir, filename)
        zip_data = base64.b64encode(zip_data)

        # Upload the file
        res = self._test_post_request(
            "/modules/comms/upload",
            data={"filedata": zip_data, "task_id": task_id, "filename": filename},
            response_format="json",
            show_response=False,
        )
        upload_id = res["id"]

        # Import it
        url = "/modules/comms/upload/{}/import".format(upload_id)

        params = {
            "engine": "cdif",
            "coord_system": 4326,
            "delta": delta_name,
            "task_id": 25,
            "filename": filename,
        }

        self._test_post_request(url, data=params, show_response=False)

    def _add_loc_and_ripple(self, name, low, high, status, urn, delta=None):

        loc_cfg = [
            {
                "name": name,
                "low": low,
                "high": high,
                "status": status,
                "origin": urn,
            }
        ]

        feature_loc = {}
        feature_loc[urn] = {"loc_cfg": loc_cfg, "origin": True}
        data = {"feature_loc": json.dumps(feature_loc)}

        if delta:
            data["delta"] = delta

        resp = self._test_post_request(f"/modules/comms/loc/update", data=data, show_response=False)

        data = {}
        if delta:
            data["delta"] = delta

        resp = self._test_post_request(
            f"/modules/comms/loc/{urn}/ripple_trace_update", data=data, show_response=False
        )
        # self.show_json(resp, sorter=MywControllerTestJsonSorter)

    def _loc_update(self, urn, loc_cfg, side=None, delta=""):

        if side:
            loc_cfg = {side: loc_cfg}

        data = {"loc_cfg": loc_cfg, "origin": True}

        feature_loc = {urn: data}

        data = {"feature_loc": json.dumps(feature_loc)}

        if delta:
            data["delta"] = delta

        resp = self._test_post_request("/modules/comms/loc/update", data=data, show_response=True)
        self.show_json(resp, sorter=MywControllerTestJsonSorter)