// Copyright: IQGeo Limited 2010-2023
import Schematic from '../schematic';
import PinTraceNode from './pinTraceNode';
import PinTraceLink from './pinTraceLink';
import PinTraceStructNode from './pinTraceStructNode';
import Grid from '../grid';
import _ from 'underscore';

export default class PinTraceSchematic extends Schematic {
    static {
        this.prototype.messageGroup = 'PinTraceSchematic';
    }

    /**
     * Layout options (a list of option defs)
     */
    getOptionDefs() {
        const layoutChoices = [
            { value: 'horizontal', text: this.msg('horizontal') },
            { value: 'vertical', text: this.msg('vertical') }
        ];

        const labelChoices = [
            { value: 'cableLabels', text: this.msg('cable_labels'), default: true },
            { value: 'equipmentLabels', text: this.msg('equipment_labels'), default: false },
            { value: 'structureLabels', text: this.msg('structure_labels'), default: false },
            { value: 'locLabels', text: 'LOC', default: false } // FIXME - Message string and toggle with cable labels
        ];

        return [
            {
                name: 'layout',
                text: this.msg('layout'),
                items: layoutChoices,
                default: 'horizontal',
                resetView: true
            },
            { name: 'labels', text: this.msg('labels'), items: labelChoices, multiple: true }
        ];
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Data of 'features' from which self can be built (if any)
     */
    getBuildData(features) {
        if (!features.isTraceResult) return;
        if (!this.nodeTypeOf(features.start)) return;
        return features;
    }

    /**
     * Build from trace result 'trace'
     */
    async buildFrom(trace) {
        this.startTraceNode = trace.start;

        this.nodes = [];
        this.links = [];
        this.structNodes = [];
        this.grid = new Grid();
        this.rootNode = this.buildGraph(trace.start);
        this.setNodePositions(this.rootNode);
        this.adjustUpstreamNodePositions(this.rootNode, this.rootNode.col);
        await this.buildStructNodes();
        return this;
    }

    /**
     * String to show in trace messages
     */
    toString() {
        const urn = this.startTraceNode ? this.startTraceNode.getUrn() : '';
        return `${this.constructor.name}(${urn})`;
    }

    /**
     * Title string
     */
    title() {
        return `Trace: ${this.startTraceNode.getTitle()}`;
    }

    // ------------------------------------------------------------------------
    //                               GRAPH BUILDING
    // ------------------------------------------------------------------------

    /**
     * Add nodes and links for objects in subtree of traceNode
     */
    buildGraph(traceNode, node = null, dir = null) {
        const nodeType = this.nodeTypeOf(traceNode);

        if (!dir) dir = this.directionOf(traceNode);

        // Case: Start node
        if (!node) {
            node = this.addNode(nodeType, node, traceNode, dir);
            this.buildGraph(traceNode, node);
            return node;
        }

        // Case: Child node
        switch (nodeType) {
            case 'cable':
                // Case: Not both-way start node .. add node
                if (traceNode.dist > 0 || node.type != nodeType) {
                    node = this.addNode(nodeType, node, traceNode, dir);
                }
                break;

            case 'conn':
                // Case: Trace node is only out-going connection .. just mutate parent
                if (traceNode.parent && this.nChildren(traceNode.parent, 'conn') == 1) {
                    node.type = nodeType;
                    node.feature = traceNode;
                }
                // Case: Other: Add new node
                else {
                    node = this.addNode(nodeType, node, traceNode, dir);
                }
                break;

            case 'equip':
                // Case: Parent is same equipment .. just update
                if (node.feature.feature === traceNode.feature) {
                    node.feature = traceNode;
                }
                // Case: parent is a connection or cable .. mutate it
                else if (node.type == 'cable' || node.type == 'conn') {
                    node.type = nodeType;
                    node.feature = traceNode;
                }
                // Case: Other: Add new node
                else {
                    node = this.addNode(nodeType, node, traceNode, dir);
                }

                break;

            default:
                console.log('Unknown trace node type', nodeType);
        }

        // Add children
        for (const childTraceNode of traceNode.children) {
            this.buildGraph(childTraceNode, node, dir);
        }

        return node;
    }

    /**
     * Build all structure nodes around existing nodes in schematic.
     */
    async buildStructNodes() {
        let structs = await Promise.all(
            this.nodes
                .filter(node => node.type !== 'cable')
                .map(async node => {
                    const feature = node.feature;
                    return this.getRef(feature, 'root_housing');
                })
        );

        structs = _.uniq(structs, struct => struct.getUrn());

        this.nodes.forEach(node => {
            const struct = structs.find(
                struct => struct.getUrn() === node.feature.properties.root_housing
            );
            if (!struct) return;
            if (!struct.childNodes) struct.childNodes = [];
            struct.childNodes.push(node);
        });

        structs.forEach(structure => {
            this.addStructNode(structure);
        });
    }

    /**
     * Create structure node
     */
    addStructNode(struct) {
        //Break up the struct node by grouping by coordinates. This may break up the structure in some cases more than needed but better than having
        //it consume more of the schematic than needed.
        const childNodeGroups = {};
        struct.childNodes.forEach(childNode => {
            const matched = struct.childNodes.findIndex(
                node =>
                    (node.row === childNode.row || node.col === childNode.col) &&
                    node.feature.getUrn() !== childNode.feature.getUrn()
            );
            if (matched < 0) {
                // Did not match with any other node by row or col.
                childNodeGroups[`row-${childNode.row}`] = [childNode];
            } else {
                const matchedRow = struct.childNodes.findIndex(
                    node =>
                        node.row === childNode.row &&
                        node.feature.getUrn() !== childNode.feature.getUrn()
                );
                if (matchedRow >= 0) {
                    if (!childNodeGroups[`row-${childNode.row}`])
                        childNodeGroups[`row-${childNode.row}`] = [];
                    childNodeGroups[`row-${childNode.row}`].push(childNode);
                }

                const matchedCol = struct.childNodes.findIndex(
                    node =>
                        node.col === childNode.col &&
                        node.feature.getUrn() !== childNode.feature.getUrn()
                );
                if (matchedCol >= 0) {
                    if (!childNodeGroups[`col-${childNode.col}`])
                        childNodeGroups[`col-${childNode.col}`] = [];
                    childNodeGroups[`col-${childNode.col}`].push(childNode);
                }
            }
        });

        _.keys(childNodeGroups).forEach(key => {
            const dir = this.directionOf(this.startTraceNode);
            const structNode = new PinTraceStructNode(struct, childNodeGroups[key], dir);
            this.structNodes.push(structNode);
        });

        return this.structNodes;
    }

    /**
     * Create node (and link from parent, if appropriate)
     */
    addNode(type, parentNode, feature, dir) {
        const node = new PinTraceNode(type, parentNode, feature, dir);
        this.nodes.push(node);

        if (parentNode) {
            const link = new PinTraceLink(parentNode, node, feature);
            this.links.push(link);
        }

        return node;
    }

    /**
     * Number of direct children of traceNode of type
     */
    // ENH: Return this from server
    nChildren(traceNode, type) {
        let n = 0;
        for (const child of traceNode.children) {
            if (this.nodeTypeOf(child) == type) n += 1;
        }
        return n;
    }

    /**
     * Type of traceNode ('cable','equip','conn' or undefined)
     */
    // ENH: Return this from server
    nodeTypeOf(traceNode) {
        if (traceNode.ports) return 'equip';
        if (traceNode.from_) return 'conn';
        if (traceNode.fibers) return 'cable';
    }

    // ------------------------------------------------------------------------
    //                               POSITIONING
    // ------------------------------------------------------------------------

    /**
     * Set positions for subtree of node
     */
    setNodePositions(node, row = 0, col = 0) {
        col = this.grid.nextFreeCol(col, row, 2);

        // Set position of children
        // ENH: Do upstream and downstream separately
        const nChildren = node.children.length;
        if (nChildren > 0) {
            col -= nChildren - 1;
            for (const childNode of node.children) {
                const rowOffset = childNode.dir == 'upstream' ? -1 : 1;
                col = this.setNodePositions(childNode, row + rowOffset, col);
            }

            if (node.type === 'equip') {
                col = (node.children[0].col + node.children[nChildren - 1].col) / 2;
            }
        }

        // Set position of self
        node.row = row;
        node.col = col;
        this.grid.setCell(col - 1, row, node); // Padding
        this.grid.setCell(col, row, node);
        this.grid.setCell(col + 1, row, node); // Padding

        return col;
    }

    /**
     * Move upstream nodes (to match downstream root)
     */
    adjustUpstreamNodePositions(node, col0) {
        // Adjust children
        for (const childNode of node.children) {
            if (childNode.dir == 'upstream') {
                const colOffset = node.dir == 'upstream' ? childNode.col - node.col : 0;
                this.adjustUpstreamNodePositions(childNode, col0 + colOffset);
            }
        }

        // Adjust self
        if (node.dir == 'upstream') node.col = col0;
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
            trans = trans.scale(-1, -6);
        } else {
            trans = trans.scale(-1, 6).rotate(90);
        }
        return trans;
    }

    /**
     * Feature representations for self
     */
    items(opts) {
        const reps = [];

        // Add links
        for (const link of this.links) {
            const rep = link.item(opts);
            reps.push(rep);
        }

        // Add nodes to map
        for (const node of this.nodes) {
            const rep = node.item(opts);
            reps.push(rep);
        }

        // Add struct nodes to map
        for (const structNode of this.structNodes) {
            const structNodeRep = structNode.item(opts);
            reps.push(structNodeRep);
        }

        return reps;
    }

    // ------------------------------------------------------------------------
    //                                HELPERS
    // ------------------------------------------------------------------------

    /**
     * Direction of trace tree 'traceNode'
     *
     * Returns 'upstream', 'downstream' or none
     */
    directionOf(traceNode) {
        if (traceNode.direction == 'both') return null;
        return traceNode.direction;
    }

    /**
     * Follow a reference field
     */
    async getRef(feature, field) {
        const res = await this.getRefs(feature, field);
        return res[0];
    }

    async getRefs(feature, field) {
        return feature.followRelationship(field);
    }
}
