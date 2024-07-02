// Copyright: IQGeo Limited 2010-2023

//import {MywError} from 'myWorld-native-services'
//import {MywProgressHandler} from 'myWorld-native-services'
import myw, { FilterParser } from 'myWorld-base';
import { NetworkEngine } from 'myWorld-native-services';

import Manager from './Manager';
import PinRange from './PinRange';
import GeomUtils from '../base/GeomUtils';

/**
 * Engine for routing circuits via a fibre network trace
 */
/*eslint-disable no-await-in-loop*/
class CircuitManager extends Manager {
    // -----------------------------------------------------------------------
    //                                 ROUTING
    // -----------------------------------------------------------------------

    /**
     * Find path terminating at pins.
     * Returns IN_NODE (a fiber trace node) or None
     */
    async findPathTo(feature, pins, tech) {
        this.progress(1, 'Finding path to', feature, pins);

        // Get network engine
        const network = this.nw_view.networks[tech];

        const networkRec = await this.db_view.db.cachedTable('network').get(network.network_name);
        await networkRec.setFeatureItems();
        const network_engine = NetworkEngine.newFor(this.db_view, networkRec);

        // Trace upstream
        const out_node = await network_engine.traceOutRaw(feature, pins, 'upstream');

        // Find upstream end
        const in_nodes = out_node.root.leafNodes();

        if (in_nodes.length > 1) {
            return null;
        }

        this.progress(3, 'Found upstream paths:', in_nodes);
        const in_node = in_nodes[0];

        return in_node;
    }

    /**
     * Set route for CIRCUIT from trace that starts at IN_NODE (a fiber trace node)
     * Updates features to reference the circuit, and sets the circuit's geometry
     */
    async route(circuit, in_node) {
        this.progress(1, 'Routing', circuit);

        // Get tables
        const circuit_tab = await this.db_view.table(circuit.getType());

        // Set service port
        this.progress(1, 'Setting service port:', in_node.feature, in_node.pins);
        circuit.properties.in_feature = in_node.feature.getUrn();
        circuit.properties.in_pins = in_node.pins.spec;
        await circuit_tab.update(circuit.id, circuit);

        // Apply circuit information to the features
        let node = in_node;
        while (node) {
            await this._applyCircuitInfo(circuit, node);
            node = node.parent;
        }

        // Build circuit geometry from trace features
        const geom = this.constructGeomFromTrace(circuit, in_node);
        await this.applyGeometry(circuit, geom);
    }

    /**
     * Updates the node's feature to contain reference to the circuit
     */
    async _applyCircuitInfo(circuit, node) {
        // Case: Port node
        if (node.type == 'port') {
            const circuit_info = this.parseCircuitInfo(node.feature.properties.circuits);
            if (!circuit_info[circuit.getUrn()]) {
                circuit_info[circuit.getUrn()] = [];
            }
            circuit_info[circuit.getUrn()].push(node.pins);
            node.feature.properties.circuits = this.serializeEquipmentCircuits(circuit_info);
            await this.update(node.feature);
        }

        // Case: Cable segment node
        if (node.type == 'segment' && node.leaving) {
            const circuit_info = this.parseCircuitInfo(node.feature.properties.circuits);
            circuit_info[circuit.getUrn()] = [node.pins];
            node.feature.properties.circuits = this.serializeCableCircuits(circuit_info);
            await this.update(node.feature);
        }
    }

