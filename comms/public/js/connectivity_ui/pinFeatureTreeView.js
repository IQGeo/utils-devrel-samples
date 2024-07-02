// Copyright: IQGeo 2010-2023
import $ from 'jquery';
import _ from 'underscore';
import myw, { Form, UnitInput, Dialog } from 'myWorld-client';
import FeatureTreeView from '../base/featureTreeView';
import PinRange from '../api/pinRange';
import SetTickMarkDialog from './setTickMarkDialog';
import EquipmentSelectionDialog from './equipmentSelectionDialog';
import loadingSrc from 'images/loading.svg';

export default class PinFeatureTreeView extends FeatureTreeView {
    static {
        this.mergeOptions({
            selectMultiple: true
        });
    }

    // Constructor
    constructor(owner, options) {
        super(owner, options);

        // Icons
        this.icons = {
            port: 'modules/comms/images/features/port.svg',
            splice: 'modules/comms/images/features/fiber.svg',
            cable: 'modules/comms/images/features/fiber.svg',
            circuit: 'modules/comms/images/features/circuit.svg'
        };

        this.pathIcons = {
            port_to_port: 'modules/comms/images/paths/port_to_port.svg',
            port_to_fiber: 'modules/comms/images/paths/port_to_fiber.svg',
            fiber_to_port: 'modules/comms/images/paths/fiber_to_port.svg'
        };

        // Managers
        this.displayManager = owner.app.plugins.displayManager;
        this.cableManager = owner.app.plugins.cableManager;
        this.connectionManager = this.app.plugins.connectionManager;
        this.specManager = this.app.plugins.specManager;
        this.locManager = this.app.plugins.locManager;

        // Filter string
        this.filterStr = '';

        // Redraw if display options changed
        // Note: Done here rather than in setEventHandlers() since we only want to do it once
        this.listenTo(this.displayManager, 'state-changed', feature => {
            // Only refresh if its for our feature
            if (this.feature && this.feature.getUrn() == feature.getUrn()) this.refreshFor(feature);
        });
    }

    /*
     * Set event handlers after change to this.feature
     */
    setEventHandlers() {
        super.setEventHandlers();

        // On open tree node, add termination info
        if (this.options.showPaths) {
            this.container.on('open_node.jstree', (evt, data) => {
                this.ensurePaths(data.node);
            });
        }

        // On open, if node has circuits, load. Needed to replace the child that was created when node was made in _addCircuitCount (to allow double click opening)
        // ENH: how important is the double click functionality (esp on mobile?). Consider removing.
        this.container.on('open_node.jstree', async (evt, data) => {
            if (!data.node.original.circuitCount) return; // No circuits to load
            if (
                data.node.original.children?.length > 0 &&
                data.node.original.children[0].state.opened
            )
                return; // Circuit info is already there do not fetch again
            await this._showCircuitsFor(data.node);
        });

        // On hover, highlight current feature in schematic etc
        this.container.on('hover_node.jstree', (evt, data) => {
            this._fireHighlightEvents(data, true);
        });

        // On de-hover, remove highlight from schematic etc
        this.container.on('dehover_node.jstree', (evt, data) => {
            this._fireHighlightEvents(data, false);
        });
    }

    /**
     * Fires comms highlight events for node
     * @param {Object} data
     * @param {Boolean} highlight
     */
    _fireHighlightEvents(data, highlight = true) {
        let action = 'highlight';
        if (!highlight) {
            action = 'unhighlight';
        }

        if (data.node.original.feature) {
            this.app.fire(`comms-${action}-feature`, {
                feature: data.node.original.feature
            });
        }
        if (data.node.original.nodeType == 'splice') {
            // ENH: find better way to get segment urns
            this.app.fire(`comms-${action}-features`, {
                urns: [
                    data.node.original.conns.conns[0].from_ref,
                    data.node.original.conns.conns[0].to_ref
                ]
            });
        }
    }

    // ------------------------------------------------------------------------------
    //                               TREE BUILDING
    // ------------------------------------------------------------------------------

