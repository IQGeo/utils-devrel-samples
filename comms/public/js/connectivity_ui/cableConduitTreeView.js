// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import PinFeatureTreeView from './pinFeatureTreeView';

/**
 * Tree view showing conduit ends within a structure
 *
 * Provides context menu for joining conduits, etc
 */
// ENH: Rename as ConduitTreeView
export default class cableConduitTreeView extends PinFeatureTreeView {
    static {
        this.prototype.messageGroup = 'CableTreeView';
    }

    // Constructor
    constructor(owner, options) {
        options.selectMultiple = false;
        options.selectBranches = true;
        super(owner, options);

        // Gather config info of interest
        this.configs = {
            ...myw.config['mywcom.cables'],
            ...myw.config['mywcom.conduits']
        };

        this.defaultImage = 'modules/comms/images/features/default.svg';

        this.conduitManager = this.app.plugins.conduitManager;
        this.structManager = this.app.plugins.structureManager;
    }

    // --------------------------------------------------------------------------
    //                                  TREE BUILDING
    // --------------------------------------------------------------------------

    // Build tree for 'struct'
    async getTreesFor(struct) {
        // Get contained objects
        const structContent = await this.structManager.structContent(struct);
        const tree = structContent.conduitTree();

        // Build tree
        const rootNode = this.createNode(tree);
        return rootNode.children;
    }

    /*
     * Build tree for 'cableTreeNode' (recursive)
     */
    createNode(cableTreeNode, parentNode = null) {
        // Case: Cable segment
        if (cableTreeNode.pins) return this.createCableSegNode(cableTreeNode, parentNode);

        let node;

        if (cableTreeNode.passThroughConduit) {
            node = this.createPassThroughNode(cableTreeNode, parentNode);
        } else {
            // Create node for feature
            node = this.newFeatureNode(cableTreeNode.feature, parentNode, {
                isLink: false
            });

            node.nodeType = cableTreeNode.nodeType;
        }

        // Highlight whole conduit run
        if (cableTreeNode.conduitRun) node.highlight = this.geomRepFor(cableTreeNode.conduitRun);

        // Add children
        if (cableTreeNode.children) {
            for (const childNode of cableTreeNode.children) {
                this.createNode(childNode, node);
            }
        }

        if (!parentNode) node['li_attr'] = { class: 'jstree-root-node' }; // ENH: Do this in super

        // Open conduit nodes by default
        if (
            node.feature &&
            _.includes(this.conduitManager.conduitFeatureTypes, node.feature.getType())
        )
            this.setDefaultState(node, true);

        return node;
    }

    /*
     * Add sub-tree for given cable segment
     */
    // ENH: Highlight full side of cable (not just first segment)
    createCableSegNode(segNode, parentNode) {
        const seg = segNode.feature;
        const cable = segNode.cable;

        let sideStr;
        if (cable.properties.directed) {
            sideStr = this.msg('side_' + segNode.side);
        } else {
            sideStr = this.msg('cable_' + segNode.side);
        }

        // Add node for side
        const node = this.newNode({
            id: seg.getUrn(),
            feature: seg,
            text: `${cable.properties.name} : (${segNode.n_connected}/${segNode.pins.size}) - ${sideStr}`,
            icon: this.getIconFor(cable),
            pins: segNode.pins,
            cable: cable,
            filterText: cable.getTitle(),
            highlight: this.geomRepFor(cable)
        });
        parentNode.children.push(node);

        // Add node for each pin
        this.addPinNodes(
            seg,
            'cable',
            segNode.pins,
            segNode.conns,
            node,
            cable,
            segNode.cable_side
        );

        return node;
    }

    /*
     * Add sub-tree for pass through conduit
     */
    createPassThroughNode(passThroughNode, parentNode) {
        const conduit = passThroughNode.feature;
        const passThroughConduit = passThroughNode.passThroughConduit;

        const node = this.newFeatureNode(passThroughNode.feature, parentNode, { isLink: false });
        node.text = `${conduit.getTitle()} == ${passThroughConduit.getTitle()}`;
        node.pass_through = true;

        return node;
    }

    // --------------------------------------------------------------------------
    //                                  RENDERING
    // --------------------------------------------------------------------------

    // Icon to display in subtree for 'feature'
    getIconFor(feature) {
        const cfg = this.configs[feature.getType()] || {};
        return cfg.image || this.defaultImage;
    }

    // --------------------------------------------------------------------------
    //                                  SELECTION
    // --------------------------------------------------------------------------

    // Subclassed to inform owner
    selectionChanged(startSelection) {
        this.owner.selectionChanged(this, startSelection);
    }

    // Returns current selected feature
    selection() {
        const selNode = _.first(this.selectedNodes);

        if (selNode && !selNode.pass_through) return selNode.feature;
    }
}
