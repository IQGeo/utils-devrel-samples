// Copyright: IQGeo Limited 2010-2023
import _ from 'underscore';
import myw from 'myWorld-client';
import PinRange from './pinRange';

const otherSide = { in: 'out', out: 'in' };

// Add an entry to 'dict' if not already present
// ENH: Move to utils
const entryFor = function (dict, key, defaultVal) {
    if (dict[key] !== undefined) return dict[key];
    dict[key] = defaultVal;
    return dict[key];
};

// Update dict 'dict' with values from 'other'
// ENH: Move to utils
const addEntries = function (dict, other) {
    for (const [key, val] of Object.entries(other)) {
        dict[key] = val;
    }

    return dict;
};

// A segment end
class SegSide {
    constructor(seg, side) {
        this.seg = seg;
        this.side = side;
        this.id = seg.getUrn() + '/' + side;
    }
}

export default class EquipTree extends myw.Class {
    /**
     * @class A node in a structure containment tree
     *
     * Has properties:
     *    feature            A struct or equip
     *    pins               Pins on equip (a list of PinInfos keyed by 'in_pins', 'out_pins' + list of conns in 'splices')
     *    segments           Cable segments directly contained within equip (a dict of lists of SegSides)
     *    circuits           Circuits running on ports of equip (a list of PortCircuitInfos)
     *    splice_circuits    Circuits running on splices housed in equip (a list of SegCircuitInfos)
     *    children           List of child nodes
     *
     * where PinInfo is an object with properties:
     *    pins         A PinRange
     *    conns        A list of Conn objects
     *    n_connected  Number of pins connected
     *
     * and SegSide is an object with properties:
     *    id           String identifying end
     *    seg          Cable segment
     *    side         Side of segment ('in' or 'out')
     *
     * and PortCircuitInfo is an object with properties:
     *    circuit_urn URN of circuit record
     *    urn         URN of mywcom_circuit_port
     *    equip_urn   URN of equip on which circuit runs
     *    side        Side of equip
     *    low         Port range low
     *    high        Port range high
     *
     * and SegCircuitInfo is an object with properties:
     *    circuit_urn URN of circuit record
     *    urn         URN of mywcom_circuit_segment
     *    seg_urn     URN of cable segment on which circuit runs
     *    low         Fiber range low
     *    high        Fiber range high
     *
     * Also provides tree behaviour
     */
    constructor(feature, pins, circuits, splice_circuits, structSegs) {
        super();
        this.feature = feature;
        this.pins = pins;
        this.circuits = circuits;
        this.splice_circuits = splice_circuits;

        this.segSides = this._segSides(structSegs);

        this.parent = null;
        this.children = [];
    }

    // ----------------------------------------------------------------------------
    //                                 SEGMENT CONTAINMENT
    // ----------------------------------------------------------------------------

    /**
     * Cable segments directly contained within self
     */
    _segSides(structSegs) {
        const impSegSides = this._implicitSegSides();
        const expSegSides = this._explicitSegSides(structSegs);

        const allSegSides = {};
        for (const segSide of impSegSides) allSegSides[segSide.id] = segSide;
        for (const segSide of expSegSides) allSegSides[segSide.id] = segSide;

        return { implicit: impSegSides, explicit: expSegSides, all: Object.values(allSegSides) };
    }

    /**
     * Cable segments directly contained within self via connection housing
     */
    _implicitSegSides() {
        const segSides = [];

        // Add implicitly contained cables
        for (const conn of this.conns()) {
            if (conn.from_cable) {
                segSides.push(new SegSide(conn.from_feature, conn.from_side));
            }

            if (conn.to_cable) {
                segSides.push(new SegSide(conn.to_feature, conn.to_side));
            }
        }

        return segSides;
    }

    /**
     * Cable segments directly contained within self via equip field
     */
    _explicitSegSides(structSegs) {
        const housingUrn = this.feature.getUrn();
        const segSides = [];

        for (const seg of structSegs) {
            const inHousing = seg.properties.in_equipment || seg.properties.in_structure;
            const outHousing = seg.properties.out_equipment || seg.properties.out_structure;

            if (inHousing == housingUrn) segSides.push(new SegSide(seg, 'in'));
            if (outHousing == housingUrn) segSides.push(new SegSide(seg, 'out'));
        }

        return segSides;
    }

    // ----------------------------------------------------------------------------
    //                                  NODE BEHAVIOUR
    // ----------------------------------------------------------------------------

    /**
     * Add a child node
     */
    addChild(node) {
        this.children.push(node);
        node.parent = this;
    }

