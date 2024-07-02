import json, requests


class exerciseRestApi(object):
    """
    Simple class to exercise some REST API services
    """

    def __init__(self, base_url, user, password):
        """
        Initialise"""

        self.base_url = base_url
        self.username = user
        self.password = password

        self.session = None
        self.cookie = None
        self.design = ""

    def run(self, design_name):
        """
        Run the progress
        Creates a design with the given name and uses REST API to add data
        """

        self.session = requests.Session()

        self.cookie = self._getCookie()
        self.headers = {"X-CSRF-Token": json.loads(self.cookie)["csrf_token"]}

        design_info = self._createDesign(design_name)

        # Design URN to be passed as delta REST param
        self.design = design_info["urn"]

        self._createRoutes()
        self._createStructures()
        self._createEquipment()
        self._createCables()

        self._deleteSomeFeatures()
        self._updateSomeFeatures()

    """----------------------------------------------------
                  AUTHENTICATE
    ----------------------------------------------------"""

    def _getCookie(self):
        """
        Authenticates and returns cookie"""

        payload = {"user": self.username, "pass": self.password}

        response = self.session.post(self.base_url + "auth", data=payload, allow_redirects=False)
        cookies = response.cookies.get_dict()

        return json.dumps(cookies)

    """----------------------------------------------------
                  REST API CALLS
    ----------------------------------------------------"""

    def insertFeature(self, feature_type, payload):
        """
        Insert a new feature
        """

        url = "{}modules/comms/feature/{}?delta={}".format(self.base_url, feature_type, self.design)

        response = self.session.post(url, json=payload, headers=self.headers)
        self._validateResponse(response)

        featureJson = json.loads(response.content)
        urn = "{}/{}".format(featureJson["myw"]["feature_type"], featureJson["id"])

        return {"urn": urn, "feature": featureJson}

    def updateFeature(self, feature_type, feature_id, payload):
        """
        Update feature
        """

        url = "{}modules/comms/feature/{}/{}?delta={}".format(
            self.base_url, feature_type, feature_id, self.design
        )

        response = self.session.put(url, json=payload, headers=self.headers)
        self._validateResponse(response)

        return json.loads(response.content)

    def deleteFeature(self, feature_type, feature_id):
        """
        Delete feature
        """

        url = "{}modules/comms/feature/{}/{}?delta={}".format(
            self.base_url, feature_type, feature_id, self.design
        )

        response = self.session.delete(url, headers=self.headers)
        self._validateResponse(response)

    def runTransaction(self, payload):
        """
        Make a transaction request

        Supports single transaction with multiples of:
        insert
        insertOrUpdate
        update
        delete
        deleteIfExists
        """

        url = "{}modules/comms/feature?delta={}".format(self.base_url, self.design)

        response = self.session.post(url, json=payload, headers=self.headers)
        self._validateResponse(response)

        # Response is a list of ids in same order as request actions
        idsJson = json.loads(response.content)
        ids = idsJson["ids"]

        urns = []
        for idx, feature_id in enumerate(ids):
            feature_type = payload[idx][1]

            urn = "{}/{}".format(feature_type, feature_id)
            urns.append(urn)

        return urns

    """----------------------------------------------------
                  CREATE DATA
    ----------------------------------------------------"""

    def _createDesign(self, design_name):
        """
        Insert a design feature
        Designs keyed on name so will fail if design name already in use"""

        payload = {
            "type": "Feature",
            "properties": {"type": "Network Build", "status": "Designing", "name": design_name},
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    [
                        [0.13340771198272708, 52.22430644134925],
                        [0.1292127370834351, 52.224336016159945],
                        [0.1292127370834351, 52.22293612018722],
                        [0.133410394191742, 52.22293612018722],
                        [0.13340771198272708, 52.22430644134925],
                    ]
                ],
            },
        }

        return self.insertFeature("design", payload)

    def _createRoutes(self):
        """
        Create routes

        Runs as single transaction"""

        actions = []

        actions.append(
            [
                "insert",
                "ug_route",
                {
                    "type": "Feature",
                    "properties": {"cover_type": "Grass", "length": None},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [0.1297867298126221, 52.223987689361586],
                            [0.130564570426941, 52.22341590171196],
                            [0.1307094097137452, 52.223498055562814],
                        ],
                    },
                },
            ]
        )

        actions.append(
            [
                "insert",
                "ug_route",
                {
                    "type": "Feature",
                    "properties": {"cover_type": "Grass", "length": None},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [0.1307094097137452, 52.223498055562814],
                            [0.1314711570739746, 52.22373137167049],
                        ],
                    },
                },
            ]
        )

        actions.append(
            [
                "insert",
                "oh_route",
                {
                    "type": "Feature",
                    "properties": {"cover_type": "Grass", "length": None},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [
                            [0.1314711570739746, 52.22373137167049],
                            [0.1318788528442383, 52.22382995557293],
                        ],
                    },
                },
            ]
        )

        self.runTransaction(actions)

    def _createStructures(self):
        """
        Create structures

        Created in single transaction"""

        actions = []

        actions.append(
            [
                "insert",
                "building",
                {
                    "type": "Feature",
                    "properties": {
                        "name": "TEST",
                        "owner": "Unknown",
                        "access_code": "123",
                        "rooms": 4,
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [0.1297867298126221, 52.223987689361586],
                    },
                },
            ]
        )

        actions.append(
            [
                "insert",
                "manhole",
                {
                    "type": "Feature",
                    "properties": {
                        "specification": "FPM-CCANN-C2",
                        "size_x": 609.5999999999999,
                        "size_y": 1193.8,
                        "size_z": 889,
                        "lockable": None,
                        "powered": None,
                        "installation_date": "",
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [0.1307094097137452, 52.223498055562814],
                    },
                },
            ]
        )

        actions.append(
            [
                "insert",
                "pole",
                {
                    "type": "Feature",
                    "properties": {"type": "Wood", "height": None},
                    "geometry": {
                        "type": "Point",
                        "coordinates": [0.1314711570739746, 52.22373137167049],
                    },
                },
            ]
        )

        actions.append(
            [
                "insert",
                "wall_box",
                {
                    "type": "Feature",
                    "properties": {"name": "", "installation_date": ""},
                    "geometry": {
                        "type": "Point",
                        "coordinates": [0.1318788528442383, 52.22382995557293],
                    },
                },
            ]
        )

        result = self.runTransaction(actions)

        # Store URNs for later
        self.building = result[0]
        self.manhole = result[1]
        self.pole = result[2]
        self.wall_box = result[3]

    def _createEquipment(self):
        """
        Add equipment to previously created structures"""

        # Patch panel inside building
        self.insertFeature(
            "fiber_patch_panel",
            {
                "type": "Feature",
                "properties": {
                    "housing": self.building,  # Building URN
                    "root_housing": self.building,  # Building URN
                    "n_fiber_out_ports": 144,
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [0.1297867298126221, 52.223987689361586],
                },
            },
        )

        # Splice closure on pole
        closure_info = self.insertFeature(
            "splice_closure",
            {
                "type": "Feature",
                "properties": {
                    "housing": self.pole,  # Pole URN
                    "root_housing": self.pole,  # Pole URN
                    "specification": "",
                    "installation_date": "",
                    "job_id": "",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [0.1314711570739746, 52.22373137167049],
                },
            },
        )

        # Put a splitter inside the closure
        self.insertFeature(
            "fiber_splitter",
            {
                "type": "Feature",
                "properties": {
                    "n_fiber_in_ports": "1",
                    "housing": closure_info["urn"],  # Closure URN
                    "root_housing": self.pole,  # Pole URN
                    "specification": "",
                    "n_fiber_out_ports": 4,
                    "device_id": "",
                    "installation_date": "",
                    "job_id": "",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [0.1314711570739746, 52.22373137167049],
                },
            },
        )

        # ONT inside wallbox
        self.insertFeature(
            "fiber_ont",
            {
                "type": "Feature",
                "properties": {
                    "housing": self.wall_box,  # wall box URN
                    "root_housing": self.wall_box,  # wall box URN
                    "n_fiber_in_ports": 4,
                    "installation_date": "",
                    "job_id": "",
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [0.1318788528442383, 52.22382995557293],
                },
            },
        )

    def _createCables(self):
        """
        Add some cables

        Cables are created with vertexs on structures to route through"""

        # Cable from building to pole
        self.insertFeature(
            "fiber_cable",
            {
                "type": "Feature",
                "properties": {"directed": True, "fiber_count": 144},
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [0.1297867298126221, 52.223987689361586],
                        [0.1314711570739746, 52.22373137167049],
                    ],
                },
            },
        )

        # Drop from pole to wallbox
        self.insertFeature(
            "fiber_cable",
            {
                "type": "Feature",
                "properties": {
                    "directed": True,
                    "type": "Drop",
                    "specification": "O-004-CA-8W-F04NS",
                    "fiber_count": 4,
                    "diameter": 10.414,
                    "installation_date": "",
                    "job_id": "",
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [0.1314711570739746, 52.22373137167049],
                        [0.1318788528442383, 52.22382995557293],
                    ],
                },
            },
        )

    def _updateSomeFeatures(self):
        """
        Update some features
        """

        # Update pole height
        # Note only need to specify the attributes to update, not all attribute
        self.updateFeature(
            "pole",
            self.pole.split("/")[1],  # ID split from URN
            {"type": "Feature", "properties": {"height": 152.4}},
        )

        # Move wallbox location, which will drag the route, ONT, cable with it
        self.updateFeature(
            "wall_box",
            self.wall_box.split("/")[1],  # ID split from URN
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [0.1319003105163575, 52.223882533564726],
                },
            },
        )

    def _deleteSomeFeatures(self):
        """
        Exercise deleting some features"""

        # Delete manhole
        self.deleteFeature("manhole", self.manhole.split("/")[1])  # ID split from URN

    """----------------------------------------------------
                         HELPERS
    ----------------------------------------------------"""

    def _validateResponse(self, response):
        """
        Helper to raise exception if response status not as expected"""

        if response.status_code not in [200, 201]:
            raise ValueError("{}: Failed: {}".format(response.status_code, response))