    /**
     * Add a node for each pin in range low:high with connections from conns
     *
     * 'feature' is a cable segment or equip. 'cable' and 'cableSide' are set for segments only
     */
    addPinNodes(
        feature,
        pinType,
        pins,
        conns,
        parentNode,
        cable = null,
        cableSide = null,
        // circuit info
        circuits = []
    ) {
        const color2 = '#6666FF'; // Secondary highlight

        // Build highlight reps
        const otherCableSide = cableSide === 'in' ? 'out' : 'in';
        const currSideGeomRep = this.geomRepForCable(cable, feature, cableSide);
        const otherSideGeomRep = this.geomRepForCable(cable, feature, otherCableSide, color2);

        const pinNodes = {};
        // list of circuits keyed on their pin for segment or port
        const segPinsWithCircuits = this._segPinsWithCircuits(feature, circuits);

        // Create pin nodes
        for (let pin = pins.low; pin <= pins.high; pin++) {
            // list of circuits on pin
            const pinCircuits = this._getCircuitsForPin(segPinsWithCircuits, pin);
            const nodeText = cable
                ? this.displayManager.pinLabel(cable, pin)
                : this.displayManager.pinTextFor(feature, pin, pins.side);

            const icon = pinCircuits.length > 0 ? this.icons.circuit : this.icons[pinType];

            const node = this.newNode({
                feature: feature,
                text: nodeText,
                icon: icon,
                nodeType: 'pin',
                side: pins.side,
                pin: pin,
                pinType: pinType,
                circuitCount: pinCircuits.length,
                highlight: currSideGeomRep,
                highlight2: otherSideGeomRep,
                sortValue: `${pin}`,
                li_attr: { class: 'jstree-leaf-node' }
            });

            if (node.circuitCount > 0) node.circuitInfo = pinCircuits;

            parentNode.children.push(node);
            node.children = [];
            pinNodes[pin] = node;
        }

        // Add connection info
        this._addPinConnectionInfo(pinNodes, conns, cable, color2);

        // Add circuit info
        this._addCircuitCount(pinNodes);

        // Add loc info
        if (this.displayManager.showLoc) {
            const side = pinType == 'port' ? pins.side : undefined;
            this.locManager.addStrandStatusToPins(pinNodes, feature, side);
        }
    }

    /**
     * Returns list of circuit info(s) on FEATURE (segment or equipment) keyed on their pin
     * @param {MywFeature} feature
     * @param {Array} circuits list of circuit info in a piece of equipment
     * @returns
     */
    _segPinsWithCircuits(feature, circuits) {
        const pinsWithCircuits = [];
        circuits.forEach(circuitInfo => {
            const pins = circuitInfo.pins;
            for (let pin = pins.low; pin <= pins.high; pin++) {
                let pinCirc = {};
                pinCirc[pin] = { feature: circuitInfo.circuit_urn };
                pinCirc[pin].proposed = this._isProposedCircuit(circuitInfo);
                const circInfoFeatureUrn = circuitInfo.seg_urn || circuitInfo.equip_urn;
                if (feature.getUrn() === circInfoFeatureUrn) pinsWithCircuits.push(pinCirc);
            }
        });

        return pinsWithCircuits;
    }

    /**
     * return list of circuits on pin
     * @param {Array} circuits list of circuit for for segment
     * @param {integer} pin
     */
    _getCircuitsForPin(circuits, pin) {
        const pinCircuits = [];
        circuits.forEach(pinWithCircuit => {
            if (Object.keys(pinWithCircuit)[0] == pin) {
                pinCircuits.push(pinWithCircuit[pin]);
            }
        });

        return pinCircuits;
    }

    /**
     * Add circuit count to each node of 'pinNodes'
     * @param {object} pinNodes
     */
    _addCircuitCount(pinNodes) {
        Object.keys(pinNodes).forEach(nodeKey => {
            const node = pinNodes[nodeKey];

            if (node.circuitCount > 0) {
                node.text +=
                    ' ' +
                    this.displayManager.circuitCount(
                        node.circuitCount,
                        this._allProposed(node.circuitInfo)
                    );
                node.children.push('<lazy_evaluated>'); // To trick js tree into opening on double click (will be replaced through open event)
            }
        });
    }

    /**
     * Returns true if all circuits on pin are proposed
     * @param {Array} circuits
     */
    _allProposed(circuits) {
        let allProposed = true;

        for (const circuit of circuits) {
            if (!circuit.proposed) {
                allProposed = false;
                break;
            }
        }

        return allProposed;
    }

