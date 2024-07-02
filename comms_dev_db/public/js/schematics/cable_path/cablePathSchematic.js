// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Schematic from 'modules/comms/js/schematics/schematic';
import Grid from 'modules/comms/js/schematics/grid';
import CablePathNode from './cablePathNode';
import CablePathLink from './cablePathLink';

export default class CablePathSchematic extends Schematic {
    /**
     * Layout options (a list of option defs)
     */
    getOptionDefs() {
        const layoutChoices = ['horizontal', 'vertical']; // TODO: Use messages

        return [
            {
                name: 'layout',
                text: 'Layout',
                items: layoutChoices,
                default: 'vertical',
                resetView: true
            }
        ];
    }

    /**
     * Init slots of self
     */
    constructor() {
        super();
        this.cables = myw.config['mywcom.cables'];
    }

    /**
     * Data of 'features' from which self can be built (if any)
     */
    getBuildData(features) {
        if (features.items.length != 1) return;
        if (this.nodeTypeOf(features.items[0]) != 'cable') return;
        return features.items[0];
    }

    /**
     * Build for 'cable'
     */
    async buildFrom(cable) {
        this.cable = cable;
        this.nodes = [];
        this.links = [];
        this.structNodes = [];
        await this.buildGraph(this.cable);

        this.setPositions();
        return this;
    }

    /**
     * Title string
     */
    title() {
        return this.cable.getTitle();
    }

    // ------------------------------------------------------------------------
    //                               GRAPH BUILDING
    // ------------------------------------------------------------------------

    /**
     * Add nodes and links for objects associated with 'cable'
     */
    async buildGraph(cable) {
        const segs = await this.orderedSegmentsOf(cable);

        let structNode, segNode;

        for (const seg of segs) {
            const conns = await seg.followRelationship('fiber_connections');
            const internal = seg.properties.in_structure == seg.properties.out_structure;

            // Add start structure (if necessary)
            if (!structNode) {
                structNode = await this.addStructNode(seg, 'in_structure');
                segNode = this.addSegNode(structNode, cable);
            }

            // Add 'in' end splices
            this.addConnections(segNode, seg, 'in', conns);

            // Add end structure (if necessary)
            if (!internal) {
                const prevStructNode = structNode;
                structNode = await this.addStructNode(seg, 'out_structure');
                await this.addRouteLink(cable, seg, prevStructNode, structNode);
            }

            // Add segment end node
            const prevSegNode = segNode;
            segNode = this.addSegNode(structNode, cable);

            // Add 'out' end splices
            this.addConnections(segNode, seg, 'out', conns);

            // Add cable segment
            const segLink = this.addLink('segment', seg, prevSegNode, segNode);

            // If internal segment .. add slack
            if (internal) {
                const slack = await this.getRef(seg, 'housing');
                const node = this.addNode('slack', slack, structNode); // TODO: Associate with link
                segLink.slackNodes.push(node);
            }
        }
    }

    /**
     * Create structure node
     */
    async addStructNode(seg, field) {
        const struct = await this.getRef(seg, field);
        const node = this.addNode('struct', struct);
        node.segNodes = [];
        this.structNodes.push(node);
        return node;
    }

    /**
     * Create node for cable segment junction
     */
    addSegNode(structNode, cable) {
        const node = this.addNode('cable', cable);
        node.spliceNodes = [];
        structNode.segNodes.push(node);
        return node;
    }

    /**
     * Add connection nodes for 'side' of 'seg'
     */
    addConnections(segNode, seg, side, conns) {
        for (const conn of conns) {
            const segUrn = seg.getUrn();
            if (
                (conn.properties.in_object == segUrn && conn.properties.in_side == side) ||
                (conn.properties.out_object == segUrn && conn.properties.out_side == side)
            ) {
                const node = this.addNode('splice', conn, segNode);
                segNode.spliceNodes.push(node);
            }
        }
    }

    /**
     * Create node
     */
    addNode(type, feature, parentNode) {
        const node = new CablePathNode(type, feature, 0, 0);
        this.nodes.push(node);
        return node;
    }