    /**
     * Remove routing substructure
     */
    async unroute(circuit, tech) {
        // Get all segemnts fiber_segments of the circuit
        const cable_segs = await this.cableSegmentsOf(circuit, tech);

        // Remove circuit information from the fiber_segments
        for (const seg of cable_segs) {
            const circuit_infos = this.parseCircuitInfo(seg.properties.circuits);
            delete circuit_infos[circuit.getUrn()];
            seg.properties.circuits = this.serializeCableCircuits(circuit_infos);
            await this.update(seg);
        }

        // Get a list of all structures from the fiber_segments
        const struct_urns = {};
        cable_segs.forEach(seg => {
            struct_urns[seg.properties.in_structure] = null;
            struct_urns[seg.properties.out_structure] = null;
        });

        // For each Structure, and each Equipment type,
        // locate and remove the circuit from Equipment
        for (const feature_type of Object.keys(this.nw_view.equips)) {
            if (
                this.nw_view.equips[feature_type].tech == 'fiber' ||
                this.nw_view.equips[feature_type].tech == 'mixed'
            ) {
                const tab = await this.db_view.table(feature_type);
                for (const struct_urn of Object.keys(struct_urns)) {
                    let filter = `[root_housing] = '${struct_urn}'`;
                    filter += ` & `;
                    filter += `[circuits] like '%${circuit.getUrn()}?%'`;
                    const pred = new FilterParser(filter).parse();
                    const equips = await this._getRecs(tab, pred, false);

                    // Remove circuit from the equipment
                    for (const equip of equips) {
                        const circuit_infos = this.parseCircuitInfo(equip.properties.circuits);
                        delete circuit_infos[circuit.getUrn()];
                        equip.properties.circuits = this.serializeEquipmentCircuits(circuit_infos);
                        this.update(equip);
                    }
                }
            }
        }
    }

    // -----------------------------------------------------------------------
    //                                 DATA ACCESS
    // -----------------------------------------------------------------------

    /**
     * True if there are any circuits running on equipment or internal segments in STRUCT
     */
    async structHasCircuits(struct) {
        // Check equipment ports
        const all_equips = await this.nw_view.equip_mgr.equipsIn(struct);
        if (all_equips.some(e => e.properties.circuits && e.properties.circuits.length)) {
            return true;
        }

        // Check internal segments
        const all_internal_segs = await this.nw_view.cable_mgr.internalSegmentsOf(struct);
        if (
            all_internal_segs.some(seg => seg.properties.circuits && seg.properties.circuits.length)
        ) {
            return true;
        }

        // Check splices
        //TODO: nlm - named parameter
        const splice_conns = await this.nw_view.connection_mgr.connectionsOfAll(
            struct,
            'root_housing',
            /*splices=*/ true
        );
        return this.connectionsHaveCircuits(splice_conns);
    }

    /**
     * True if there are any circuits running on EQUIP
     */
    async equipHasCircuits(equip) {
        // Check equipment ports

        if (!equip.properties.circuits) return false;

        const circuit_infos = this.parseCircuitInfo(equip.properties.circuits);
        if (circuit_infos.length > 0) {
            return true;
        }

        // Check splices
        //TODO: NLM - named parameter
        const splice_conns = await this.nw_view.connection_mgr.connectionsOf(
            equip,
            'housing',
            /*splices=*/ true
        );
        return this.connectionsHaveCircuits(splice_conns);
    }

    /**
     * True if there are any circuits running on cable segment SEG
     */
    segmentHasCircuits(seg) {
        const circuit_infos = this.parseCircuitInfo(seg.properties.circuits);
        return Object.keys(circuit_infos).length > 0;
    }

    /**
     * True if there are any circuits running on PINS of FEATRUE (a cable segment or equip)
     */
    async pinsHaveCircuits(feature, pins) {
        const recs = await this.circuitsOn(feature, pins, false, false);
        return Object.keys(recs).length > 0;
    }

    /**
     * Gets circuit_segments attached at struct.
     */
    async circuitSegmentsAt(struct, include_proposed = false) {
        const all_segments = await this.allCableSegmentsAt(struct, include_proposed);

        let all_circuit_segments = [];
        all_segments.forEach(seg => {
            all_circuit_segments.push(...this.toCircuitSegments(seg));
        }, this);

        const circuit_segments = this.uniqueFirstsBy(all_circuit_segments, [
            'seg_urn',
            'circuit_urn'
        ]);
        return circuit_segments;
    }

    /**
     * Gets circuit_ports at structure.
     */
    async circuitPortsAt(struct, include_proposed = false) {
        const equips = await this.allEquipsIn(struct, include_proposed);
        let all_circuit_ports = [];
        equips.forEach(equip => {
            all_circuit_ports.push(...this.toCircuitPorts(equip));
        });

        const circuit_ports = this.uniqueFirstsBy(all_circuit_ports, [
            'equip_urn',
            'circuit_urn',
            'side'
        ]);
        return circuit_ports;
    }

