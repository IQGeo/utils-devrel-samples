// Copyright: IQGeo Limited 2010-2023
import { MywClass } from 'myWorld-client';
import _ from 'underscore';
import PinRange from './pinRange';
import Conn from './conn';
import EquipTree from './equipTree';
import CableTree from './cableTree';

export default class StructContent extends MywClass {
    static {
        this.prototype.oppositeSide = { in: 'out', out: 'in' };
    }

    /**
     * Initialize from containment service result 'result'
     */
    constructor(struct, result) {
        super();
        this.struct = struct;
        this.urn = struct.getUrn();

        this.features = {};
        this.equips = this._addFeatures(result.equip);
        this.conduits = this._addFeatures(result.conduits);
        this.conduit_runs = this._addFeatures(result.conduit_runs);
        this.cables = this._addFeatures(result.cables);
        this.segs = this._addFeatures(result.cable_segs);
        this.conns = this._addFeatures(result.conns);

        this.segCircuitInfos = this._circuitInfosFrom(result.seg_circuits);
        this.equipCircuitInfos = this._circuitInfosFrom(result.port_circuits);

        this.isValid = true;
    }

    /**
     * Returns 'features' as a list, keyed by urn
     *
     * Also adds them to this.features (the list of all known features)
     */
    _addFeatures(ftrs) {
        const ftrsByUrn = {};

        for (const ftr of ftrs) {
            const urn = ftr.getUrn();
            ftrsByUrn[urn] = ftr;
            this.features[urn] = ftr;
        }

        return ftrs; // TODO: Fix code and return keyed list
    }

    /**
     * Mutate circuit summary info from containment result
     */
    _circuitInfosFrom(infos) {
        for (const info of infos) {
            info.pins = new PinRange(info.side, info.low, info.high);
            delete info.side;
            delete info.low;
            delete info.high;
        }
        return infos;
    }

    // -----------------------------------------------------------------------
    //                               CABLE TREE
    // -----------------------------------------------------------------------

    /**
     * Get all cable segments at 'struct'
     *
     * @param {feature} struct feature
     *
     * Returns a containment tree
     */
    cableTree() {
        const segPins = this.segPins(false, true);

        const allSegPins = [...segPins.in, ...segPins.out, ...segPins.int];

        // Build set of referenced cables
        const cables = _.indexBy(this.cables, c => c.getUrn());

        // Create root node
        const nodes = {};
        const structNode = CableTree.featureNode(this.struct);
        nodes[this.urn] = structNode;

        // Create cable nodes
        for (const [urn, cable] of Object.entries(cables)) {
            nodes[urn] = CableTree.cableNode(cable);
        }

        // Create segment nodes (at sides)
        for (const side of ['in', 'out']) {
            for (const segCP of segPins[side]) {
                const seg = segCP.feature;
                nodes[seg.getUrn()] = CableTree.segNode(
                    seg,
                    segCP.cable,
                    segCP.cable_side,
                    side,
                    segCP.n_connected,
                    segCP.conns,
                    segCP.housing,
                    this.struct,
                    segCP.circuits
                );
            }
        }

        // Include nodes for internal segments
        for (const intSegCP of segPins.int) {
            const seg = intSegCP.feature;
            const segUrn = seg.getUrn();

            // Parent node for internal segment
            const intSegNode = CableTree.featureNode(seg);
            intSegNode.isInternal = true;
            intSegNode.cable = intSegCP.cable;
            intSegNode.slack = intSegCP.slack;

            nodes[segUrn] = intSegNode;

            // For internal segments, create in/out child nodes
            for (const side of ['in', 'out']) {
                const segCP = intSegCP[side];

                const seg = segCP.feature;
                const segNode = CableTree.segNode(
                    seg,
                    segCP.cable,
                    segCP.cable_side,
                    side,
                    segCP.n_connected,
                    segCP.conns,
                    segCP.housing,
                    this.struct,
                    segCP.circuits
                );

                intSegNode.children.push(segNode);
            }
        }

        // Build tree
        for (const cableUrn in cables) {
            structNode.children.push(nodes[cableUrn]);
        }

        for (const segPin of allSegPins) {
            const seg = segPin.feature;
            const parentNode = nodes[seg.properties.cable];
            parentNode.children.push(nodes[seg.getUrn()]);
        }

        // Order each cable node set of children
        for (const cableNode of structNode.children) {
            cableNode.children = this._orderedSegNodes(cableNode.children);
        }

        return structNode;
    }