    /**
     * All connection records housed in self
     */
    // ENH: Exclude duplicates e.g. return list keyed by URN
    conns() {
        const conns = [];

        if (this.pins.in_pins) {
            for (const conn of this.pins.in_pins.conns) {
                conns.push(conn);
            }
        }

        if (this.pins.out_pins) {
            for (const conn of this.pins.out_pins.conns) {
                conns.push(conn);
            }
        }

        if (this.pins.splices) {
            for (const conn of this.pins.splices) {
                conns.push(conn);
            }
        }

        // TODO: HACK for splice report
        for (const conn of conns) {
            conn.equipNode = this;
        }

        return conns;
    }

    /**
     * URNs of cables directly contained within self
     *
     * 'type' is containment type ('implicit', 'explicit' or 'all')
     */
    cables(type = 'all') {
        const cableUrns = new Set();

        for (const segSide of this.segSides[type]) {
            cableUrns.add(segSide.seg.properties.cable);
        }

        return [...cableUrns];
    }

    /**
     * Segments directly contained within 'side' of self
     *
     * 'type' is containment type ('implicit', 'explicit' or 'all')
     */
    segs(side, type = 'all') {
        return [...this.segments[side][type]];
    }

    /**
     * Urns of circuits running on selfs ports and splices
     */
    circuitUrns() {
        const circuitUrns = [];
        for (const info of this.circuits) {
            circuitUrns.push(info.circuit_urn);
        }

        if (this.splice_circuits) {
            for (const info of this.splice_circuits) {
                circuitUrns.push(info.circuit_urn);
            }
        }

        return _.unique(circuitUrns);
    }

    /**
     * Circuits running on 'pin' of self
     */
    circuitsOn(side, pin) {
        const circuits = [];

        // Add port info
        for (const info of this.circuits) {
            if (info.pins.side == side && info.pins.includesPin(pin)) {
                circuits.push(info.circuit_urn);
            }
        }

        // Add splice info
        if (this.splice_circuits) {
            for (const info of this.splice_circuits) {
                if (info.pins.includesPin(pin)) {
                    circuits.push(info.circuit_urn);
                }
            }
        }
        return circuits;
    }

    // ----------------------------------------------------------------------------
    //                                  TREE BEHAVIOUR
    // ----------------------------------------------------------------------------

    /**
     * Node of self that relates to 'equipUrn' (if any)
     */
    subtreeFor(equipUrn) {
        // Try self
        if (this.feature.getUrn() == equipUrn) return this;

        // Try children
        for (const child of this.children) {
            const node = child.subtreeFor(equipUrn);
            if (node) return node;
        }

        return null;
    }

    /**
     * List of containing features (top down)
     */
    path(fromNode = null) {
        if (!this.parent) return [this];

        const parents = this.parent.path(fromNode);
        return [...parents, this];
    }

    /**
     * Equipment housed in self's subtree (including self)
     */
    allEquips() {
        const equips = {};

        equips[this.feature.getUrn()] = this.feature;

        for (const child of this.children) {
            addEntries(equips, child.allEquips());
        }

        return equips;
    }

    /**
     * Segments contained within self and self's subtree that are connectable on 'side' of equip
     */
    allConnectableSegs(side) {
        const cableSide = otherSide[side];

        const segs = new Set();
        for (const segSide of this.allSegSides('all')) {
            const seg = segSide.seg;
            if (segSide.side == cableSide || !seg.properties.directed) {
                segs.add(seg);
            }
        }

        return [...segs];
    }

    /**
     * Segments contained within self and self's subtree
     *
     * 'type' is containment type ('implicit', 'explicit' or 'all')
     */
    allSegSides(type = 'all') {
        const segSides = new Set(this.segSides[type]);

        for (const child of this.children) {
            for (const segment of child.allSegSides(type)) {
                segSides.add(segment);
            }
        }

        return [...segSides];
    }

    /**
     * Connection objects housed in self and self's subtree
     */
    allConns() {
        const conns = this.conns();

        for (const child of this.children) {
            conns.push(...child.allConns());
        }

        return conns;
    }

    /**
     * Circuit urns referenced by self and self's children
     */
    allCircuitUrns() {
        const circuitUrns = this.circuitUrns();

        for (const child of this.children) {
            circuitUrns.push(...child.allCircuitUrns());
        }

        return _.unique(circuitUrns);
    }

    // -----------------------------------------------------------------------------
    //                              TRACE TREE BUILDING
    // -----------------------------------------------------------------------------
    // ENH: Move this onto connectivity report?