    /**
     * Gets all circuit_segments in ROUTE.
     * A circuit_segment is a deprecated model which represents a circuit through a cable_segment.
     * This method returns data from the cable_segment that mimics the structure of a circuit_segment
     */
    async circuitSegmentsIn(route, include_proposed) {
        let all_circuit_segments = [];
        for (const segment_type of Object.keys(this.nw_view.segments)) {
            const tab = this.db_view.table(segment_type);
            const filter = `[root_housing] = '${route.getUrn()}'`;
            const pred = new FilterParser(filter).parse();
            const all_segments = await this._getRecs(tab, pred, include_proposed);

            Object.values(all_segments).forEach(seg => {
                all_circuit_segments.push(...this.toCircuitSegments(seg));
            });
        }

        const circuit_segments = this.uniqueFirstsBy(all_circuit_segments, [
            'seg_urn',
            'circuit_urn'
        ]);
        return circuit_segments;
    }

    /**
     * Converts EQUIP circuits field to list<circuit_port> representation
     */
    toCircuitPorts(equip) {
        const circuit_ports = [];

        if (!equip.properties.circuits) return circuit_ports;

        const circuit_infos = this.parseCircuitInfo(equip.properties.circuits);
        Object.entries(circuit_infos).forEach(([circuit_urn, pin_ranges]) => {
            pin_ranges.forEach(pin_range => {
                let circ = {
                    circuit_urn: circuit_urn,
                    equip_urn: equip.getUrn(),
                    low: pin_range.low,
                    high: pin_range.high,
                    side: pin_range.side
                };
                if (equip.myw.delta && equip.myw.delta != this.db_view.delta) {
                    circ['delta'] = equip.myw.delta;
                }

                circuit_ports.push(circ);
            });
        });
        return circuit_ports;
    }

    /**
     * Converts CABLE_SEG circuits field to list<circuit_segment> representation
     */
    toCircuitSegments(cable_seg) {
        const circuit_segments = [];
        const circuit_infos = this.parseCircuitInfo(cable_seg.properties.circuits);
        Object.entries(circuit_infos).forEach(([circuit_urn, pin_ranges]) => {
            pin_ranges.forEach(pin_range => {
                let circ = {
                    circuit_urn: circuit_urn,
                    seg_urn: cable_seg.getUrn(),
                    low: pin_range.low,
                    high: pin_range.high
                };
                if (cable_seg.myw.delta && cable_seg.myw.delta != this.db_view.delta) {
                    circ['delta'] = cable_seg.myw.delta;
                }

                circuit_segments.push(circ);
            });
        });

        return circuit_segments;
    }

    /**
     * Return circuits on a piece of equipment or housing FEATURE
     */
    async circuitsOn(feature, pins, get_circuits = false, include_proposed = false) {
        const circuits_by_pin = {};

        // If looking for proposed, get all representations of this feature
        let recs = [feature];
        if (include_proposed) {
            const tab = await this.db_view.table(feature.getType());
            const filter = `[id] = '${feature.id}'`;
            const pred = new FilterParser(filter).parse();
            recs = await this._getRecs(tab, pred, include_proposed);
        }

        for (const rec of recs) {
            if (!rec.properties.circuits) continue;
            let circuit_infos = this.parseCircuitInfo(rec.properties.circuits);
            if (!circuit_infos) continue;

            for (const circuit_id of Object.keys(circuit_infos)) {
                let circ_item = circuit_id;
                if (get_circuits) {
                    let the_view = this.db_view.db.view(rec.myw.delta);
                    circ_item = await the_view.get(circuit_id);
                }

                circuit_infos[circuit_id].forEach(circuit_range => {
                    if (pins.side && circuit_range.side && pins.side != circuit_range.side) {
                        return;
                    }

                    const intersect = pins.intersect(circuit_range);
                    if (intersect) {
                        for (const pin of intersect.range()) {
                            if (!(pin in circuits_by_pin)) {
                                circuits_by_pin[pin] = {};
                            }
                            if (!(circuit_id in circuits_by_pin[pin])) {
                                circuits_by_pin[pin][circuit_id] = circ_item;
                            }
                        }
                    }
                });
            }
        }

        // Convert to an array
        Object.keys(circuits_by_pin).forEach(pin => {
            circuits_by_pin[pin] = Object.values(circuits_by_pin[pin]);
        });

        return circuits_by_pin;
    }

