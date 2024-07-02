from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.geom.myw_line_string import MywLineString

from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms_dev_db.server.dev_db_name_manager import DevDbNameManager


class CommsDevDBCableManager(object):
    """
    Engine for routing cables from a list of strcture names

    Understands DevDB naming scheme."""

    def __init__(self, db_view, trace_level, cable_type="fiber_cable"):
        """
        Init slots of self

        DB_VIEW is a MywFeatureView"""

        self.db_view = db_view
        self.progress = MywSimpleProgressHandler(trace_level)
        self.cable_type = cable_type

        self.engine = NetworkView(self.db_view, progress=self.progress).cable_mgr

        self.name_mgr = DevDbNameManager(self.engine, self.progress)

        self.seqs = {
            "Backbone": 15,
            "Feeder": 0,
            "Riser": 0,
            "Drop": 0,
            "Internal": 0,
            "copper_cable": 0,
            "coax_cable": 1,
        }

    def create(self, count, **props):
        """
        Helper to create a fiber cable
        """

        table = self.db_view.table(self.cable_type)
        if self.cable_type == "fiber_cable":
            props["fiber_count"] = count
        elif self.cable_type == "coax_cable":
            props["coax_count"] = 1
        else:
            props["copper_count"] = count

        rec = table.insertWith(**props)

        self.setName(rec)
        self.setDirected(rec, props)

        table.update(rec)

        return rec

    def setDirected(self, rec, props):

        # Set directionality
        if not "directed" in props:
            if not "type" in props:
                rec.directed = True
            else:
                rec.directed = rec.type != "Backbone"

    def setName(self, rec):

        if self.cable_type == "copper_cable":
            self.seqs["copper_cable"] += 1
            rec.name = "WH-CC-{:03}".format(self.seqs["copper_cable"])
            return

        if self.cable_type == "coax_cable":
            self.seqs["coax_cable"] += 1
            rec.name = "WH-CA-{:03}".format(self.seqs["coax_cable"])
            return

        # Set name
        if rec.type == "Backbone":
            self.seqs[rec.type] += 1
            rec.name = "BB-FCB-{:03}".format(self.seqs[rec.type])

        elif rec.type == "Riser":
            self.seqs[rec.type] += 1
            rec.name = "RISER-{:03}".format(self.seqs[rec.type])

        elif rec.type == "Drop":
            self.seqs[rec.type] += 1
            rec.name = "DROP-{:03}".format(self.seqs[rec.type])

        elif rec.type == "Internal":
            self.seqs[rec.type] += 1
            rec.name = "WH-INT-{:02}".format(self.seqs[rec.type])

        elif self.db_view.delta:
            delta_owner = self.db_view.get(self.db_view.delta)
            rec.name = "WH-FCB-{}:{:03}".format(delta_owner._id, rec.id)

        else:
            rec.name = "WH-FCB-{:03}".format(rec.id)

    def route(self, cable, *struct_names):
        """
        Route CABLE along path identified by STRUCT_NAMES

        Finds shortest patch between named structures and enters cable"""

        with self.progress.operation("Routing", cable, ":", " -> ".join(struct_names)):

            # Find structures from their names
            structs = []
            for struct_name in struct_names:
                structs.append(self.findStruct(struct_name))

            # Find shortest path between them
            routes = self.engine.findPath(structs)

            # Route the cable
            self.engine.route(cable, *routes)

            # Also store the placement path based on the structures
            self.engine.buildPlacementGeometry(cable, structs)

    def routeDrop(self, cable, route):
        """
        Route a PON drop CABLE along ROUTE

        CABLE and ROUTE are database records"""

        struct1 = route._field("in_structure").rec()
        struct2 = route._field("out_structure").rec()

        forward = struct2.feature_type == "wall_box"

        with self.progress.operation("Routing drop cable", cable, ":", struct1, "->", struct2):
            self.engine.route(cable, (route, forward))
            self.engine.buildPlacementGeometry(cable, [struct1,struct2])

    def routeInternal(self, cable, struct_name):
        """
        Route an internal cable in STRUCT_NAME
        """

        from myworldapp.core.server.base.geom.myw_line_string import MywLineString

        struct = self.findStruct(struct_name)

        with self.progress.operation("Adding internal cable", cable, ":", struct):

            # Create segment
            seg_tab = self.db_view.table("mywcom_fiber_segment")

            seg = seg_tab.insertWith(
                cable=cable._urn(),
                housing=struct._urn(),
                root_housing=struct._urn(),
                in_structure=struct._urn(),
                out_structure=struct._urn(),
                directed=cable.directed,
            )

            # Set geometry
            coord = struct._field("location").geom().coord
            geom = MywLineString([coord, coord])
            seg._field("path").set(geom)
            cable._field("path").set(geom)
            cable._field("placement_path").set(geom)

    def findStruct(self, name):
        """
        Returns the structure identified by NAME
        """

        for feature_type in ("building", "mdu", "manhole", "cabinet", "pole", "wall_box"):
            table = self.db_view.table(feature_type)
            rec = table.filterOn("name", name).first()

            if rec:
                return rec

        raise MywError("Cannot find structure:", name)

    def findEquip(self, name):

        for feature_type in [
            "optical_node",
            "optical_node_closure",
            "coax_tap",
            "coax_terminator",
            "inline_equalizer",
            "two_way_splitter",
            "three_way_splitter",
            "coax_amplifier",
        ]:
            table = self.db_view.table(feature_type)
            rec = table.filterOn("name", name).first()

            if rec:
                return rec

        raise MywError("Cannot find equipment:", name)

    def addOffsetBetween(self, cable, equip1, equip2):
        """
        Add offset geometry for cable between two equipment features
        """

        with self.progress.operation(
            "Creating offset geom for", cable.name, ":", " -> ".join([equip1, equip2])
        ):
            rec1 = self.findEquip(equip1)
            rec2 = self.findEquip(equip2)

            pt1 = rec1._field("offset_geom").geom()
            pt2 = rec2._field("offset_geom").geom()

            cable._field("offset_geom").set(MywLineString([pt1, pt2]))