    /**
     * Find the root pins of self's sub-tree and the objects they connect to
     *
     * Returns a list of PinTree objects with properties:
     *    feature    Pin owner (an equip or segment)
     *    pin        Out pin on feature that this node represents
     *    conn       Connection from upstream object (a Conn)
     *    cable      Cable that owns 'feature' (if segment)
     *    equipNode  Tree node for pin owner
     *    children   Downstream objects (a list of PinTrees)
     */
    traceTrees() {
        // Find all connections
        const conns = this.allConns();
        const equips = this.allEquips();

        // Build list of features in subtree
        const features = {};
        for (const conn of conns) {
            addEntries(features, conn.features());
        }
        addEntries(features, equips);

        // Get connections on each side of each feature
        const featureInfos = {};
        for (const conn of conns) {
            this.addConn(conn, featureInfos, features);
        }
        if (myw.isTracing('EquipTree', 3)) this.logFeatureInfos(featureInfos);

        // Find main 'root' features (those with no incoming connections)
        const rootFeatureInfos = {};
        for (const featureInfo of Object.values(featureInfos)) {
            if (!Object.values(featureInfo.conns['in']).length) {
                rootFeatureInfos[featureInfo.urn] = featureInfo;
            }
        }

        // Build trees from each root out pin
        const pinTrees = [];
        for (const featureInfo of Object.values(rootFeatureInfos)) {
            const trees = this.buildPinTreesFor(featureInfo, featureInfos);
            pinTrees.push(...trees);
        }

        // Add trees for any segments not already found (catches undirected segments in cycles)
        for (const featureInfo of Object.values(featureInfos)) {
            if (!featureInfo.pinTree && featureInfo.isSeg) {
                const trees = this.buildPinTreesFor(featureInfo, featureInfos);
                pinTrees.push(...trees);
            }
        }

        // Add trees for any remaining objects (catches undirected equipment in cycles)
        for (const featureInfo of Object.values(featureInfos)) {
            if (!featureInfo.pinTree) {
                const trees = this.buildPinTreesFor(featureInfo, featureInfos);
                pinTrees.push(...trees);
            }
        }

        // Set housings
        for (const pinTree of pinTrees) {
            pinTree.housing = this.housingFor(pinTree, features);
        }

        return pinTrees;
    }

    /**
     * Add 'conn' to the sides of the features that it connects
     */
    addConn(conn, featureInfos, features) {
        const connUrn = conn.conn_rec.getUrn();

        // Add to 'from' object (handling undirected cables)
        {
            const urn = conn.from_ref;
            const info = this.ensureFeatureInfoEntryFor(urn, featureInfos, features);

            if (conn.logicalFromSide() == 'out') {
                info.conns['out'][connUrn] = conn;
            } else {
                const sideConn = conn.reversed();
                sideConn.equipNode = conn.equipNode;
                info.conns['in'][connUrn] = sideConn;
            }
        }

        // Add to 'to' object (handling undirected cables)
        {
            const urn = conn.to_ref;
            const info = this.ensureFeatureInfoEntryFor(urn, featureInfos, features);

            if (conn.logicalToSide() == 'in') {
                info.conns['in'][connUrn] = conn;
            } else {
                const sideConn = conn.reversed();
                sideConn.equipNode = conn.equipNode;
                info.conns['out'][connUrn] = sideConn;
            }
        }
    }

    /**
     * Create and entry for 'urn' in 'featureInfos' (if not already present)
     */
    ensureFeatureInfoEntryFor(urn, featureInfos, features) {
        const ftr = features[urn];
        const isSeg = this.isSegment(urn);

        const info = entryFor(featureInfos, urn, {
            urn: urn,
            feature: ftr,
            conns: { in: {}, out: {} },
            outFeatures: {},
            isSeg: isSeg
        });

        if (isSeg) {
            info.cable = features[ftr.properties.cable];
            info.outPins = new PinRange('out', 1, info.cable.pinCount());
        } else {
            let nPorts = ftr.properties.n_fiber_out_ports || ftr.properties.n_fiber_ports; // TODO: Get from connection manager
            nPorts = nPorts || ftr.properties.n_copper_out_ports || ftr.properties.n_copper_ports;
            if (nPorts) {
                info.outPins = new PinRange('out', 1, nPorts);
            }
        }

        return info;
    }

    /**
     * Build pin tree for each 'out' pin of 'featureInfo'
     *
     * Returns list of PinTree trees
     */
    buildPinTreesFor(featureInfo, featureInfos) {
        const pinTrees = [];
        if (!featureInfo.outPins) return pinTrees; //cope with terminating equipment
        for (let pin = featureInfo.outPins.low; pin <= featureInfo.outPins.high; pin++) {
            const pinTree = this.buildPinTree(featureInfo, null, pin, null, featureInfos);
            pinTrees.push(pinTree);
        }

        return pinTrees;
    }