    /**
     * Parses circuit information for circuits field
     */
    parseCircuitInfo(circuits) {
        const results = {};
        if (!circuits) return results;

        circuits.forEach(circuit_info => {
            const [circ, qualifiers_str] = circuit_info.split('?');
            if (!(circ in results)) {
                results[circ] = [];
            }

            qualifiers_str.split('&').forEach(qualifier_str => {
                const [key, val] = qualifier_str.split('=');
                const val_parts = val.split(':');

                if (key == 'in' || key == 'out') {
                    results[circ].push(
                        new PinRange(key, parseInt(val_parts[0]), parseInt(val_parts[1]))
                    );
                } else {
                    results[circ].push(
                        new PinRange(undefined, parseInt(val_parts[0]), parseInt(val_parts[1]))
                    );
                }
            });
        });

        return results;
    }

    /**
     * Serialize fiber_segment circuit info
     */
    serializeCableCircuits(circuit_info) {
        const qurns = [];
        Object.entries(circuit_info).forEach(([circuit_id, pin_ranges]) => {
            pin_ranges.forEach(pin_range => {
                const qurn = `${circuit_id}?fibers=${pin_range.low}:${pin_range.high}`;
                qurns.push(qurn);
            });
        });

        qurns.sort();
        return qurns;
    }

    /**
     * Serializes equipment circuit info
     */
    serializeEquipmentCircuits(circuit_info) {
        let qurns = Object.entries(circuit_info).map(([circuit_id, pin_ranges]) => {
            let qualifiers = pin_ranges.map(pin_range => {
                return `${pin_range.side}=${pin_range.low}:${pin_range.high}`;
            });
            qualifiers.sort();

            return `${circuit_id}?${qualifiers.join('&')}`;
        });

        qurns.sort();
        return qurns;
    }

    /**
     * True if there are any circuits running on connections CONN_RECS
     */
    async connectionsHaveCircuits(conn_recs) {
        const pinsIntersect = function (a, b) {
            if (a.side && b.side && a.side != b.side) {
                return false;
            }
            return a.intersect(b) !== undefined;
        };

        for (const conn_rec of conn_recs) {
            // Check In Side
            let the_object = await conn_rec.followRef('in_object');
            if (the_object.properties.circuits) {
                const in_pins = new PinRange(
                    conn_rec.properties.in_side,
                    conn_rec.properties.in_low,
                    conn_rec.properties.in_high
                );
                const circuit_infos = this.parseCircuitInfo(the_object.properties.circuits);
                for (const pin_ranges of Object.values(circuit_infos)) {
                    if (pin_ranges.some(pr => pinsIntersect(pr, in_pins))) return true;
                }
            }

            // Check Out Side
            the_object = await conn_rec.followRef('out_object');
            if (the_object.properties.circuits) {
                const out_pins = new PinRange(
                    conn_rec.properties.out_side,
                    conn_rec.properties.out_low,
                    conn_rec.properties.out_high
                );
                const circuit_infos = this.parseCircuitInfo(the_object.properties.circuits);
                for (const pin_ranges of Object.values(circuit_infos)) {
                    if (pin_ranges.some(pr => pinsIntersect(pr, out_pins))) return true;
                }
            }
        }

        return false;
    }

    /**
     * Gets all equipment in a structure.  Optionally retrieves equipment from other deltas
     */
    async allEquipsIn(struct, include_proposed = false) {
        const struct_urn = struct.getUrn();
        const equips = [];

        for (const feature_type of Object.keys(this.nw_view.equips)) {
            const tab = await this.db_view.table(feature_type);
            const filter = `[root_housing] = '${struct_urn}'`;
            const pred = new FilterParser(filter).parse();
            const equips_by_type = await this._getRecs(tab, pred, include_proposed);
            equips.push(...equips_by_type);
        }

        return equips;
    }