    /**
     * Update pin nodes to show what they are connected to
     */
    _addPinConnectionInfo(pinNodes, conns, cable, color2) {
        for (const conn of conns) {
            // Determine colours for highlights
            const fromCableColor = conn.from_cable === cable ? undefined : color2;
            const toCableColor = !cable || conn.to_cable === cable ? undefined : color2;
            const currentDelta = this.ds.getDelta();

            // Build highlights
            const fromGeomRep = this.geomRepForCable(
                conn.from_cable,
                conn.from_feature,
                conn.from_cable_side,
                fromCableColor
            );
            const toGeomRep = this.geomRepForCable(
                conn.to_cable,
                conn.to_feature,
                conn.to_cable_side,
                toCableColor
            );

            // Update nodes for connection (avoiding problems with broken data)
            for (let pin = conn.from_pins.low; pin <= conn.from_pins.high; pin++) {
                const node = pinNodes[pin];

                // Check for broken data
                if (!node) {
                    console.log(`equipmentTree: No node for pin ${pin}`); // ENH: use trace() instead
                    continue;
                }

                // Check for already added (can happen with bi-directional cables
                if (node.conn && node.conn.urn === conn.urn) continue;

                // for handling if connection is in both master and one or more designs (gazumped)
                const gazumped = node.conn && conn.delta && conn.delta !== currentDelta;
                if (!gazumped) node.conn = conn;

                node.text += this.displayManager.connLabel(pin, conn);

                if (conn.delta && this.ds.getDelta() != conn.delta) {
                    if (!gazumped) node.proposed = true;
                    node.highlight = null;
                    node.highlight2 = null;
                    node.link = conn.delta;
                    continue;
                }

                node.highlight = fromGeomRep;
                node.highlight2 = toGeomRep;
            }
        }
    }

    /**
     * Helper to add slack icon and total length to 'cableNode'
     */
    addSlackSummary(cableNode) {
        let totalSlackLength = 0;
        let slackFeature;

        cableNode.children.forEach(segNode => {
            if (!segNode.slack) return; // this is a continue

            slackFeature = segNode.slack;
            totalSlackLength += slackFeature.properties.length || 0;
        });

        if (slackFeature) {
            this.addRightIcon(cableNode, this.getIconFor(slackFeature));
            const slackLength = slackFeature.formattedFieldValue('length', null, totalSlackLength);
            if (slackLength) cableNode.text += ` ${slackLength}`;
        }
    }

    /**
     * Returns highlight object for part of 'cable' on 'side' of current feature
     *
     * For convenience, cable can be undefined
     */
    geomRepForCable(cable, seg, side, color = undefined) {
        if (!cable) return undefined;

        // Determine vertex to split at
        let iSplit = this.cableSplitVertexFor(cable, seg);
        if (iSplit === undefined) return undefined;

        // Build geometry
        const geom = this.geomSide(cable.geometry, side, iSplit);
        if (!geom) return undefined;

        // Build rep
        const id = cable.getUrn() + '-' + side + '-' + seg.getUrn();
        return this.geomRepFor(cable, geom, id, color); // ENH: Cache this to avoid rebuilding
    }

    /*
     * The vertex at which to split 'cable' for highlighting
     */
    cableSplitVertexFor(cable, seg) {
        const geom = cable.geometry;

        // Find coordinate to split at
        let coord;
        if (this.feature.geometry.type === 'Point') {
            coord = this.feature.geometry.coordinates;
        } else {
            coord = this.feature.geometry.coordinates[0];
        }

        // Find vertices at that location
        const vertices = this._geomIndicesOfCoord(geom.coordinates, coord);

        // Case: not found (should never happen)
        if (!vertices.length) return undefined;

        // Case: passes through once (so split there)
        if (vertices.length == 1) return vertices[0];

        // Case: Loop or re-enterant (so find pieces to use)
        const segCoords = seg.geometry.coordinates;
        let segCoord;
        if (this._coordsEqual(segCoords[0], coord)) {
            segCoord = segCoords[segCoords.length - 1];
        } else {
            segCoord = segCoords[0];
        }

        let prevVertex = 0;
        for (const vertex of vertices) {
            if (this._geomHasCoord(geom.coordinates, segCoord, prevVertex, vertex + 1)) {
                if (seg.properties.forward) {
                    return vertex;
                } else {
                    return prevVertex;
                }
            }
            prevVertex = vertex;
        }

        return vertices[vertices.length - 1];
    }

    /**
     * The section of 'geom' on 'side' of vertex 'iSplit' (if any)
     * Side is 'in' 'or 'out'
     */
    // ENH: Handle closed loops better
    geomSide(geom, side, iSplit) {
        if (!iSplit) return geom;

        // Find coords
        let sideCoords;
        if (side === 'in') {
            sideCoords = geom.coordinates.slice(0, iSplit + 1);
        } else {
            sideCoords = geom.coordinates.slice(iSplit);
        }

        // Build geometry
        if (sideCoords.length < 2) return geom;

        return {
            type: 'LineString',
            coordinates: sideCoords
        };
    }

