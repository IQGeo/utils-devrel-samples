# Copyright: IQGeo Limited 2010-2023

import traceback
from collections import defaultdict
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_point import MywPoint

from myworldapp.modules.comms.server.api.conn import Conn
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.base.readonly_feature_view import (
    ReadonlyFeatureView,
)
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.base.geom_utils import GeomUtils

from .integrity_error import IntegrityError


class DataValidator:
    """
    Engine for checking network data consistency
    """

    def __init__(self, db_view, polygon=None, progress=MywProgressHandler()):
        """
        Init slots of self

        Optional POLYGON limits the area checked by .run()

        DB_VIEW is a MywFeatureView"""

        # ENH: Move validation code to managers?

        # Init slots
        self.db_view = ReadonlyFeatureView(db_view)  # Cached for speed
        self.polygon = polygon
        self.progress = progress

        self.categories = {}
        self.validators = {}
        self.errors = {}  # A nested dict keyed on feature, keyed on field

        # Get managers
        self.nw_view = NetworkView(self.db_view)

        # Build validator lookup table
        self.add_category("routes", self.check_route, self.nw_view.routes)
        self.add_category("conduits", self.check_conduit, self.nw_view.conduits)
        self.add_category("conduit_runs", self.check_conduit_run, self.nw_view.conduit_runs)
        self.add_category("equips", self.check_equip, self.nw_view.equips)
        self.add_category("cables", self.check_cable, self.nw_view.cables)
        self.add_category("segments", self.check_segment, self.nw_view.segments)
        self.add_category("connections", self.check_connection, self.nw_view.connections)
        self.add_category("circuits", self.check_circuit, self.nw_view.circuits)
        self.add_category("line_of_counts", self.check_line_of_count, self.nw_view.line_of_counts)

    def add_category(self, category, meth, feature_types):
        """
        Add validator METH for FEATURE_TYPES
        """

        self.categories[category] = sorted(feature_types)

        for feature_type in feature_types:
            self.validators[feature_type] = meth

    def run(self, categories=None):
        """
        Validate all network records in self's view

        Optional categories in a list of categories to check (default: all)

        Returns a list of IntegrityErrors"""
        # ENH: Support incremental check

        # Deal with defaults
        if categories is None:
            categories = self.categories.keys()

        self.progress(5, "Validating:", *categories)

        # Check requested categories (in top-down order)
        for category in self.categories:
            if category in categories:
                self.check_category(category)

        return self.errors

    def check_category(self, category):
        """
        Runs validator for all features of category
        """

        with self.progress.operation("Checking", category) as stats:
            feature_types = self.categories[category]

            for feature_type in feature_types:
                tab = self.db_view.table(feature_type)
                meth = self.validators[feature_type]

                # Build query
                recs = tab
                if self.polygon:
                    geom_field = tab.field(tab.descriptor.primary_geom_name)
                    recs = recs.filter(geom_field.geomIntersects(self.polygon))

                # Check records
                # ENH: Find a way to include bad record count in stats ... without losing rate
                stats["n_recs"] = 0
                for rec in recs.orderBy("id"):
                    self._check(rec, meth)
                    stats["n_recs"] += 1

    def check(self, rec):
        """
        Validate REC (if it is something we recognise)
        """

        meth = self.validators.get(rec.feature_type)

        if meth:
            self._check(rec, meth)

    def _check(self, rec, meth):
        """
        Run method METH on REC, handling errors

        Returns number of integrity errors found"""

        orig_n_errs = len(self.errors)

        try:
            meth(rec)

        except Exception as cond:
            self.progress("error", rec, ":", cond, traceback=traceback)
            self.error(rec, "", "validation_failed", error=str(cond))

        return len(self.errors) - orig_n_errs

    # ------------------------------------------------------------------------------
    #                                   FEATURE VALIDATION
    # ------------------------------------------------------------------------------

    def check_route(self, route):
        """
        Check route ROUTE
        """

        self.progress(4, "Checking", route)

        # Check referenced objects exist
        in_struct = self.check_reference(route, "in_structure", False)
        out_struct = self.check_reference(route, "out_structure", False)

        # Check geometry
        geom = self.check_geometry(route)
        if geom:
            if in_struct:
                self.check_coord(route, "in_structure", geom.coords[0], in_struct)
            if out_struct:
                self.check_coord(route, "out_structure", geom.coords[-1], out_struct)

    def check_conduit(self, cnd):
        """
        Check conduit CND
        """

        self.progress(4, "Checking", cnd)

        # Check mandatory references exist
        housing = self.check_reference(cnd, "housing")
        root_housing = self.check_reference(cnd, "root_housing")
        if not housing:
            return

        if "root_housing" in housing._descriptor.fields:
            self.check_derived_field(cnd, "root_housing", housing, "root_housing")
        else:
            self.check_derived_field(cnd, "root_housing", housing)

        # Check derived references and geom matches housing
        geom = self.check_derived_geom_and_structs(cnd, housing)

        # If continuous .. check prev/next links
        if "out_conduit" in cnd._descriptor.fields:

            # Check next/prev
            self.check_conduit_link(cnd, "in")
            self.check_conduit_link(cnd, "out")

            # Check conduit run is set
            if "conduit_run" in cnd._descriptor.fields:
                conduit_run = self.check_reference(cnd, "conduit_run")

    def check_conduit_link(self, cnd, side):
        """
        Check the two-way chain reference at SIDE of CND
        """

        struct_field = side + "_structure"
        field = side + "_conduit"

        # Get structure at which side is located
        struct_urn = cnd[struct_field]

        # Get next conduit at that structure
        next_cnd = self.check_reference(cnd, field, False)
        if not next_cnd:
            return

        # Find field of next_cnd that should point to us
        if next_cnd.in_structure == struct_urn:
            back_ref_field = "in_conduit"
        elif next_cnd.out_structure == struct_urn:
            back_ref_field = "out_conduit"
        else:
            struct = cnd._field(struct_field).rec()
            self.error(cnd, field, "broken_chain", at=struct._title(), _ref=cnd[field])
            return next_cnd

        # Check back ref points to self
        if next_cnd[back_ref_field] != cnd._urn():
            struct = cnd._field(struct_field).rec()
            self.error(cnd, field, "broken_chain", at=struct._title(), _ref=cnd[field])
            return next_cnd

        return next_cnd

    def check_conduit_run(self, cnd_run):
        """
        Check conduit run CND_RUN
        """

        self.progress(4, "Checking", cnd_run)
        conduit_mgr = self.nw_view.conduit_mgr

        conduits = cnd_run._field("conduits").recs()

        # Check has at least one conduit
        if not conduits:
            self.error(cnd_run, "conduits", "no_conduits")
            return

        # Check geometry set
        run_geom = self.check_geometry(cnd_run)
        if not run_geom:
            return

        # Check geometry matches conduits
        cnd_chain = conduit_mgr.conduitChain(conduits[0])
        expected_geom = conduit_mgr.calcConduitRunGeom(cnd_chain)

        # Compare geometry, allows reverse
        self.check_geometry_matches(cnd_run, "conduits", expected_geom, True)

    def check_equip(self, equip):
        """
        Check equipment record EQUIP
        """

        self.progress(4, "Checking", equip)

        # Check mandatory referenced records exist
        housing = self.check_reference(equip, "housing")
        root_housing = self.check_reference(equip, "root_housing")
        if not housing:
            return

        # Check other derived fields
        if "root_housing" in housing._descriptor.fields:
            self.check_derived_field(equip, "root_housing", housing, "root_housing")
        else:
            self.check_derived_field(equip, "root_housing", housing)

        # Check geom matches housing
        geom = self.check_geometry(equip)
        if geom:
            self.check_derived_geom(equip, housing, geom)

    def check_cable(self, cable):
        """
        Check cable record CABLE
        """

        self.progress(4, "Checking", cable)

        # Check mandatory fields
        directed = self.check_field(cable, "directed")

        # Check geometry set
        geom = self.check_geometry(cable)

        # TODO: Check geometry matches segments

    def check_segment(self, seg):
        """
        Check cable segment SEG
        """

        self.progress(4, "Checking", seg)

        # Check mandatory referenced records exist
        housing = self.check_reference(seg, "housing")
        root_housing = self.check_reference(seg, "root_housing")
        cable = self.check_reference(seg, "cable")
        in_struct = self.check_reference(seg, "in_structure")
        out_struct = self.check_reference(seg, "out_structure")
        in_equip = self.check_reference(seg, "in_equipment", False)
        out_equip = self.check_reference(seg, "out_equipment", False)

        # Check prev/next records exist
        in_seg = self.check_twoway_reference(seg, "in_segment", "out_segment", False)
        out_seg = self.check_twoway_reference(seg, "out_segment", "in_segment", False)

        # Check derived properties
        if cable:
            self.check_derived_field(seg, "directed", cable, "directed")

        # Check geometry set
        geom = self.check_geometry(seg)

        # Check derived references
        if not housing:
            return

        # Check root_housing matches that of housing
        if "root_housing" in housing._descriptor.fields:
            self.check_derived_field(seg, "root_housing", housing, "root_housing")
        else:
            self.check_derived_field(seg, "root_housing", housing)

        # Check in/out structures and geometry match those of housing
        internal = seg.in_structure == seg.out_structure  # ENH: Better to check root_housing type?
        if internal:
            self.check_derived_geom(seg, housing, geom, forward=seg.forward)
        else:
            self.check_derived_geom_and_structs(seg, housing)

        # Check equipment at either end matches geom
        if in_equip:
            self.check_derived_field(seg, "in_structure", in_equip, "root_housing")
        if out_equip:
            self.check_derived_field(seg, "out_structure", out_equip, "root_housing")

        # Check geometry start and end joins to prev/next seg
        if in_seg:
            self.check_coord(seg, "in_segment", geom.coords[0], in_seg, "out")
        if out_seg:
            self.check_coord(seg, "out_segment", geom.coords[-1], out_seg, "in")

        # Check tick marks of seg dont overlap in_seg and out_seg
        if in_seg and out_seg:
            self.check_tick_marks(seg, in_seg, out_seg)

        # Check containment matches adjacent segs
        if in_seg:
            self.check_derived_field(seg, "in_equipment", in_seg, "out_equipment")
        if out_seg:
            self.check_derived_field(seg, "out_equipment", out_seg, "in_equipment")

    def check_connection(self, conn_rec):
        """
        Check relational and geometric consistency of connection CONN_REC
        """

        conn = Conn(conn_rec)
        self.progress(4, "Checking connection", conn_rec, conn)

        # Get geometry
        geom = self.check_geometry(conn_rec)

        # Check referenced features exist
        in_feature = self.check_connection_side(conn_rec, conn, "in")
        out_feature = self.check_connection_side(conn_rec, conn, "out")

        # Check pin ranges sane
        from_pins_valid = conn.from_pins.size > 0
        in_fields = ["in_low", "in_high"]
        out_fields = ["out_low", "out_high"]

        (housing_title, struct_title) = self._getHousingAndRootHousingTitle(conn_rec)

        if not from_pins_valid:
            error = "bad_pin_range" if conn.is_from_cable else "bad_port_range"
            for field in in_fields:
                self.error(
                    conn.conn_rec,
                    field,
                    error,
                    side="in",
                    connection=conn.description(),
                    range=conn.from_pins.spec,
                    housing=housing_title,
                    struct=struct_title,
                )

        to_pins_valid = conn.to_pins.size > 0
        if not to_pins_valid:
            error = "bad_pin_range" if conn.is_to_cable else "bad_port_range"
            for field in out_fields:
                self.error(
                    conn.conn_rec,
                    field,
                    error,
                    side="out",
                    connection=conn.description(),
                    range=conn.to_pins.spec,
                    housing=housing_title,
                    struct=struct_title,
                )

        # Check pin range sizes match (avoiding duplicate error if not sane)
        if from_pins_valid and to_pins_valid and conn.from_pins.size != conn.to_pins.size:
            fields = in_fields + out_fields
            for field in fields:
                self.error(
                    conn.conn_rec,
                    field,
                    "pin_range_mismatch",
                    connection=conn.description(),
                    in_size=conn.from_pins.size,
                    out_size=conn.to_pins.size,
                    housing=housing_title,
                    struct=struct_title,
                )

        # Check housing exists
        housing = self.check_reference(conn_rec, "housing")

        # Check matches housing
        if housing:
            if "root_housing" in housing._descriptor.fields:
                self.check_derived_field(conn_rec, "root_housing", housing, "root_housing")
            else:
                self.check_derived_field(conn_rec, "root_housing", housing)

            self.check_derived_geom(conn_rec, housing, geom)

        # Check derived properties
        if in_feature and out_feature:
            if conn_rec.splice != conn.is_splice:
                self.error(
                    conn_rec,
                    "splice",
                    "derived_value_mismatch",
                    value=conn_rec.splice,
                    expected=conn.is_splice,
                )

    def check_connection_side(self, conn_rec, conn, side):
        """
        Check relational consistency of SIDE of CONN_REC
        """

        feature_field = side + "_object"
        pins_side_field = side + "_side"
        pins_low_field = side + "_low"
        pins_high_field = side + "_high"

        # Check target feature exists
        feature = self.check_reference(conn_rec, feature_field)
        conn_tech = self.nw_view.connections[conn_rec.feature_type].name
        if not feature:
            return

        # Check pins exist
        pins = PinRange(
            conn_rec[pins_side_field],
            conn_rec[pins_low_field],
            conn_rec[pins_high_field],
        )
        if self.nw_view.cable_mgr.isSegment(feature):
            self.check_fibers_exist(feature, pins, conn_rec, pins_high_field)
        else:
            self.check_ports_exist(feature, pins, conn_rec, pins_high_field, conn_tech)

        # Check no overlaps
        if self.nw_view.cable_mgr.isSegment(feature):
            field = side + "_structure"
        else:
            field = "n_{}_{}_ports".format(conn_tech, side)
        self.check_connection_unique(feature, pins, conn_rec, field)

        # Check connection root housing is valid root housing or end point for feature
        if self.nw_view.cable_mgr.isSegment(feature):
            self.check_segment_end(feature, conn_rec)
        else:
            self.check_derived_field(conn_rec, "root_housing", feature, "root_housing")

        return feature

    def check_segment_end(self, feature, conn_rec):
        """
        Check that segment FEATURE ends or starts at the root housing of the connection CONN_REC
        """
        housing = conn_rec.root_housing

        if feature.in_structure != housing and feature.out_structure != housing:
            self.error(
                conn_rec,
                "root_housing",
                "derived_value_mismatch",
                feature,
                value=housing,
                expected=f"{feature.in_structure} or {feature.out_structure}",
            )

    def check_connection_unique(self, feature, pins, conn_rec, field):
        """
        Check that CONN_REC is the only connection record that references PINS of FEATURE
        """
        # ENH: Prevent reporting both size when running full validation

        conn_tab = conn_rec._view.table(conn_rec.feature_type)
        feature_urn = feature._urn()

        for conn_side in ["in", "out"]:
            feature_field = conn_side + "_object"
            side_field = conn_side + "_side"
            low_field = conn_side + "_low"
            high_field = conn_side + "_high"

            pred = (
                (conn_tab.field(feature_field) == feature_urn)
                & (conn_tab.field(side_field) == pins.side)
                & (conn_tab.field(low_field) <= pins.high)
                & (conn_tab.field(high_field) >= pins.low)
                & (conn_tab.field("id") != conn_rec.id)
            )

            for clash_rec in conn_tab.filter(pred).orderBy("id"):
                housing = conn_rec._field("housing").rec()

                conn1 = Conn(conn_rec)
                conn2 = Conn(clash_rec)

                clash_pins = PinRange(
                    clash_rec[side_field], clash_rec[low_field], clash_rec[high_field]
                )
                overlap_pins = pins.intersect(clash_pins)

                if housing == feature and housing._descriptor.fields["housing"]:
                    housing = housing._field("housing").rec()

                (housing_title, struct_title) = self._getHousingAndRootHousingTitle(conn_rec)

                self.error(
                    feature,
                    field,
                    "duplicate_connection",
                    housing,
                    _conn1=conn_rec._urn(),
                    _conn2=clash_rec._urn(),
                    side=conn_side,
                    conn1=conn1.description(),
                    conn2=conn2.description(),
                    clash_pins=overlap_pins.spec,
                    housing=housing_title,
                    struct=struct_title,
                )

    def check_circuit(self, circuit, tech="fiber"):
        """
        check relational and geometric consistency of circuit
        """

        self.progress(4, "Checking", circuit)
        circuit_mgr = self.nw_view.circuit_mgr

        # Check referenced features exiits
        in_feature = self.check_reference(circuit, "in_feature", mandatory=False)
        out_feature = self.check_reference(circuit, "out_feature", mandatory=False)

        # Check pin ranges
        if in_feature and circuit.in_pins:
            pins = PinRange.parse(circuit.in_pins)
            self.check_ports_exist(in_feature, pins, circuit, "in_pins")

        if out_feature and circuit.out_pins:
            pins = PinRange.parse(circuit.out_pins)
            self.check_ports_exist(out_feature, pins, circuit, "out_pins")

        # Check circuit path
        # Note: Does not check matches segments as geom is not currently maintained on split
        segs = circuit_mgr.cableSegmentsOf(circuit, tech)
        if segs:
            self.check_geometry(circuit)

    def check_line_of_count(self, loc_record):
        """
        Check validatory of line of count record
        """

        self.progress(4, "Checking", loc_record)

        if loc_record.feature_type == "mywcom_line_of_count_section":
            self._check_line_of_count_section(loc_record)
        else:
            self._check_line_of_count(loc_record)

    def _check_line_of_count_section(self, loc_record):
        """
        Check line of count section
        """

        self.check_reference(loc_record, "container", mandatory=True)
        self.check_reference(loc_record, "line_of_count", mandatory=True)

        # Check section geometry against container's geometry
        container = loc_record._field("container").rec()
        container_geom = container._primary_geom_field.geom()
        self.check_geometry_matches(loc_record, "container", container_geom)

        # ENH: Add check for loc assignment overlap. This could be expensive. Is there
        # a simpler quicker test?

    def _check_line_of_count(self, loc_record):
        """
        Check line of count recorod
        """

        self.check_reference(loc_record, "origin", mandatory=True)

        # Check that line of count is not stale
        if loc_record.stale:
            self.error(loc_record, "", "loc_stale", loc_record, value=loc_record.stale)

        # Check that physical and logical ranges (per name) don't overlap with other
        # line of count records at the same origin

        loc_table = self.db_view.table(loc_record.feature_type)
        loc_recs = loc_table.filterOn("origin", str(loc_record.origin))

        l_range = PinRange("in", loc_record.low_logical, loc_record.high_logical)
        p_range = PinRange("in", loc_record.low_physical, loc_record.high_physical)

        for rec in loc_recs:
            if rec == loc_record:
                continue
            other_l_range = PinRange("in", rec.low_logical, rec.high_logical)
            other_p_range = PinRange("in", rec.low_physical, rec.high_physical)

            if (
                rec.name == loc_record.name
                and not rec.physical
                and not loc_record.physical
                and rec.name
            ):
                if l_range.intersect(other_l_range):
                    self.error(
                        loc_record,
                        "",
                        "loc_overlap",
                        rec,
                        value=rec,
                    )

            if p_range.intersect(other_p_range):
                self.error(
                    loc_record,
                    "",
                    "loc_overlap",
                    rec,
                    value=rec,
                )

    # ------------------------------------------------------------------------------
    #                                    HELPERS
    # ------------------------------------------------------------------------------

    def _getHousingAndRootHousingTitle(self, rec):
        """
        Get title of REC and title of root_housing of REC
        """

        housing_title = None
        struct_title = None
        if rec:
            if "housing" in rec._descriptor.fields:
                housing = rec._field("housing").rec()
                if housing:
                    housing_title = housing._title()

            if "root_housing" in rec._descriptor.fields:
                struct = rec._field("root_housing").rec()
                if struct:
                    struct_title = struct._title()

        return (housing_title, struct_title)

    def check_derived_geom_and_structs(self, rec, housing):
        """
        Checks properties in_structure, out_structure and geometry match HOUSING

        REC is a conduit or cable_segment"""

        # Determine direction relative to housing
        rec_forward = rec.forward if "forward" in rec._descriptor.fields else True
        housing_forward = housing.forward if "forward" in housing._descriptor.fields else True
        same_dir = rec_forward == housing_forward

        # Check structures refs
        if same_dir:
            self.check_derived_field(rec, "in_structure", housing, "in_structure")
            self.check_derived_field(rec, "out_structure", housing, "out_structure")
        else:
            self.check_derived_field(rec, "in_structure", housing, "out_structure")
            self.check_derived_field(rec, "out_structure", housing, "in_structure")

        # Check geometry
        geom = self.check_geometry(rec)
        if geom:
            self.check_derived_geom(rec, housing, geom, forward=same_dir)

        return geom

    def check_fibers_exist(self, seg, pins, feature, field=None):
        """
        Check that cable segment SEG has pins PINS
        """

        tech = self.nw_view.segments[seg.feature_type].name

        cable = seg._field("cable").rec()  # ENH: Handle field not found
        if not cable:
            return

        count_field_name = self.nw_view.networks[tech].cable_n_pins_field

        cable_pins = PinRange(
            "in", 1, cable[count_field_name]
        )  # ENH: Get from connectivity manager

        (housing_title, struct_title) = self._getHousingAndRootHousingTitle(feature)

        if not pins in cable_pins:
            if not field:
                field = pins.side + "_structure"
            self.error(
                feature,
                field,
                "pins_out_of_range",
                ref_rec=cable,
                pins=pins.rangeSpec(),
                cable_pins=cable_pins.rangeSpec(),
                housing=housing_title,
                struct=struct_title,
            )

    def check_ports_exist(self, equip, pins, feature, field, tech="fiber"):
        """
        Check that pin range on FEATURE is in range of EQUIP
        """

        (housing_title, struct_title) = self._getHousingAndRootHousingTitle(equip)

        equip_pins = self.nw_view.networks[tech].pinsOn(equip, pins.side)
        if pins and equip_pins and not pins in equip_pins:
            self.error(
                feature,
                field,
                "port_out_of_range",
                ref_rec=equip,
                ports=pins.spec,
                equip_ports=equip_pins.spec,
                housing=housing_title,
                struct=struct_title,
            )

    def check_tick_marks(self, seg, in_seg, out_seg):
        """
        Checks that tick_marks of SEG do not overlap IN_SEG AND OUT_SEG
        """

        # Check in_tick
        ticks = [in_seg.out_tick, seg.in_tick, out_seg.in_tick]
        ticks = [tick for tick in ticks if tick is not None]  # Remove None from list
        sorted_ticks = sorted(ticks)

        # Check ticks are the same forwards or backwards
        if not sorted_ticks == ticks and not sorted_ticks == ticks[::-1]:
            next_seg = out_seg if seg.forward else in_seg
            self.error(
                seg,
                "in_tick",
                "tick_mark_invalid",
                invalid_tick=seg.in_tick,
                overlap_seg=next_seg._title(),
            )

        # Check out_tick
        ticks = [in_seg.out_tick, seg.out_tick, out_seg.in_tick]
        ticks = [tick for tick in ticks if tick is not None]  # Remove None from list
        sorted_ticks = sorted(ticks)

        # Check ticks are the same forwards or backwards
        if not sorted_ticks == ticks and not sorted_ticks == ticks[::-1]:
            next_seg = out_seg if seg.forward else in_seg
            self.error(
                seg,
                "out_tick",
                "tick_mark_invalid",
                invalid_tick=seg.out_tick,
                overlap_seg=next_seg._title(),
            )

    def check_derived_field(self, rec, field, parent_rec, parent_field=None):
        """
        Check value of REC.FIELD matches PARENT_REC.PARENT_FIELD

        If PARENT_FIELD omitted, checks REC.FIELD contains URN of PARENT_REC"""

        # Check expected value
        if parent_field:
            parent_value = parent_rec[parent_field]
        else:
            parent_value = parent_rec._urn()

        # Check actual value
        value = rec[field]

        if value != parent_value:
            self.error(
                rec,
                field,
                "derived_value_mismatch",
                parent_rec,
                parent_field,
                value=value,
                expected=parent_value,
            )

    def check_derived_geom(self, rec, parent_rec, geom, ref_field="housing", forward=True):
        """
        Check geometry of REC matches that of PARENT_REC
        """

        if geom.geom_type == "Point":
            self.check_coord(rec, ref_field, geom.coords[0], parent_rec)
        else:
            self.check_linestring(rec, parent_rec, geom, ref_field, forward)

    def check_geometry_matches(self, feature, seg_field, expected_geom, allow_reverse=False):
        """
        Check primary geometry of FEATURE matches EXPECTED_GEOM

        ALLOW_REVERSE - if True then geometry considered a match if coords match forwards or backwards
        """

        geom = self.check_geometry(feature)

        if not geom:
            return

        coords = list(geom.coords)
        expected_coords = list(expected_geom.coords)

        ok = coords == expected_coords

        if not ok and allow_reverse:
            expected_coords.reverse()
            ok = coords == expected_coords

        if not ok:
            self.error(
                feature,
                feature._descriptor.primary_geom_name,
                "geom_mismatch",
                ref=seg_field,
            )

    def check_linestring(self, rec, parent_rec, geom, ref_field="housing", forward=True):
        """
        Checks all coords of GEOM match PARENT_REC
        """

        # Get geometry of housing
        ref_geom = parent_rec._primary_geom_field.geom()
        if not ref_geom:
            return

        # Get housing coords
        coords = list(ref_geom.coords)
        if not forward:
            coords = coords[::-1]

        # Hack for internal segments
        if ref_geom.geom_type == "Point":
            coords.append(coords[0])

        # Check for different number of coords
        if len(coords) != len(geom.coords):
            self.error(
                rec,
                rec._primary_geom_field.name,
                "geom_size_mismatch",
                _ref=ref_field,
                ref_rec=parent_rec,
                n_coords=len(coords),
                n_expected=len(geom.coords),
            )
            return

        # Check coords match
        for index, ref_coord in enumerate(coords):
            coord = geom.coords[index]

            if coord != ref_coord:
                self.error(
                    rec,
                    rec._primary_geom_field.name,
                    "geom_mismatch_at",
                    _ref=ref_field,
                    ref_rec=parent_rec,
                    _coord=coord,
                    _expected_coord=ref_coord,
                )
                return

    def check_coord(self, rec, ref_field, coord, ref_rec, ref_side=None):
        """
        Check COORD of REC is coincident with SIDE of REF_REC
        """

        # Get geometry of referenced rec
        ref_geom = ref_rec._primary_geom_field.geom()
        if not ref_geom:
            return

        # Get coordinate to match
        if ref_side:
            ref_coord = self.coord_for(ref_geom, ref_side)
        else:
            ref_coord = ref_geom.coords[0]

        # Do the check
        if coord != ref_coord:
            self.error(
                rec,
                rec._primary_geom_field.name,
                "geom_mismatch_at",
                _ref=ref_field,
                ref_rec=ref_rec,
                ref_side=ref_side,
                _coord=coord,
                _expected_coord=ref_coord,
            )

    def coord_for(self, geom, side):
        """
        The coordinate at SIDE of linestring GEOM
        """

        if side == "in":
            return geom.start_point.coord
        if side == "out":
            return geom.end_point.coord
        raise MywError("Bad side:", side)

    def check_geometry(self, rec, field=None):
        """
        Get the primary geometry of REC (if set)

        If optional FIELD is set, get geometry from that field instead"""

        if not field:
            field = rec._primary_geom_field.name

        geom = rec._field(field).geom()
        if not geom:
            self.error(rec, field, "not_set")

        return geom

    def check_twoway_reference(self, rec, field, backref_field, mandatory=True):
        """
        Check the bi-direction link REC.FIELD

        BACKREF_FIELD is the field on the referenced rec that
        should point to REC"""

        # Check the forward reference
        to_rec = self.check_reference(rec, field, mandatory)
        if not to_rec:
            return

        # Check the back reference
        # ENH: Quicker just to check the ref ... but need to handle urn and foreign key
        back_rec = to_rec._field(backref_field).rec()
        if back_rec != rec:
            self.error(
                rec,
                field,
                "broken_chain",
                _ref=rec[field],
                back_ref=to_rec[backref_field],
            )

        return to_rec

    def check_reference(self, rec, field, mandatory=True):
        """
        Check rec referenced by REC.FIELD exists
        """

        # Check for not set
        if not rec[field]:
            if mandatory:
                self.error(rec, field, "not_set")
            return None

        # Check reference is good
        ref_rec = rec._field(field).rec()
        if not ref_rec:
            self.error(rec, field, "referenced_record_missing", ref=rec[field])

        return ref_rec

    def check_field(self, rec, field):
        """
        Checks that mandatory field FIELD is not null
        """

        val = rec[field]

        if val == None:
            self.error(rec, field, "not_set")

        return val

    def error(self, rec, field, problem_type, ref_rec=None, ref_field=None, **data):
        """
        Report a problem

        Data is a list of additional properties. Keys starting with '_' are hidden in GUI"""

        item = IntegrityError(
            rec, field, problem_type, ref_rec=ref_rec, ref_field=ref_field, **data
        )

        self.progress(0, item)
        for prop in sorted(data):
            val = data[prop]
            self.progress(2, " ", prop, ":", val)

        if rec._urn() not in self.errors:
            self.errors[rec._urn()] = {}

        self.errors[rec._urn()][field] = item