    /**
     * Gets all cable_segements in or connected to struct.  Optionally gets cable_segments from other deltas
     *
     * Note: This is similar to segmentsAt on cable manager except this method also includes updated segments
     */
    async allCableSegmentsAt(struct, include_proposed = false) {
        const struct_urn = struct.getUrn();

        let segs = [];

        for (const segment_type of Object.keys(this.nw_view.segments)) {
            const tab = this.db_view.table(segment_type);
            const filter = `[in_structure] = '${struct_urn}' | [out_structure] = '${struct_urn}'`;
            const pred = new FilterParser(filter).parse();
            const all_segments = await this._getRecs(tab, pred, include_proposed);

            segs.push(...Object.values(all_segments));
        }

        return segs;
    }

    /**
     * Gets recs in current and future view.
     * Note that this is similar to getRecs, but also includes Updated features.
     */
    async _getRecs(tab, pred, include_proposed) {
        const recs = await tab.query().filter([pred]).all();

        if (include_proposed) {
            // Now load Updates/Inserts
            const current_delta = this.db_view.delta;

            const deltaTable = this.db_view.db.dd.getFeatureTable(
                'myworld',
                tab.featureName,
                'delta'
            );
            const filter = `[myw_change_type] <> 'delete' & [myw_delta] <> '${current_delta}'`;
            const deltaPred = new FilterParser(filter).parse();

            // Find records from other deltas
            const other_recs = await deltaTable.query().filter([deltaPred]).filter([pred]).all();
            recs.push(...other_recs);
        }

        return recs;
    }

    /**
     * From iterable of ITEMS, extracts the first unique items grouped by PROPS.
     * PROPS is an array of property names.
     * ITEMS is an iterable of objects, sorted such that items first seen have higher priority
     */
    uniqueFirstsBy(items, props) {
        const results = [];
        const uniques = {};
        for (const item of items) {
            const item_values = props.map(p => {
                return item[p];
            });

            let is_new = false;
            let tracker = uniques;
            for (const v of item_values) {
                if (!(v in tracker)) {
                    is_new = true;
                    tracker[v] = {};
                }
                tracker = tracker[v];
            }

            if (is_new) {
                results.push(item);
            }
        }
        return results;
    }

    // -----------------------------------------------------------------------
    //                               MAINTENANCE
    // -----------------------------------------------------------------------

    /**
     * Updates the geometry for all circuits passing through CABLE_SEGS at a structure
     * @param {*} cable_segs
     * @param {*} old_coord
     * @param {*} new_coord
     */
    async updateCircuitsAtStruct(cable_segs, old_coord, new_coord) {
        if (!cable_segs) return;

        const circuit_ids = {};

        for (const cable_seg of cable_segs) {
            const circuit_urns = this.parseCircuitInfo(cable_seg.properties.circuits);
            Object.keys(circuit_urns).forEach(circuit_urn => {
                circuit_ids[circuit_urn] = true;
            });
        }

        // Rebuild geometry for each circuit in set
        for (const circuit_id of Object.keys(circuit_ids)) {
            await this.updateCircuitPointById(circuit_id, old_coord, new_coord);
        }
    }

    /**
     * Updates the geometry for all circuits passing through CABLE_SEGS that pass through a route
     * @param {*} cable_segs
     * @param {*} new_route_geom
     * @param {*} old_route_geom
     */
    async updateCircuitsInRoute(
        cable_segs,
        new_route_geom = undefined,
        old_route_geom = undefined
    ) {
        this.progress(4, 'updateCircuitsInRoute', cable_segs, new_route_geom, old_route_geom);

        if (!cable_segs) return;

        const circuit_ids = {};

        for (const cable_seg of cable_segs) {
            const circuit_urns = this.parseCircuitInfo(cable_seg.properties.circuits);
            Object.keys(circuit_urns).forEach(circuit_urn => {
                circuit_ids[circuit_urn] = true;
            });
        }

        // Rebuild geometry for each circuit in set
        for (const circuit_id of Object.keys(circuit_ids)) {
            await this.updateCircuitRouteById(circuit_id, new_route_geom, old_route_geom);
        }
    }