    /**
     * Returns list of ordered cable tree seg nodes
     */
    _orderedSegNodes(segNodes) {
        if (segNodes.length <= 1) return segNodes;

        // Mapping seg ID => segNode
        const idMap = _.indexBy(segNodes, segNode => segNode.feature.id);

        // Find head segment (the one with no known incoming segment)
        let currentSegNode;
        for (const segNode of segNodes) {
            if (!idMap[segNode.feature.properties.in_segment]) currentSegNode = segNode;
        }

        // Follow down from head
        const orderedSegNodes = [];
        while (currentSegNode) {
            orderedSegNodes.push(currentSegNode);
            currentSegNode = idMap[currentSegNode.feature.properties.out_segment];
        }

        // Ensure 'out' side is always listed last
        if (orderedSegNodes.length) {
            if (orderedSegNodes[0].cable_side == 'out') orderedSegNodes.reverse();
        }

        // Handle cases where one or more segments weren't chained (bad data)
        _.each(segNodes, segNode => {
            if (orderedSegNodes.indexOf(segNode) == -1) {
                orderedSegNodes.push(segNode);
            }
        });

        return orderedSegNodes;
    }

    // -----------------------------------------------------------------------
    //                              CONDUIT TREE
    // -----------------------------------------------------------------------

    conduitTree() {
        const segPins = this.segPins(false, false);
        const structConduitData = this.conduitInfos(2);

        const allSegPins = [...segPins.in, ...segPins.out];

        // Add root node
        const nodes = {};
        const structNode = CableTree.featureNode(this.struct);
        nodes[this.urn] = structNode;

        // Create conduit nodes
        for (const conduitData of structConduitData) {
            const conduit = conduitData.conduit;
            const conduitUrn = conduit.getUrn();

            nodes[conduitUrn] = this.createConduitTreeNode(
                conduit,
                conduitData.connected_conduit,
                conduitData.structure_housing,
                conduitData.conduit_run
            );
        }

        // Create segment nodes
        for (const [side, sideSegPins] of Object.entries(segPins)) {
            for (const segPin of sideSegPins) {
                const seg = segPin.feature;
                nodes[seg.getUrn()] = CableTree.segNode(
                    seg,
                    segPin.cable,
                    segPin.cable_side,
                    side,
                    segPin.n_connected,
                    segPin.conns,
                    segPin.housing,
                    this.struct,
                    segPin.circuits
                );
            }
        }

        /*
           Create Tree
        */
        for (const conduitData of structConduitData) {
            const parentNode = nodes[conduitData.structure_housing.getUrn()];
            parentNode.children.push(nodes[conduitData.conduit.getUrn()]);
        }

        for (const segPin of allSegPins) {
            const seg = segPin.feature;
            const parentKey = segPin.housing && segPin.housing.getUrn();
            const parentNode = nodes[parentKey] || nodes[this.urn];
            parentNode.children.push(nodes[seg.getUrn()]);
        }

        // Current state of tree is that there may be multiple entries for cables and
        // passthrough conduits under the same parent. Combine children where appropriate
        this._reduceStructConduitTree(structNode);

        return structNode;
    }

    /**
     * Traverse tree combining children where they refer to the same feature
     */
    _reduceStructConduitTree(tree) {
        const consolidatedChildren = {};

        for (const childNode of tree.children) {
            const nodeKey = childNode.feature.getUrn();

            const secondaryNodeKey = childNode.passThroughConduit
                ? childNode.passThroughConduit.getUrn()
                : null;

            const consolidatedChild =
                consolidatedChildren[nodeKey] || consolidatedChildren[secondaryNodeKey];

            if (consolidatedChild) {
                // Combine children
                consolidatedChild.children = consolidatedChild.children.concat(childNode.children);
            } else {
                consolidatedChildren[nodeKey] = childNode;
            }
        }

        tree.children = _.values(consolidatedChildren);

        // Recurse
        for (const childNode of tree.children) {
            this._reduceStructConduitTree(childNode);
        }

        return tree;
    }

    // Create conduit node
    createConduitTreeNode(conduit, passThroughConduit, housing, conduitRun) {
        const node = CableTree.featureNode(conduit);

        node.housing = housing;
        node.passThroughConduit = passThroughConduit;
        node.conduitRun = conduitRun;

        return node;
    }

    // ------------------------------------------------------------------------------
    //                               CABLE CONNECTION POINTS
    // ------------------------------------------------------------------------------

