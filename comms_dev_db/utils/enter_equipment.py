# Associate equipment to its containing structure (and name it)

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler


class ContainmentEngine:
    """
    Engine to build containment from spatial coincidence
    """

    def __init__(self, db, trace_level):
        """
        Init slots of self
        """

        self.db_view = db.view()
        self.progress = MywSimpleProgressHandler(trace_level)

    def setOwners(self, feature_type, housing_types):
        """
        Set housing property on equipment records FEATURE_TYPE
        """

        with self.progress.operation("Setting housings for:", feature_type):

            table = self.db_view.table(feature_type)
            for equip in table:
                self.progress(2, "Processing", equip)

                # Ensure has housing
                if equip.housing:
                    housing = equip._field("housing").rec()
                else:
                    housing = self.housingFor(equip, housing_types)

                    if not housing:
                        self.progress("warning", "Cannot find housing for", equip)
                        continue

                    self.progress(1, "Entered", equip, "->", housing)
                    equip.housing = housing._urn()

                # Set root_housing
                if "root_housing" in housing._descriptor.fields:
                    equip.root_housing = housing.root_housing
                else:
                    equip.root_housing = equip.housing

                # Set location (if necessary)
                if equip.location is None:
                    root_housing = equip._field("root_housing").rec()

                    if root_housing:
                        equip.location = root_housing.location
                    else:
                        self.progress("warning", "Cannot find root housing for", equip)

                table.update(equip)

    def housingFor(self, equip, housing_types):
        """
        Feature to act as housing for EQUIP (if any)
        """

        pnt = equip._primary_geom_field.geom()

        for feature_type in housing_types[::-1]:  # in reverse order, to get containment correct
            tab = self.db_view.table(feature_type)
            pred = tab.field("location").geomEquals(pnt)
            housing = tab.filter(pred).orderBy("id").first()

            if housing:
                return housing

        return None


# ==============================================================================
#
# ==============================================================================

struct_types = ["building", "mdu", "manhole", "cabinet", "pole", "wall_box"]

# pylint: disable=undefined-variable
engine = ContainmentEngine(db, 1)

engine.setOwners("floor", struct_types)
engine.setOwners("room", struct_types + ["floor"])
engine.setOwners("rack", struct_types)
engine.setOwners("fiber_shelf", struct_types + ["rack"])
engine.setOwners("slot", struct_types + ["rack", "fiber_shelf"])
engine.setOwners("splice_closure", struct_types + ["rack", "fiber_shelf", "slot"])
engine.setOwners("fiber_patch_panel", struct_types + ["room", "floor"])
engine.setOwners("fiber_olt", struct_types + ["rack", "fiber_shelf", "slot"])
engine.setOwners("fiber_mux", struct_types + ["splice_closure"])
engine.setOwners("fiber_splitter", struct_types + ["splice_closure"])
engine.setOwners("fiber_splice_tray", struct_types + ["splice_closure"])
engine.setOwners("fiber_ont", struct_types + ["room"])

for coax_equip in [
    "optical_node",
    "inline_equalizer",
    "two_way_splitter",
    "three_way_splitter",
    "optical_node_closure",
    "coax_terminator",
    "coax_tap",
    "coax_amplifier",
]:
    engine.setOwners(coax_equip, struct_types)