    /**
     * Updates the circuit geometry for the circuit with id CIRCUIT_ID
     * @param {*} circuit_id
     * @param {*} old_coord
     * @param {*} new_coord
     */
    async updateCircuitPointById(circuit_id, old_coord, new_coord) {
        this.progress(4, 'updateCircuitPointById: ', circuit_id, old_coord, new_coord);
        const circuit = await this.db_view.get(circuit_id);
        const geom = circuit.geometry;
        const new_circuit_geom = GeomUtils.replacePoint(geom, old_coord, new_coord);
        await this.applyGeometry(circuit, new_circuit_geom);
    }

    /**
     * Updates the circuit geometry for the circuit with id CIRCUIT_ID
     * @param {*} circuit_id
     * @param {*} new_route_geom
     * @param {*} old_route_geom
     * @returns
     */
    async updateCircuitRouteById(
        circuit_id,
        new_route_geom = undefined,
        old_route_geom = undefined
    ) {
        this.progress(4, 'updateCircuitRouteById: ', circuit_id, new_route_geom, old_route_geom);

        const circuit = await this.db_view.get(circuit_id);
        let new_circuit_geom;
        if (new_route_geom) {
            const circuit_geom = circuit.geometry;
            new_circuit_geom = GeomUtils.replaceLinestring(
                circuit_geom,
                old_route_geom,
                new_route_geom
            );
            if (new_circuit_geom) {
                this.progress(2, 'updateCircuitById. quick update done');
                await this.applyGeometry(circuit, new_circuit_geom);
                return;
            }
        }

        if (!new_route_geom || !new_circuit_geom) {
            this.progress(2, 'updateCircuitById. slow update needed');
            this.reconstructGeom(circuit);
        }
    }

    /**
     * Reconstructs the circuit geometry by re-running a network trace.
     * Optionally updates the circuit with the new geometry.
     */
    async reconstructGeom(circuit, update = true, tech = 'fiber') {
        const out_feature = await circuit.followRef('out_feature');
        const out_pins = PinRange.parse(circuit.properties.out_pins);
        const trace_node = await this.findPathTo(out_feature, out_pins, tech);
        const geom = this.constructGeomFromTrace(circuit, trace_node);
        if (update) {
            await this.applyGeometry(circuit, geom);
        }
        return geom;
    }

    /**
     * Constructs the circuit geometry from trace result node
     */
    constructGeomFromTrace(circuit, in_node) {
        this.progress(2, 'Building primary geometry for', circuit);

        if (!in_node) {
            return undefined;
        }

        // Flatten trace node structure
        let traceNodes = [];
        let node = in_node;
        while (node) {
            traceNodes.push(node);
            node = node.parent;
        }

        // Filter to segment nodes where Leaving
        traceNodes = traceNodes.filter(n => n.type === 'segment' && n.leaving);
        let lines = traceNodes.map(n => n.feature.geometry.coordinates);
        let mergedCoords = GeomUtils.lineMerge(lines);
        mergedCoords = GeomUtils.removeDuplicates(mergedCoords);

        //Now that we have created the geometry, ensure that it is oriented correctly
        let term_point = traceNodes[traceNodes.length - 1].feature.geometry.coordinates;
        if (
            GeomUtils.dist(mergedCoords[0], term_point) <
            GeomUtils.dist(mergedCoords[mergedCoords.length - 1], term_point)
        ) {
            mergedCoords.reverse();
        }

        return myw.geometry.lineString(mergedCoords);
    }

    /**
     * Sets the geometry on the circuit and saves
     */
    async applyGeometry(circuit, geom) {
        circuit.geometry = geom;
        await this.update(circuit);
    }

    /**
     * Gets fiber segments that the circuit passes through.
     */
    async cableSegmentsOf(circuit, tech) {
        const segment_type = this.nw_view.networks[tech].segment_type;
        const seg_tab = await this.db_view.table(segment_type);
        const filter = `[circuits] like '%${circuit.getUrn()}?%'`;
        const pred = new FilterParser(filter).parse();
        const segs = await this._getRecs(seg_tab, pred);
        return segs;
    }
}

export default CircuitManager;
