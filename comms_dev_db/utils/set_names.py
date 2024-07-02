# Set obejct names based on the service area they are in

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler


class NameBuilder:
    """
    Engine for constructing object names based on the service area they are in
    """

    fmts = {
        "rack": "{}-R-{:02}",
        "fiber_shelf": "{}-S-{:03}",
        "slot": "{}-SL-{:04}",
        "splice_closure": "{}-SC-{:03}",
        "fiber_patch_panel": "{}-ODF-{:02}",
        "manhole": "{}-M-{:02}",
        "cabinet": "{}-C-{:02}",
        "pole": "{}-P-{:03}",
        "wall_box": "{}-{:04}",
        "fiber_olt": "{}-OLT-{:03}",
        "fiber_mux": "{}-MUX-{:03}",
        "fiber_splitter": "{}-SPL-{:03}",
        "fiber_tap": "{}-FT-{:03}",
        "fiber_ont": "{}-ONT-{:03}",
        "optical_node": "{}-ON-{:03}",
        "optical_node_closure": "{}-ONC-{:03}",
        "coax_tap": "{}-CTAP-{:03}",
        "coax_terminator": "{}-CT-{:03}",
        "inline_equalizer": "{}-IE-{:03}",
        "two_way_splitter": "{}-2WSPL-{:03}",
        "three_way_splitter": "{}-3WSPL-{:03}",
        "coax_amplifier": "{}-A-{:03}",
    }

    def __init__(self, db, trace_level):
        """
        Init slots of self

        DB is a MywDatabase"""

        from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine

        self.db_view = db.view()
        self.progress = MywSimpleProgressHandler(trace_level)

    def setNamesFor(self, feature_type):
        """
        Set names for objects of type FEATURE_TYPE
        """

        with self.progress.operation("Setting names for", feature_type):

            table = self.db_view.table(feature_type)

            for rec in table:
                if not rec.name:
                    rec.name = self.nameFor(rec)
                    table.update(rec)

    def nameFor(self, rec):
        """
        Construct the name for rec (based on its feature type and service area)
        """

        sa_code = self.serviceAreaCodeFor(rec)

        fmt = self.fmts[rec.feature_type]

        return fmt.format(sa_code, rec.id)

    def serviceAreaCodeFor(self, struct):
        """
        The name of the service area that contains STRUCT (if there is one)
        """

        pnt = struct._field("location").geom()

        tab = self.db_view["service_area"]
        pred = tab.field("boundary").geomCovers(pnt)

        sa_rec = tab.filter(pred).first()

        if not sa_rec:
            return "XX"

        return sa_rec.name


# ==============================================================================
#
# ==============================================================================

# pylint: disable=undefined-variable
engine = NameBuilder(db, 1)

for feature_type in sorted(engine.fmts):
    engine.setNamesFor(feature_type)