    /**
     * Build tree of objects downstream of 'pin' of 'featureInfo' (recursive)
     *
     * Returns tree of PinTree objects with properties:
     *    feature    Pin owner (an equip or segment)
     *    pin        Out pin on feature that this node represents
     *    conn       Connection from upstream object (a Conn)
     *    cable      Cable that owns 'feature' (if segment)
     *    equipNode  Tree node for pin owner
     *    children   Downstream objects (a list of PinTrees)
     */
    // ENH: Move functionality to featureInfos object? (StuctContent or similar)
    buildPinTree(featureInfo, inPin, outPin, conn, featureInfos, activeFeatures = []) {
        const feature = featureInfo.feature;
        const cable = featureInfo.cable;

        // Create item for pin
        const pinTree = {
            feature: feature,
            inPin: inPin,
            outPin: outPin,
            conn: conn,
            cable: cable,
            children: []
        };
        featureInfo.pinTree = pinTree;

        // Add circuits
        if (conn && conn.equipNode) {
            const circuitPin = cable ? conn.fromPinFor(outPin) : outPin;
            pinTree.circuits = conn.equipNode.circuitsOn('out', circuitPin);
        }

        // Avoid infinite recursion
        if (activeFeatures.includes(feature)) {
            myw.trace('EquipTree:', 1, ' cycle detected', feature.getUrn(), inPin, outPin);
            return pinTree;
        }
        activeFeatures.push(feature);

        // For each connection from out pin .. add downstream child
        if (outPin) {
            for (const childConn of _.values(featureInfo.conns['out'])) {
                if (childConn.from_pins.includesPin(outPin)) {
                    const childInPin = childConn.toPinFor(outPin);

                    // Case: Child is cable segment
                    if (childConn.to_cable) {
                        const child = this.buildPinTree(
                            featureInfos[childConn.to_ref],
                            childInPin,
                            childInPin,
                            childConn,
                            featureInfos,
                            activeFeatures
                        );
                        pinTree.children.push(child);
                    }

                    // Case: Child is Equip
                    else {
                        const childOutPins = this.outPinsFor(childConn.to_feature, childInPin);
                        if (childOutPins) {
                            for (
                                let childOutPin = childOutPins.low;
                                childOutPin <= childOutPins.high;
                                childOutPin++
                            ) {
                                const child = this.buildPinTree(
                                    featureInfos[childConn.to_ref],
                                    childInPin,
                                    childOutPin,
                                    childConn,
                                    featureInfos,
                                    activeFeatures
                                );
                                child.equipNode = childConn.equipNode;
                                pinTree.children.push(child);
                            }
                        } else {
                            const child = this.buildPinTree(
                                featureInfos[childConn.to_ref],
                                childInPin,
                                null,
                                childConn,
                                featureInfos,
                                activeFeatures
                            );
                            featureInfos[childConn.to_ref].pinTree = null; // TODO: HACK
                            child.equipNode = childConn.equipNode;
                            pinTree.children.push(child);
                        }
                    }
                }
            }
        }

        activeFeatures.pop();

        return pinTree;
    }

    /**
     * Show what we built (for debugging)
     */
    logFeatureInfos(featureInfos) {
        console.log('buildPinTree() FeatureInfos');

        for (const featureInfo of Object.values(featureInfos)) {
            console.log('  ', featureInfo.feature.getUrn(), featureInfo.feature.properties.cable);

            for (const side of ['in', 'out']) {
                for (const conn of _.values(featureInfo.conns[side])) {
                    console.log('    ', side, ':', conn.__ident__());
                }
            }
        }
    }

    /**
     * The housing to show for 'pinTree' (if any)
     */
    housingFor(pinTree, features) {
        if (pinTree.cable) {
            if (!pinTree.children.length) return undefined;

            const conn = pinTree.children[0].conn;
            const housing = conn.housing_feature;

            // Case cable -> cable: Use immediate housing
            if (conn.to_cable) return housing;

            // Case cable -> equip: Use equipment housing
            if (housing.properties.housing) {
                return features[housing.properties.housing];
            }

            return undefined;
        } else {
            return features[pinTree.feature.properties.housing];
        }
    }

    /**
     * The out pins on 'equip' that are connected to 'inPin' via implicit connections
     */
    // TODO: Duplicated with trace engine
    outPinsFor(equip, inPin) {
        const func = equip.definedFunction();
        if (func == 'mux') return new PinRange('out', 1);
        if (func == 'splitter')
            return new PinRange(
                'out',
                1,
                equip.properties.n_fiber_out_ports || equip.properties.n_copper_out_ports
            );
        if (func == 'connector') return new PinRange('out', inPin, inPin);
    }

    typeOf(urn) {
        return this.isSegment(urn) ? 'seg' : 'equip';
    }

    isSegment(urn) {
        return myw.app.plugins.cableManager.isSegment(urn);
    }
}
