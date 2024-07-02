# Set object attributes

import os, base64
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.system.myw_product import MywProduct


class Engine:
    """
    Engine for setting object properties to pseudo-random values
    """

    feature_types = [
        "building",
        "ug_route",
        "oh_route",
        "conduit",
        "manhole",
        "cabinet",
        "pole",
        "wall_box",
        "rack",
        "fiber_shelf",
        "slot",
        "splice_closure",
        "fiber_olt",
        "fiber_mux",
        "fiber_splitter",
        "fiber_tap",
        "fiber_ont",
        "fiber_cable",
    ]

    def __init__(self, db, trace_level):
        """
        Init slots of self

        DB is a MywDatabase"""

        self.db_view = db.view()
        self.progress = MywSimpleProgressHandler(trace_level)
        self.data_dir = MywProduct().moduleOf(__file__).file("data")

    def setProperties(self, feature_type):
        """
        Set attributes for records of type FEATURE_TYPE
        """

        with self.progress.operation("Setting properties for", feature_type):

            for rec in self.db_view.table(feature_type):
                self.setPropertiesFor(rec)

    def setPropertiesFor(self, rec):
        """
        Set attributes of REC
        """

        if hasattr(rec, "specification"):
            rec["specification"] = self.specFor(rec)
        if hasattr(rec, "labor_costs"):
            rec["labor_costs"] = self.laborCostsFor(rec)
        if hasattr(rec, "length"):
            rec["length"] = self.lengthFor(rec)
        if hasattr(rec, "size_x"):
            rec["size_x"] = self.sizeX(rec)
        if hasattr(rec, "size_y"):
            rec["size_y"] = self.sizeY(rec)
        if hasattr(rec, "size_z"):
            rec["size_z"] = self.sizeZ(rec)
        if hasattr(rec, "diameter"):
            rec["diameter"] = self.diameterFor(rec)
        if hasattr(rec, "n_ports"):
            rec["n_ports"] = self.nPortsFor(rec)
        if hasattr(rec, "type"):
            rec["type"] = self.typeFor(rec)
        if hasattr(rec, "device_id"):
            rec["device_id"] = self.deviceIdFor(rec)
        if hasattr(rec, "owner"):
            rec["owner"] = self.ownerFor(rec)
        if hasattr(rec, "job_id"):
            rec["job_id"] = self.jobIdFor(rec)
        if hasattr(rec, "cover_type"):
            rec["cover_type"] = self.coverTypeFor(rec)
        if hasattr(rec, "material"):
            rec["material"] = self.materialFor(rec)
        if hasattr(rec, "powered"):
            rec["powered"] = self.poweredFor(rec)
        if hasattr(rec, "installation_date"):
            rec["installation_date"] = self.installationDateFor(rec)
        if hasattr(rec, "rooms"):
            rec["rooms"] = rec.id
        if hasattr(rec, "access_code"):
            rec["access_code"] = "A7B-{:03}".format((rec.id * 792) % 1000)
        if hasattr(rec, "photo"):
            rec["photo"] = self.photoFor(rec)

        table = rec._view.table(rec.feature_type)
        table.update(rec)

    def specFor(self, feature):
        """
        Spec name for FEATURE (a spec record key)
        """
        # Specs come from https://www.commscope.com/catalog

        if feature.feature_type == "fiber_cable":
            if feature.fiber_count == 2:
                return "O-002-CA-8W-F04NS"
            if feature.fiber_count == 4:
                return "O-004-CA-8W-F04NS"
            if feature.fiber_count == 8:
                return "O-008-CA-8W-F04NS"
            if feature.fiber_count == 12:
                return "NETCONNECT 12 Count OM4"
            if feature.fiber_count == 24:
                return "NETCONNECT 24 Count OS2"
            if feature.fiber_count == 48:
                return "O-048-CN-5L-F12NS"
            if feature.fiber_count == 72:
                return "D-072-LA-8W-F12NS"
            if feature.fiber_count == 96:
                return "D-096-LA-8W-F12NS"
            if feature.fiber_count == 144:
                return "D-144-LA-8W-F12NS"
            if feature.fiber_count == 288:
                return "D-288-LA-8W-F12NS"

        if feature.feature_type == "conduit":
            if "-I-" in feature.name:
                return "JDP-26.5MM-Grey"
            return "JDP-110MM-Green"

        if feature.feature_type == "splice_closure":
            fid = feature.id
            if fid % 4 == 0:
                return "CS-FOSC-400B4-S24-4-NNN"
            if fid % 3 == 0:
                return "CS-FOSC400-A4-16-1-BNV"
            if fid & 2 == 0:
                return "CS- FOSC-100-DM-144"
            return "CS-FOSC450-D6-6-36-1-N0V"

        if feature.feature_type == "fiber_splitter":
            if feature.n_fiber_out_ports == 4:
                return "CS-EG4886-000"
            if feature.n_fiber_out_ports == 8:
                return "CS-EF3421-000"

        if feature.feature_type == "cabinet":
            fid = feature.id
            if fid % 4 == 0:
                return "CS-A-100586"
            if fid % 3 == 0:
                return "CS-A-100468"
            if fid & 2 == 0:
                return "CS-A-100324"
            return "CS-A-100455"

        if feature.feature_type == "manhole":

            fid = feature.id
            if fid % 3 == 0:
                return "FPM-CCANN-J4"
            if fid & 2 == 0:
                return "FPM-CCANN-C2"
            return "FPM-CCANN-MCX"

    def laborCostsFor(self, feature):
        """
        Set labor costs for FEATURE (a spec record key)
        """

        if feature.feature_type == "manhole":
            fid = feature.id
            if fid % 4 == 0:
                return "tree_trim,hole_dig"
            if fid % 3 == 0:
                return "level_ground"
            if fid & 2 == 0:
                return "survey"
            return "hole_dig"

        if feature.feature_type == "cabinet":
            fid = feature.id
            if fid % 4 == 0:
                return "fiber_connect"
            if fid % 3 == 0:
                return "fiber_connect,survey"
            if fid & 2 == 0:
                return "tree_trim"
            return "fiber_connect"

        if feature.feature_type == "ug_route":
            fid = feature.id
            if fid % 4 == 0:
                return "cherry_picker,trench_dig"
            if fid % 3 == 0:
                return "trench_dig"
            if fid & 2 == 0:
                return "pavement_re-surface,site_manager"
            return "cherry_picker"

    def typeFor(self, feature):
        """
        Type for cable object etc
        """

        if feature.type:
            return feature.type

        if feature.feature_type == "pole":
            return "Wood"

        if feature.feature_type == "fiber_cable":
            return "External"

        if feature.feature_type == "cabinet":
            fid = feature.id
            if fid % 4 == 0:
                return "Micro Cell Site Enclosure"
            if fid % 3 == 0:
                return "Power Supply Enclosure"
            if fid & 2 == 0:
                return "Micro Cell Site Enclosure"
            return "Power Supply Enclosure"

        if feature.feature_type == "fiber_cable":
            if feature.fiber_count == 4:
                return "Drop"
            if feature.fiber_count == 72:
                return "Internal"
            if feature.fiber_count == 144:
                return "External"
            if feature.fiber_count == 288:
                return "External"

        return None

    def lengthFor(self, feature):
        """
        Measured length for route, cable segment etc (in m)
        """

        # Routes etc
        calc_length = feature._primary_geom_field.geoLength()

        return round(
            calc_length * 1.05, 2
        )  # ENH: Support formatting at display time and remove rounding

    def sizeX(self, feature):
        """
        Width of structure
        """

        spec_val = self.specProperty(feature, "size_x")
        if spec_val:
            return spec_val

        if feature.feature_type == "manhole":
            fid = feature.id
            if fid % 3 == 0:
                return 440
            if fid & 2 == 0:
                return 600
            return 850

    def sizeY(self, feature):
        """
        Depth of structure
        """

        spec_val = self.specProperty(feature, "size_y")
        if spec_val:
            return spec_val

        if feature.feature_type == "manhole":

            fid = feature.id
            if fid % 3 == 0:
                return 910
            elif fid & 2 == 0:
                return 1200
            else:
                return 1300

    def sizeZ(self, feature):
        """
        Height of structure
        """

        spec_val = self.specProperty(feature, "size_z")
        if spec_val:
            return spec_val

        if feature.feature_type == "manhole":

            fid = feature.id
            if fid % 3 == 0:
                return 800
            elif fid & 2 == 0:
                return 895
            else:
                return 900

    def diameterFor(self, feature):
        """
        Diameter of cable or conduit
        """

        spec_val = self.specProperty(feature, "diameter")
        if spec_val:
            return spec_val

        if feature.feature_type == "fiber_cable":
            if feature.fiber_count == 2:
                return 6
            if feature.fiber_count == 4:
                return 10.4
            if feature.fiber_count == 8:
                return 11.5
            if feature.fiber_count == 72:
                return 11.6
            if feature.fiber_count == 144:
                return 9.9
            if feature.fiber_count == 288:
                return 19.5

        if feature.feature_type == "conduit":
            if "-I-" in feature.name:
                return 26.5
            return 110

        return None

    def nPortsFor(self, feature):
        """
        Port count
        """

        spec_val = self.specProperty(feature, "n_ports")
        if spec_val:
            return spec_val

        if feature.feature_type == "splice_closure":
            fid = feature.id
            if fid % 4 == 0:
                return 5
            elif fid % 3 == 0:
                return 5
            elif fid & 2 == 0:
                return 5
            else:
                return 6

    def deviceIdFor(self, feature):
        """
        Device ID for equipment object
        """

        return "{:04X}-{:04X}-{:04X}-{:06X}".format(
            feature.id * 7243 % pow(16, 4),
            feature.id * 9473 % pow(16, 4),
            feature.id * 2523 % pow(16, 4),
            feature.id * 77352 % pow(16, 6),
        )

    def poweredFor(self, feature):
        """
        Value for 'powered' field
        """

        if feature.feature_type == "cabinet":
            return (feature.id % 4) != 0

        return None

    def ownerFor(self, feature):
        """
        Owning company for cables etc
        """

        if (feature.id % 13) == 7:
            return None

        if (feature.id % 9) == 2:
            return "SFB Comms"

        return "Acme Co"

    def jobIdFor(self, feature):
        """
        Job in which object was created
        """

        return 18604 + (feature.id * 743) % pow(16, 4)

    def coverTypeFor(self, feature):
        """
        Surface type for an underground route
        """
        # ENH: Replace by captured attributes

        if (feature.id % 7) == 0:
            return "Tarmac"
        if (feature.id % 5) == 0:
            return "Grass"
        if (feature.id % 17) == 0:
            return None
        return "Mixed"

    def materialFor(self, feature):
        """
        Surface type for a conduit
        """
        # ENH: Replace by captured attributes

        if feature.feature_type == "conduit":
            if "-I-" in feature.name:
                return "PVC (Smooth)"
            return "PE (Corrugated)"

        return None

    def installationDateFor(self, feature):
        """
        Installation date
        """

        from datetime import date

        if (feature.id % 18) == 3:
            return None

        day = 1 + feature.id * 724 % 27
        month = 1 + feature.id * 452 % 12
        year = 1998 + (feature.id * 452 % 20)

        return date(year, month, day)

    def photoFor(self, feature):
        """
        Raw image for feature (if any)
        """

        if (feature.feature_type == "cabinet") and (feature.id == 1):
            return self.loadPhoto("cabinet_1.png")
        if (feature.feature_type == "cabinet") and (feature.id == 2):
            return self.loadPhoto("cabinet_2.png")
        if (feature.feature_type == "cabinet") and (feature.id == 3):
            return self.loadPhoto("cabinet_3.png")

        return None

    def loadPhoto(self, file_name):
        """
        Returns image from resources
        """

        file_path = os.path.join(self.data_dir, "network", "photos", file_name)

        with open(file_path, "rb") as strm:
            data = strm.read()

            return base64.b64encode(data).decode()

    def specProperty(self, feature, prop):
        """
        The value of PROP on FEATURE's spec (if it has one)
        """

        # Get spec record
        if not "specification" in feature._descriptor.fields:
            return None

        spec = feature._field("specification").rec()
        if not spec:
            return None

        # Get property from it
        if not prop in spec._descriptor.fields:
            return None

        return spec[prop]


# ==============================================================================
#
# ==============================================================================

# pylint: disable=undefined-variable
engine = Engine(db, 1)

for feature_type in engine.feature_types:
    engine.setProperties(feature_type)
