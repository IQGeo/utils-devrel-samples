//###############################################################################
// Comms Fiber Network Engine
//###############################################################################
// Copyright: IQGeo Limited 2010-2023

import { Reference, NetworkEngine, MywInternalError } from 'myWorld-native-services';

import ProgressHandler from '../base/ProgressHandler';
import PinRange from '../api/PinRange';
import PinSet from '../api/PinSet';
import ConnSet from '../api/ConnSet';
import Network from '../api/Network';
import NetworkView from '../api/NetworkView';

import PortTraceNode from './PortTraceNode';
import SegmentTraceNode from './SegmentTraceNode';
import ConnectionTraceNode from './ConnectionTraceNode';

import myw, { trace as mywTrace } from 'myWorld-base';
const trace = mywTrace('tracing');

myw.geometry.init(); // TBR: Workaround for PLAT-7362. Remove if/when platform fixes it.

/*eslint-disable no-await-in-loop*/
class MywcomPinNetworkEngine extends NetworkEngine {
    /**
     * A network engine for tracing signal path through cables and equipment
     *
     * Includes support for bulk trace on a range of pins
     */

    // ==============================================================================
    //                                    CREATION
    // ==============================================================================

    /**
     * Returns a engine for NETWORK_DEF
     *
     * DB_VIEW is a FeatureView. NETWORK_DEF is a dict of network
     * properties (as returned by Network.networkDef()).
     *
     * Optional EXTRA_FILTERS (a set of myWorld select expressions, keyed
     * by feature type) can be used to further limit which objects
     * are considered to be in the network. If supplied, they are
     * ANDed with any filters in NETWORK_DEF
     */
    constructor(view, networkDef, extraFilters) {
        // Init super
        super(view, networkDef, extraFilters);
        this.networkTypes = myw.config['mywcom.network_types'];
        // ENH: Use cached view (for speed)
        this.db_view = view;

        // Init own slots
        this.tech = networkDef['name'].split('_')[1];
        Network.defineTypesFrom(this.networkTypes);
        this.network = Network.types[this.tech];
        this.progress = ProgressHandler.newFor('comms.tracing');

        this.nw_view = new NetworkView(view);

        // Cache settings
        this.equipment = myw.config['mywcom.equipment'] || {}; // TODO: Find a cleaner way
        this.ewl = myw.config['mywcom.ewl'] || {};
    }

    // -------------------------------------------------------------------------
    //                                 SUBPATHS
    // -------------------------------------------------------------------------

    /**
     * Tree of URNs that can be used as trace start points within FEATURE_REC (if any)
     *
     * Returns a list of descriptive strings, keyed by URN (or None)
     */
    // ENH: Change trace dialog to use trees and remove this?
    // ENH: Support build conn points for structure etc
    async subPathsFor(feature_rec, lang) {
        if (!this.includesFeature(feature_rec)) {
            return undefined;
        }

        const urns = {};

        for (const side of ['in', 'out']) {
            const pins = await this.network.pinsOn(feature_rec, side);

            if (!pins) {
                continue;
            }

            for (const pin of pins.range()) {
                const pin_range = new PinRange(side, pin);
                const ref = new Reference('myworld', feature_rec.getType(), feature_rec.id, {
                    pins: pin_range.spec
                });
                const urn = ref.urn();
                urns[urn] = `${side.toUpperCase()}#${pin}`;
            }
        }

        return urns;
    }

    // -------------------------------------------------------------------------
    //                                 TRACING
    // -------------------------------------------------------------------------

    /**
     * Find objects reachable from FROM_FEATURE
     *
     * Direction is 'upstream', 'dowstream' or 'both'. Optional
     * MAX_DIST is maximum distance to trace for (in metres)
     * measured from start of FROM_URN.
     *
     * Returns root of an unconsolidated trace tree (a MywFiberTraceNode)
     */
    async traceOutRaw(
        feature,
        pins,
        direction = 'both',
        max_dist = undefined,
        max_nodes = undefined
    ) {
        // ENH: Make .tidy() optional in core

        const urn = feature.getUrn() + `?pins=${pins.spec}`;

        this.progress(2, 'Tracing from', urn, direction, max_dist);

        const root_node = this._trace(urn, direction, { max_dist, max_nodes }); //Compose urn

        return root_node;
    }

