from locust import TaskSet, SequentialTaskSet, task, run_single_user, HttpUser
import logging, random, time, json, math
from myworldapp.modules.comms_dev_db.tests.scalability.locust.utils import *
from job_queue import JobQueue

# Just needed for geometry calculations
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_polygon import MywPolygon


"""
See comms_server_test_suite to see what comms specific API calls can be made
"""


class CommsTaskSet(TaskSet):
    def __init__(self, parent):
        super().__init__(parent)
        self.use_redis = False
        if self.use_redis:
            self.job_queue = JobQueue("redis")

    def deg2tilenum(self, lat_deg, lon_deg, zoom):
        lat_rad = math.radians(lat_deg)
        n = 2.0**zoom
        xtile = int((lon_deg + 180.0) / 360.0 * n)
        ytile = int(
            (1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n
        )
        return (xtile, ytile)

    def getTile(self, required_fields, tile, zoom=16):
        """
        Get layer tile
        """

        self.headers = {"X-CSRF-Token": self._parent.csrf_token}

        payload = {
            "application": "mywcom",
            "svars": {"activeDelta": ""},
            "required_fields": json.loads(required_fields),
            "world_name": "geo",
            "layer_names": ["mywcom_structures"],
            "zoom": zoom,
            "tile": tile,
        }

        url = f"/render_features?geo/{zoom}/{tile[0]}/{tile[1]}"

        resp = self.client.post(url, json=payload, headers=self.headers)

        logging.info(responseSummary("Get Layer", resp))

    def getLayer(self, name, bbox, required_fields, tiles, zoom=16):
        """
        Get layer tiles within BBOX
        """

        bbox = list(map(float, bbox.split(",")))
        start = self.deg2tilenum(bbox[1], bbox[0], zoom)
        end = self.deg2tilenum(bbox[3], bbox[2], zoom)

        for x in range(start[0], end[0] + 1):
            for y in range(end[1], start[0] + 1):
                self.getTile(required_fields, [x, y], zoom)

    def getLayerOld(self, name, bbox, required_fields, zoom=16):
        """
        Old style layer request
        """

        self.headers = {"X-CSRF-Token": self._parent.csrf_token}
        offset = ""

        while True:
            url = f"/layer/mywcom_structures/features?delta=&bbox={bbox}&limit=500&zoom={zoom}&requiredFields={required_fields}&application=mywcom&lang=en-GB&offset={offset}"

            res = self.client.get(url, headers=self.headers)
            try:
                fc = res.json()
            except:
                break
            if "offset" not in fc:
                break
            offset = fc["offset"]

        logging.info(responseSummary("Get Layer", res))

    def get_ont_name(self):
        fex = "FEX-BHM-01"
        pn = random.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        sn = random.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        sp = random.choice([2])
        drop = random.choice([1, 2, 3, 4])

        return "{}-PN{:03d}-SN{:03d}-{:03d}-{:03d}".format(fex, pn, sn, sp, drop)

    def get_sp_name_for_drop(self):
        fex = "FEX-BHM-01"
        pn = random.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
        sn = random.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

        return "{}-PN{:03d}-SN{:03d}_SP0".format(fex, pn, sn)

    def get_record(self, type, field, value):

        url = f"/feature/{type}/get?application=mywcom&lang=en-GB&limit=2"

        data = {
            "predicate": '["comp_op","=",{"type":"field","fieldName":"'
            + field
            + '"},{"type":"literal","value":"'
            + value
            + '"}]'
        }

        self.headers = {"X-CSRF-Token": self._parent.csrf_token}
        res = self.client.post(url, data=data, headers=self.headers)

        if res.ok:
            return res.json()
        else:
            return None

    def _set_feature_props(self, urn, delta="", **props):
        """
        Update properties of feature URN
        """

        url = "/feature/" + urn

        if delta:
            url += "?delta=" + delta

        res = self.client.get(url)
        try:
            data = res.json()
        except:
            return

        for prop, val in props.items():
            data["properties"][prop] = val

        # ENH This is using platform REST API but comms always uses transaction API
        self.client.put(url, data=json.dumps(data), headers=self.headers)

    def _feature_insert_request(self, feature_type, data, delta=""):
        """
        Insert feature using transaction.
        Returns IDs
        """

        self.headers = {"X-CSRF-Token": self._parent.csrf_token}
        url = "/modules/comms/feature?application=mywcom&lang=en-GB"
        if delta:
            url += "&delta=" + delta

        import pdb

        # pdb.set_trace()
        data["type"] = "Feature"
        data = [["insert", feature_type, data]]

        res = self.client.post(url, json=data, headers=self.headers)

        if res.ok:
            return res.json()["ids"]

    def validate_design(self, name):
        url = f"/modules/comms/delta/design/{name}/validate"
        res = self.client.get(url)
        logging.info(responseSummary("Validate Design", res))

    def create_circuit(self, name="CC_"):
        ids = self._feature_insert_request(
            "ftth_circuit",
            {"geometry": None, "properties": {"name": name}},
        )
        return ids[0] if ids else None

    def create_design(self, name, poly):

        self._feature_insert_request(
            "design",
            {"geometry": poly.geoJson(), "properties": {"name": name, "status": "Designing"}},
        )

    def create_route(self, type, linestring, delta):
        self._feature_insert_request(type, {"geometry": linestring.geoJson()}, delta=delta)

    def create_structure(self, type, point, delta):
        ids = self._feature_insert_request(
            type,
            {
                "geometry": point.geoJson()
                # "geometry": { 'type' : 'Point' ,  "coordinates": [0.1371239125728608, 52.22545943361946], "world_name" : "geo" }
            },
            delta=delta,
        )
        return ids[0] if ids else None

    def create_equipment(self, type, point, housingUrn, delta, **props):

        ids = self._feature_insert_request(
            type,
            {
                "geometry": point.geoJson(),
                # "geometry": { 'type' : 'Point' ,  "coordinates": [0.1371239125728608, 52.22545943361946], "world_name" : "geo" },
                "properties": {"root_housing": housingUrn, "housing": housingUrn, **props},
            },
            delta=delta,
        )
        return ids[0] if ids else None

    def connect(self, from_pin, to_pin, housing, delta):
        url = "/modules/comms/fiber/connect?application=mywcom&lang=en-GB"

        data = {"from": from_pin, "to": to_pin, "housing": housing, "delta": delta}

        self.headers = {"X-CSRF-Token": self._parent.csrf_token}
        res = self.client.post(url, data=data, headers=self.headers)

    def get_contents(self, urn, delta):

        url = f"/modules/comms/structure/{urn}/contents?delta={delta}"
        self.headers = {"X-CSRF-Token": self._parent.csrf_token}
        res = self.client.get(url)

        if res:
            return res.json()

    def get_cable_segment_at(self, cable_id, structure_urn, delta):
        contents = self.get_contents(structure_urn, delta)

        if not contents:
            return

        for cs in contents["cable_segs"]["features"]:
            if f"fiber_cable/{cable_id}" == cs["properties"]["cable"]:
                return f'mywcom_fiber_segment/{cs["id"]}'

    def create_cable(self, type, coords, delta, **props):
        geom = MywLineString(coords)
        ids = self._feature_insert_request(
            "fiber_cable",
            {"geometry": geom.geoJson(), "properties": {"directed": True, **props}},
            delta=delta,
        )
        return ids[0] if ids else None


class CommsBreakTask(CommsTaskSet):
    # Mimic user performing activity not using IQGeo

    @task(1)
    def breakTask(self):
        # Break for 5 minutes
        time.sleep(5 * 60.0)


class CommsQueryTasks(CommsTaskSet):
    # Each spawned locust user will perform a series of tasks (from below) until test run is stopped.

    @task(1)
    def fiberTrace(self):

        selected_feature = getRandomOntFeature()
        feature_and_pair = f"{selected_feature}%3Fpins%3Din%3A1"
        url = f"/network/mywcom_fiber/trace_out?from={feature_and_pair}&direction=upstream&result_type=tree&max_nodes=10000&delta=&application=mywcom&lang=en-GB"

        res = self.client.get(url)

        # logging.info(res.json())
        logging.info(responseSummary("Network Fibre Trace Request", res))

    @task(1)
    def getContents(self):
        """
        Get contents of a structure
        """

        self.headers = {"X-CSRF-Token": self._parent.csrf_token}
        url = "/modules/comms/structure/building/1/contents?delta=&include_proposed=true&application=mywcom&lang=en-GB"
        res = self.client.get(url, headers=self.headers)
        logging.info(responseSummary("Get Contents", res))

    @task(10)
    def getLayerNorthCambridge(self):
        """
        Get layer features as part of rendering
        """

        # This request is bookmark:
        # /mywcom.html?ll=52.2261130,0.1414263&z=16&layers=mywcom_st,sa,re&basemap=Google

        bbox = "0.12807964518199558,52.221781910214645,0.15477298929820651,52.23044369412733"
        zoom = 16
        required_fields = '{"building":["name"],"cabinet":["name"],"drop_point":["name"],"manhole":["name"],"mdu":["name"],"pole":["name"],"wall_box":["name"]}'
        self.getLayer("mywcom_structures", bbox, required_fields, zoom)

    @task(10)
    def getLayersFEX(self):
        """
        Gets large part of FEX BHM
        """

        # This request is bookmark
        # /mywcom.html?ll=52.5037101,-1.9237566&z=15&layers=mywcom_st,sa,dn,dlts,dltc,re&basemap=Google

        bbox = "-1.9470381733850721,52.49619909413397,-1.9004750248865367,52.51121982006552"
        zoom = 15
        required_fields = '{"building":["name"],"cabinet":["name"],"drop_point":["name"],"manhole":["name"],"mdu":["name"],"pole":["name"],"wall_box":["name"]}'

        self.getLayer("mywcom_structures", bbox, required_fields, zoom)

    @task(10)
    def getLayerDerby(self):
        """
        Get layer features as part of rendering
        """

        # This is bookmark
        # /mywcom.html?ll=52.9240831,-1.4769521&z=16&layers=mywcom_st,sa,dn,dlts,dltc,re&basemap=Google

        bbox = "-1.488592859399416,52.92036377177516,-1.4653112851501484,52.9278021123298"
        zoom = 16

        required_fields = '{"building":["name"],"cabinet":["name"],"drop_point":["name"],"manhole":["name"],"mdu":["name"],"pole":["name"],"wall_box":["name"]}'
        self.getLayer("mywcom_structures", bbox, required_fields, zoom)

    @task(1)
    def select(self):
        self.headers = {"X-CSRF-Token": self._parent.csrf_token}
        url = '/select?lat=52.22401675092945&lon=0.1366055756807537&zoom=21&layers=mywcom_st,mywcom_eq,a&pixel_tolerance=8&svars={"activeDelta":""}&delta=&application=mywcom&lang=en-GB'
        res = self.client.get(url, headers=self.headers)
        logging.info(responseSummary("Select", res))


class CommsRouteCircuitTasks(CommsTaskSet):
    @task(1)
    def routeCircuit(self):
        """
        Create circuit and route it for customer
        """

        self.headers = {"X-CSRF-Token": self._parent.csrf_token}

        delta = ""
        ont_name = self.get_ont_name()
        recs = self.get_record("fiber_ont", "name", ont_name)
        if not recs:
            return

        ont_id = recs["features"][0]["id"]
        circuit_id = self.create_circuit(name=f"CC_{random.randint(1,1000000)}")
        self._set_feature_props(
            f"ftth_circuit/{circuit_id}", delta, out_feature=f"fiber_ont/{ont_id}", out_pins="in:1"
        )
        url = f"/modules/comms/circuit/ftth_circuit/{circuit_id}/route?delta={delta}"
        res = self.client.post(url, headers=self.headers)
        logging.info(responseSummary("Route Circuit", res))

    @task(2)
    def findPath(self):
        """
        Find path for cable between structures
        """
        self.headers = {"X-CSRF-Token": self._parent.csrf_token}

        res = self.client.post(
            "/modules/comms/cable/path?delta=''",
            headers=self.headers,
            data={
                "structures": json.dumps(["manhole/251", "manhole/111"]),
                "feature_type": "fiber_cable",
            },
        )
        logging.info(responseSummary("Find Path", res))


class CommsCustomerDropTasks(CommsTaskSet):

    """
    Navigate to customer
    Create design
    Create drop route, wall box, add ONT
    Create drop cable from wallbox back to secondary node splitter
    Connect fiber to ONT
    (Connecting drop fiber to splitter and creating circuit is for later)

    Sleeps added to make this more realistic timing wise so that one Locust user does equate to one real user.
    Alternative to sleeps is to use SequentialTaskSet
    """

    def translate(self, coord, de, dn):
        from math import atan2, cos, pi, radians, sin, sqrt
        from myworldapp.core.server.base.geom.myw_geo_utils import earth_radius

        lat = coord.y
        lon = coord.x
        dLat = dn / earth_radius
        dLon = de / (earth_radius * cos(pi * lat / 180))

        latO = lat + dLat * 180 / pi
        lonO = lon + dLon * 180 / pi
        return MywPoint(lonO, latO)

    def calc_drop_coords(self):

        sp_name = self.get_sp_name_for_drop()
        recs = self.get_record("fiber_splitter", "name", sp_name)
        if not recs:
            return
        # print("SP name ", sp_name)
        sp_coord = MywPoint(recs["features"][0]["geometry"]["coordinates"])

        drop_num = random.randint(1, 8)

        drop_coord = self.translate(sp_coord, 10 * (drop_num + 1), 0)
        wb_coord = self.translate(sp_coord, 10 * (drop_num + 1), 10)

        coords = {"wb_coord": wb_coord, "drop_coord": drop_coord, "sp_coord": sp_coord}

        return coords

    @task(1)
    def createCustomerDrop(self):
        import random, time

        coords = self.calc_drop_coords()
        if not coords:
            return

        drop_num = random.randint(1, 100000)
        wb_coord = coords["wb_coord"]

        design_poly = MywPolygon(wb_coord.buffer(0.0001))
        design_name = f"CD_{drop_num}"
        delta = f"design/{design_name}"
        self.create_design(design_name, design_poly)
        time.sleep(4)

        drop_coord = coords["drop_coord"]
        self.create_route("ug_route", MywLineString([wb_coord, drop_coord]), delta)
        time.sleep(4)

        wb_id = self.create_structure("wall_box", wb_coord, delta)
        time.sleep(4)

        ont_id = self.create_equipment(
            "fiber_ont", wb_coord, f"wall_box/{wb_id}", delta, n_fiber_in_ports=4
        )
        time.sleep(4)

        sp_coord = coords["sp_coord"]
        cable_id = self.create_cable(
            "fiber_cable",
            [sp_coord, wb_coord],
            delta,
            fiber_count=4,
            specification="O-004-CA-8W-F04NS",
        )
        cs = self.get_cable_segment_at(cable_id, f"wall_box/{wb_id}", delta)
        time.sleep(4)
        if cs:
            self.connect(
                f"fiber_ont/{ont_id}?pins=in:1", f"{cs}?pins=out:1", f"fiber_ont/{ont_id}", delta
            )
            time.sleep(4)

        if self.use_redis:
            self.job_queue.push({"delta_name": delta, "id": wb_id, "location": wb_coord.wkb_hex})

        self.validate_design(design_name)
