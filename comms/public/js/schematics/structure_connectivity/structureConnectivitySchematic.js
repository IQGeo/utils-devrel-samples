// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import Schematic from '../schematic';
import Grid from '../grid';
import Graph from './graph';
import SegmentNode from './segmentNode';
import EquipNode from './equipNode';
import StructNode from './structNode';
import ConnectionLink from './connectionLink';
import CableLink from './cableLink';
import clamp from '../../base/numUtils';

export default class StructureConnectivitySchematic extends Schematic {
    static {
        this.prototype.messageGroup = 'StructureConnectivitySchematic';
    }

    /**
     * Layout options (a list of option defs)
     */
    getOptionDefs() {
        const layoutChoices = [
            { value: 'horizontal', text: 'Horizontal' }, // TODO: Use messages
            { value: 'vertical', text: 'Vertical' }
        ];

        return [
            {
                name: 'layout',
                text: 'Layout',
                items: layoutChoices,
                default: 'horizontal',
                resetView: true
            }
        ];
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     */
    constructor(app) {
        super(app);
        this.app = app;
        this.structs = app.system.settings['mywcom.structures'];

        this.structManager = app.plugins.structureManager;
        this.cableManager = app.plugins.cableManager;
        this.connectionManager = app.plugins.connectionManager;
        this.colScaleOptions = { min: 1, max: 4, factor: 2 };
    }

    /**
     * Data of 'features' from which self can be built (if any)
     */
    getBuildData(features) {
        if (features.items.length != 1) return;
        const feature = features.items[0];
        if (this.categoryOf(features.items[0]) != 'struct') return;
        return feature;
    }

    /**
     * Build for structure 'struct'
     */
    async buildFrom(struct) {
        await myw.geometry.init();
        this.struct = struct;
        await this.rebuild();
        return this;
    }

    /**
     * Build or rebuild
     */
    async rebuild() {
        if (!this.structIsValid()) return false;
        this.nodes = [];
        this.links = [];
        this.grid = new Grid();

        myw.trace('schematics', 2, 'Building: Start:', this);
        await this.buildGraph();
        this.setNodePositions();
        myw.trace('schematics', 2, 'Building: End:', this);

        return this;
    }

    /**
     * Returns true if structure is accessible in current design or master
     * @returns {boolean}
     */
    structIsValid() {
        const struct = this.struct;
        const currentDelta = this.app.getDelta();
        if (struct.getDelta() && struct.getDelta() !== currentDelta) {
            return false;
        }

        return true;
    }

    /**
     * String to show in trace messages
     */
    toString() {
        const urn = this.struct ? this.struct.getUrn() : '';
        return `${this.constructor.name}(${urn})`;
    }

    /**
     * Title string
     */
    title() {
        return `${this.struct.getTitle()}`;
    }

    /**
     * Category of 'feature'
     */
    categoryOf(feature) {
        if (feature.getType() in this.structs) return 'struct';
    }

    // ------------------------------------------------------------------------
    //                               GRAPH BUILDING
    // ------------------------------------------------------------------------

    /**
     * Create connection trees in -> out
     *
     * Returns a list of root nodes
     */
    async buildGraph() {
        // Get data
        const structContent = await this.structManager.structContent(this.struct);

        const equips = structContent.equips;
        const segSlacks = structContent.slacksBySeg();
        const slacks = _.values(segSlacks);
        const cables = _.indexBy(structContent.cables, c => c.getUrn());
        const sideSegs = structContent.segsBySide();
        const conns = structContent.conns;

        // Create nodes
        for (const side of ['in', 'int', 'out']) {
            for (const seg of sideSegs[side]) {
                const cable = cables[seg.properties.cable];
                const slack = segSlacks[seg.getUrn()];
                this.addCableSegNode(seg, side, cable, slack);
            }
        }

        for (const equip of equips) {
            if (!slacks.includes(equip)) {
                this.addEquipNode(equip);
            }
        }

        // Add implicit connections
        for (const side of ['in', 'int']) {
            for (const seg of sideSegs[side]) {
                this.connectPassthroughSeg(seg);
            }
        }

        // Add explicit connections
        for (const conn of conns) {
            this.addConnection(conn);
        }

        // Prune enclosures
        for (const node of Object.values(this.nodes)) {
            if (
                !node.inLinks.length &&
                !node.outLinks.length &&
                node.feature.definedFunction() == 'enclosure'
            ) {
                delete this.nodes[node.feature.getUrn()];
            }
        }
    }

    /**
     * Connect 'seg' to its downstream segment (if there is one)
     */
    connectPassthroughSeg(seg) {
        const node = this.nodes[seg.getUrn()];

        // Check for no out segment
        const outSegId = seg.properties.out_segment;
        if (!outSegId) return true;

        // Check for not in this structure
        const childUrn = `${seg.getType()}/${outSegId}`;
        const childNode = this.nodes[childUrn];
        if (!childNode) return false;

        // Connect it
        this.addCableLink(node, childNode, node.cable);

        return true;
    }

    /**
     * Add explicit connection
     */
    addConnection(conn) {
        // Find referenced objects
        let node1 = this.getNode(conn.properties.in_object);
        let node2 = this.getNode(conn.properties.out_object);
        if (!node1 || !node2) {
            // ENH: Warn
            return;
        }

        // Determine connectin direction (handles undirected cables)
        let forward = conn.properties.in_side == 'out' && conn.properties.out_side == 'in';
        if (node1.type == 'equip') forward = conn.properties.in_side == 'out';
        if (node2.type == 'equip') forward = conn.properties.out_side == 'in';

        if (!forward) {
            [node1, node2] = [node2, node1];
        }

        // Create link (if necessary)
        // TODO: Check housing matches
        let link = node1.linkTo(node2, 'connection');
        if (!link) {
            link = this.addConnectionLink(node1, node2, conn.properties.housing);
        }
        link.addConnection(conn, forward);

        // Create new link
        return link;
    }

    /**
     * Create cable node
     */
    addCableSegNode(seg, side, cable, slack) {
        const node = new SegmentNode(cable, seg, side, slack);
        this.nodes[seg.getUrn()] = node;
        return node;
    }

    /**
     * Create equipment node
     */
    addEquipNode(equip) {
        const node = new EquipNode(equip);
        this.nodes[equip.getUrn()] = node;
        return node;
    }

    /**
     * Add implicit connection node1 -> node2
     */
    addCableLink(node1, node2, cable) {
        // Create link
        const link = new CableLink(node1, node2, cable);
        this.links.push(link);

        // Connect nodes
        node1.outLinks.push(link);
        node2.inLinks.push(link);

        return link;
    }

    /**
     * Add explicit connection node1 -> node2
     */
    addConnectionLink(node1, node2, housingUrn) {
        // Find feature to highlight
        let housing = this.getFeature(housingUrn);
        if (!housing) {
            console.log('Cannot find:', housingUrn);
        }

        // Create link
        const link = new ConnectionLink(node1, node2, housing);
        this.links.push(link);

        // Connect nodes
        node1.outLinks.push(link);
        node2.inLinks.push(link);

        return link;
    }

    /*
     * Get node by URN
     */
    getNode(urn) {
        const node = this.nodes[urn];
        if (!node) console.log('Cannot find node for:', urn); // ENH: Create one?
        return node;
    }

    /*
     * Get feature by URN
     */
    getFeature(urn) {
        if (urn in this.nodes) return this.nodes[urn].feature;
        if (urn == this.struct.getUrn()) return this.struct;
    }

    // ------------------------------------------------------------------------
    //                                 LAYOUT
    // ------------------------------------------------------------------------

    /**
     * Set column and row positions for nodes
     */
    setNodePositions() {
        // Partition into disconnected subgraphs (to minimise crossings)
        this.subGraphs = this.partitionNodes(this.nodes);

        // Sort them by complexity (simplest first)
        const sortProc = function (sg1, sg2) {
            return sg1.order - sg2.order;
        };
        this.subGraphs = this.subGraphs.sort(sortProc);

        this.colScale = 1;

        // Set node positions
        let sideCols = { in: 1, int: 5, out: 9 };
        const maxRows = this._setNodePositions(sideCols);

        // Find maxColumn and then adjust side column positions
        let maxCols = 0;
        for (const node of Object.values(this.nodes)) {
            if (node.col > maxCols) maxCols = node.col;
        }
        this.colScale = clamp(
            Math.round(maxRows / (maxCols * this.colScaleOptions.factor)),
            this.colScaleOptions.min,
            this.colScaleOptions.max
        );
        myw.trace(
            'schematics',
            2,
            'Aspect ratio = ',
            maxRows / maxCols,
            'colScale = ',
            this.colScale
        );
        sideCols = { in: 1, int: 4 * this.colScale, out: 9 * this.colScale };

        // Align in and out segment nodes
        this.adjustEdgeNodePositions(sideCols);

        // Set structure outline
        this.structNode = new StructNode(this.struct, Object.values(this.nodes));
    }

    _setNodePositions(sideCols) {
        let row = 1;
        for (const subGraph of this.subGraphs) {
            myw.trace(
                'schematics',
                3,
                'Setting positions for subgraph of size',
                subGraph.nodes.length
            );
            for (const node of subGraph.orderedNodes()) {
                const startCol = sideCols[node.side];
                row = this.setNodePositionsBelow(node, row, startCol);
            }
        }
        return row;
    }

    /**
     * Partition dict 'nodes' into disconnected sets
     *
     * Returns a list subGraphs
     */
    partitionNodes(nodes) {
        // Clone list (as we will destroy it}
        nodes = { ...nodes };

        // Until all processed ...
        const subGraphs = [];
        while (Object.values(nodes).length) {
            const node = Object.values(nodes)[0];

            // Find next subgraph
            const subGraph = new Graph(node.connectedNodes());

            // Remove its nodes from the set
            for (const node of subGraph.nodes) {
                const found = delete nodes[node.feature.getUrn()];
                if (!found) console.log('partitionNodes: Could not find', node.feature.getUrn());
            }

            subGraphs.push(subGraph);
        }

        return subGraphs;
    }

    /**
     * Set col and row for 'node' and its children (recursive)
     */
    setNodePositionsBelow(node, row, col) {
        // Check for already processed
        if (node.row) return row;

        // Position parent
        node.row = this.grid.nextFreeRow(col, row);
        node.col = col;
        this.grid.setCell(col, row, node);

        // Position children
        row = node.row;
        if (node.side == 'out') row++; // Reduces clashes with cable links on undirected cables

        for (const link of node.outLinks) {
            row = this.setNodePositionsBelow(link.node2, row, col + 4 * this.colScale);
        }
        if (row == node.row) row++;

        // Adjust parent position (if necessary)
        if (node.side != 'out') {
            const midRow = (row + node.row - 1) / 2.0;
            node.row = this.grid.nextFreeRow(node.col, midRow, 1, node);
            this.grid.setCell(node.col, node.row, node);
        }

        return row;
    }

    /**
     * Move 'in' and 'out' cable nodes to edges of structure
     */
    adjustEdgeNodePositions(sideCols) {
        // Find column range for internal objects
        let minIntCol = sideCols['int'];
        let maxIntCol = sideCols['int'];
        for (const node of Object.values(this.nodes)) {
            if (node.side == 'int') {
                minIntCol = Math.min(minIntCol, node.col);
                maxIntCol = Math.max(maxIntCol, node.col);
            }
        }

        // Align in/out cables
        const inCol = minIntCol - 4 * this.colScale;
        const outCol = maxIntCol + 4 * this.colScale;
        for (const node of Object.values(this.nodes)) {
            if (node.side === 'in') {
                node.col = inCol;
                node.row = this.grid.nextFreeRow(node.col, node.row, 1, node);
                this.grid.setCell(node.col, node);
            }

            if (node.side === 'out') {
                node.col = outCol;
                node.row = this.grid.nextFreeRow(node.col, node.row, 1, node);
                this.grid.setCell(node.col, node);
            }
        }
    }

    // ------------------------------------------------------------------------
    //                                DISPLAY
    // ------------------------------------------------------------------------

    /**
     * Transform from grid space to long-lat degrees
     */
    getTransform(layoutOpts) {
        let trans = Schematic.prototype.getTransform(this, layoutOpts).scale(6, 6);
        if (layoutOpts.layout == 'vertical') trans = trans.rotate(90);
        return trans;
    }

    /**
     * Feature representations for self
     */
    items(opts) {
        const items = [];
        opts.colScale = this.colScale;

        // Add structure boundary
        items.push(this.structNode.item(opts));

        // Add links
        for (const link of this.links) {
            items.push(link.item(opts));
        }

        // Add nodes
        for (const node of Object.values(this.nodes)) {
            for (const item of node.items(opts)) {
                items.push(item);
            }
        }

        return items;
    }

    // ------------------------------------------------------------------------
    //                             CHANGE DETECTION
    // ------------------------------------------------------------------------

    /**
     * Called after self has been displayed
     *
     * Subclassed to listen for changes that might invalidate self
     */
    activate(view) {
        super.activate(view);

        this.registeredHandlers = [];

        this.addEventHandler(
            this.app,
            'featureCollection-modified',
            this.handleDataChange.bind(this)
        );

        this.addEventHandler(
            this.app.plugins.connectionManager,
            'connected disconnected',
            this.handleDataChange.bind(this)
        );
    }

    /**
     * Called when self is removed from display
     *
     * Subclassed to listen for changes that might invalidate self
     */
    deactivate(view) {
        super.deactivate(view);
        this.removeEventHandlers();
    }

    handleDataChange(e) {
        // ENH: For connections, only raise if rootHousing matches?
        this.fire('out-of-date');
    }

    addEventHandler(target, event, handler) {
        target.on(event, handler);
        this.registeredHandlers.push([target, event, handler]);
    }

    removeEventHandlers() {
        for (const [target, event, handler] of this.registeredHandlers) {
            target.off(event, handler);
        }
        this.registeredHandlers = [];
    }
}