    /**
     * Create the start node for URN
     */
    async rootNode(urn, direction) {
        const ref = this.parseUrn(urn);
        const feature = await this.featureRecFor(ref.urn);
        const pins = PinRange.parse(ref.qualifiers['pins']);

        if (this.network.isSegment(feature)) {
            const loc = await this.locFor(feature, pins);
            return new SegmentTraceNode(
                feature,
                this.tech,
                pins,
                direction,
                0.0,
                0.0,
                undefined,
                loc
            );
        } else {
            const ft = this.functionOf(feature);
            return new PortTraceNode(feature, this.tech, pins, direction, 0.0, 0.0, ft);
        }
    }

    /**
     * The nodes directly reachable from NODE
     *
     * DIRECTION is unused (uses node.direction instead).
     * ROOT_NODE is the root of the current trace (unused here).
     */
    async connectedNodes(node, direction, root_node) {
        let nodes;
        if (node.direction == 'both' || !this.networkDef['directed']) {
            const upstream_nodes = await this.connectedNodesFor(node, 'upstream');
            const downstream_nodes = await this.connectedNodesFor(node, 'downstream');
            nodes = [...upstream_nodes, ...downstream_nodes];
        } else {
            nodes = await this.connectedNodesFor(node, node.direction);
        }

        // ENH: Exclude duplicates
        return nodes;
    }

    /**
     * The nodes directly reachable from NODE in DIRECTION
     *
     * DIRECTION is 'upstream' or 'downstream'
     *
     * Returns a list of trace nodes
     */
    async connectedNodesFor(node, direction) {
        this.progress(
            6,
            'Finding',
            direction,
            'connections at side',
            node.pins.side,
            'of',
            node.feature
        );

        if (node.type == 'port') return this.connectedNodesForPort(node, direction);
        if (node.type == 'segment') return this.connectedNodesForSegment(node, direction);
        if (node.type == 'connection') return this.connectedNodesForConnection(node, direction);

        throw MywInternalError('Bad node type:', node.type);
    }

    /**
     * The nodes directly reachable from port trace node NODE
     *
     * DIRECTION is 'upstream' or 'downstream'
     *
     * Returns a list of trace nodes
     */
    async connectedNodesForPort(node, direction) {
        const equip = node.feature;
        const ports = node.pins;

        // Case: Hop to ports on other side (via implicit connection)
        if (
            (ports.side == 'in' && direction == 'downstream') ||
            (ports.side == 'out' && direction == 'upstream')
        ) {
            // Find ports on other side
            const conn_ports = await this.equipConnectedPortsFor(equip, ports);
            if (!conn_ports) {
                return [];
            }

            // Find connections from those ports
            // Note: We exclude unconnected out ports from trace results (simplifies result)
            const conn_sets = [];
            for (const conn_ports_range of conn_ports) {
                const conn_set = await this.connSetFor(
                    equip,
                    conn_ports_range.side,
                    conn_ports_range
                );
                if (conn_set) {
                    conn_sets.push(conn_set);
                }
            }
            if (conn_sets.length == 0) return [];

            // Add trace nodes (for connected pins only)
            const conn_nodes = [];
            for (const conn_set of conn_sets) {
                for (const conn of conn_set.conns) {
                    const ft = this.functionOf(equip);
                    const conn_node = new PortTraceNode(
                        equip,
                        this.tech,
                        conn.from_pins,
                        direction,
                        node.dist,
                        node.ewlDist,
                        ft,
                        node
                    );
                    if (conn_node) conn_nodes.push(conn_node);
                }
            }

            return conn_nodes;
        }

        // Case: Hop to connected object
        else {
            // Find outgoing connections
            const conn_set = await this.connSetFor(equip, ports.side, ports);
            if (!conn_set) {
                return [];
            }

            // Find connected features
            const conn_nodes = [];
            for (const conn of conn_set.conns) {
                const conn_node = new ConnectionTraceNode(
                    conn,
                    this.tech,
                    direction,
                    node.dist,
                    node.ewlDist,
                    node
                );
                conn_nodes.push(conn_node);
            }

            return conn_nodes;
        }
    }