    /*
     * Returns the vertex number of the first occurance of 'coord' in 'coords' (if any)
     */
    // ENH: Move to base
    _geomIndicesOfCoord(coords, coord, from = 0, to = coords.length) {
        const indices = [];

        for (let i = from; i < to; i++) {
            if (this._coordsEqual(coords[i], coord)) indices.push(i);
        }

        return indices;
    }

    /*
     * True if 'coords' contains 'coord'
     */
    // ENH: Move to base
    _geomHasCoord(coords, coord, from = 0, to = coords.length) {
        for (let i = from; i < to; i++) {
            if (this._coordsEqual(coords[i], coord)) return true;
        }
        return false;
    }

    /**
     * True if 'coord1' equals 'coord2'
     */
    // ENH: Move to base
    _coordsEqual(coord1, coord2) {
        return coord1[0] == coord2[0] && coord1[1] == coord2[1];
    }

    /**
     * Label to show for 'feature'
     * @param {MywFeature} feature
     */
    // Subclassed to handle proposed objects
    getNodeTextFor(feature) {
        return this.displayManager.featureLabel(feature);
    }

    // ------------------------------------------------------------------------------
    //                                  HIGHLIGHTING
    // ------------------------------------------------------------------------------

    /*
     * Build a geometry representation for use in highlight
     */
    // Subclassed to set style based on feature type
    geomRepFor(feature, geom = undefined, id = undefined, color = undefined, style = undefined) {
        const geomRep = super.geomRepFor(feature, geom, id, color, style);

        if (!style && this.cableManager.isCable(feature)) {
            geomRep.style = {
                color: geomRep.color,
                weight: 4,
                opacity: 0.75,
                arrows: true
            };
        }

        return geomRep;
    }

    // Geometries to highlight on map when hovering over 'node'
    highlightsFor(node) {
        const geomReps = this._highlightsFor(node, {});
        return Object.values(geomReps);
    }

    // Returns list of geomReps to highlight, keyed by id
    _highlightsFor(node, geomReps) {
        // Add node
        const geomRep = node.original.highlight;
        if (geomRep) {
            geomReps[geomRep.id] = geomRep;
        }
        const geomRep2 = node.original.highlight2;
        if (geomRep2) {
            geomReps[geomRep2.id] = geomRep2;
        }

        // If node has linear geometry, stop recursing
        if (node.original.highlight && node.original.highlight.geom.type === 'LineString')
            return geomReps;

        // Add children
        _.each(node.children, child => {
            let childNode = this.container.jstree(true).get_node(child);
            this._highlightsFor(childNode, geomReps);
        });

        return geomReps;
    }

    // ------------------------------------------------------------------------------
    //                                  SELECTION
    // ------------------------------------------------------------------------------

    /**
     * The selected node and pin range for click event 'data' (if there is one)
     */
    // TODO: Set current node on right-click and remove this
    selectedPinsForEvent(data) {
        let pins, node, nodeIds, jsNode;

        node = this.getNodeFor(data);

        // Case: Click was on element of selection
        const selNodes = this.selectedNodes;
        if (selNodes.length && selNodes.includes(node)) {
            pins = this.selectedPins();
            node = selNodes[0];
            nodeIds = this.selectedNodeIds;
        }
        // Case: Click was outside of selection
        else {
            pins = new PinRange(node.side || 'in', node.pin);
            jsNode = this.getJsNodeFor(data);
            nodeIds = [jsNode.id];
        }

        return { node: node, pins: pins, nodeIds };
    }

    /**
     * The selected pin range (if there is one)
     *
     * If optional arg connected is supplied, only return range if all pins have that status
     */
    selectedPins(connected = undefined) {
        // Check for nothing selected
        const nSel = this.selectedNodes.length;
        if (nSel == 0) return undefined;

        // Check for some already connected
        for (let iNode = 0; iNode < nSel; iNode++) {
            const node = this.selectedNodes[iNode];
            if (!node.pin) return undefined;
            if (connected === false && node.conn) return undefined;
            if (connected === true && !node.conn) return undefined;
        }

        // Build result
        const firstPin = this.selectedNodes[0].pin;
        const lastPin = this.selectedNodes[nSel - 1].pin;

        return new PinRange(this.selectedNodes[0].side || 'in', firstPin, lastPin);
    }

    // ------------------------------------------------------------------------------
    //                                  TRACING
    // ------------------------------------------------------------------------------

