import Manager from './Manager';
import { MywError, NetworkEngine, Reference } from 'myWorld-native-services';
import PinRange from './PinRange';
import myw, { FilterParser } from 'myWorld-base';
import ProgressHandler from '../base/ProgressHandler';
import DefaultDict from '../../../public/js/base/defaultDict';

/**
 * Manager for maintaining line of count
 */
/* eslint-disable no-await-in-loop */
class LOCManager extends Manager {
    constructor(nw_view, progress) {
        super(nw_view, progress);

        // ENH: This is unnecessary if LOCManager and LOC controller are instantiated correctly.
        if (!progress) {
            this.progress = ProgressHandler.newFor('comms.controllers');
        }

        // TBR: Workaround for PLAT-7960 where ReadonlyFeatureView doesn't have table method
        const view = this.db_view;
        if (!view.__proto__.table && view._dbView) {
            view.__proto__.table = function (tableName) {
                return this._dbView.table(tableName);
            };
        }
    }

    /**
     * Do a trace downstream and determine how pin mapping switches across connections
     *
     * Format of result is a dictionary keyed by feature URN qualified with side (when URN is for
     * equipment). Entry in the dictionary are the features as geojson, the side, and the mapping.
     * The latter maps a strand at the origin to strands or ports at the feature.
     *
     * This information will be used by client to determine how to update segments
     * and the calculation is independent of the data model used to store LOC information
     */
    async rippleTrace(feature_type, feature_id, side = undefined, config = undefined) {
        this.progress(2, `rippleTrace from  ${feature_type}/${feature_id}`);

        const table = this.db_view.table(feature_type);
        const rec = await table.get(feature_id);

        if (!rec) {
            return;
        }
        const loc_records = await this.lineOfCountsFor(rec, side);

        const tech = this.getTechFor(rec, side);
        const pin_side = rec.feature_type in this.nw_view.segments ? 'in' : 'out';
        const pin_count = await this.getPinCount(rec, tech, pin_side);

        if (!pin_count) {
            return [[], []];
        }

        const pins = new PinRange(pin_side, 1, pin_count);

        // Do a downstream trace at the fiber/pair level
        const network = this.nw_view.networks[tech];
        const networkRec = await this.db_view.db.cachedTable('network').get(network.network_name);
        await networkRec.setFeatureItems();
        const network_engine = NetworkEngine.newFor(this.db_view, networkRec);

        const root_node = await network_engine.traceOutRaw(rec, pins, 'downstream');

        // Add 'cross-connect' mappings at each node
        await this._addTraceRipple(root_node.root);

        // Combine ripple information for each container
        const result = await this._combineContainerRipples(root_node.root);

        //Remove entries that don't overlap with the source ranges
        const source_ranges = await this._sourceRanges(config);

        const new_result = {};

        for (const urn in result) {
            const details = result[urn];
            if (details) {
                const mapping_keys = Object.keys(details.mapping);

                if (
                    !source_ranges ||
                    source_ranges.length == 0 ||
                    this._rangeOverlaps(source_ranges, mapping_keys)
                ) {
                    new_result[urn] = details;
                }
            }
        }

        const loc_records_json = [];
        for (const loc_record of loc_records) {
            const json_feature = await loc_record.asGeojsonFeature();
            json_feature['bbox'] = [];
            loc_records_json.push(json_feature);
        }
        return { features: new_result, loc_records: loc_records_json };
    }