    /**
     * The nodes directly reachable from segment trace node NODE
     *
     * DIRECTION is 'upstream' or 'downstream'
     *
     * Returns a list of trace nodes
     */
    async connectedNodesForSegment(node, direction) {
        const seg = node.feature;
        const pins = node.pins;

        // Hack for traces started from a segment
        const starting_in =
            node.parent === undefined &&
            ((direction == 'upstream' && pins.side == 'in') ||
                (direction == 'downstream' && pins.side == 'out'));

        // Check for hop to other end of segment
        if (node.entering && !starting_in) {
            const seg_len = await this.lengthOf(seg);
            let ewl_len = 0.0;
            if (this.tech === 'copper') {
                const ewlFactor = await this.getEwlFactor(seg);
                ewl_len = seg_len * ewlFactor;
            }
            const next_pins = new PinRange(pins.otherSide(), pins.low, pins.high);
            const loc = await this.locFor(seg, next_pins);
            const next_node = new SegmentTraceNode(
                seg,
                this.tech,
                next_pins,
                direction,
                node.dist + seg_len,
                node.ewlDist + ewl_len,
                node,
                loc
            );
            return [next_node];
        }

        // Find outgoing connections
        const conn_set = await this.connSetFor(seg, pins.side, pins);

        // Add node for each connection
        // ENH: Consolidate adjacent connections to same object
        const conn_nodes = [];
        if (conn_set) {
            for (const conn of conn_set.conns) {
                const conn_node = new ConnectionTraceNode(
                    conn,
                    this.tech,
                    direction,
                    node.dist,
                    node.ewlDist,
                    node
                );
                conn_nodes.push(conn_node);
            }
        }

        // Find next segment (for passthrough fibers)
        const field_name = pins.side + '_segment';
        const next_seg = await seg.followRef(field_name);
        if (!next_seg) {
            return conn_nodes;
        }
        const next_side = pins.otherSide();

        // Build set of passthrough fibers
        let next_pin_set = new PinSet(next_side, pins.low, pins.high);
        if (conn_set) {
            for (const conn of conn_set.conns) {
                next_pin_set = next_pin_set.subtract(conn.from_pins);
            }
        }

        // Remove those that are cut
        const next_conn_set = await this.connSetFor(next_seg, next_side, pins);
        if (next_conn_set) {
            for (const conn of next_conn_set.conns) {
                next_pin_set = next_pin_set.subtract(conn.from_pins);
            }
        }

        // Add node for each group of passthrough fibers
        for (const next_pins of next_pin_set.ranges) {
            const loc = await this.locFor(next_seg, next_pins);
            const conn_node = new SegmentTraceNode(
                next_seg,
                this.tech,
                next_pins,
                direction,
                node.dist,
                node.ewlDist,
                node,
                loc
            );
            conn_nodes.push(conn_node);
        }

        return conn_nodes;
    }

    /**
     * The nodes directly reachable from connection trace node NODE
     *
     * DIRECTION is 'upstream' or 'downstream'
     *
     * Returns a list of trace nodes
     */
    async connectedNodesForConnection(node, direction) {
        // Find pins it is connected to
        const conn = node.conn;
        const to_feature = await conn.toFeatureRec();

        // Build node
        let conn_node;
        if (conn.is_to_cable) {
            const loc = await this.locFor(to_feature, conn.to_pins);
            conn_node = new SegmentTraceNode(
                to_feature,
                this.tech,
                conn.to_pins,
                direction,
                node.dist,
                node.ewlDist,
                node,
                loc
            );
        } else {
            const ft = this.functionOf(to_feature);
            conn_node = new PortTraceNode(
                to_feature,
                this.tech,
                conn.to_pins,
                direction,
                node.dist,
                node.ewlDist,
                ft,
                node
            );
        }

        return [conn_node];
    }

