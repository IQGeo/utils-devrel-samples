from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.modules.comms.server.api.network_view import NetworkView


class SlackEngine:
    """
    Engine to add cable slack objects
    """

    def __init__(self, db, trace_level):
        """
        Init slots of self
        """

        self.db_view = db.view()
        self.progress = MywSimpleProgressHandler(trace_level)

        self.structs = db.setting("mywcom.structures")
        self.cables = db.setting("mywcom.cables")

        self.cable_mgr = NetworkView(self.db_view, self.progress).cable_mgr

    def add_slack(self, struct_name, cable_name, length, side="in", **props):
        """
        Add a slack to cable CABLE_NAME at SIDE of STRUCT_NAME
        """

        self.progress(1, struct_name, ":", "Adding slack to", cable_name, "length=", length)

        # Find objects
        struct = self.find_struct(struct_name)
        cable = self.find_cable(cable_name)
        seg = self.find_segment(cable, struct, side)

        feature_type = "mywcom_fiber_slack"
        table = self.db_view.table(feature_type)
        det_slack = table._new_detached()
        det_slack.housing = struct._urn()
        det_slack.root_housing = struct._urn()
        det_slack.location = struct.location
        det_slack.length = length
        det_slack.cable = cable._urn()

        self.cable_mgr.addSlack(feature_type, det_slack, seg._urn(), side)

    def find_struct(self, name):
        """
        Returns the structure identified by NAME
        """
        # ENH: Share with design builder etc

        for feature_type in self.structs:
            tab = self.db_view.table(feature_type)
            if not "name" in tab.descriptor.fields:
                continue

            rec = tab.filterOn("name", name).first()
            if rec:
                return rec

        raise MywError("Cannot find structure:", name)

    def find_cable(self, name):
        """
        Returns the structure identified by NAME
        """
        # ENH: Share with design builder etc

        for feature_type in self.cables:
            tab = self.db_view.table(feature_type)

            rec = tab.filterOn("name", name).first()
            if rec:
                return rec

        raise MywError("Cannot find cable:", name)

    def find_segment(self, cable, struct, side="in"):
        """
        Returns the segment of CABLE on side 'in' of STRUCT
        """
        # ENH: Share with design builder etc

        struct_field = {"in": "out_structure", "out": "in_structure"}

        tab = self.db_view.table("mywcom_fiber_segment")

        pred = (tab.field("cable") == cable._urn()) & (
            tab.field(struct_field[side]) == struct._urn()
        )

        segs = tab.filter(pred).all()

        if len(segs) > 0:
            return sorted(segs, key=lambda rec: rec.id)[0]

        raise MywError(cable, "Cannot find cable segment at:", struct)


# ==============================================================================
#
# ==============================================================================
# pylint: disable=undefined-variable
engine = SlackEngine(db, 1)

engine.add_slack("WH-M-12", "WH-FCB-001", 30, "in")
engine.add_slack("WH-M-10", "WH-FCB-001", 40, "in")  # For conflict test
engine.add_slack("WH-M-13", "WH-FCB-002", 25, "in")  # For delete structure test
engine.add_slack("WH-M-35", "WH-FCB-003", 9, "in")  # For move structure test
engine.add_slack("WH-C-03", "WH-FCB-003", 12, "in")
engine.add_slack("WH-M-28", "WH-FCB-005", 125, "in")
engine.add_slack("WH-M-28", "BB-FCB-017", 90, "in")
engine.add_slack("WH-M-47", "WH-FCB-004", 140, "in")
engine.add_slack("WH-M-252", "WH-FCB-021", 40, "out")
engine.add_slack("WH-M-99", "WH-FCB-021", 87, "out")
engine.add_slack("WH-M-26", "WH-FCB-006", 8, "in")
engine.add_slack("WH-M-26", "WH-FCB-006", 8, "in")
engine.add_slack("WH-M-253", "WH-FCB-009", 6, "in")  # For move structure test (circuits)
engine.add_slack("WH-M-253", "WH-FCB-010", 7, "out")
engine.add_slack("WH-M-27", "BB-FCB-017", 5, "in")
engine.add_slack("WH-M-29", "BB-FCB-017", 5, "out")
engine.add_slack("WH-M-32", "BB-FCB-017", 5, "in")
engine.add_slack("WH-M-33", "BB-FCB-017", 5, "in")

engine.add_slack("Gladeside", "DROP-144", 20)
# engine.add_slack('Gladeside', 'WH-INT-22', 1)
# engine.add_slack('Gladeside', 'WH-INT-20', 1, False, True)
