# Copyright: IQGeo Limited 2010-2023

import json
from collections import defaultdict
from .manager import Manager
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.base.readonly_feature_view import (
    ReadonlyFeatureView,
)
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.core.server.base.geom.myw_multi_line_string import MywMultiLineString
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.core.myw_error import MywInternalError
from collections import defaultdict


class LOCManager(Manager):
    """
    Manager for maintaining line of count
    """

    def rippleTrace(self, feature_type, feature_id, tech="fiber", side=None, config = None):
        """
        Do a trace downstream and determine how pin mapping switches across connections

        Format of result is a dictionary keyed by feature URN qualified with side (when URN is for
        equipment). Entry in the dictionary are the feature as geojson, the side, and the mapping.
        The latter maps a strand at the origin to strands or ports at the feature.

        This information will be used by client to determine how to update segments
        and the calculation is independent of the data model used to store LOC information.

        """

        self.progress(2, f"rippleTrace from {feature_type}/{feature_id}")

        db_view = ReadonlyFeatureView(self.db_view)
        table = db_view.table(feature_type)
        rec = table.get(feature_id)

        loc_records = self.lineOfCountsFor(rec, side)

        tech = self.getTechFor(rec, side)
        pin_side = "in" if rec.feature_type in self.nw_view.segments else "out"
        pin_count = self.getPinCount(rec, tech, pin_side)

        if not pin_count:
            return ([], [])

        pins = PinRange(pin_side, 1, pin_count)

        # Do a downstream trace at the fiber/pair level
        network_def = self.db.config_manager.networkDef(f"mywcom_{tech}")
        network_engine = MywNetworkEngine.newFor(db_view, network_def)

        # ENH: For performance, should only trace on the source ranges from config provided
        root_node = network_engine.traceOutRaw(rec, pins, "downstream")

        # Add 'cross-connect' mappings at each node
        self._addTraceRipple(root_node)

        # Combine ripple information for each container
        result = self._combineContainerRipples(root_node)

        # Remove entries that don't overlap with the source ranges
        source_ranges = self._sourceRanges(config)

        new_result = {}

        for urn, details in result.items():
            mapping_keys = details["mapping"].keys()
            if not source_ranges or self._rangeOverlaps(source_ranges, mapping_keys):
                new_result[urn] = details

        loc_records_json = []
        for loc_record in loc_records:
            json_feature = loc_record.asGeojsonFeature()
            json_feature["bbox"] = []
            loc_records_json.append(json_feature)

        return {"features": new_result, "loc_records": loc_records_json}

    def _rangeOverlaps(self, source_ranges, mapping_keys):
        """
        Returns true if any of the mapping keys overlap with the source ranges
        """

        for source_range in source_ranges:
            for mapping_key in mapping_keys:
                if mapping_key in source_range:
                    return True

        return False

    def _sourceRanges(self, config):
        """
        Returns physical ranges from config
        """

        ranges = []

        if not config:
            return None
        
        p_low = 1
        for row in config:
            p_high = p_low + (row['high'] - row['low'])
            pinRange = PinRange('in', p_low , p_high)
            ranges.append(pinRange)
            p_low = p_high + 1

        return ranges

    def _parentPinOf(self, a_dict, find_value):
        """
        Reverse lookup from downstream to upstream pin
        """

        for a_key, a_value in a_dict.items():
            if find_value in a_value:
                return a_key

    def _allContainerRipples(self, root_node):
        """
        Return all ripple mappings and containers for a completed ripple trace
        starting from ROOT_NODE
        """

        stack = [root_node]
        container_ripples = []

        while stack:
            a_node = stack.pop()

            # Only include cable segments and equipment as loc containers
            if (
                a_node.feature.feature_type in self.nw_view.segments
                or a_node.feature.feature_type in self.nw_view.equips
            ):
                side = (
                    a_node.pins.side if a_node.feature.feature_type in self.nw_view.equips else None
                )

                container_ripples.append(
                    {
                        "feature": a_node.feature,
                        "mapping": a_node._ripple_mapping,
                        "side": side,
                        "seq": a_node._seq,
                    }
                )

            for child_node in a_node.children:
                if self.isRippleStopNode(child_node):
                    continue

                stack.append(child_node)

        return container_ripples

    def _combineContainerRipples(self, root_node):
        """
        Combine mapping information for each container
        """

        all_ripples = self._allContainerRipples(root_node)

        container_ripples = {}

        for ripple in all_ripples:
            feature = ripple["feature"]
            side = ripple["side"]
            mapping = ripple["mapping"]

            qurn = f"{feature._urn()}?side={side}" if side else feature._urn()

            # Get ripple entry for this container and if present merge current
            # mapping into it. Otherwise create new entry.
            combined_ripple = container_ripples.get(qurn)
            if combined_ripple:

                combined_mapping = combined_ripple["mapping"]

                for root_pin, fibers in mapping.items():

                    if not combined_mapping.get(root_pin, None):
                        combined_mapping[root_pin] = []

                    # Add fibers without duplicates
                    combined_mapping[root_pin] = list(set(combined_mapping[root_pin] + fibers))

                container_ripples[qurn]["mapping"] = combined_mapping
            else:
                container_ripples[qurn] = {
                    "qurn": qurn,
                    "feature": feature.asGeojsonFeature(),
                    "side": side,
                    "mapping": mapping,
                    "seq": ripple["seq"],
                }

        return container_ripples

    def _addTraceRipple(self, a_node):
        """
        For each node in the trace create ripple mapping that maps
        origin pin to pins at this node it connects to.
        """

        seq = [1]
        a_node._seq = seq
        stack = [a_node]

        while stack:
            a_node = stack.pop()

            self.addTraceRippleAtNode(a_node)
            cnum = 0
            for child_node in a_node.children:
                if self.isRippleStopNode(child_node):
                    continue

                child_node._seq = a_node._seq + [cnum]
                cnum += 1
                stack.append(child_node)

    def addTraceRippleAtNode(self, a_node):
        """
        Create a mapping that maps pin at start of ripple to pin at the node
        """

        if hasattr(a_node, "_ripple_mapping"):
            raise MywError("ripple_internal_error", a_node)

        if a_node.parent:
            # Get a mapping from the parent pins to our (child) pins
            parent_child_pin_map = {}
            for child_pin in a_node.pins.range():
                parent_pin = a_node.parent.pinFor(a_node, child_pin)
                if not parent_child_pin_map.get(parent_pin, None):
                    parent_child_pin_map[parent_pin] = []
                parent_child_pin_map[parent_pin].append(child_pin)

            # Now ripple down the pin mapping
            ripple_map = {}

            for parent_pin, child_pins in parent_child_pin_map.items():
                root_pin = self._parentPinOf(a_node.parent._ripple_mapping, parent_pin)

                if not ripple_map.get(root_pin, None):
                    ripple_map[root_pin] = []

                ripple_map[root_pin] += child_pins

            a_node._ripple_mapping = ripple_map

        else:
            # Create initial mapping
            default_map = {}
            for pin in a_node.pins.range():
                default_map[pin] = [pin]

            # And set as the rippled mapping (as it hasn't gone anywhere yet)
            a_node._ripple_mapping = default_map

    def isRippleStopNode(self, trace_node):
        """
        Returns true if LOC tracing should stop at the node
        """

        feature = trace_node.feature

        if not feature:
            return False

        root_housing = feature._field("root_housing").rec()

        # Stop when we hit 'out' side of equipment
        if getattr(feature, "stop_ripple", False) and trace_node.pins.side == "out":
            return True

        return getattr(root_housing, "stop_ripple", False)

    def getPinCount(self, feature, tech, side):
        """
        Get number of pins (fibers,pairs, ports etc) in FEATURE
        """

        techs = [tech] if tech else self.nw_view.networks.keys()
        for tech in techs:
            network_def = self.nw_view.networks[tech]
            if feature.feature_type == network_def.segment_type:
                cable = feature._field("cable").rec()
                count = cable._field(network_def.cable_n_pins_field).raw_value
                return count
            else:
                field_names = (
                    [f"n_{tech}_{side}_ports", f"n_{tech}_ports"] if side else [f"n_{tech}_ports"]
                )
                for field_name in field_names:
                    if hasattr(feature, field_name):
                        return feature._field(field_name).raw_value

    def getLocDetails(self, feature, side=None, pins=None, include_proposed=False):
        """
        Get line of count data for FEATURE. Return compressed list of loc assignments for each delta.
        Note that the compressed list doesn't correspond exactly to line of count sections as a section might
        have gaps in the physical pin range.
        """

        tech = self.getTechFor(feature, side)

        pin_count = self.getPinCount(feature, tech, side)
        if not pin_count:
            return []

        qurn = f"{feature._urn()}?side={side}" if side else feature._urn()

        # For each delta, Map from physical pin at section to logical pin assignment
        container_pins_deltas = defaultdict(lambda: defaultdict(list))

        for loc_section in self.lineOfCountSectionsFor(
            feature, side, include_proposed=include_proposed
        ):
            if hasattr(loc_section, "myw_change_type") and loc_section.myw_change_type == "delete":
                continue

            is_proposed = (
                hasattr(loc_section, "myw_delta") and loc_section.myw_delta != self.db_view.delta
            )

            if is_proposed:
                delta_owner = self.db_view.get(loc_section.myw_delta)
                delta_owner_title = delta_owner._title()
                container_pins = container_pins_deltas[loc_section.myw_delta]
            else:
                container_pins = container_pins_deltas[""]

            # Only for side if specified
            if side and qurn != loc_section.container:
                continue

            if loc_section.mapping:
                loc_feature_map = json.loads(loc_section.mapping)
            else:
                loc_feature_map = dict([(str(i), [i]) for i in range(1, pin_count + 1)])

            loc = loc_section._field("line_of_count").rec()

            # Ignore if LOC is missing or marked for deletion
            if not loc or loc.deleted:
                continue

            for physical_origin_pin in range(loc.low_physical, loc.high_physical + 1):
                physical_section_pins = loc_feature_map.get(str(physical_origin_pin), [])
                logical_origin_pin = loc.low_logical + (physical_origin_pin - loc.low_physical)

                if isinstance(physical_section_pins, int):
                    physical_section_pins = [physical_section_pins]

                for i in physical_section_pins:
                    loc_data = {
                        "name": loc.name,
                        "status": loc.status,
                        "count": logical_origin_pin,
                        "physical": loc.physical,
                        "origin": loc.origin,
                    }
                    if loc.physical:
                        loc_data["physical"] = loc.physical
                    if is_proposed:
                        loc_data["myw_delta"] = loc_section.myw_delta
                        loc_data["myw_delta_owner_title"] = delta_owner_title

                    container_pins[i] = loc_data

        for delta, pins in container_pins_deltas.items():
            loc_data = []
            for pin_num in sorted(pins.keys()):
                loc = pins[pin_num]
                loc["low"] = loc["count"]
                loc["high"] = loc["count"]
                loc["physical_low"] = pin_num
                del loc["count"]
                loc_data.append(loc)
            container_pins_deltas[delta] = self.compressLOC(loc_data)

        return container_pins_deltas

    def getLoc(self, feature, side=None, pins=None, include_proposed=False):
        """
        Get line of count data for FEATURE
        """

        p_map = {}

        tech = self.getTechFor(feature, side)

        pin_count = self.getPinCount(feature, tech, side)
        if not pin_count:
            return []

        loc_data = []

        qurn = f"{feature._urn()}?side={side}" if side else feature._urn()

        for loc_feature in self.lineOfCountSectionsFor(
            feature, side, include_proposed=include_proposed
        ):

            # Only for side if specified
            if side and qurn != loc_feature.container:
                continue

            if loc_feature.mapping:
                loc_feature_map = json.loads(loc_feature.mapping)
            else:
                loc_feature_map = dict([(i, [i]) for i in range(1, pin_count + 1)])

            loc = loc_feature._field("line_of_count").rec()

            # Ignore if LOC is missing or marked for deletion
            if not loc or loc.deleted:
                continue

            # Use the mapping and physical range on loc to add to p_map
            for origin_pin, feature_pins in loc_feature_map.items():
                if isinstance(feature_pins, int):
                    feature_pins = [feature_pins]

                for feature_pin in feature_pins:
                    if int(origin_pin) <= loc.high_physical and int(origin_pin) >= loc.low_physical:
                        loc_num = loc.low_logical + (int(origin_pin) - loc.low_physical)
                        p_map[int(feature_pin)] = (loc_num, loc, loc_feature)

        if pins:
            pin_range = range(pins.low, pins.high + 1)
        else:
            pin_range = range(1, pin_count + 1)

        for pin in pin_range:
            loc_info = p_map.get(pin)
            if loc_info:
                loc_cfg = {
                    "name": loc_info[1].name,
                    "status": loc_info[1].status,
                    "loc_section_ref": loc_info[2]._urn(),
                    "loc_ref": loc_info[1]._urn(),
                    "low": loc_info[0],
                    "high": loc_info[0],
                    "origin": loc_info[1].origin,
                    "forward": loc_info[2].forward,
                    "physical": loc_info[1].physical,
                }
                if loc_info[1].physical:
                    loc_cfg["physical"] = loc_info[1].physical

                if hasattr(loc_feature, "myw_delta"):
                    loc_cfg["myw_delta"] = loc_feature.myw_delta
                    loc_cfg["myw_change_type"] = loc_feature.myw_change_type
            else:
                loc_cfg = {"name": "", "status": "", "low": pin, "high": pin}

            loc_data.append(loc_cfg)

        compressed_loc_data = self.compressLOC(loc_data)

        # If last physical range is unassigned and has no status then don't return it
        if (
            compressed_loc_data
            and not compressed_loc_data[-1]["name"]
            and not compressed_loc_data[-1]["status"]
        ):
            compressed_loc_data = compressed_loc_data[:-1]

        return compressed_loc_data

    def getLocMany(self, feature_urns, include_proposed=False):
        """
        Get LOC information for multiple features. Dictionary indexed by URN.

        We don't get LOC for proposed features but do get proposed LOC for existing features
        """

        feature_loc = {}

        for urn in feature_urns:

            feature = self.db_view.get(urn)
            if not feature:
                continue

            if feature.feature_type in self.nw_view.segments:
                feature_loc[feature._urn()] = self.getLoc(
                    feature, include_proposed=include_proposed
                )
            else:
                feature_loc[feature._urn()] = {
                    "in": self.getLoc(feature, side="in", include_proposed=include_proposed),
                    "out": self.getLoc(feature, side="out", include_proposed=include_proposed),
                }

        return feature_loc

    def getLocDetailsMany(self, feature_urns, include_proposed=False):
        """
        Get LOC information for multiple features.

        We don't get LOC for proposed features but do get proposed LOC for existing features
        """

        result = {}

        for urn in feature_urns:

            feature = self.db_view.get(urn)
            if not feature:
                continue

            if feature.feature_type in self.nw_view.segments:
                result[feature._urn()] = self.getLocDetails(
                    feature, include_proposed=include_proposed
                )
            else:
                result[feature._urn()] = {
                    "in": self.getLocDetails(feature, side="in", include_proposed=include_proposed),
                    "out": self.getLocDetails(
                        feature, side="out", include_proposed=include_proposed
                    ),
                }

        return result

    def rippleDeletions(self, feature, side=None):
        """
        Do actual removal of line of count records associated to FEATURE and flagged as 'deleted'. Deletes
        line of count section records. Returns list segment records impacted.
        """

        tech = self.getTechFor(feature, side)

        loc_table = self.db_view.table("mywcom_line_of_count")
        loc_section_table = self.db_view.table("mywcom_line_of_count_section")

        fix_segments = set()
        qurn = f"{feature._urn()}?side={side}" if side else feature._urn()

        for loc in loc_table.filterOn("origin", qurn):
            if not loc.deleted:
                continue

            for loc_feature in loc_section_table.filterOn("line_of_count", str(loc.id)):
                fix_segments.add(loc_feature.container)
                loc_section_table.delete(loc_feature)

            loc_table.delete(loc)

        seg_updates = []
        for seg in fix_segments:
            urn = seg
            seg = self.db_view.get(urn)
            self.updateSegRefs(seg)
            seg_updates.append(urn)

        return seg_updates

    def updateSegRefs(self, feature, side=None):
        """
        Update loc references on a feature (if field is present)
        """

        loc_field = f"line_of_counts_{side}" if side else "line_of_counts"

        if not feature._descriptor.fields.get(loc_field):
            return

        qurn = f"{feature._urn()}?side={side}" if side else feature._urn()

        loc_section_table = self.db_view.table(f"mywcom_line_of_count_section")
        urns = []
        for seg_loc in loc_section_table.filterOn("container", qurn):
            urns.append(seg_loc._urn())

        new_urns = ";".join(urns)
        if getattr(feature, loc_field) != new_urns:
            setattr(feature, loc_field, new_urns)
            tab = self.db_view.table(feature.feature_type)
            tab.update(feature)

    def compressLOC(self, loc_data):
        """
        Combine adjacent LOC records
        """

        if not loc_data:
            return loc_data

        new_loc_data = []
        last = {}
        current = {}

        for row in loc_data:
            if not current:
                current = row
                new_loc_data.append(current)
            else:

                # If contiguous then extend current
                if (
                    row.get("name","") == current.get("name","")
                    and row["status"] == current["status"]
                    and row["low"] == current["high"] + 1
                ):
                    current["high"] = row["high"]
                else:
                    current = row
                    new_loc_data.append(current)

            last = row

        current["high"] = last["high"]

        return new_loc_data

    def getTechFor(self, feature, side):
        """
        Return technology for segment feature
        """

        for tech, net_def in self.nw_view.networks.items():
            if feature.feature_type == net_def.segment_type:
                return tech

            field_name = f"n_{tech}_ports"
            if hasattr(feature, field_name):
                return tech

            if side:
                field_name = f"n_{tech}_{side}_ports"
                if hasattr(feature, field_name):
                    return tech

    def updateLocMany(self, feature_loc_data,mark_stale=False):
        """
        Update multiple LOC records. FEATURE_LOC_DATA is a dictionary keyed by feature URN
        """

        loc_records = set()

        for feature_urn, loc_data in feature_loc_data.items():
            ref = MywReference.parseUrn(feature_urn)
            feature = self.db_view.get(ref.base)
            if not feature:
                continue

            # We could have data for feature with sides or without (segments)
            if isinstance(loc_data["loc_cfg"], dict):
                for side, loc_cfg in loc_data["loc_cfg"].items():
                    loc_records |= self.updateLoc(
                        feature,
                        loc_cfg,
                        loc_data.get("origin", False),
                        side,
                        mark_stale
                    )
            else:
                loc_records |= self.updateLoc(
                    feature, loc_data["loc_cfg"], loc_data.get("origin", False), mark_stale=mark_stale)

        for loc in loc_records:
            self.setLOCGeom(loc)

    def updateLoc(self, feature, loc_data, origin=False, side=None,mark_stale=False):
        """
        Update line of count information on a FEATURE. Has checks to skip update if
        there is no change.
        """

        qurn = f"{feature._urn()}?side={side}" if side else feature._urn()
        geom = feature._primary_geom_field.geom()

        loc_table = self.db_view.table("mywcom_line_of_count")
        loc_section_table = self.db_view.table(f"mywcom_line_of_count_section")

        loc_feature_urns = []
        p_low = 1
        loc_rec = None
        loc_recs_for_update = set()

        old_loc_features = self.lineOfCountSectionsFor(feature, side)

        for loc in loc_data:

            # Skip if unassigned pins
            if not loc.get("name", None) and not loc.get("status", None):
                p_low += loc["high"] - loc["low"] + 1
                continue

            # Get from data or create line of count record if there isnt one referenced
            if loc.get("loc_ref"):
                loc_rec = self.db_view.get(loc["loc_ref"])
            else:
                if origin:
                    loc_rec = loc_table._new_detached()
                    loc_rec._primary_geom_field.set(geom)
                    loc_rec.stale = False
                    loc_rec.deleted = False
                else:
                    MywError("Can't be here")

            # Can only update loc rec if container is the origin
            if origin:
                p_high = p_low + loc["high"] - loc["low"]
                props = {}

                for field_name in ["name", "status"]:
                    self._updateField(loc_rec, field_name, loc[field_name], props)

                self._updateField(loc_rec, "low_physical", p_low, props)
                self._updateField(loc_rec, "high_physical", p_high, props)
                self._updateField(loc_rec, "low_logical", loc["low"], props)
                self._updateField(loc_rec, "high_logical", loc["high"], props)
                self._updateField(loc_rec, "origin", qurn, props)
                self._updateField(loc_rec, "physical", loc.get("physical", False), props)
                new_label = self.labelForLOC(loc_rec)
                self._updateField(loc_rec, "label", new_label, props)
                self._updateField(loc_rec, "stale", mark_stale,props)

                p_low = p_high + 1

                if loc.get("loc_ref"):
                    if props:
                        loc_table.update(loc_rec)
                else:
                    props["stale"] = mark_stale
                    props["deleted"] = False
                    loc_rec = self.db_view.table("mywcom_line_of_count").insertWith(**props)
                    loc_rec._primary_geom_field.set(geom)

            if not loc_rec:
                MywError("Can't be here")

            loc_recs_for_update.add(loc_rec)

            # Get loc section from data provided or look at container and line of count
            if loc.get("loc_section_ref"):
                loc_section_rec = self.db_view.get(loc["loc_section_ref"])
            else:
                loc_section_rec = self.locSectionFor(qurn, loc_rec)

            # Create new section record if necessary
            if not loc_section_rec:
                loc_section_rec = loc_section_table._new_detached()
                loc_section_rec._primary_geom_field.set(geom)
                loc_section_rec.forward = True
                loc_section_rec.line_of_count = loc_rec.id
                loc_section_rec.container = qurn
                loc_section_rec = loc_section_table.insert(loc_section_rec)

            # Mapping is the only thing that will change and only update record
            # if it does.
            if loc.get("mapping"):
                if loc_section_rec.mapping != json.dumps(loc["mapping"]):
                    loc_section_rec.mapping = json.dumps(loc["mapping"])
                    loc_section_table.update(loc_section_rec)

            loc_feature_urns.append(loc_section_rec._urn())                    

            section_label = self.labelForLOCSection(loc_section_rec)

            if section_label != loc_section_rec.label:
                loc_section_rec.label = section_label
                self.update(loc_section_rec)
            
        # Work out which records were not provided and delete.
        if old_loc_features:
            old_loc_feature_urns = map(lambda f: f._urn(), old_loc_features)
            deleted_loc_features = set(old_loc_feature_urns) - set(loc_feature_urns)

            for del_loc_feature in deleted_loc_features:
                loc_section_rec = self.db_view.get(del_loc_feature)
                loc_rec = loc_section_rec._field("line_of_count").rec()

                loc_recs_for_update.add(loc_rec)

                # Mark LOC for deletion. Record will be deleted when we ripple
                if origin:
                    loc_rec = loc_section_rec._field("line_of_count").rec()
                    loc_rec.deleted = True
                    loc_table.update(loc_rec)

                if loc_section_rec:
                    loc_section_table.delete(loc_section_rec)

        # Update join from segment to segment loc records if present
        loc_field = f"line_of_counts_{side}" if side else "line_of_counts"

        if feature._descriptor.fields.get(loc_field):
            segment_loc = ";".join(loc_feature_urns)
            setattr(feature, loc_field, segment_loc)
            self.db_view.table(feature.feature_type).update(feature)

        return loc_recs_for_update

    def _updateField(self, rec, field_name, value, props):
        if not hasattr(rec, field_name) or getattr(rec, field_name) != value:
            props[field_name] = value
            setattr(rec, field_name, value)

    def locStaleFor(self, feature, side=None):
        """
        Flag the LOC records associated to FEATURE as stale. Network connectivity has
        changed for example
        """

        loc_field = f"line_of_counts_{side}" if side else "line_of_counts"

        if not feature._descriptor.fields.get(loc_field):
            return

        loc_table = self.db_view.table("mywcom_line_of_count")
        for loc_feature in feature._field(loc_field).recs():
            loc_id = int(loc_feature.line_of_count)
            loc = loc_table.get(loc_id)
            loc.stale = True
            loc_table.update(loc)

    def lineOfCountSectionsFor(self, feature, side=None, include_proposed=False):
        """
        Return line of count sections associated to a feature (such as segment or equipment)
        """

        qurn = f"{feature._urn()}?side={side}" if side else feature._urn()

        loc_section_table = self.db_view.table(f"mywcom_line_of_count_section")

        pred = loc_section_table.field("container") == qurn

        return self.nw_view.getRecs(loc_section_table, pred, include_proposed)

    def lineOfCountsFor(self, feature, side=None, include_proposed=False):
        """
        Return line of count records associated to a feature (such as segment or equipment)
        """

        qurn = f"{feature._urn()}?side={side}" if side else feature._urn()

        loc_table = self.db_view.table(f"mywcom_line_of_count")

        pred = loc_table.field("origin") == qurn

        return self.nw_view.getRecs(loc_table, pred, include_proposed)

    def disconnectLoc(self, feature, side=None, ripple=False):
        """
        Handle disconnects. Find origin feature and initiate ripple from it
        """

        loc_recs = set()

        for loc_section_rec in self.lineOfCountSectionsFor(feature, side):          
            loc_rec = loc_section_rec._field("line_of_count").rec()
            loc_recs.add(loc_rec)

        self.rippleOrMarkStale(loc_recs,ripple)            

        return {}

    def connectLoc(self, conn, ripple=False):
        """
        Handle connecting. Find origin feature and initiate ripple from it
        """
      
        loc_recs = set()

        # Find all line of count records that we might need to ripple. Look on both side of connection
        for (side,urn) in [ (conn.out_side, conn.out_object), (conn.in_side, conn.in_object)]:

            feature = self.db_view.get(urn)
            side = None if feature.feature_type in self.nw_view.segments else side

            for loc_section_rec in self.lineOfCountSectionsFor(feature, side):
                loc_rec = loc_section_rec._field("line_of_count").rec()
                loc_recs.add(loc_rec)       

        self.rippleOrMarkStale(loc_recs,ripple)

        return {}

    def rippleOrMarkStale(self,loc_recs,ripple=False):
        """
        Ripple or mark as stale line of counts
        """

        loc_table = self.db_view.table("mywcom_line_of_count")
        origins = set()

        for loc_rec in loc_recs:    
            if not ripple:
                loc_rec.stale = True
                loc_table.update(loc_rec)
            else:
                qurn = loc_rec.origin                
                origins.add(qurn)

        for qurn in origins:
            self.rippleTraceAndUpdateForRef(qurn)

        return {}

    def rippleTraceAndUpdateForRef(self,qurn):
        """
        Ripple and update for a feature reference
        """

        ref = MywReference.parseUrn(qurn)              
        side = ref.qualifiers.get("side",None)
        self.rippleTraceAndUpdate(ref.feature_type, ref.id, side)

    def rippleTraceAndUpdate(self, feature_type, feature_id,side=None):
        """
        Do a ripple and update using provided feature information which will either be
        a segment or equipment side.
        """

        originFeature = self.db_view.get(f"{feature_type}/{feature_id}")
        if not originFeature:
            return
        tech = self.getTechFor(originFeature, side)

        rippleResults = self.rippleTrace(feature_type, feature_id, tech, side)
       
        self.rippleUpdate(rippleResults, originFeature, side)

        return rippleResults

    def rippleUpdate(self, rippleResults, originFeature, side):
        """
        Update line of count information on containers based on ripple results.
        Create new section records if necessary.
        """

        # ENH: This can create redundant section records for a line of count where the line of counts physical
        # strands don't reach the container.

        featuresRippled = rippleResults["features"]
        loc_section_table = self.db_view.table("mywcom_line_of_count_section")

        # For each line of count at the origin feature, update or create line of count sections.
        # At the end, delete sections that didn't appear in the trace and update geometry.
        for loc_rec in self.lineOfCountsFor(originFeature, side):
        
            # ENH: This overlaps with updateLOC. Should be refactored.
            updated_sections = set()
            for feature_qurn, feature_ripple in featuresRippled.items():

                mapping = json.dumps(feature_ripple["mapping"])
                
                loc_section = self.locSectionFor(feature_qurn, loc_rec)

                # If mapping does not overlap physical range at origin then delete section
                if not self.mappingOverlapsOrigin(loc_rec, mapping):
                    if loc_section:
                        self.deleteRecord(loc_section)
                    continue

                if not loc_section:

                    loc_section = loc_section_table._new_detached()
                    loc_section.container = feature_qurn
                    geom = self.db_view.get(feature_qurn)._primary_geom_field.geom()

                    loc_section.line_of_count = loc_rec.id
                    loc_section = self.insertRecord(loc_section)
                    loc_section._primary_geom_field.set(geom)
                    loc_section.forward = True
                    self.update(loc_section)
                    
                updated_sections.add(loc_section._urn())                

                if loc_section.mapping != mapping:
                    loc_section.mapping = mapping
                    self.update(loc_section)

                new_label =  self.labelForLOCSection(loc_section)

                if loc_section.label != new_label:
                    loc_section.label = new_label
                    self.update(loc_section)

            # Delete section records that do not occur in the trace.
            for loc_sec in loc_section_table.filterOn("line_of_count", str(loc_rec.id)):
                if loc_sec._urn() not in updated_sections:
                    self.deleteRecord(loc_sec)

            self.setLOCGeom(loc_rec)

    def mappingOverlapsOrigin(self, loc_rec, mapping):
        """
        Determies if domain of mapping overlaps with physical range at origin
        """

        mapping = json.loads(mapping)
        p_range = PinRange("in", loc_rec.low_physical, loc_rec.high_physical)
        keys = list(map(int,mapping.keys()))
        p_range_loc = PinRange("in", min(keys), max(keys))

        if p_range.intersect(p_range_loc):
            return True
        
        return False



    def locSectionFor(self, feature_qurn, loc_rec):
        """
        Get section record that sits between FEATURE_QURN and LOC_REC
        """

        loc_section_table = self.db_view.table("mywcom_line_of_count_section")
        for loc_section in loc_section_table.filterOn("container", feature_qurn):
            if int(loc_section.line_of_count) == loc_rec.id:
                return loc_section

    def calcLOCGeom(self, loc_rec):
        """
        Calculates geometry for LOC record. This is the union of the geometries of the sections.
        """

        geoms = []
        for loc_section in loc_rec._field("loc_sections").recs():
            geom = loc_section._primary_geom_field.geom()
            if geom.geom_type == "Point":
                geom = MywLineString([geom, geom])
            geoms.append(geom)

        # Ensure we always have a geometry
        if len(geoms) == 0:
            origin = self.db_view.get(loc_rec.origin)
            geom = origin._primary_geom_field.geom()
            if geom.geom_type == "Point":
                geom = MywLineString([geom, geom])
            geoms.append(geom)

        return MywMultiLineString(geoms)

    def setLOCGeom(self, loc_rec):
        """
        Sets geometry for LOC record. This is the union of the geometries of the sections.
        """

        new_geom = self.calcLOCGeom(loc_rec)
        if new_geom != loc_rec._primary_geom_field.geom():
            loc_rec._primary_geom_field.set(new_geom)
            self.db_view.table("mywcom_line_of_count").update(loc_rec)


    def sectionsAt(self, struct):
        """
        Yield line of count sections at a structure
        """

        for seg in self.nw_view.cable_mgr.segmentsAt(struct):
            for section in self.lineOfCountSectionsFor(seg):
                yield section

        for equip in self.nw_view.equip_mgr.allEquipmentIn(struct):
            for section in self.lineOfCountSectionsFor(equip, side="in"):
                yield section
            for section in self.lineOfCountSectionsFor(equip, side="out"):
                yield section

    def sectionsIn(self, route):
        """
        Yield line of count sections in a route
        """

        for seg in self.nw_view.cable_mgr.segmentsIn(route):
            for section in self.lineOfCountSectionsFor(seg):
                yield section

    def setSectionGeom(self, section, geom):
        """
        Sets geometry on line of count section
        """

        container = section._field("container").rec()

        # Can occur if section is for an internal cable
        if geom.geom_type == "Point" and container.feature_type in self.nw_view.segments:
            geom = MywLineString([geom, geom])

        section._primary_geom_field.set(geom)
        self.db_view.table("mywcom_line_of_count_section").update(section)

    def updateLOCGeomsAtStruct(self, struct):
        """
        Updates all section and loc geometries at a structure
        """

        loc_recs = set()
        geom = struct._primary_geom_field.geom()
        for section in self.sectionsAt(struct):
            self.setSectionGeom(section, geom)
            loc_recs.add(section._field("line_of_count").rec())

        for loc in loc_recs:
            self.setLOCGeom(loc)

    def updateLOCGeomsInRoutes(self, routes):
        """
        Updates all section and loc geometries in routes
        """

        if not routes:
            return

        loc_recs = set()
        for route in routes:

            for section in self.sectionsIn(route):
                container = section._field("container").rec()
                geom = container._primary_geom_field.geom()
                self.setSectionGeom(section, geom)
                loc_recs.add(section._field("line_of_count").rec())

        for loc in loc_recs:
            self.setLOCGeom(loc)

    def cloneSection(self, old_section, new_seg):
        """
        Clones section from OLD_SECTION and associate it to NEW_SEG
        """

        table = self.db_view.table("mywcom_line_of_count_section")
        new_section = table._new_detached()
        new_section.container = new_seg._urn()
        new_section.line_of_count = old_section.line_of_count
        new_section.mapping = old_section.mapping
        new_section.forward = old_section.forward
        new_section.label = old_section.label
        new_section._primary_geom_field.set(new_seg._primary_geom_field.geom())

        return table.insert(new_section)

    def cloneLOCs(self, old_seg, new_seg):
        """
        Clone line of count sections on OLD_SEG onto NEW_SEG
        """
        loc_recs = set()

        for old_sec in self.lineOfCountSectionsFor(old_seg):
            self.cloneSection(old_sec, new_seg)
            loc_recs.add(old_sec._field("line_of_count").rec())

        for loc in loc_recs:
            self.setLOCGeom(loc)

    def cloneLOCSectionsOnto(self, seg, loc_sections):
        loc_recs = set()

        for old_sec in loc_sections:
            self.cloneSection(old_sec, seg)
            loc_recs.add(old_sec._field("line_of_count").rec())

        for loc in loc_recs:
            self.setLOCGeom(loc)

    def splitLOCs(self, split_segs):
        """
        Transfer loc information across to new segments and update geometries
        """

        loc_recs = set()
        for old_seg, new_seg in split_segs.values():
            old_seg_geom = old_seg._primary_geom_field.geom()
            for old_sec in self.lineOfCountSectionsFor(old_seg):
                self.cloneSection(old_sec, new_seg)
                loc_recs.add(old_sec._field("line_of_count").rec())
                old_sec._primary_geom_field.set(old_seg_geom)
                self.db_view.table("mywcom_line_of_count_section").update(old_sec)

        for loc in loc_recs:
            self.setLOCGeom(loc)

    def handleCableDelete(self, cable):
        """
        Update information when cable deleted
        """

        # Delete sections that cable is container for and update geom of all of the owning line of count records
        segments = cable._field("cable_segments").recs()
        loc_section_table = self.db_view.table("mywcom_line_of_count_section")
        loc_recs = set()
        for seg in segments:
            for loc_section in self.lineOfCountSectionsFor(seg):
                loc_recs.add(loc_section._field("line_of_count").rec())
                loc_section_table.delete(loc_section)

        for loc in loc_recs:
            self.setLOCGeom(loc)

        self.handleCableDeleteOrigin(cable)

        return loc_recs
    
    def handleCableDeleteRipple(self, loc_recs):
        """
        Handle cable delete after cable has been unrouted.
        """

        # Ripple as some of the downstream strands might now be disconnected from their origin
        ripple = self.db.setting('mywcom.line_of_count').get("connect_disconnect_auto_ripple", True)        
        self.rippleOrMarkStale(loc_recs,ripple)

    def handleCableDeleteOrigin(self, cable):
        """
        Delete line of count records that cable is origin for
        """

        segments = cable._field("cable_segments").recs()
        origin_locs = set()
        for seg in segments:
            for loc_rec in self.lineOfCountsFor(seg):   
                origin_locs.add(loc_rec)

        self.deleteLineOfCounts(origin_locs)

    def deleteLineOfCounts(self, locs):
        """
        Delete a set of line of counts and their sections
        """

        loc_section_table = self.db_view.table("mywcom_line_of_count_section")
        for loc_rec in locs: 
            for loc_sec in loc_section_table.filterOn("line_of_count", str(loc_rec.id)):
                    self.deleteRecord(loc_sec)
            self.deleteRecord(loc_rec)  

    def handleEquipmentDelete(self, equip):
        """
        Update information when equipment deleted
        """

        self.progress(2, "Handling equipment delete", equip)

        loc_recs = set()
  
        # Delete sections that equipment is container for
        for side in ["in", "out"]:
            for loc_section in self.lineOfCountSectionsFor(equip, side=side):
                loc_recs.add(loc_section._field("line_of_count").rec())
                self.deleteRecord(loc_section)                

        # Update line of count geometry
        for loc in loc_recs:           
            self.setLOCGeom(loc)

        ripple = self.db.setting('mywcom.line_of_count').get("connect_disconnect_auto_ripple", True)        
        self.rippleOrMarkStale(loc_recs,ripple)

        # Delete line of count records that equipment is origin for
        for side in ["in", "out"]:
            self.deleteLineOfCounts(self.lineOfCountsFor(equip, side=side))                          


    def locInfoFor(self, cable):
        """
        Return line of count sections for a whole cable indexed by
        segment URN
        """

        segs = cable._field("cable_segments").recs()
        loc_info = defaultdict(list)

        for seg in segs:
            for loc_section in self.lineOfCountSectionsFor(seg):
                loc_info[loc_section.container].append(loc_section)

        return loc_info

    def matchingLOCInfo(self, cable):
        """
        Determine if a cable has matching line of count assignment along its whole length
        """

        segs = cable._field("cable_segments").recs()
        first_loc_info = None

        for seg in segs:
            loc_info = {}
            for loc_section in self.lineOfCountSectionsFor(seg):
                loc_info[loc_section.line_of_count] = loc_section.mapping

            if first_loc_info:
                if first_loc_info != loc_info:
                    return False
            else:
                first_loc_info = loc_info

        return True

    def handleRerouteCable(self, cable, changes, loc_info):
        """
        Update line of count information when cable route changed.
        LOC_INFO is section information before the reroute
        If connections are changed, then we need to redo ripple.
        """

        # No loc information to preserve
        if not loc_info:
            return

        # Setup. Calculate new segments added to cable
        loc_sections, *_ = loc_info.values()
        loc_section_table = self.db_view.table(f"mywcom_line_of_count_section")
        segs = cable._field("cable_segments").recs()
        new_segs = set([seg._urn() for seg in segs]) - set(loc_info.keys())

        # If line of count information for the cable is the same across the whole cable then
        # we have no connections or simple ones. We can just copy the section records to the new segments.
        if self.matchingLOCInfo(cable):

            # Delete section records for deleted segments
            for deleted_seg in changes["deleted_segs"]:
                pred = loc_section_table.field("container") == deleted_seg
                print(f"deleted seg {deleted_seg}")
                for loc_section in self.nw_view.getRecs(loc_section_table, pred):
                    loc_section_table.delete(loc_section)

            # Clone section records to new segments
            for new_seg in new_segs:
                print(f"New seg: {new_seg}")
                new_seg_rec = self.db_view.get(new_seg)
                self.cloneLOCSectionsOnto(new_seg_rec, loc_sections)

        else:
            # Find the line of count records and their origins and ripple
            origins = set()
            for locs in loc_info.values():
                for loc_section in locs:
                    loc_rec = loc_section._field("line_of_count").rec()
                    origins.add(loc_rec.origin)

            for origin in origins:                         
                self.rippleTraceAndUpdateForRef(origin)

    def labelForLOC(self,loc_rec):
        """
        Calculate the label for a line of count record
        """

        if loc_rec.physical:
            return f"{loc_rec.low_physical}-{loc_rec.high_physical} : {loc_rec.status}"
        else:
            return f"{loc_rec.low_physical}-{loc_rec.high_physical} : {loc_rec.name} [{loc_rec.low_logical}-{loc_rec.high_logical}] {loc_rec.status}"
        
    def labelForLOCSection(self,loc_section_rec):
        """
        Calculate the label for a line of count section record.
        Returns empty string if container is not a segment.
        """

        loc_rec = loc_section_rec._field("line_of_count").rec()
        container = loc_section_rec._field("container").rec()
        if not container.feature_type in self.nw_view.segments:
            return ""
        
        loc_data = []
        if loc_section_rec.mapping:
            loc_feature_map = json.loads(loc_section_rec.mapping)
        else:
            loc_feature_map = None
               
   
        for origin_pin in range(loc_rec.low_physical, loc_rec.high_physical+1):
            if loc_feature_map and not loc_feature_map.get(str(origin_pin),None):
                continue

            container_pins = loc_feature_map[str(origin_pin)] if loc_feature_map else [origin_pin]
            logical_pin = loc_rec.low_logical + (origin_pin - loc_rec.low_physical)

            container_pins = [container_pins] if isinstance(container_pins, int) else container_pins
            
            for container_pin in container_pins:
                
                data = { 'status' : loc_rec.status,  'low' : container_pin, 'high' : container_pin }
                if not loc_rec.physical:
                   data['name'] = loc_rec.name
                   data['logical_pin'] = logical_pin
                            
                loc_data.append(data)                

        loc_data = self.compressLOC(loc_data)
        loc_strs = []
        for loc in loc_data:

            if loc.get('name',None):
                logical_low = loc['logical_pin']
                logical_high = loc['logical_pin'] + (loc['high'] - loc['low'])
                loc_strs.append( f"{loc['low']}-{loc['high']}: {loc['name']} [{logical_low}-{logical_high}] {loc['status']}")
            else:
                loc_strs.append( f"{loc['low']}-{loc['high']}: {loc['status']}")

        return "\n".join(loc_strs)
            
        