    /**
     * Get cable connection points on SIDE of STRUCT (with their connections)
     *
     * Returns a list of cable trees, keyed by cable urn
     */
    cableConnectionPointsFor(side) {
        let cableTrees = {};

        for (const connSide of ['in', 'out']) {
            const undirectedOnly = connSide != side;

            // Find pins (and their connections)
            const pinSets = this.segPins(undirectedOnly, !undirectedOnly);

            // Add them to tree
            for (const pinSet of pinSets[connSide]) {
                this._addCablePinSet(cableTrees, pinSet);
            }

            // Include internal segments
            for (const intPinSet of pinSets.int)
                this._addInternalCablePinSet(cableTrees, intPinSet);
        }

        cableTrees = Object.values(cableTrees);

        // Sort tree children
        for (const cableTree of cableTrees) {
            cableTree.children = this._orderedSegNodes(cableTree.children);
        }

        return cableTrees;
    }

    /**
     * Add pinSet to cableTree list cableTrees
     */
    _addCablePinSet(cableTrees, pinSet) {
        const cableUrn = pinSet.cable.getUrn();

        let tree = cableTrees[cableUrn];
        if (!tree) {
            tree = cableTrees[cableUrn] = {
                cable: pinSet.cable,
                children: []
            };
        }
        tree.children.push(pinSet);
    }

    /**
     * Add internal pinSet to cableTree list cableTrees
     */
    _addInternalCablePinSet(cableTrees, pinSet) {
        const cableUrn = pinSet.cable.getUrn();

        let parentTree = cableTrees[cableUrn];
        if (!parentTree) {
            // No parent, cableTree, this must be a fully internal cable
            parentTree = cableTrees[cableUrn] = {
                cable: pinSet.cable,
                children: []
            };
        }

        // Add a tree node parent for the internal segment
        const segParent = {
            cable: pinSet.cable,
            feature: pinSet.feature,
            children: [],
            isInternal: true,
            slack: pinSet.slack
        };
        parentTree.children.push(segParent);

        // Add both sides of the internal segment as children
        segParent.children.push(pinSet.in);
        segParent.children.push(pinSet.out);
    }

    // ------------------------------------------------------------------------------
    //                              EQUIPMENT TREE
    // ------------------------------------------------------------------------------

    /**
     * Equipment tree for 'struct' (an EquipTree)
     */
    // ENH: Return PinRanges in CircuitInfos
    equipTree() {
        // Build lookups
        const featureConns = _.groupBy(this.conns, conn => conn.properties.housing);
        const equipConns = this._groupByObject(this.conns);
        const equipCircuitPorts = _.groupBy(this.equipCircuitInfos, 'equip_urn');
        const segCircuitSegs = _.groupBy(this.segCircuitInfos, 'seg_urn');

        // Build nodes
        const nodes = {};
        for (const housing of [this.struct, ...this.equips]) {
            const urn = housing.getUrn();
            const pins = this._equipSideInfo(housing, featureConns, equipConns);

            const circuits = equipCircuitPorts[urn] || [];
            const spliceCircuits =
                pins.splices && this._spliceCircuits(pins.splices, segCircuitSegs);

            nodes[urn] = new EquipTree(housing, pins, circuits, spliceCircuits, this.segs);
        }

        // Build tree
        for (const equip of this.equips) {
            const node = nodes[equip.getUrn()];
            const housingUrn = equip.properties.housing;
            const parentNode = nodes[housingUrn];

            if (parentNode) {
                parentNode.addChild(node);
            } else {
                console.log(equip, ' : Cannot find housing ', housingUrn); // ENH: Use .trace()
            }
        }

        return nodes[this.struct.getUrn()];
    }

    /**
     * Returns info about the connections on each side of 'housing'
     *   in_pins   PinSet
     *   out_pins  PinSet
     *   splices   [Conns]
     *
     * where PinSet is an object with members:
     *    pins          A PinRange
     *    conns         A list of connection objects (Conns)
     *    n_connected   Number of connected pins
     *
     */
    _equipSideInfo(housing, featureConns, equipConns) {
        const housingUrn = housing.getUrn();
        const housingConns = featureConns[housingUrn] || [];

        const sideInfo = {};

        // Get contained splices
        const splices = this._housingSplices(housingUrn, housingConns);
        if (splices.length) sideInfo.splices = splices;

        // Get connections on each side
        for (const side of ['in', 'out']) {
            const pinSet = this._equipPinSet(housing, side, equipConns);

            if (pinSet) {
                sideInfo[`${side}_pins`] = pinSet;
            }
        }

        return sideInfo;
    }

    portsField(equip, side) {
        const techs = ['fiber', 'copper', 'coax'];
        for (const tech of techs) {
            let portsField = ['n', tech, side, 'ports'].join('_');
            if (portsField in equip.properties) return portsField;
            portsField = ['n', tech, 'ports'].join('_');
            if (portsField in equip.properties) return portsField;
        }

        return undefined;
    }