    openDistanceTraceDialog(data, direction, tech) {
        const self = this;
        const sel = this.selectedPinsForEvent(data);

        let lableKey;
        let titleKey;
        if (tech === 'fiber') {
            lableKey = '{:distance}:';
            titleKey = `otdr_${direction}_title`;
        } else if (tech === 'copper') {
            lableKey = '{:ewl}:';
            titleKey = `ewl_${direction}_title`;
        }

        const form = new Form({
            messageGroup: 'DistanceTraceDialog',
            rows: [
                {
                    label: lableKey,
                    components: [
                        new UnitInput({
                            unitScaleDef: this.app.system.settings['core.units'].length,
                            defaultUnit: myw.applicationDefinition.displayUnits.length,
                            cssClass: 'medium',
                            value: this.maxDist,
                            onChange: function (input) {
                                try {
                                    self.maxDist = input.getUnitValue().toString();
                                    self.distMetres = input.getUnitValue().valueIn('m');
                                } catch (e) {
                                    self.maxDist = input.getValue();
                                    self.distMetres = null;
                                }
                            }
                        })
                    ]
                }
            ]
        });

        // ENH: GUI should indicate somewhere what it is tracing from
        this.distanceTraceDialog = new Dialog({
            title: myw.msg('DistanceTraceDialog', titleKey), // use loc method with key so string is defined in DistanceTraceDialog
            contents: form.$el,
            modal: false,
            destroyOnClose: true, // Keep DOM tidy
            position: { my: 'center', at: 'top+152', of: window },
            buttons: {
                OK: {
                    text: this.msg('ok_btn'),
                    click() {
                        // Use node as tree can be changing as user examines and selects other data
                        // and there may be no leaf still representing data to later find the node
                        self.doTraceFor(sel, direction, self.distMetres);
                    }
                },
                Cancel: {
                    text: this.msg('close_btn'),
                    class: 'right',
                    click() {
                        this.close();
                        self.distanceTraceDialog = undefined;
                    }
                }
            }
        });
    }

    /**
     * Traces upstream or downstream for tree node data
     * @param  {object} data      Data associated with a tree node
     * @param  {string} direction 'upstream' or 'downstream'
     * @param  {string} distance   optional distance for trace
     */
    doTrace(data, direction, distance = null) {
        const sel = this.selectedPinsForEvent(data);
        this.doTraceFor(sel, direction, distance);
    }

    /**
     * Traces upstream or downstream for a tree node
     * @param  {object} node      tree node
     * @param  {string} direction 'upstream' or 'downstream'
     * @param  {string} distance   optional distance for trace
     */
    async doTraceFor(sel, direction, distance = null) {
        const app = this.owner.app;

        const { feature, pins } = this.traceTargetFor(sel, direction);

        const tech = this.connectionManager.techFor(feature, pins.side);

        // Show we are doing something
        this._showLoadingSpinner();

        try {
            // Do trace
            const res = await this.connectionManager.traceOut(
                tech,
                feature,
                pins,
                direction,
                distance
            );

            // Show result
            if (res.items.length) {
                this.closeLoadingSpinner();
                app.setCurrentFeatureSet(res, { currentFeature: null, zoomTo: false });
                app.map.fitBoundsToFeatures(app.currentFeatureSet.items);
            }
        } catch (err) {
            this.closeLoadingSpinner();
            console.log(err.stack);
        }
    }

    /**
     * The feature and pins to trace from for node selection 'sel' (hook for subclasses)
     *
     * @returns {object} with members features and pins
     */
    traceTargetFor(sel, direction) {
        return { feature: sel.node.feature, pins: sel.pins };
    }

    // ------------------------------------------------------------------------------
    //                                 REPORTING
    // ------------------------------------------------------------------------------

    /*
     * Build and display report 'rep' in preview dialog
     */
    async showReport(data, rep) {
        await rep.initialized;

        // Gather data
        this._showLoadingSpinner(rep.title());
        try {
            await rep.build();
        } catch (e) {
            this.closeLoadingSpinner();
            throw e;
        }
        this.closeLoadingSpinner();

        // Show report
        const reportManager = this.app.plugins.reportManager;
        reportManager.preview(rep.title(), rep);
    }

    // ------------------------------------------------------------------------------
    //                                    TERMINATIONS
    // ------------------------------------------------------------------------------

    /**
     * Adds path data to children of 'jsNode' (if necessary)
     *
     * Called after jsNode is opened
     */
    async ensurePaths(jsNode) {
        const node = jsNode.original;

        if (node.pins && !node.pathsDone) {
            const tech = this.connectionManager.techFor(node.feature, node.pins.side);
            this.showPaths(tech, node.feature, node.pins, jsNode.children);
            node.pathsDone = true;
        }
    }

