// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Schematic from 'modules/comms/js/schematics/schematic';
import Grid from 'modules/comms/js/schematics/grid';
import RoutePathNode from './routePathNode';
import RoutePathLink from './routePathLink';

export default class RoutePathSchematic extends Schematic {
    /**
     * Layout options (a list of option defs)
     */
    getOptionDefs() {
        const layoutChoices = [
            { value: 'horizontal', text: 'Horizontal' },
            { value: 'vertical', text: 'Vertical' } // TODO: Use messages
        ];

        return [
            {
                name: 'layout',
                text: 'Layout',
                items: layoutChoices,
                default: 'vertical',
                resetView: true
            },
            { name: 'labels', text: 'Labels', default: false },
            { name: 'conduitCapacity', text: 'Capacity', default: true }
        ];
    }

    /**
     * Init slots of self
     */
    constructor() {
        super();
        // Init constants
        this.structs = myw.config['mywcom.structures'];
        this.routes = myw.config['mywcom.routes'];
        this.conduits = myw.config['mywcom.conduits'];

        // Find pseudo-conduits
        // ENH: Do this once, store on class
        this.conduitBundles = {};
        for (const conduitType in this.conduits) {
            const bundleType = this.conduits[conduitType].bundle_type;
            if (bundleType) this.conduitBundles[bundleType] = {};
        }
    }

    /**
     * Data of 'features' from which self can be built (if any)
     */
    getBuildData(features) {
        if (!features.isTraceResult) return;
        if (!['struct', 'route'].includes(this.categoryOf(features.start))) return;
        if (features.start.getLeaves().length != 1) return;
        return features;
    }

    /**
     * Create from structure network trace
     */
    async buildFrom(trace) {
        // Init slots
        this.startTraceNode = trace.start;
        this.endTraceNode = trace.start.getLeaves()[0];

        this.nodes = [];
        this.links = [];
        this.grid = new Grid();
        await this.buildGraph(trace.start);
        return this;
    }

    /**
     * Title string
     */
    title() {
        return `Path: ${this.startTraceNode.properties.name} -> ${this.endTraceNode.properties.name}`;
    }

    // ------------------------------------------------------------------------
    //                               GRAPH BUILDING
    // ------------------------------------------------------------------------

    /**
     * Add nodes and links for objects in subtree of traceNode
     */
    async buildGraph(traceNode) {
        let row = 0;
        let col0 = 0;
        while (traceNode) {
            const category = this.categoryOf(traceNode);

            switch (category) {
                case 'struct':
                    this.addNode(category, traceNode, row, col0);
                    break;

                case 'route':
                    this.addLink(category, traceNode, row, col0);
                    await this.addConduits(traceNode.feature, row, col0 + 1.5);
                    break;

                default:
                    console.log('Unknown trace node type', category);
            }

            // Next node
            traceNode = traceNode.children[0];
            row += 1;
        }
    }

    /**
     * Create links for conduits of 'route'
     */
    async addConduits(route, row, col) {
        const routeContent = await myw.app.plugins.structureManager.routeContent(route);
        const tree = routeContent.cableTree(); // TODO: Pass app in?
        this.addConduitsFrom(tree, row, col);
    }

    /**
     * Create links for conduits children of 'tree'
     */
    addConduitsFrom(tree, row, col) {
        const sorter = function (a, b) {
            return a.feature.properties.name < b.feature.properties.name ? -1 : 1;
        };

        for (const child of tree.children.sort(sorter)) {
            if (this.categoryOf(child.feature) == 'conduit') {
                const link = this.addLink('conduit', child.feature, row, col);

                link.cables = [];
                for (const subChild of child.children.sort(sorter)) {
                    if (this.categoryOf(subChild.feature) == 'segment') {
                        link.cables.push(subChild.cable);
                    }
                }
                col += 0.5;
            }

            col = this.addConduitsFrom(child, row, col);
        }

        return col;
    }

    /**
     * Create node
     */
    addNode(type, feature, row, col) {
        const node = new RoutePathNode(type, feature, row, col);
        this.nodes.push(node);
        return node;
    }

    /**
     * Create link
     */
    addLink(type, feature, row, col) {
        const link = new RoutePathLink(type, feature, row, col);
        this.links.push(link);
        return link;
    }

    /**
     * Type of feature
     */
    categoryOf(feature) {
        const featureType = feature.getType();
        if (featureType in this.routes) return 'route';
        if (featureType in this.structs) return 'struct';
        if (featureType in this.conduitBundles) return 'conduit_bundle';
        if (featureType in this.conduits) return 'conduit';
        if (featureType == 'mywcom_fiber_segment') return 'segment';
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
}