    async _traceNode(node, activeNodes, visitedNodes, direction, rootNode, options) {
        //  Overidden from core native NetworkEngine to add ewl distance
        //  TBR: PLAT-9028 Ideally we wouldn't have to subclass the entire trace function to change distance behavior
        //   ** Need to check NetworkEngine._traceNode method for changes after every platform release  **

        const nodeUrn = node.feature.getUrn();
        const stopUrns = options.stopUrns || [];
        const stopGeoms = options.stopGeoms || [];
        trace(4, 'Processing:', node.ident());

        // Check for found stop node
        if (stopUrns.includes(nodeUrn)) return node;

        let connectedNodes; //promise
        // Check for node beyond distance limit
        if (node.partial) {
            connectedNodes = [];
        } else {
            connectedNodes = await this.connectedNodes(node, direction, rootNode);
        }
        // Add end nodes of connected items to wavefront
        for (const connNode of connectedNodes) {
            trace(5, '  Connection:', connNode.ident());

            // Check for already found
            if (visitedNodes[connNode.node_id]) {
                trace(8, '  Already visited');
                return;
            }

            if (options.maxDist) {
                await this.traceStopAtDist(options.maxDist, connNode);
            }

            //Prevent cycles
            visitedNodes[connNode.node_id] = true;

            // Prevent memory overflow etc
            if (options.maxNodes && Object.keys(visitedNodes).length > options.maxNodes) {
                trace(4, '  Visited nodes exceeds max:', options.maxNodes);
                throw new Error('Trace size limit exceeded');
            }

            // Add to wavefront
            trace(6, '  Activating:', connNode.ident());
            if (this.euclidean) {
                connNode.minPossibleDist = connNode.dist + connNode.minDistTo(stopGeoms);
            }
            activeNodes.push(connNode);

            node.children.push(connNode);
        }

        if (activeNodes.empty()) return;

        // Move to next closest node
        const nextNode = activeNodes.pop();
        return this._traceNode(nextNode, activeNodes, visitedNodes, direction, rootNode, options);
    }

    async traceStopAtDist(maxDist, connNode) {
        // if ewl distance is present, use it for max distance
        if (connNode.ewlDist !== 0) {
            if (connNode.ewlDist > maxDist) {
                trace(7, '  Beyond max EWL dist');
                // max dist and ewlDist are applying the ewl factor, need the actual distance here
                const diff = connNode.ewlDist - maxDist;
                const ewl_factor = await this.getEwlFactor(connNode.feature);
                const real_max_distance = connNode.dist - diff / ewl_factor;
                connNode.stopAt(real_max_distance);
            }
        } else if (connNode.dist > maxDist) {
            trace(7, '  Beyond max dist');
            connNode.stopAt(maxDist);
        }

        return;
    }

    // -------------------------------------------------------------------------
    //                                 EQUIPMENT
    // -------------------------------------------------------------------------

    /**
     * The ports on the opposite side of EQUIP that are connected to PINS
     *
     * Uses equipment function to determine internal connectivity
     *
     * Returns a list of PinRange (or None)
     */
    async equipConnectedPortsFor(equip, pins) {
        // ENH: Support cross-connect etc

        const funct = this.functionOf(equip);

        if (funct == 'connector') {
            return [new PinRange(pins.otherSide(), pins.low, pins.high)];
        }

        if (funct == 'splitter') {
            if (pins.side == 'in') return [await this.network.pinsOn(equip, 'out')];
            if (pins.side == 'out') return [new PinRange('in', 1)];
        }
        if (funct == 'mux') {
            if (pins.side == 'in') return [new PinRange('out', 1)];
            if (pins.side == 'out') return [await this.network.pinsOn(equip, 'in')];
        }
        if (funct == 'bridge_tap') return this.equipConnectedPortsForTap(equip, pins);

        return undefined;
    }

    /**
     * The ports on the opposite side of tap EQUIP that are connected to PINS
     *
     * Returns a list of PinRange (or None)
     */
    async equipConnectedPortsForTap(equip, pins) {
        const in_ports = await this.network.pinsOn(equip, 'in');

        if (pins.side == 'in')
            return [
                new PinRange('out', pins.low, pins.high),
                new PinRange('out', pins.low + in_ports.size, pins.high + in_ports.size)
            ];

        if (pins.side == 'out') {
            if (pins.low <= in_ports.size) {
                if (pins.high <= in_ports.size) {
                    // Range is in first set of ports
                    return [new PinRange('in', pins.low, pins.high)];
                } else {
                    // Range overlaps both sets of ports
                    const r1 = new PinRange('in', pins.low, in_ports.size);
                    const r2 = new PinRange('in', 1, pins.high - in_ports.size);
                    if (r2.high >= r1.low) {
                        // New ranges overlap so return combination
                        return [new PinRange('in', r1.low, r2.high)];
                    } else return [r1, r2];
                }
            } else {
                // Range is in second set of ports
                return [new PinRange('in', pins.low - in_ports.size, pins.high - in_ports.size)];
            }
        }

        return undefined;
    }