    /**
     * Updates children of selected node to show their paths and circuits
     * @param  {object} data      Data associated with event
     */
    async doShowPathsForChildren(data) {
        const jsNode = this.getJsNodeFor(data);
        const node = jsNode.original;

        if (jsNode.children.length == 0) {
            this.showMessage('Warning', 'No Paths Exist');
            return;
        }

        this.addProcessingIndicator(jsNode);
        this.owner.app.message('Tracing...', 500, 500);

        try {
            const tech = this.connectionManager.techFor(node.feature, node.pins.side);
            await this.showPaths(tech, node.feature, node.pins, jsNode.children);
        } catch (err) {
            this.showError('show_paths_failed', err, 'PinTreeView');
            this.jstree().redraw(true);
            throw err;
        }

        this.openNode(jsNode);
    }

    /**
     * Updates selected pin nodes to show their paths and circuits
     * @param  {object} data      Data associated with event
     */
    async doShowPaths(data) {
        const sel = this.selectedPinsForEvent(data);

        const jsNodes = sel.nodeIds.map(nodeId => this.jstree().get_node(nodeId));

        jsNodes.forEach(jsNode => this.addProcessingIndicator(jsNode));

        const { feature, pins } = this.traceTargetFor(sel, 'upstream'); // Specifies upstream to ensure get side of splices that match results
        this.owner.app.message('Tracing...', 500, 500);

        try {
            const tech = this.connectionManager.techFor(feature, pins.side);
            await this.showPaths(tech, feature, pins, sel.nodeIds);
        } catch (err) {
            this.showError('show_paths_failed', err, 'PinTreeView');
            this.jstree().redraw(true);
            throw err;
        }
    }

    /**
     * Updates nodes 'nodeIds' to show their paths and circuits
     */
    async showPaths(tech, feature, pins, nodeIds) {
        const paths = await feature.datasource.comms.pinPaths(tech, feature, pins);

        for (const nodeId of nodeIds) {
            const jsNode = this.jstree().get_node(nodeId);
            const node = jsNode.original;
            if (node.pin) {
                this.showPathsFor(jsNode, paths[node.pin]);
            }
        }
        this.jstree().redraw(true);
    }

    /*
     * Updates children of selected splice node to show terminations
     */
    async doShowPathsSplice(data) {
        const jsNode = this.getJsNodeFor(data);
        const conns = jsNode.original.conns.conns;

        for (const connection of conns) {
            // Obtain entire path for connection
            const tech = this.connectionManager.techFor(
                connection.from_feature,
                connection.from_pins.side
            );
            let path = await this.ds.comms.pinPaths(
                tech,
                connection.from_feature,
                connection.from_pins
            );
            this.addProcessingIndicator(jsNode);

            //Iterate through all child nodes under splice node
            for (const childId of jsNode.children) {
                let childNode = this.container.jstree().get_node(childId);
                let node = childNode.original;

                // Check if child node pins are within the connection pin range
                if (path[node.pin]) {
                    this.showPathsFor(childNode, path[node.pin]);
                }
            }
        }

        this.jstree().redraw(true);
        this.openNode(jsNode);
    }

    /**
     * Add termination info to pin node 'jsNode'
     */
    showPathsFor(jsNode, path) {
        // Remove current path info from node
        this.removePathInfo(jsNode);

        const node = jsNode.original;

        // Check for nothing to show
        if (path.in.feature === node.feature.getUrn() && path.out.feature === node.feature.getUrn())
            return;

        // Cache current display state
        jsNode.origData = {
            title: jsNode.li_attr.title,
            icon: jsNode.icon,
            text: jsNode.text
        };

        // Set tooltip and icon
        jsNode.li_attr.title = `${path.in.desc} -> ${path.out.desc}`;
        jsNode.icon = this.iconForPath(path, jsNode.icon);
    }

    /**
     * The icon to show for a node with terminations 'path'
     */
    iconForPath(path, defaultIcon) {
        if (path.in.type == 'port' && path.out.type == 'port')
            return this.pathIcons['port_to_port'];
        if (path.in.type == 'port') return this.pathIcons['port_to_fiber'];
        if (path.out.type == 'port') return this.pathIcons['fiber_to_port'];
        return defaultIcon;
    }

    /**
     * Remove path information from jsTree node
     */
    removePathInfo(jsNode) {
        const origData = jsNode.origData;
        if (!origData) return;

        jsNode.text = origData.text;
        jsNode.li_attr.title = origData.title;
        jsNode.icon = origData.icon;

        // Remove child nodes, this assumes they are for circuits
        const children = jsNode.children;
        const jstree = this.container.jstree(true);
        jstree.delete_node(children); // deletes all children
        jsNode.original.children = [];

        delete jsNode.origData;
    }