    /**
     * Returns true if any of the mapping keys overlap with the source ranges
     * @param {*} source_ranges
     * @param {*} mapping_keys
     */
    _rangeOverlaps(source_ranges, mapping_keys) {
        for (const source_range of source_ranges) {
            for (const mapping_key of mapping_keys) {
                if (
                    source_range.low <= Number(mapping_key) &&
                    Number(mapping_key) <= source_range.high
                ) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Returns ranges on FEATURE that have line of count assignments
     * @param {*} feature
     * @param {*} side
     */
    async _sourceRanges(config) {
        let ranges = [];

        if (!config) {
            return undefined;
        }

        let p_low = 1;

        for (const row of config) {
            const p_high = p_low + (row['high'] - row['low']);
            const pinRange = new PinRange('in', p_low, p_high);
            ranges.push(pinRange);
            p_low = p_high + 1;
        }

        return ranges;
    }

    /**
     * Reverse lookup from downstream to upstream pin
     * @param {*} a_dict
     * @param {*} find_value
     */
    _parentPinOf(a_dict, find_value) {
        for (const a_key in a_dict) {
            const a_value = a_dict[a_key];
            if (a_value) {
                if (a_value.includes(find_value)) {
                    return a_key;
                }
            }
        }
        return null;
    }

    /**
     * Return all ripple mappings and containers for a completed ripple trace
     * starting from ROOT_NODE
     * @param {*} root_node
     * @returns
     */
    async _allContainerRipples(root_node) {
        const stack = [root_node];
        let container_ripples = [];

        while (stack) {
            const a_node = stack.pop();

            if (!a_node) break;

            // Only include cable segments and equipment as loc containers
            const feature_type = a_node.feature.getType();
            if (feature_type in this.nw_view.segments || feature_type in this.nw_view.equips) {
                const side = feature_type in this.nw_view.equips ? a_node.pins.side : undefined;

                container_ripples.push({
                    feature: a_node.feature,
                    mapping: a_node._ripple_mapping,
                    side: side,
                    seq: a_node._seq
                });
            }

            for (const child_node of a_node.children) {
                const isStop = await this.isRippleStopNode(child_node);
                if (isStop) continue;

                stack.push(child_node);
            }
        }
        return container_ripples;
    }

    /**
     * Combine mapping information for each container
     * @param {*} root_node
     */
    async _combineContainerRipples(root_node) {
        const all_ripples = await this._allContainerRipples(root_node);

        let container_ripples = {};

        for (const ripple of all_ripples) {
            const feature = ripple.feature;
            const side = ripple.side;
            const mapping = ripple.mapping;

            const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();

            // Get ripple entry for this container and merge the current mapping into it if present.
            const combined_ripple = container_ripples[qurn];

            if (combined_ripple) {
                const combined_mapping = combined_ripple.mapping;

                for (const root_pin in mapping) {
                    if (!combined_mapping[root_pin]) {
                        combined_mapping[root_pin] = [];
                    }

                    // Add fibers without duplicates
                    combined_mapping[root_pin] = Array.from(
                        new Set(combined_mapping[root_pin].concat(mapping[root_pin]))
                    );
                }

                container_ripples[qurn].mapping = combined_mapping;
            } else {
                container_ripples[qurn] = {
                    feature: await feature.asGeojsonFeature(),
                    side: side,
                    mapping: mapping,
                    seq: ripple.seq
                };
            }
        }
        return container_ripples;
    }

    /**
     * For each node in the trace create ripple mapping that maps
     * origin pin to pins at this node it connects to.
     * @param {*} a_node
     */
    async _addTraceRipple(a_node) {
        const seq = [1];
        a_node._seq = seq;
        const stack = [a_node];

        while (stack.length > 0) {
            const a_node = stack.pop();

            this.addTraceRippleAtNode(a_node);
            let cnum = 0;
            for (const child_node of a_node.children) {
                if (await this.isRippleStopNode(child_node)) {
                    continue;
                }
                child_node._seq = a_node._seq.concat([cnum]);
                cnum += 1;
                stack.push(child_node);
            }
        }
    }

    /**
     * Create a mapping that maps pin at start of ripple to pin at the node
     * @param {*} a_node
     */
    addTraceRippleAtNode(a_node) {
        if (a_node._ripple_mapping) {
            throw new MywError('ripple_internal_error', a_node);
        }

        if (a_node.parent) {
            const parent_child_pin_map = {};
            for (const child_pin of a_node.pins.range()) {
                const parent_pin = a_node.parent.pinFor(a_node, child_pin);
                if (!parent_child_pin_map[parent_pin]) {
                    parent_child_pin_map[parent_pin] = [];
                }
                parent_child_pin_map[parent_pin].push(child_pin);
            }

            const ripple_map = {};

            for (const parent_pin in parent_child_pin_map) {
                const root_pin = this._parentPinOf(
                    a_node.parent._ripple_mapping,
                    Number(parent_pin)
                );

                if (!ripple_map[root_pin]) {
                    ripple_map[root_pin] = [];
                }

                ripple_map[root_pin] = ripple_map[root_pin].concat(
                    parent_child_pin_map[parent_pin]
                );
            }

            a_node._ripple_mapping = ripple_map;
        } else {
            let default_map = {};
            for (const pin of a_node.pins.range()) {
                default_map[pin] = [pin];
            }

            a_node._ripple_mapping = default_map;
        }
    }

    /**
     * Returns true if LOC tracing should stop at the node
     * @param {*} trace_node
     */
    async isRippleStopNode(trace_node) {
        const feature = trace_node.feature;

        if (!feature) {
            return false;
        }

        const rootHousing = await feature.followRef('root_housing');

        if (feature.stop_ripple && trace_node.pins.side === 'out') {
            return true;
        }
        return rootHousing.properties.stop_ripple || false;
    }

    /**
     * Get number of pins (fibers, pairs, ports, etc) in FEATURE
     * @param {*} feature
     * @param {*} tech
     * @param {*} side
     */
    async getPinCount(feature, tech, side) {
        const techs = tech ? [tech] : Object.keys(this.nw_view.networks);

        for (const tech of techs) {
            const networkDef = this.nw_view.networks[tech];

            if (feature.myw.feature_type === networkDef.segment_type) {
                const cable = await feature.followRef('cable');
                const count = cable.properties[networkDef.cable_n_pins_field];
                return count;
            } else {
                const fieldNames = side
                    ? [`n_${tech}_${side}_ports`, `n_${tech}_ports`]
                    : [`n_${tech}_ports`];

                for (const fieldName of fieldNames) {
                    if (fieldName in feature.properties) {
                        return feature.properties[fieldName];
                    }
                }
            }
        }
        return null;
    }

    /**
     * Get line of count data for FEATURE. Return compressed list of loc assignments for each delta.
     * Note that the compressed list doesn't correspond exactly to line of count sections as a section
     * might have gaps in the physical pin range.
     * @param {*} feature
     * @param {*} side
     * @param {*} pins
     * @param {*} include_proposed
     */
    async getLocDetails(feature, side = undefined, pins = undefined, include_proposed = false) {
        const tech = this.getTechFor(feature, side);
        const pin_count = await this.getPinCount(feature, tech, side);
        if (!pin_count) {
            return [];
        }
        const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();
        let container_pins_deltas = new DefaultDict(Array);

        const loc_sections = await this.lineOfCountSectionsFor(feature, side, include_proposed);

        for (const loc_section of loc_sections) {
            if (loc_section.myw.change_type && loc_section.myw.change_type === 'delete') {
                continue;
            }
            const is_proposed =
                loc_section.myw.delta && loc_section.myw.delta !== this.db_view.delta;
            let container_pins = is_proposed
                ? container_pins_deltas[loc_section.myw.delta]
                : container_pins_deltas[''];

            if (side && qurn !== loc_section.properties.container) {
                continue;
            }

            const loc_feature_map = loc_section.properties.mapping
                ? JSON.parse(loc_section.properties.mapping)
                : Object.fromEntries(Array.from({ length: pin_count }, (_, i) => [i + 1, i + 1]));
            const loc = await loc_section.followRef('line_of_count');

            if (!loc || loc.properties.deleted) {
                continue;
            }

            for (
                let physical_origin_pin = loc.properties.low_physical;
                physical_origin_pin <= loc.properties.high_physical;
                physical_origin_pin++
            ) {
                let physical_section_pins = loc_feature_map[physical_origin_pin.toString()] || [];
                const logical_origin_pin =
                    loc.properties.low_logical +
                    (physical_origin_pin - loc.properties.low_physical);

                if (typeof physical_section_pins === 'number') {
                    physical_section_pins = [physical_section_pins];
                }

                for (const i of physical_section_pins) {
                    let loc_data = {
                        name: loc.properties.name == null ? '' : loc.properties.name,
                        status: loc.properties.status,
                        count: logical_origin_pin,
                        physical: loc.properties.physical,
                        origin: loc.properties.origin[0]
                    };
                    if (is_proposed) {
                        loc_data.myw_delta = loc_section.myw.delta;
                        loc_data.myw_delta_owner_title = (
                            await this.db_view.get(loc_section.myw.delta)
                        ).myw.title;
                    }

                    container_pins[i] = loc_data;
                }
            }
        }

        for (let [delta, pins] of Object.entries(container_pins_deltas)) {
            let loc_data = [];
            for (let pin_num of Object.keys(pins).sort((a, b) => a - b)) {
                let loc = pins[pin_num];
                loc.low = loc.count;
                loc.high = loc.count;
                loc.physical_low = Number(pin_num);
                delete loc.count;
                loc_data.push(loc);
            }
            container_pins_deltas[delta] = this.compressLOC(loc_data);
        }

        // Return vanilla object
        const result = Object.fromEntries(
            Object.keys(container_pins_deltas).map(k => [k, container_pins_deltas[k]])
        );
        return result;
    }

    /**
     * Get line of count data for FEATURE
     * @param {*} feature
     * @param {*} side
     * @param {*} pins
     * @param {*} include_proposed
     */
    async getLoc(feature, side = undefined, pins = undefined, include_proposed = false) {
        let p_map = {};
        const tech = this.getTechFor(feature, side);
        const pin_count = await this.getPinCount(feature, tech, side);

        if (!pin_count) {
            return [];
        }

        let loc_data = [];

        const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();
        const loc_features = await this.lineOfCountSectionsFor(feature, side, include_proposed);

        for (const loc_feature of loc_features) {
            // Only for the specified side if provided
            if (side && qurn !== loc_feature.properties.container) {
                continue;
            }

            const loc_feature_map = loc_feature.properties.mapping
                ? JSON.parse(loc_feature.properties.mapping)
                : Array.from({ length: pin_count + 1 }, (_, i) => [i]);
            const loc = await loc_feature.followRef('line_of_count');

            // Ignore if LOC is missing or marked for deletion
            if (!loc || loc.properties.deleted) {
                continue;
            }

            // Use the mapping and physical range on loc to add to p_map
            for (const [origin_pin, feature_pins] of Object.entries(loc_feature_map)) {
                const feature_pins_array = Array.isArray(feature_pins)
                    ? feature_pins
                    : [feature_pins];

                for (const feature_pin of feature_pins_array) {
                    const originPinNum = parseInt(origin_pin);
                    const featurePinNum = parseInt(feature_pin);

                    if (
                        originPinNum >= loc.properties.low_physical &&
                        originPinNum <= loc.properties.high_physical
                    ) {
                        const loc_num =
                            loc.properties.low_logical +
                            (originPinNum - loc.properties.low_physical);
                        p_map[featurePinNum] = { loc_num, loc, loc_feature };
                    }
                }
            }
        }

        const pin_range = pins
            ? Array.from({ length: pins.high - pins.low + 1 }, (_, i) => i + pins.low)
            : Array.from({ length: pin_count }, (_, i) => i + 1);

        for (const pin of pin_range) {
            const loc_info = p_map[pin];
            if (loc_info) {
                const loc_cfg = {
                    name: loc_info.loc.properties.name,
                    status: loc_info.loc.properties.status,
                    loc_section_ref: loc_info.loc_feature.getUrn(),
                    loc_ref: loc_info.loc.getUrn(),
                    low: loc_info.loc_num,
                    high: loc_info.loc_num,
                    physical: loc_info.loc.properties.physical,
                    origin: loc_info.loc.properties.origin[0],
                    forward: loc_info.loc_feature.properties.forward
                };
                if (loc_info.loc_feature.myw.delta !== undefined) {
                    loc_cfg.myw_delta = loc_info.loc_feature.myw.delta;
                    loc_cfg.myw_change_type = loc_info.loc_feature.myw.change_type;
                }
                loc_data.push(loc_cfg);
            } else {
                loc_data.push({ name: '', status: '', low: pin, high: pin });
            }
        }

        const compressed_loc_data = this.compressLOC(loc_data);

        // If the last physical range is unassigned, then don't return it
        if (
            compressed_loc_data.length > 0 &&
            !compressed_loc_data[compressed_loc_data.length - 1].name &&
            !compressed_loc_data[compressed_loc_data.length - 1].status
        ) {
            compressed_loc_data.pop();
        }

        return compressed_loc_data;
    }

    /**
     * Get LOC information for multiple features.
     *
     * We don't get LOC for proposed features but do get proposed LOC for existing features.
     * @param {*} feature_urns - Object indexed by feature URN
     * @param {*} include_proposed
     */
    async getLocMany(feature_urns, include_proposed = false) {
        let feature_loc = {};

        for (const urn of feature_urns) {
            const feature = await this.db_view.get(urn);
            if (!feature) {
                continue;
            }

            if (feature.myw.feature_type in this.nw_view.segments) {
                feature_loc[feature.getUrn()] = await this.getLoc(
                    feature,
                    undefined,
                    undefined,
                    include_proposed
                );
            } else {
                feature_loc[feature.getUrn()] = {
                    in: await this.getLoc(feature, 'in', undefined, include_proposed),
                    out: await this.getLoc(feature, 'out', undefined, include_proposed)
                };
            }
        }
        return feature_loc;
    }

    /**
     * Get LOC information for multiple features.
     *
     * We don't get LOC for proposed features but do not get proposed LOC for existing features
     * @param {*} feature_urns
     * @param {*} include_proposed
     */
    async getLocDetailsMany(feature_urns, include_proposed = false) {
        let result = {};

        for (const urn of Object.values(feature_urns)) {
            const feature = await this.db_view.get(urn);
            if (feature) {
                if (this.nw_view.segments[feature.myw.feature_type]) {
                    result[feature.getUrn()] = await this.getLocDetails(
                        feature,
                        undefined,
                        undefined,
                        include_proposed
                    );
                } else {
                    result[feature.getUrn()] = {
                        in: await this.getLocDetails(feature, 'in', undefined, include_proposed),
                        out: await this.getLocDetails(feature, 'out', undefined, include_proposed)
                    };
                }
            }
        }

        return result;
    }

    /* eslint-disable no-await-in-loop*/
    /**
     * Do actual removal of line of count records associated to FEATURE and flagged as 'deleted'. Delete
     * line of count section records. Returns list segment records impacted.
     * @param {*} feature
     * @param {*} side
     */
    async rippleDeletions(feature, side = undefined) {
        const loc_table = await this.db_view.table('mywcom_line_of_count');
        const loc_section_table = await this.db_view.table('mywcom_line_of_count_section');
        const fix_segments = new Set();
        const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();

        const filter = `[origin] = '${qurn}'`;
        const pred = new FilterParser(filter).parse();
        const locs = await this.nw_view.getRecs(loc_table, pred);

        for (const loc of locs) {
            if (!loc.deleted) {
                continue;
            }

            const filter = `[line_of_count] = '${loc.id.toString()}'`;
            const pred = new FilterParser(filter).parse();
            const loc_features = await this.nw_view.getRecs(loc_section_table, pred);

            for (const loc_feature of loc_features) {
                fix_segments.add(loc_feature.container);
                await this.deleteRecord(loc_feature);
            }

            await this.deleteRecord(loc);
        }

        const seg_updates = [];
        for (const seg of fix_segments) {
            const urn = seg;
            const segObj = await this.db_view.get(urn);
            await this.updateSegRefs(segObj);
            seg_updates.push(urn);
        }

        return seg_updates;
    }
    /* eslint-enable */

    /**
     * Update loc references on a feature (if field is present)
     * @param {*} feature
     * @param {*} side
     */
    async updateSegRefs(feature, side = undefined) {
        const loc_field = side ? `line_of_counts_${side}` : 'line_of_counts';

        if (!feature.featureDef.fields.get(loc_field)) {
            return;
        }

        const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();
        const loc_section_table = this.db_view.table('mywcom_line_of_count_section');
        let urns = [];
        const filter = `[container] = '${qurn}'`;
        const pred = new FilterParser(filter).parse();
        const seg_locs = await this.nw_view.getRecs(loc_section_table, pred);
        for (const seg_loc in seg_locs) {
            urns.push(seg_loc.getUrn());
        }

        const new_urns = urns.jsoin(';');
        if (feature[loc_field] !== new_urns) {
            feature[loc_field] = new_urns;
            const tab = this.db_view.table(feature.feature_type);
            await tab.update(feature.id, feature);
        }
    }

    /**
     * Combine adjacent LOC records
     * @param {*} loc_data
     * @returns
     */
    compressLOC(loc_data) {
        if (!loc_data || loc_data.length === 0) {
            return loc_data;
        }

        let new_loc_data = [];
        let last = {};
        let current = {};

        for (const row of loc_data) {
            if (!current) {
                current = { ...row };
                new_loc_data.push(current);
            } else {
                // If contiguous then extend current
                if (
                    row.name === current.name &&
                    row.status === current.status &&
                    row.low === current.high + 1
                ) {
                    current.high = row.high;
                } else {
                    current = { ...row };
                    new_loc_data.push(current);
                }
            }

            last = { ...row };
        }

        current.high = last.high;

        return new_loc_data;
    }

    /* eslint-disable no-prototype-builtins */
    /**
     * Return technology for segment feature
     * @param {*} feature
     * @param {*} side
     * @returns
     */
    getTechFor(feature, side) {
        for (const tech in this.nw_view.networks) {
            const net_def = this.nw_view.networks[tech];

            if (feature.myw.feature_type === net_def.segment_type) {
                return tech;
            }

            let field_name = `n_${tech}_ports`;
            if (field_name in feature.properties) {
                return tech;
            }

            if (side) {
                field_name = `n_${tech}_${side}_ports`;
                if (field_name in feature.properties) {
                    return tech;
                }
            }
        }
        return null;
    }
    /* eslint-enable */

    /**
     * Update multiple LOC records
     * @param {*} feature_loc_data - Object indexed by feature URN
     */
    async updateLocMany(feature_loc_data, mark_stale = false) {
        const loc_records = {};

        for (const feature_urn in feature_loc_data) {
            const loc_data = feature_loc_data[feature_urn];
            const ref = Reference.parseUrn(feature_urn);
            const feature = await this.db_view.get(ref.base);
            if (!feature) {
                continue;
            }
            let loc_recs = [];

            if ('in' in loc_data['loc_cfg'] || 'out' in loc_data['loc_cfg']) {
                for (const side in loc_data['loc_cfg']) {
                    const loc_cfg = loc_data['loc_cfg'][side];
                    loc_recs = await this.updateLoc(
                        feature,
                        loc_cfg,
                        loc_data.origin || false,
                        side || undefined,
                        mark_stale
                    );
                }
            } else {
                loc_recs = await this.updateLoc(
                    feature,
                    loc_data.loc_cfg,
                    loc_data.origin || false,
                    loc_data.side || undefined,
                    mark_stale
                );
            }

            loc_recs.forEach(loc_rec => (loc_records[loc_rec.id] = loc_rec));
        }

        for (const loc of Object.values(loc_records)) {
            await this.setLOCGeom(loc);
        }
    }

    /**
     * Update line of count information on a FEATURE. Has checks to not update records if
     * there is no change.
     * @param {*} feature
     * @param {*} loc_data
     * @param {*} origin
     * @param {*} side
     */
    async updateLoc(feature, loc_data, origin = false, side = undefined, mark_stale = false) {
        const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();
        const geom = feature.geometry;
        const loc_table = await this.db_view.table('mywcom_line_of_count');
        const loc_section_table = await this.db_view.table(`mywcom_line_of_count_section`);
        let loc_feature_urns = [];
        let p_low = 1;
        let loc_rec = undefined;
        let loc_section_rec = undefined;
        let loc_recs_for_update = new Set();

        const old_loc_features = await this.lineOfCountSectionsFor(feature, side);

        for (const loc of loc_data) {
            if (!loc.name && !loc.status) {
                p_low += loc.high - loc.low + 1;
                continue;
            }

            if (loc.loc_ref) {
                loc_rec = await this.db_view.get(loc.loc_ref);
            } else {
                if (origin) {
                    loc_rec = this._new_detached(loc_table);
                    loc_rec.geometry = geom;
                    loc_rec.properties.stale = false;
                    loc_rec.properties.deleted = false;
                } else {
                    throw new MywError("Can't be here");
                }
            }

            if (origin) {
                const p_high = p_low + loc.high - loc.low;
                let props = {};

                const field_names = ['name', 'status'];
                for (const field_name of field_names) {
                    this._updateField(loc_rec, field_name, loc[field_name], props);
                }

                this._updateField(loc_rec, 'low_physical', p_low, props);
                this._updateField(loc_rec, 'high_physical', p_high, props);
                this._updateField(loc_rec, 'low_logical', loc.low, props);
                this._updateField(loc_rec, 'high_logical', loc.high, props);
                this._updateField(loc_rec, 'origin', qurn, props);
                const new_label = this.labelForLOC(loc_rec);
                this._updateField(loc_rec, 'label', new_label, props);
                this._updateField(loc_rec, 'stale', mark_stale, props);

                p_low = p_high + 1;

                if (loc.loc_ref) {
                    if (props) {
                        await loc_table.update(loc_rec.id, loc_rec);
                    }
                } else {
                    props.stale = mark_stale;
                    props.deleted = false;
                    const loc_rec_id = await loc_table.insertOrUpdateFeature(props);
                    loc_rec = await loc_table.get(loc_rec_id);
                    loc_rec.geometry = geom;
                }
            }

            if (!loc_rec) {
                throw new MywError("Can't be here");
            }

            loc_recs_for_update.add(loc_rec);

            if (loc.loc_section_ref) {
                loc_section_rec = await this.db_view.get(loc.loc_section_ref);
            } else {
                loc_section_rec = await this.locSectionFor(qurn, loc_rec);
            }

            if (!loc_section_rec) {
                loc_section_rec = this._new_detached(loc_section_table);
                loc_section_rec.geometry = geom;
                loc_section_rec.properties.forward = true;
                loc_section_rec.properties.line_of_count = loc_rec.id;
                loc_section_rec.properties.container = qurn;
                const loc_section_rec_id = await loc_section_table.insert(loc_section_rec);
                loc_section_rec = await loc_section_table.get(loc_section_rec_id);
            }

            if (loc.mapping) {
                if (
                    !loc_section_rec.properties.mapping ||
                    loc_section_rec.properties.mapping.replaceAll(' ', '') !==
                        JSON.stringify(loc.mapping)
                ) {
                    loc_section_rec.properties.mapping = JSON.stringify(loc.mapping);
                    await loc_section_table.update(loc_section_rec.id, loc_section_rec);
                }
            }

            loc_feature_urns.push(loc_section_rec.getUrn());

            const section_label = await this.labelForLOCSection(loc_section_rec);
            if (section_label !== loc_section_rec.properties.label) {
                loc_section_rec.properties.label = section_label;
                await loc_section_table.update(loc_section_rec.id, loc_section_rec);
            }
        }

        if (old_loc_features?.length) {
            const old_loc_features_urns = old_loc_features.map(f => f.getUrn());
            const deleted_loc_features = new Set(
                old_loc_features_urns.filter(urn => !loc_feature_urns.includes(urn))
            );

            for (const del_loc_feature of deleted_loc_features) {
                const loc_section_rec = await this.db_view.get(del_loc_feature);

                if (origin) {
                    loc_rec = await loc_table.get(loc_section_rec.properties.line_of_count);
                    loc_rec.properties.deleted = true;
                    await this.update(loc_rec);
                }

                if (loc_section_rec) {
                    await this.deleteRecord(loc_section_rec);
                }
            }
        }
        return loc_recs_for_update;
    }

    _updateField(rec, field_name, value, props) {
        if (!rec.properties[field_name] || rec.properties[field_name] !== value) {
            props[field_name] = value;
            rec.properties[field_name] = value;
        }
    }

    /**
     * Flag the LOC records associated to FEATURE as stale. Network connectivity has
     * changed for example
     * @param {*} feature
     * @param {*} side
     */
    async locStaleFor(feature, side = undefined) {
        const loc_field = side ? `line_of_counts_${side}` : 'line_of_counts';

        if (!feature.featureDef.fields.get(loc_field)) {
            return;
        }

        const loc_table = this.db_view.table('mywcom_line_of_count');
        for (const loc_feature in await feature.followRef(loc_field)) {
            const loc_id = parseInt(loc_feature.line_of_count);
            const loc = loc_table.get(loc_id);
            loc.properties.stale = true;
            await this.update(loc);
        }
    }

    async lineOfCountSectionsFor(feature, side = undefined, include_proposed = false) {
        if (!feature.getUrn) {
            console.log('HELP', feature);
        }
        const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();
        const loc_section_table = this.db_view.table(`mywcom_line_of_count_section`);
        const filter = `[container] = '${qurn}'`;
        const pred = new FilterParser(filter).parse();

        const loc_section_segs = await this.nw_view.getRecs(
            loc_section_table,
            pred,
            include_proposed
        );

        return loc_section_segs;
    }

    async lineOfCountsFor(feature, side = undefined, include_proposed = false) {
        const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();
        const loc_table = this.db_view.table('mywcom_line_of_count');
        const filter = `[origin] = '${qurn}'`;
        const pred = new FilterParser(filter).parse();

        const all = await loc_table.all();

        const loc_segs = await this.nw_view.getRecs(loc_table, pred, include_proposed);

        return loc_segs;
    }

    /**
     * Handle disconnects. Find origin feature and initiate ripple from it
     * @param {*} feature
     * @param {*} tech
     * @param {*} side
     * @param {*} ripple
     */
    async disconnectLoc(feature, side = undefined, ripple = false) {
        const loc_table = this.db_view.table('mywcom_line_of_count');

        const sections = await this.lineOfCountSectionsFor(feature, side);
        for (const loc_section_rec of sections) {
            // Assumption is that features only have one LOC origin
            const loc_rec = await loc_table.get(loc_section_rec.properties.line_of_count);

            if (!ripple) {
                loc_rec.properties.stale = true;
                await loc_table.update(loc_rec.id, loc_rec);
            } else {
                const qurn = loc_rec.properties.origin[0];
                const ref = Reference.parseUrn(qurn);

                return this.rippleTraceAndUpdate(ref.feature_type, ref.id, ref.qualifiers['side']);
            }
        }
        return {};
    }

    /**
     * Handle connecting. Find origin feature and initiate ripple from it
     * @param {*} conn - Connection record
     * @param {*} ripple - Should we ripple or just mark LOC as stale
     */
    async connectLoc(conn, ripple = false) {
        const loc_recs = new Set();

        for (const side_urn of [
            [conn.properties.in_side, conn.properties.in_object],
            [conn.properties.out_side, conn.properties.out_object]
        ]) {
            let side = side_urn[0];
            const feature = await this.db_view.get(side_urn[1]);

            side = feature.myw.feature_type in this.nw_view.segments ? undefined : side;

            const sections = await this.lineOfCountSectionsFor(feature, side);
            for (const loc_section_rec of sections) {
                const loc_rec = await loc_section_rec.followRef('line_of_count');
                loc_recs.add(loc_rec);
            }
        }

        await this.rippleOrMarkStale(loc_recs, ripple);

        return {};
    }

    /**
     * Ripple and update for a feature reference
     * @param {String} qurn
     */
    async rippleTraceAndUpdateForRef(qurn) {
        const ref = new Reference.parseUrn(qurn);
        const side = ref.qualifiers['side'];
        return this.rippleTraceAndUpdate(ref.feature_type, ref.id, side);
    }

    /**
     * Do a ripple and update
     * @param {*} feature_type
     * @param {*} feature_id
     * @param {*} tech
     * @param {*} side
     * @returns
     */
    async rippleTraceAndUpdate(feature_type, feature_id, side = undefined) {
        const ripple_results = await this.rippleTrace(feature_type, feature_id, side);

        const origin_feature = await this.db_view.get(`${feature_type}/${feature_id}`);

        if (!origin_feature) return;

        await this.rippleUpdate(ripple_results, origin_feature, side);

        return ripple_results;
    }

    /**
     * Update line of count information on containers based on ripple results
     * @param {*} ripple_results
     * @param {*} origin_feature
     * @param {*} side
     */
    async rippleUpdate(ripple_results, origin_feature, side) {
        const features_rippled = ripple_results['features'];

        const loc_section_table = this.db_view.table('mywcom_line_of_count_section');
        const loc_sections_for_origin = await this.lineOfCountSectionsFor(origin_feature, side);

        for (const loc_section_rec of loc_sections_for_origin) {
            const loc_rec = await loc_section_rec.followRef('line_of_count');
            const updated_sections = new Set();

            for (const [feature_qurn, feature_ripple] of Object.entries(features_rippled)) {
                const mapping = JSON.stringify(feature_ripple['mapping']);
                let loc_section = await this.locSectionFor(feature_qurn, loc_rec);

                if (!loc_section) {
                    const new_loc_section = this._new_detached(loc_section_table);

                    const feature = await this.db_view.get(feature_qurn);
                    const geom = feature.geometry;

                    new_loc_section.properties.container = feature_qurn;
                    new_loc_section.properties.line_of_count = loc_rec.id;
                    new_loc_section.geometry = geom;
                    new_loc_section.properties.forward = true;
                    const loc_section_id = await loc_section_table.insert(new_loc_section);
                    loc_section = await loc_section_table.get(loc_section_id);
                }

                updated_sections.add(loc_section.id);

                if (this.mappingsAreEqual(loc_section.properties.mapping, mapping) === false) {
                    loc_section.properties.mapping = mapping;
                    await loc_section_table.update(loc_section.id, loc_section);
                }

                const new_label = await this.labelForLOCSection(loc_section);
                if (new_label != '' && loc_section.properties.label != new_label) {
                    loc_section.properties.label = new_label;
                    await this.update(loc_section);
                }
            }

            // Delete section records that do not occur in trace
            const current_loc_sections = await loc_rec.followRelationship('loc_sections');
            for (const loc_section of current_loc_sections) {
                if (!updated_sections.has(loc_section.id)) {
                    await this.deleteRecord(loc_section);
                }
            }

            await this.setLOCGeom(loc_rec);
        }
    }

    mappingsAreEqual(curMapping, newMapping) {
        if (!curMapping) return false;

        const orderMappingArrays = mappingJsonStr => {
            const mappingJson = JSON.parse(mappingJsonStr);
            let orderArrays = {};
            // sort numeric values in mapping array
            for (const [key, array] of Object.entries(mappingJson)) {
                orderArrays[key] = array.sort((a, b) => {
                    return a - b;
                });
            }
            return JSON.stringify(orderArrays);
        };

        const orderedCurrent = orderMappingArrays(curMapping);
        const orderedNew = orderMappingArrays(newMapping);

        return orderedCurrent === orderedNew;
    }

    /**
     * Get section record that sits between FEATURE_QURN and LOC_REC
     * @param {*} feature_qurn
     * @param {*} loc_rec
     */
    async locSectionFor(feature_qurn, loc_rec) {
        const loc_section_table = this.db_view.table('mywcom_line_of_count_section');
        const filter = `[container] = '${feature_qurn}'`;
        const pred = new FilterParser(filter).parse();
        const loc_sections = await this.nw_view.getRecs(loc_section_table, pred);

        for (const loc_section of loc_sections) {
            if (parseInt(loc_section.properties.line_of_count) === loc_rec.id) {
                return loc_section;
            }
        }
        return null;
    }

    /**
     * Calculates geometry for LOC record. This is the union of the geometries of the sections.
     * @param {*} loc_rec
     */
    async calcLOCGeom(loc_rec) {
        let geoms = [];
        const loc_sections = await loc_rec.followRelationship('loc_sections');

        for (const loc_section of loc_sections) {
            const geom = loc_section.geometry;

            // Check if the geom is a Point and convert it to LineString if needed
            if (geom.type === 'Point') {
                geoms.push(myw.geometry.lineString([geom.coordinates, geom.coordinates]));
            } else {
                geoms.push(geom);
            }
        }

        //Ensure we always have a geometry
        if (geoms.length == 0) {
            const ref = Reference.parseUrn(loc_rec.properties.origin[0]);
            const origin = await this.db_view.get(ref.base);
            let geom = origin.geometry;
            if (geom.type == 'Point')
                geom = myw.geometry.lineString([geom.coordinates, geom.coordinates]);
            geoms.push(geom);
        }

        // Construct by hand as MultiLineString constructor isnt available.
        const new_coords = geoms.map(g => g.coordinates);
        return { type: 'MultiLineString', coordinates: new_coords };
    }

    /**
     * Sets geometry for LOC record.
     * @param {*} loc_rec
     */
    async setLOCGeom(loc_rec) {
        loc_rec.geometry = await this.calcLOCGeom(loc_rec);
        await this.db_view.table('mywcom_line_of_count').update(loc_rec.id, loc_rec);
    }

    /**
     * Yield line of count sections at a structure
     * @param {*} struct
     */
    async sectionsAt(struct) {
        let sections = [];

        // Cable segments at the structure
        const segments = await this.nw_view.cable_mgr.segmentsAt(struct);
        for (const seg of segments) {
            const seg_sections = await this.lineOfCountSectionsFor(seg);
            for (const section of seg_sections) {
                sections.push(section);
            }
        }

        // Equipment at the structure
        const equipment = await this.nw_view.equip_mgr.allEquipmentIn(struct);
        for (const equip of equipment) {
            const in_sections = await this.lineOfCountSectionsFor(equip, 'in');
            for (const sectionIn of in_sections) {
                sections.push(sectionIn);
            }
            const out_sections = await this.lineOfCountSectionsFor(equip, 'out');
            for (const sectionOut of out_sections) {
                sections.push(sectionOut);
            }
        }
        return sections;
    }

    async sectionsIn(route) {
        let sections = [];

        const segments = await this.nw_view.cable_mgr.segmentsIn(route);
        for (const seg of segments) {
            const seg_sections = await this.lineOfCountSectionsFor(seg);
            for (const section of seg_sections) {
                sections.push(section);
            }
        }
        return sections;
    }

    /**
     * Sets geometry on line of count section
     * @param {*} section
     * @param {*} geom
     */
    async setSectionGeom(section, geom) {
        // Can occur if section is for an internal cable
        const container = await section.followRef('container');
        if (geom.type == 'Point' && container.getType() in this.nw_view.segments) {
            geom = myw.geometry.lineString([geom.coordinates, geom.coordinates]);
        }

        section.geometry = geom;
        await this.db_view.table('mywcom_line_of_count_section').update(section.id, section);
    }

    /**
     * Updates all section and loc geometries at a structure
     * @param {*} struct
     */
    async updateLOCGeomsAtStruct(struct) {
        const loc_recs = {};
        const geom = struct.geometry;

        for (const section of await this.sectionsAt(struct)) {
            await this.setSectionGeom(section, geom);
            const loc_rec = await section.followRef('line_of_count');
            loc_recs[loc_rec.id] = loc_rec;
        }

        for (const loc of Object.values(loc_recs)) {
            await this.setLOCGeom(loc);
        }
    }

    /**
     * Updates all section and loc geometries in routes
     * @param {*} routes
     */
    async updateLOCGeomsInRoutes(routes) {
        if (!routes || routes.length === 0) {
            return;
        }

        const loc_recs = {};
        for (const route of routes) {
            for (const section of await this.sectionsIn(route)) {
                const container = await section.followRef('container');
                const geom = container.geometry;
                await this.setSectionGeom(section, geom);
                const loc_rec = await section.followRef('line_of_count');
                loc_recs[loc_rec.id] = loc_rec;
            }
        }

        for (const loc of Object.values(loc_recs)) {
            await this.setLOCGeom(loc);
        }
    }

    /**
     * Clone section from OLD_SECTION and associate it to NEW_SEG
     * @param {*} old_section
     * @param {*} new_seg
     * @returns
     */
    async cloneSection(old_section, new_seg) {
        const table = this.db_view.table('mywcom_line_of_count_section');
        let new_section = this._new_detached(table);
        new_section.properties.container = new_seg.getUrn();
        new_section.properties.line_of_count = old_section.properties.line_of_count;
        new_section.properties.mapping = old_section.properties.mapping;
        new_section.properties.forward = old_section.properties.forward;
        new_section.properties.label = old_section.properties.label;
        new_section.geometry = new_seg.geometry;

        return table.insert(new_section);
    }

    /**
     * Clone line of count sections on OLD_SEG onto NEW_SEG
     * @param {*} old_seg
     * @param {*} new_seg
     */
    async cloneLOCs(old_seg, new_seg) {
        const loc_recs = {};

        for (const old_sec of await this.lineOfCountSectionsFor(old_seg)) {
            await this.cloneSection(old_sec, new_seg);
            const loc_rec = await old_sec.followRef('line_of_count');
            loc_recs[loc_rec.id] = loc_rec;
        }

        for (const loc of Object.values(loc_recs)) {
            await this.setLOCGeom(loc);
        }
    }

    /**
     * Transfer
     * @param {*} split_segs
     */
    async splitLOCs(split_segs) {
        let loc_recs = {};
        for (const [old_seg, new_seg] of Object.values(split_segs)) {
            const old_seg_geom = old_seg.geometry;
            for (const old_sec of await this.lineOfCountSectionsFor(old_seg)) {
                await this.cloneSection(old_sec, new_seg);
                const loc_rec = await old_sec.followRef('line_of_count');
                loc_recs[loc_rec.id] = loc_rec;
                old_sec.geometry = old_seg_geom;
                await this.db_view
                    .table('mywcom_line_of_count_section')
                    .update(old_sec.id, old_sec);
            }
        }

        for (const loc of Object.values(loc_recs)) {
            await this.setLOCGeom(loc);
        }
    }

    /**
     *
     * @param {MywFeature} cable
     * @returns {Set<MywFeature>} LOC Records
     */
    async handleCableDelete(cable) {
        const segments = await cable.followRelationship('cable_segments');

        const loc_recs = new Set();

        for (const seg of segments) {
            for (const loc_section of await this.lineOfCountSectionsFor(seg)) {
                const loc_rec = await loc_section.followRef('line_of_count');
                loc_recs.add(loc_rec);
                await this.deleteRecord(loc_section);
            }
        }

        for (const [key, loc] of loc_recs.entries()) {
            await this.setLOCGeom(loc);
        }

        this.handleCableDeleteOrigin(cable);

        return loc_recs;
    }

    async handleCableDeleteRipple(loc_recs) {
        const ripple = myw.config['mywcom.line_of_count']['connect_disconnect_auto_ripple'];
        await this.rippleOrMarkStale(loc_recs, ripple);
    }

    async handleCableDeleteOrigin(cable) {
        const segments = await cable.followRelationship('cable_segments');
        const origin_locs = new Set();

        // Delete line of count records that equipment is origin for
        for (const seg of segments) {
            const loc_records = await this.lineOfCountsFor(seg);
            for (const loc_rec of loc_records) {
                origin_locs.add(loc_rec);
            }
        }

        this.deleteLineOfCounts(origin_locs);
    }

    /**
     * Delete line of counts and their sections
     * @param {} loc_recs
     */
    async deleteLineOfCounts(loc_recs) {
        const loc_section_table = this.db_view.table('mywcom_line_of_count_section');

        for (const loc_rec of loc_recs) {
            const filter = `[line_of_count] = '${loc_rec.id.toString()}'`;
            const pred = new FilterParser(filter).parse();
            const loc_sections = await this.nw_view.getRecs(loc_section_table, pred);
            for (const loc_sec of loc_sections) {
                await this.deleteRecord(loc_sec);
            }
            await this.deleteRecord(loc_rec);
        }
    }

    async handleEquipmentDelete(equip) {
        const loc_recs = new Set();

        const loc_section_table = this.db_view.table('mywcom_line_of_count_section');
        const sides = ['in', 'out'];
        for (const side of sides) {
            for (const loc_section of await this.lineOfCountSectionsFor(equip, side)) {
                const loc_rec = await loc_section.followRef('line_of_count');
                loc_recs.add(loc_rec);
                await this.deleteRecord(loc_section);
            }
        }

        for (const [key, loc] of loc_recs.entries()) {
            await this.setLOCGeom(loc);
        }

        const ripple = myw.config['mywcom.line_of_count']['connect_disconnect_auto_ripple'];
        await this.rippleOrMarkStale(loc_recs, ripple);

        // Delete line of count records that equipment is origin for
        for (const side of sides) {
            const loc_records = await this.lineOfCountsFor(equip, side);
            for (const loc_rec of loc_records) {
                const filter = `[line_of_count] = '${loc_rec.id.toString()}'`;
                const pred = new FilterParser(filter).parse();
                const loc_sections = await this.nw_view.getRecs(loc_section_table, pred);

                for (const loc_sec of loc_sections) {
                    await this.deleteRecord(loc_sec);
                }
                await this.deleteRecord(loc_rec);
            }
        }
    }

    async locInfoFor(cable) {
        /*
        Return line of count sections for a whole cable indexed by
        segment URN
        */

        const segs = await cable.followRelationship('cable_segments');
        const loc_info = {};

        for (const seg of segs) {
            for (const loc_section of await this.lineOfCountSectionsFor(seg)) {
                const container = loc_section.container;
                if (!(container in loc_info)) loc_info[container] = [];
                loc_info[container].push(loc_section);
            }
        }

        return loc_info;
    }

    async matchingLOCInfo(cable) {
        /*
        Determine if a cable has matching line of count assignment along its whole length
        */

        const segs = await cable.followRelationship('cable_segments');
        let first_loc_info = undefined;

        for (const seg of segs) {
            const loc_info = {};
            for (const loc_section of await this.lineOfCountSectionsFor(seg)) {
                loc_info[loc_section.line_of_count] = loc_section.mapping;
            }
            if (first_loc_info) {
                if (first_loc_info != loc_info) return false;
            } else {
                first_loc_info = loc_info;
            }
        }
        return true;
    }

    async handleRerouteCable(cable, changes, loc_info) {
        /*
        Update line of count information when cable route changed.
        LOC_INFO is section information before the reroute
        If connections are changed, then we need to redo ripple.
        */

        // No loc information to preserve
        if (Object.values(loc_info).length == 0) return;

        // Setup. Calculate new segments added to cable

        const { loc_sections } = Object.values(loc_info);
        const loc_section_table = this.db_view.table('mywcom_line_of_count_section');
        const segs = await cable.followRelationship('cable_segments');

        const new_segs = new Set();
        const loc_info_keys = Object.keys(loc_info);
        for (const seg of segs) {
            if (!loc_info_keys.includes(seg.getUrn())) {
                new_segs.add(seg.getUrn());
            }
        }

        // If line of count information for the cable is the same across the whole cable then
        // we have no connections or simple ones. We can just copy the section records to the new segments.
        if (await this.matchingLOCInfo(cable)) {
            // Delete section records for deleted segments
            for (const deleted_seg in changes['deleted_segs']) {
                const filter = `[container] = '${deleted_seg}'`;
                const pred = new FilterParser(filter).parse();
                for (const loc_section of await this.nw_view.getRecs(loc_section_table, pred)) {
                    await this.deleteRecord(loc_section);
                }
            }

            // Clone section records to new segments
            for (const new_seg of new_segs) {
                const new_seg_rec = await this.db_view.get(new_seg);
                await this.cloneLOCSectionsOnto(new_seg_rec, loc_sections);
            }
        } else {
            // Find the line of count records and their origins and ripple
            const origins = new Set();
            for (const locs of Object.values(loc_info)) {
                for (const loc_section of locs) {
                    const loc_rec = await loc_section.followRef('line_of_count');
                    origins.add(loc_rec.properties.origin[0]);
                }
            }

            for (const origin of origins) {
                const ref = Reference.parseUrn(origin);
                const origin_rec = await this.db_view.get(origin);
                const side = ref.qualifiers['side'];
                const tech = await this.getTechFor(origin_rec, side);
                await this.rippleTraceAndUpdate(ref.feature_type, ref.id, (side = side));
            }
        }
    }

    /**
     * Ripple or mark as stale line of counts
     * @param {*} loc_recs - Set or array of line of count records
     * @param {*} ripple
     */
    async rippleOrMarkStale(loc_recs, ripple = false) {
        const origins = new Set();

        for (const [key, loc_rec] of loc_recs.entries()) {
            if (!ripple) {
                loc_rec.properties.stale = true;
                this.update(loc_rec);
            } else {
                const qurn = loc_rec.properties.origin[0];
                origins.add(qurn);
            }
        }

        for (const [key, qurn] of origins.entries()) {
            await this.rippleTraceAndUpdateForRef(qurn);
        }

        return {};
    }

    labelForLOC(loc_rec) {
        /*
        Calculate the label for a line of count record
        */

        if (loc_rec.properties.physical) {
            return `${loc_rec.properties.low_physical}-${loc_rec.properties.high_physical} : ${loc_rec.properties.status}`;
        } else {
            return `${loc_rec.properties.low_physical}-${loc_rec.properties.high_physical} : ${loc_rec.properties.name} [${loc_rec.properties.low_logical}-${loc_rec.properties.high_logical}] ${loc_rec.properties.status}`;
        }
    }

    async labelForLOCSection(loc_section_rec) {
        /*
        Calculate the label for a line of count section record        
        */

        const loc_table = this.db_view.table('mywcom_line_of_count');
        const loc_rec = await loc_table.get(loc_section_rec.properties.line_of_count);
        const container = await loc_section_rec.followRef('container');
        if (!(container.getType() in this.nw_view.segments)) return '';

        let loc_data = [];
        let loc_feature_map = {};

        if (loc_section_rec.properties.mapping) {
            loc_feature_map = JSON.parse(loc_section_rec.properties.mapping);
        }

        for (
            let origin_pin = loc_rec.properties.low_physical;
            origin_pin <= loc_rec.properties.high_physical;
            origin_pin++
        ) {
            if (loc_feature_map && !loc_feature_map[origin_pin.toString()]) continue;

            let container_pins = loc_feature_map[origin_pin.toString()] || [origin_pin];
            const logical_pin =
                loc_rec.properties.low_logical + (origin_pin - loc_rec.properties.low_physical);

            if (typeof container_pins === 'number') {
                container_pins = [container_pins];
            }

            for (const container_pin of container_pins) {
                const data = {
                    status: loc_rec.properties.status,
                    low: container_pin,
                    high: container_pin
                };
                if (!loc_rec.properties.physical) {
                    data['name'] = loc_rec.properties.name;
                    data['logical_pin'] = logical_pin;
                }
                loc_data.push(data);
            }
        }

        loc_data = this.compressLOC(loc_data);
        const loc_strs = [];
        for (const loc of loc_data) {
            if (loc['name']) {
                const logical_low = loc['logical_pin'];
                const logical_high = loc['logical_pin'] + (loc['high'] - loc['low']);
                loc_strs.push(
                    `${loc['low']}-${loc['high']}: ${loc['name']} [${logical_low}-${logical_high}] ${loc['status']}`
                );
            } else {
                loc_strs.push(`${loc['low']}-${loc['high']}: ${loc['status']}`);
            }
        }

        return loc_strs.join('\n');
    }
}

export default LOCManager;
