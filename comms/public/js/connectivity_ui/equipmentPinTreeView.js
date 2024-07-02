// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import PinRange from '../api/pinRange';
import PinFeatureTreeView from './pinFeatureTreeView';
import Menu from '../base/menu';

/**
 * Tree view showing equipment within a structure
 *
 * Provides context menu for tracing, disconnecting ports, etc
 */
export default class EquipmentPinTreeView extends PinFeatureTreeView {
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

        this.connectionManager = this.owner.app.plugins.connectionManager;
        this.structManager = this.owner.app.plugins.structureManager;

        this.oppositeSide = { in: 'out', out: 'in' };
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
        const includeProposed = this.displayManager.showProposed;
        const structContent = await this.structManager.structContent(this.struct, includeProposed);
        const equipTree = structContent.equipTree();

        // Create tree nodes, walking down tree
        const tree = this.createEquipNode(
            'struct',
            equipTree,
            null,
            this.oppositeSide[this.options.side]
        );

        return [tree];
    }

    /*
     * Create node for equipTree and its children
     */
    createEquipNode(nodeType, equipTree, parentNode = null, side = null) {
        const feature = equipTree.feature;
        const inCircuits = [];
        const outCircuits = [];
        equipTree.circuits.forEach(circuit => {
            if (circuit.pins.side == 'in') inCircuits.push(circuit);
            if (circuit.pins.side == 'out') outCircuits.push(circuit);
        });

        // Check for not required
        if (!this._includeFeature(feature)) return;

        const node = this.newFeatureNode(feature, parentNode);
        node.nodeType = nodeType;

        if (!parentNode) node['li_attr'] = { class: 'jstree-root-node' };

        // Add nodes for ports
        const pinTree = equipTree.pins;

        if (side) {
            if (pinTree[`${side}_pins`]) {
                const sideCircuits = side == 'in' ? inCircuits : outCircuits;
                this.addPortNodes(feature, side, pinTree[`${side}_pins`], node, sideCircuits);
            }
        } else {
            if (pinTree.in_pins)
                this.addPortNodes(feature, 'in', pinTree.in_pins, node, inCircuits);
            if (pinTree.out_pins)
                this.addPortNodes(feature, 'out', pinTree.out_pins, node, outCircuits);
        }

        // Add nodes for contained equipment
        const childTrees = equipTree.children;
        for (const childPinTree of childTrees) {
            this.createEquipNode('equip', childPinTree, node, side);
        }

        // Set tree state
        if (parentNode) this.setDefaultState(parentNode, true);

        return node;
    }

    /**
     * Creates sub-nodes for ports of given feature
     * @param  {Feature} feature     Feature from which connections run
     * @param  {object} pinSet       Pins and connections
     * @param  {node} parentNode     Node to add children to
     */
    addPortNodes(feature, side, pinSet, parentNode, circuits) {
        const pins = new PinRange(side, pinSet.pins.low, pinSet.pins.high);

        // Create main node
        const nodeId = [feature.getUrn(), side].join('/');
        const nodeText = `${this.msg(side)} (${pinSet.n_connected}/${pins.size})`;
        const node = this.newNode({
            id: nodeId,
            feature: feature,
            text: nodeText,
            nodeType: 'side',
            pins: pins
        });

        // Add node for each port
        this.addPinNodes(feature, 'port', pins, pinSet.conns, node, null, null, circuits);

        parentNode.children.push(node);

        return parentNode;
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

    // Subclassed to inform owner
    selectionChanged(startSelection) {
        this.owner.selectionChanged(this, startSelection);
    }

    // Text representing current selected pin range in self (if any)
    selectionText() {
        const sel = this.selection();
        if (!sel) return '';
        let pinText = `${this.msg(sel.pins.side)}:${sel.pins.rangeSpec()}`;
        let text = `${sel.feature.properties.name} #${pinText}`;
        return text;
    }

    // Size of selected pin range
    selectionSize() {
        const sel = this.selection();
        if (!sel) return 0;

        return sel.pins.size;
    }

    /*
     * Returns the currently selected feature and pins (if any)
     * @param {boolean} [connected=undefined] Only return result if all nodes in this state
     */
    selection(connected = undefined) {
        // Check for nothing selected
        const nSel = this.selectedNodes.length;
        if (nSel == 0) return undefined;

        // Check for bad connection status
        for (let iNode = 0; iNode < nSel; iNode++) {
            const node = this.selectedNodes[iNode];
            if ((connected == false && node.conn) || !node.pin) return undefined;
            else if ((connected == true && !node.conn) || !node.pin) return undefined;
        }

        // Build result
        const firstPin = this.selectedNodes[0].pin;
        const lastPin = this.selectedNodes[nSel - 1].pin;

        return {
            feature: this.selectedNodes[0].feature,
            pins: new PinRange(this.selectedNodes[0].side, firstPin, lastPin)
        };
    }

    /*
     * Returns the currently selected feature and pins (if any) so long as it's fiber equipment
     * @param {boolean} [connected=undefined] Only return result if all nodes in this state
     */
    fiberSelection(connected = undefined) {
        const selection = this.selection(connected);
        if (!selection) return;
        const tech = this.connectionManager.techFor(selection.feature, selection.pins.side);
        if (tech !== 'fiber') return;
        return selection;
    }

    /**
     * True if 'feature' should be included in the tree
     */
    _includeFeature(feature) {
        if (feature.definedFunction && feature.definedFunction() == 'slack') return false;
        return true;
    }

    // ------------------------------------------------------------------------------
    //                                CONTEXT MENU
    // ------------------------------------------------------------------------------

    /*
     * Returns context menu to display for 'jsNode' (a Menu)
     * @param {Object} node jsTree node the right click was initiated on
     */
    contextMenuFor(jsNode) {
        const node = jsNode.original;
        const feature = node.feature;
        const featureType = feature && feature.getType();
        const editable = this.app.isFeatureEditable(featureType, feature);
        const singleSelect = this.selectedNodes.length <= 1;

        const menu = new Menu(this.messageGroup);

        // Side actions
        if (node.pins) {
            menu.addItem('lazy', 'show_paths', data => this.doShowPathsForChildren(data));
        }

        // Pin actions
        if (node.pin) {
            menu.addItem('lazy', 'show_paths', data => this.doShowPaths(data));

            if (node.conn) {
                menu.addItem(
                    'conn',
                    'disconnect',
                    data => this.disconnect(data),
                    editable && (singleSelect || !!this.selectedPins(true))
                );
            }
        }
        return menu;
    }

    /*
     * Disconnect selected pins
     */
    async disconnect(data) {
        await super.disconnect(data);
        if (this.owner.refreshTrees) {
            // So it refreshes both the from and the to trees in cable connection dialog
            this.owner.refreshTrees();
        } else this.refreshFor(this.feature);
    }
}