    // ------------------------------------------------------------------------------
    //                                CIRCUITS
    // ------------------------------------------------------------------------------

    /**
     * Updates selected pin nodes to show their circuits
     * @param  {object} data      Data associated with event
     */
    async _doShowCircuitsFor(data) {
        const sel = this.selectedPinsForEvent(data);

        const jsNodes = sel.nodeIds.map(nodeId => this.jstree().get_node(nodeId));

        for (const jsNode of jsNodes) {
            this.addProcessingIndicator(jsNode);
            const node = jsNode.original;

            if (jsNode.children.length != 0 && node.pins) {
                await this._showAllCircuitsFor(jsNode);
            } else await this._showCircuitsFor(jsNode);
        }

        this.jstree().redraw(true);
    }

    /*
     * Get circuit info for all pins in a feature, update child nodes and display circuit info
     */
    async _showAllCircuitsFor(jsNode) {
        const node = jsNode.original;
        let pins = node.pins;

        const tech = this.connectionManager.techFor(node.feature, node.pins.side);

        const pinCircuits = await this.ds.comms.pinCircuits(
            tech,
            node.feature,
            pins,
            this.displayManager.showProposed
        );

        if (_.isEmpty(pinCircuits)) return;

        // Loop through each child node
        for (const nodeId of jsNode.children) {
            const childJsNode = this.jstree().get_node(nodeId);

            // Remove child nodes if they already exist
            this.jstree().delete_node(childJsNode.children);

            // Add circuit nodes
            this._addCircuitInfo(childJsNode, pinCircuits);
        }
        this.openNode(jsNode);
    }

    /**
     * Get circuit info for pin node and display it as child
     * @param {object} jsNode jstree object
     */
    async _showCircuitsFor(jsNode) {
        // purge child nodes
        const jstree = this.container.jstree(true);
        jstree.delete_node(jsNode.children);

        const node = jsNode.original;
        const pins = new PinRange(node.side, node.pin, node.pin);
        const tech = this.connectionManager.techFor(node.feature, pins.side);

        // get all circuits on pin
        const pinCircuits = await this.ds.comms.pinCircuits(
            tech,
            node.feature,
            pins,
            this.displayManager.showProposed
        );

        if (_.isEmpty(pinCircuits)) return;

        // Add circuit nodes
        this._addCircuitInfo(jsNode, pinCircuits);
    }

    /*
     * Get circuit info for each connection in a splice node
     */
    async _showCircuitsForSplice(data) {
        const jsNode = this.getJsNodeFor(data);

        const conns = jsNode.original.conns.conns;

        this.addProcessingIndicator(jsNode);

        // Account for multiple connection records in a splice node
        for (const connection of conns) {
            const fromFeature = connection.from_feature;
            const pins = connection.from_pins;

            const tech = this.connectionManager.techFor(fromFeature, pins.side);
            const pinCircuits = await this.ds.comms.pinCircuits(
                tech,
                fromFeature,
                pins,
                this.displayManager.showProposed
            );

            if (_.isEmpty(pinCircuits)) continue;

            // Loop through each child node
            for (const nodeId of jsNode.children) {
                const childJsNode = this.jstree().get_node(nodeId);

                // Remove child nodes if they already exist
                this.jstree().delete_node(childJsNode.children);

                // Add circuit nodes
                this._addCircuitInfo(childJsNode, pinCircuits);
            }
        }
        this.jstree().redraw(true);
        this.openNode(jsNode);
    }

    /*
     * Create the child node containing circuit information
     */
    _addCircuitInfo(jsNode, circuits) {
        if (_.isEmpty(circuits)) return;

        const node = jsNode.original;
        node.children = [];

        // Check if circuits exist on pin prior to node creation
        if (circuits[node.pin]) {
            circuits[node.pin].forEach(circuit => {
                const text = this.displayManager.circuitLabel(
                    circuit,
                    this._isProposedCircuit(circuit)
                );
                const link = this._isProposedCircuit(circuit) ? circuit.delta.name : circuit.urn;

                const circuitNode = this.newNode({
                    icon: this.icons['circuit'],
                    text: text,
                    link: link,
                    li_attr: { class: 'jstree-leaf-node' }
                });
                circuitNode.state.opened = true;
                node.children.push(circuitNode);
                this.jstree().create_node(jsNode.id, circuitNode);
            });

            jsNode.icon = this.icons['circuit'];
        }
        this.openNode(jsNode);
    }

