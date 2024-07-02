// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import FeatureTreeView from '../base/featureTreeView';

/**
 * Tree view showing equipment within a structure (but not its pins)
 */
export default class EquipmentPinTreeView extends FeatureTreeView {
    static {
        this.prototype.messageGroup = 'EquipmentPinTreeView';
    }

    /**
     * Constructor
     */
    constructor(owner, options) {
        super(owner, options);

        this.equipConfigs = myw.config['mywcom.equipment'] || {};
        this.cableConfigs = myw.config['mywcom.cables'] || {};
        this.defaultEquipmentImage = 'modules/comms/images/features/default.svg';

        this.structManager = this.owner.app.plugins.structureManager;

        this.selectableTypes = ['struct', 'equip'];
    }

    // --------------------------------------------------------------------------
    //                               TREE BUILDING
    // --------------------------------------------------------------------------

    /**
     * Build equipment tree
     */
    async getTreesFor(struct) {
        this.struct = struct;

        // Get data for tree
        this.structContent = await this.structManager.structContent(this.struct, false);
        const equipTree = this.structContent.equipTree();

        // Create tree nodes, walking down tree
        const tree = this.createEquipNode('struct', equipTree, null);

        return [tree];
    }

    /*
     * Create node for equipNode and its children
     */
    createEquipNode(nodeType, equipTree, parentNode = null) {
        const feature = equipTree.feature;

        // Check for not required
        if (!this._includeFeature(feature)) return;

        const node = this.newFeatureNode(feature, parentNode);
        node.nodeType = nodeType;

        if (!parentNode) node['li_attr'] = { class: 'jstree-root-node' };

        // Add nodes for contained equipment
        const childTrees = equipTree.children;
        for (const childPinTree of childTrees) {
            this.createEquipNode('equip', childPinTree, node);
        }

        // Add explicitly contained cables
        if (nodeType == 'equip') {
            for (const cableUrn of equipTree.cables('explicit')) {
                const cable = this.structContent.features[cableUrn];

                const cableNode = this.newFeatureNode(cable, node, {
                    nodeType: 'cable',
                    nodeId: feature.getUrn() + '/' + cableUrn,
                    sortGroup: 9,
                    li_attr: { class: 'jstree-leaf-node' }
                });
            }
        }

        // Set tree state
        if (parentNode) this.setDefaultState(parentNode, true);

        return node;
    }

    getIconFor(feature) {
        const featureType = feature.getType();

        const equipConfig = this.equipConfigs[featureType] || {};
        const cableConfig = this.cableConfigs[featureType] || {};

        return equipConfig.image || cableConfig.image || this.defaultEquipmentImage;
    }

    // --------------------------------------------------------------------------
    //                               SELECTION
    // --------------------------------------------------------------------------

    /**
     * Subclassed to inform owner
     */
    selectionChanged(startSelection) {
        this.owner.selectionChanged(this, startSelection);
    }

    /**
     * Text representing current selected pin range in self (if any)
     */
    selectionText() {
        const equip = this.selection();
        if (!equip) return '';
        return equip.properties.name;
    }

    /*
     * Returns the currently selected feature
     */
    selection() {
        // Check for nothing selected
        const nSel = this.selectedNodes.length;
        if (nSel != 1) return undefined;

        const node = this.selectedNodes[0];
        if (!this.selectableTypes.includes(node.nodeType)) return undefined;

        return node.feature;
    }

    /**
     * True if 'feature' should be included in the tree
     */
    _includeFeature(feature) {
        if (feature.definedFunction && feature.definedFunction() == 'slack') return false;
        return true;
    }
}