    /**
     * Returns the function of feature EQUIP
     */
    functionOf(equip) {
        const config = this.equipment[equip.getType()] || {};
        return config.function;
    }

    // -------------------------------------------------------------------------
    //                                 HELPERS
    // -------------------------------------------------------------------------

    /**
     * The connections from SIDE of FEATURE (if configured)
     *
     * If options PINS is provided, limit connections to those pins
     *
     * Returns a ConnSet or None
     */
    async connSetFor(feature, side, pins = undefined) {
        // Get field holding connections
        const direction = this.directionFor(side);
        const field_name = this.featurePropFieldName(feature.getType(), direction);

        if (!field_name) {
            this.progress(10, feature, 'No field configured for', direction);
            return undefined;
        }

        // Build connection set
        this.progress(7, feature, 'Getting connections from field:', field_name);
        let conns = new ConnSet(feature, this.tech, side, field_name);
        await conns.complete();
        if (pins) {
            conns = conns.intersect(pins);
        }

        this.progress(6, feature, 'Found connections', conns);

        return conns;
    }

    /**
     * The direction implied by SIDE
     */
    directionFor(side) {
        if (side == 'in') return 'upstream';
        if (side == 'out') return 'downstream';

        throw MywInternalError('Bad side:', side);
    }

    //  Length of feature_rec for tracing purposes (in m)
    async lengthOf(featureRec) {
        //Try attribute
        let length = this.featureProp(featureRec, 'length', 'm');
        if (length != undefined) {
            this.progress(10, featureRec, 'Got length from record:', length);
            return length;
        }

        //  Try housing
        if ('housing' in featureRec.featureDef.fields) {
            const housing = await featureRec.followRef('housing');
            if (housing && housing.featureDef.geometry_type == 'linestring') {
                this.progress(10, featureRec, 'Trying:', housing);
                return this.lengthOf(housing);
            }
        }

        // Compute from geometry
        // ENH: Warn if geom is in internal world (where units will be wrong)
        length = featureRec.geodeticLength();
        this.progress(10, featureRec, 'Computed length:', length);
        return length;
    }

    async getEwlFactor(featureRec) {
        let gauge = this.featureProp(featureRec, 'gauge');

        // not on passed in feature, check for containing cable
        if (!gauge) {
            if ('cable' in featureRec.featureDef.fields) {
                const cable = await featureRec.followRef('cable');
                gauge = this.featureProp(cable, 'gauge');
            }
        }

        if (!gauge) {
            // no result, leave distance unchanged
            return 1;
        }

        const conversions = this.ewl.conversions.filter(con => con.gauge === gauge);

        if (conversions.len == 0) return 1;

        return conversions[0].ewl;
    }

    // The value of FEATURE_REC's configured property PROP (if set)
    //
    // PROP is the name of a configurable field property in a
    // network definition ('upstream', 'downstream' or 'length')
    //
    // Returns None if the property is not configured for FEATURE_REC"""
    featureProp(featureRec, prop, unit = undefined) {
        // Get field holding value (handling feature types not in network)
        let fieldName = this.featurePropFieldName(featureRec.myw.feature_type, prop);
        if (!fieldName && prop in featureRec.featureDef.fields) {
            fieldName = prop;
        }

        if (!fieldName) return undefined;

        // Get value
        let val = featureRec.properties[fieldName];
        if (val && unit) {
            const fieldUnit = featureRec.featureDef.fields[fieldName].unit;
            val = this.lengthScale.convert(val, fieldUnit, 'm');
        }
        return val;
    }

    /**
     * Calculate the line of count string for FEATURE across PINS
     * ENH: Use localised string
     * @param {*} feature
     * @param {*} pins
     */
    async locFor(feature, pins) {
        const locs = await this.nw_view.loc_mgr.getLoc(feature, undefined, pins);
        const locStrings = locs.map(loc => `${loc.name} [${loc.low}-${loc.high}] ${loc.status}`);

        return locStrings.join(',');
    }
} // TBR: Workaround for PLAT-7362. Remove if/when platform fixes it.

NetworkEngine.engines['mywcom_pin_network_engine'] = MywcomPinNetworkEngine;

// For native we just assign the fiber path network engine to be its parent class
// This is needed so that trace dialog will open.
NetworkEngine.engines['mywcom_fiber_path_network_engine'] = MywcomPinNetworkEngine;

export default MywcomPinNetworkEngine;