    /**
     * Returns PinSet for 'side' of 'equip' (if any)
     */
    _equipPinSet(equip, side, equipConns) {
        const equipUrn = equip.getUrn();

        // Get number of ports
        const portsField = this.portsField(equip, side);
        const nPorts = equip.properties[portsField];

        if (!nPorts) return;

        // Build pin info
        const pinSet = {};
        pinSet.pins = new PinRange(side, 1, nPorts);
        pinSet.conns = this._equipConns(equipUrn, side, equipConns[equipUrn]);
        pinSet.n_connected = this.nConnectedPins(pinSet.conns);

        return pinSet;
    }

    /**
     * Returns lookup table 'equip' -> [conn,conn,...]
     */
    _groupByObject(connRecs) {
        const equipConns = {};
        for (const connRec of connRecs) {
            this._groupByObjectAddIfNecessary(equipConns, connRec, connRec.properties.in_object);
            this._groupByObjectAddIfNecessary(equipConns, connRec, connRec.properties.out_object);
        }
        return equipConns;
    }

    /**
     * Add an entry to lookup table equipConns (if not already present)
     */
    _groupByObjectAddIfNecessary(equipConns, connRec, equipUrn) {
        let conns = equipConns[equipUrn];
        if (!conns) conns = equipConns[equipUrn] = [];
        if (!conns.includes(connRec)) conns.push(connRec);
    }

    /**
     * Return Conn instances for connections at 'side' of 'equipUrn'
     */
    _equipConns(equipUrn, side, connRecs) {
        const conns = [];
        if (!connRecs) return conns;

        for (const connRec of connRecs) {
            if (connRec.properties.in_object == equipUrn && connRec.properties.in_side == side)
                conns.push(new Conn(connRec, true, this.features));

            if (connRec.properties.out_object == equipUrn && connRec.properties.out_side == side)
                conns.push(new Conn(connRec, false, this.features));
        }

        this.isValid &&= _.every(conns, conn => conn.isValid);
        return conns;
    }

    /**
     * Return Conn instances for splices housed in housing
     */
    _housingSplices(housingUrn, housingConnRecs) {
        const conns = [];

        for (const connRec of housingConnRecs) {
            if (
                connRec.properties.in_object != housingUrn &&
                connRec.properties.out_object != housingUrn
            )
                conns.push(new Conn(connRec, true, this.features));
        }

        this.isValid &&= _.every(conns, conn => conn.isValid);
        return conns;
    }

    /**
     * Returns infos for circuits referenced in 'conns' (a list of splice Conns)
     */
    _spliceCircuits(conns, segCircuitSegs) {
        let circuits = [];

        // Only include segs for one side to avoid double counting
        const connSegUrns = _.unique(_.map(conns, conn => conn.from_ref));

        for (const segUrn of connSegUrns) {
            const circuitSegs = segCircuitSegs[segUrn];
            if (circuitSegs) circuits = circuits.concat(circuitSegs);
        }

        return circuits;
    }

    // -----------------------------------------------------------------------
    //                             CONDUIT HELPERS
    // -----------------------------------------------------------------------

    /**
     * Get info about conduit objects at this structure
     *
     * Returns list of ConduitInfo objects with properties:
     *     conduit
     *     connected_conduit
     *     conduit_run
     *     structure_housing
     */
    conduitInfos() {
        const result = [];

        for (const conduit of this.conduits) {
            const housingUrn = conduit.properties.housing;

            const conduitRunUrn = conduit.properties.conduit_run;

            let passThroughConduitUrn;
            if (conduit.properties.in_structure == this.urn) {
                passThroughConduitUrn = conduit.properties.in_conduit;
            } else if (conduit.properties.out_structure == this.urn) {
                passThroughConduitUrn = conduit.properties.out_conduit;
            }

            const info = {
                conduit: conduit,
                connected_conduit: this.features[passThroughConduitUrn],
                conduit_run: this.features[conduitRunUrn],
                structure_housing: this.features[housingUrn] || this.struct // Consider as housed in the structure
            };

            result.push(info);
        }

        return result;
    }

    // -----------------------------------------------------------------------
    //                             CABLE PIN HELPERS
    // -----------------------------------------------------------------------

