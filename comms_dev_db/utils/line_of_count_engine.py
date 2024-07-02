# Copyright: IQGeo Limited 2010-2023

import json
from myworldapp.core.server.base.geom.myw_multi_line_string import MywMultiLineString
from myworldapp.core.server.base.geom.myw_line_string import MywLineString


class LineOfCountEngine:
    """
    Utility for creating line of count information in dev db
    """

    def __init__(self, db_view, nw_view):
        self.db_view = db_view
        self.nw_view = nw_view

    def add_loc_rec(self, props):

        loc_table = self.db_view.table("mywcom_line_of_count")

        loc_rec = loc_table.insertWith(**props)

        return loc_rec

    def add_loc_for_cable(self, name, seg_range, mapping_range, loc_rec):

        cable_rec = self.find_by_name(["copper_cable", "fiber_cable"], name)
        ordered_segs = self.nw_view.cable_mgr.orderedSegments(cable_rec)
        if seg_range:
            ordered_segs = [ordered_segs[i] for i in seg_range]

        for seg in ordered_segs:
            self.add_loc_for(seg, seg._urn(), mapping_range, mapping_range, loc_rec)

    def add_loc_for_equip(self, urn, mapping_domain, mapping_range, loc_rec):

        feature = self.db_view.get(urn)

        if not feature:
            print("Could not find feature for urn", urn)

        self.add_loc_for(feature, urn, mapping_domain, mapping_range, loc_rec)

    def add_loc_for(self, seg, seg_urn, mapping_domain, mapping_range, loc_rec):

        print("Add loc", seg, seg_urn, mapping_range, loc_rec)

        loc_section_table = self.db_view.table("mywcom_line_of_count_section")

        mapping = {}
        for (x, y) in zip(mapping_domain, mapping_range):
            mapping[x] = y

        low = mapping_range[0]
        high = mapping_range[-1]

        props = {
            "line_of_count": loc_rec.id,
            "label": f"WH-1 [{low}-{high}] Active",
            "container": seg_urn,
            "mapping": json.dumps(mapping),
            "forward": True,
        }
        loc_section = loc_section_table.insertWith(**props)
        geom = seg._primary_geom_field.geom()
        loc_section._primary_geom_field.set(geom)

    def find_by_name(self, feature_types, name):
        """
        Returns the structure identified by NAME
        """

        for feature_type in feature_types:
            tab = self.db_view.table(feature_type)
            if not "name" in tab.descriptor.fields:
                continue

            rec = tab.filterOn("name", name).first()
            if rec:
                return rec

    def set_loc_geom(self, loc_rec):

        geoms = []
        for loc_section in loc_rec._field("loc_sections").recs():
            geom = loc_section._primary_geom_field.geom()
            if geom.geom_type == "Point":
                geom = MywLineString([geom, geom])
            geoms.append(geom)

        loc_rec._primary_geom_field.set(MywMultiLineString(geoms))