    /**
     * True if feature is from a different delta then the current one or master
     * @param {object} circuitInfo circuit info object
     */
    _isProposedCircuit(circuitInfo) {
        return circuitInfo.delta && circuitInfo.delta != this.ds.getDelta();
    }

    // ------------------------------------------------------------------------------
    //                               DISCONNECT
    // ------------------------------------------------------------------------------

    /**
     * Disconnect selected pins
     */
    async disconnect(data) {
        const sel = this.selectedPinsForEvent(data);

        const jsNode = this.getJsNodeFor(data);
        this.addProcessingIndicator(jsNode);

        const tech = this.connectionManager.techFor(sel.node.feature, sel.pins.side);

        const ripple = this.app.plugins.locManager.autoRipple;

        try {
            await this.connectionManager.disconnect(tech, sel.node.feature, sel.pins, ripple);
        } catch (e) {
            this.removeProcessingIndicator(jsNode);
            this.showError('disconnect_failed', e, 'PinTreeView');
        }

        return true;
    }

    // -----------------------------------------------------------------------
    //                           SEGMENT OPERATIONS
    // -----------------------------------------------------------------------
    // ENH: Cable-tree specific

    setTickMarkFor(data) {
        try {
            const jsNode = this.getJsNodeFor(data);
            const node = this.getNodeFor(data);

            this.addProcessingIndicator(jsNode);

            this._showTickMarkDialog(node.feature, node.cable, jsNode);
        } catch (err) {
            this.showError('add_tick_mark_failed', err);
            this.refreshFor(this.feature);
            throw err;
        }
    }

    async _showTickMarkDialog(seg, cable, jsNode) {
        const spec = this.specManager.getSpecFor(cable);

        // Set options
        const dlgOptions = {};
        const tickMarkField =
            seg.properties.in_structure == this.feature.getUrn() ? 'in_tick' : 'out_tick';
        dlgOptions.tickMark = seg.properties[tickMarkField];
        dlgOptions.tickMarkField = tickMarkField;
        dlgOptions.seg = seg;
        dlgOptions.tickMarkUnit = spec.getFieldDD('tick_mark_spacing').display_unit;
        dlgOptions.spacing = spec.properties.tick_mark_spacing;
        dlgOptions.jsNode = jsNode;
        dlgOptions.lengthScaleDef = myw.config['core.units'].length;

        return new SetTickMarkDialog(this, dlgOptions);
    }

    /**
     * Set containment of selected segment end
     */
    setSegmentContainment(data) {
        const jsNode = this.getJsNodeFor(data);
        const node = this.getNodeFor(data);

        const dlg = new EquipmentSelectionDialog(this, this.struct, housing =>
            this._setSegmentContainment(node, housing)
        );
    }

    /**
     * Set or clear containment of a segment end
     */
    async _setSegmentContainment(node, housing) {
        if (housing.getUrn() == this.struct.getUrn()) {
            housing = null;
        }

        await this.cableManager.setSegmentContainment(node.feature, node.segSide, housing);

        this.refreshFor(this.feature);
    }

    // -----------------------------------------------------------------------
    //                                HELPERS
    // -----------------------------------------------------------------------

    /**
     * Show a dialog with a loading icon
     * @private
     */
    _showLoadingSpinner() {
        this.loading = true;
        if (!this.loadingSpinner) {
            this.loadingSpinner = $(
                `<img src=${loadingSrc} alt="${this.msg('trace_loading')}" />`
            ).dialog({
                modal: true,
                width: 'auto',
                resizable: false,
                position: { my: 'center', at: 'center', of: window },
                closeText: this.msg('close_tooltip')
            });
            this.loadingSpinner.dialog('widget').addClass('noStyle');
        } else {
            this.loadingSpinner.dialog('open');
        }
    }

    closeLoadingSpinner() {
        this.loading = false;
        this.loadingSpinner?.dialog('close');
    }

    /**
     * Show dialog to allow user to edit line of count information for FEATURE
     *
     * @param {Feature} feature
     */
    editStatusLoc(feature, side = undefined) {
        this.locManager.openLineOfCountDialog(feature, side);
    }

    /**
     * Show dialog showing line of count information for FEATURE
     *
     * @param {Feature} feature
     * @param {String} title
     */
    viewStatusLoc(feature, title, side = undefined) {
        const loc = this.locManager.formattedLoc(feature, side);
        new Dialog({ title: title, contents: loc, destroyOnClose: true, modal: false });
    }
}