    /**
     * Get cable connection points in self
     *
     * Returns object with properties:
     *   in    List of segInfos
     *   out   List of segInfos
     *   int   List of intSegInfos
     *
     * An intSegInfo is an object with properties:
     *    feature
     *    cable
     *    housing
     *    in       a segInfo
     *    out      a segInfo
     *
     * A segInfo is an object with properties:
     *    feature
     *    cable
     *    cable_side
     *    pins
     *    conns
     *    circuits
     *    n_connected
     *    housing
     */
    segPins(undirectedOnly = false, includeInternal = true) {
        const result = {};

        // Build lookups
        const circuitsBySeg = _.groupBy(this.segCircuitInfos, 'seg_urn');
        const sideSegs = this.segsBySide();

        // Add pins on in and out segments
        for (const side of ['in', 'out']) {
            const segInfos = [];
            const cableSide = this.oppositeSide[side];

            for (const seg of sideSegs[side]) {
                if (undirectedOnly && seg.properties.directed) continue;
                const segInfo = this._segInfoFor(seg, side, cableSide, circuitsBySeg);
                segInfos.push(segInfo);
            }

            result[side] = segInfos;
        }

        // Add pins on each side of internal segments
        result.int = [];
        if (includeInternal) {
            for (const seg of sideSegs['int']) {
                if (undirectedOnly && seg.properties.directed) continue;

                const intSegInfo = {
                    feature: seg,
                    housing: this.features[seg.properties.housing],
                    cable: this.features[seg.properties.cable]
                };

                for (const side of ['in', 'out']) {
                    intSegInfo[side] = this._segInfoFor(seg, side, side, circuitsBySeg);
                }

                result.int.push(intSegInfo);
            }
        }

        // Include slack info
        const slacksBySeg = this.slacksBySeg();

        for (const pinSets of _.values(result)) {
            for (const pinSet of pinSets) {
                pinSet.slack = slacksBySeg[pinSet.feature.getUrn()];
            }
        }

        return result;
    }

    /**
     * Builds a segInfo for 'segSide' of 'seg'
     */
    _segInfoFor(seg, cableSide, side, circuitsBySeg) {
        const seg_urn = seg.getUrn();
        const cable = this.features[seg.properties.cable];
        const count = cable.pinCount() || 0;
        const conns = this._segConns(seg_urn, side, this.conns);

        return {
            feature: seg,
            cable: cable,
            cable_side: cableSide,
            pins: new PinRange(side, 1, count),
            conns: conns,
            circuits: circuitsBySeg[seg_urn] || [],
            n_connected: this.nConnectedPins(conns),
            housing: this.features[seg.properties.housing]
        };
    }

    /**
     * Returns subset of connections from connRecs that are on 'side' of 'segUrn'
     */
    _segConns(segUrn, side, connRecs) {
        const conns = [];

        for (const connRec of connRecs) {
            if (connRec.properties.in_object == segUrn && connRec.properties.in_side == side)
                conns.push(new Conn(connRec, true, this.features));

            if (connRec.properties.out_object == segUrn && connRec.properties.out_side == side)
                conns.push(new Conn(connRec, false, this.features));
        }

        this.isValid &&= _.every(conns, conn => conn.isValid);
        return conns;
    }

    // -----------------------------------------------------------------------
    //                             CONTAINMENT HELPERS
    // -----------------------------------------------------------------------

    /**
     * Returns list of slack equips, keyed by the segment they own
     */
    slacksBySeg() {
        const slacksBySeg = {};

        for (const seg of this.segs) {
            if (this._sideOf(seg) == 'int') {
                const housing = this.features[seg.properties.housing];

                if (housing && housing.definedFunction() == 'slack') {
                    slacksBySeg[seg.getUrn()] = housing;
                }
            }
        }

        return slacksBySeg;
    }

    /**
     * Cable segments grouped by orientation relative to structure
     *
     * Returns object with keys:
     *   in   Incoming segments
     *   int  Internal segments
     *   out  Outgoing segments
     */
    segsBySide() {
        const res = { in: [], int: [], out: [] };

        for (const seg of this.segs) {
            const side = this._sideOf(seg);
            if (side) res[side].push(seg);
        }

        return res;
    }

    /**
     * The side of self's struct on which cable segment 'seg' sits ('in', 'int' or 'out')
     */
    _sideOf(seg) {
        const props = seg.properties;

        if (props.in_structure == this.urn && props.out_structure == this.urn) return 'int';
        if (props.out_structure == this.urn) return 'in';
        if (props.in_structure == this.urn) return 'out';
    }

    /**
     * Returns number of connected pins derived from CONNS
     * Does not include proposed connections
     */
    nConnectedPins(conns) {
        let n_pins = 0;
        for (const conn of conns) {
            if (!conn.conn_rec.isProposed()) n_pins += conn.from_pins.size;
        }

        return n_pins;
    }
}