    /**
     * Create route link and children
     */
    async addRouteLink(cable, seg, node1, node2) {
        // Add route
        const rootHousing = await this.getRef(seg, 'root_housing');
        this.addLink('route', rootHousing, node1, node2);

        // Add conduits
        // TODO: Add containing conduits too?
        if (seg.properties.housing != seg.properties.root_housing) {
            const housing = await this.getRef(seg, 'housing');
            this.addLink('conduit', housing, node1, node2);
        }
    }

    /**
     * Create link from 'node1' to 'node2'
     */
    addLink(type, feature, node1, node2) {
        const link = new CablePathLink(type, feature, node1, node2);
        link.slackNodes = [];
        this.links.push(link);
        return link;
    }

    /**
     * Category of feature
     */
    nodeTypeOf(feature) {
        if (feature.getType() in this.cables) return 'cable';
    }

    // ------------------------------------------------------------------------
    //                               POSITIONING
    // ------------------------------------------------------------------------

    /**
     * Set positions of nodes  'row,col' space
     */
    setPositions() {
        // Set row positions of nodes
        let row = 0;
        for (const structNode of this.structNodes) {
            const segNodes = structNode.segNodes;
            const nSegs = segNodes.length;

            for (const segNode of segNodes) {
                segNode.row = row++;
                for (const spliceNode of segNode.spliceNodes) {
                    spliceNode.row = segNode.row;
                }
            }

            structNode.row = (segNodes[0].row + segNodes[nSegs - 1].row) / 2.0;
            row += 2;
        }

        // Set column positions
        this.grid = new Grid();
        this.setColumns(this.nodes, ['struct'], 0);
        this.setColumns(this.links, ['route'], 0);
        this.setColumns(this.links, ['conduit'], 2);
        this.setColumns(this.nodes, ['cable'], 4);
        this.setColumns(this.links, ['segment'], 4);
        this.setColumns(this.nodes, ['splice'], 4);

        // Set slack positions
        for (const link of this.links) {
            for (const node of link.slackNodes) {
                node.row = (link.node1.row + link.node2.row) / 2;
                node.col = link.col + 0.5;
            }
        }
    }

    /**
     * Set column position for elements of type 'types'
     */
    setColumns(items, types, col0) {
        for (const item of items) {
            if (types.includes(item.type)) {
                let col = col0;
                //while (this.grid.cell(col,item.row)) col += 1;
                item.col = col;
                this.grid.setCell(item.col, item.row, item);
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
        let trans = Schematic.prototype.getTransform(this, layoutOpts);

        if (layoutOpts.layout == 'vertical') {
            trans = trans.scale(8, 6).rotate(90);
        } else {
            trans = trans.scale(8, -6);
        }
        return trans;
    }

    /**
     * Feature representations for self
     */
    items(layoutOpts) {
        const reps = [];

        // Add links
        for (const link of this.links) {
            const rep = link.item(layoutOpts);
            reps.push(rep);
        }

        // Add nodes to map
        for (const node of this.nodes) {
            const rep = node.item(layoutOpts);
            reps.push(rep);
        }

        return reps;
    }

    // ------------------------------------------------------------------------
    //                                HELPERS
    // ------------------------------------------------------------------------

    /**
     * Segments of 'cable' in order
     */
    // ENH: Use a comms manager
    async orderedSegmentsOf(cable) {
        const segs = await cable.followRelationship('cable_segments');

        let seg0;
        const segsByUrn = {};
        for (const seg of segs) {
            segsByUrn[seg.id] = seg;
            if (!seg.properties.in_segment) seg0 = seg;
        }

        const orderedSegs = [];
        while (seg0) {
            orderedSegs.push(seg0);
            seg0 = segsByUrn[seg0.properties.out_segment];
        }

        return orderedSegs;
    }

    /**
     * Follow a reference field
     */
    async getRef(feature, field) {
        const res = await feature.followRelationship(field);
        return res[0];
    }
}
