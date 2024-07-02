// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import PinRange from '../api/pinRange';
import PinFeatureTreeView from './pinFeatureTreeView';
import Menu from '../base/menu';

/**
 * Tree view showing cable ends within a structire
 *
 * Provides context menu for disconnecting fibers, tracing, etc.
 * Supports filtering by containment (see .housingFilterItem)
 */
export default class CablePinTreeView extends PinFeatureTreeView {
    static {
        this.prototype.messageGroup = 'CablePinTreeView';
    }

    /**
     * Constructor
     */
    constructor(owner, options) {
        super(owner, options);

        // Gather config info of interest
        this.configs = {
            ...myw.config['mywcom.cables'],
            ...myw.config['mywcom.equipment']
        };

        this.portImage = 'modules/comms/images/features/port.svg';
        this.defaultCableImage = 'modules/comms/images/features/fiber_cable.svg';

        this.structManager = this.owner.app.plugins.structureManager;

        // Create item for filtering by containment
        this.housingFilterItem = new myw.Dropdown({
            options: [],
            onChange: equipUrn => this.setHousingFilter(equipUrn)
        });
    }

    // --------------------------------------------------------------------------
    //                               TREE BUILDING
    // --------------------------------------------------------------------------

    // Display tree for 'feature'
    async renderFor(feature, housing) {
        this.housing = housing;
        await super.renderFor(feature);
    }

    /**
     * Get data for the connections to display in a tree form
     */
    async getTreesFor(struct) {
        this.struct = struct;

        // Get cables and their connections
        this.structContent = await this.structManager.structContent(
            struct,
            this.displayManager.showProposed
        );

        await this.locManager.getFeaturesLOCDetails(this.structContent.segs);
        await this.locManager.getFeaturesLOCDetails(this.structContent.equips);

        const cableTrees = await this.structContent.cableConnectionPointsFor(this.options.side);

        // Build trees
        const trees = [];
        for (const cableTree of Object.values(cableTrees)) {
            const tree = this.createCableNode(cableTree);
            if (tree) trees.push(tree);
        }

        // Init containment filter
        this.equipTree = this.structContent.equipTree();
        this.setHousingFilterChoices(this.housingFilterUrn || this.struct.getUrn());

        return trees;
    }

    /**
     * Create subtree for a cable
     */
    createCableNode(cableTree) {
        let node;

        const nonProposedChildren = _.filter(
            cableTree.children,
            pinSet => !pinSet.feature.isProposed()
        );

        // If multiple segments ... (or a single internal segment)
        if (
            nonProposedChildren.length > 1 ||
            (nonProposedChildren.length && nonProposedChildren[0].isInternal)
        ) {
            // Create cable node
            // ENH: Show total connections?
            node = this.newNode({
                id: cableTree.cable.getUrn(),
                feature: cableTree.cable,
                text: this.displayManager.unDirectedCableLabel(cableTree.cable),
                icon: this.getIconFor(cableTree.cable),
                filterChildren: true,
                highlight: this.geomRepFor(cableTree.cable)
            });

            // Add child nodes
            _.each(nonProposedChildren, (pinSet, idx) => {
                const segTree = this.createSegNode(
                    pinSet.feature,
                    pinSet,
                    pinSet.cable,
                    this.labelFor(pinSet.feature, pinSet.cable_side),
                    this.geomRepForCable(pinSet.cable, pinSet.feature, pinSet.cable_side),
                    idx.toString()
                );

                if (segTree) node.children.push(segTree);
            });
        } else {
            // Create cable node
            const pinSet = cableTree.children[0];
            node = this.createSegNode(
                pinSet.feature,
                pinSet,
                pinSet.cable,
                pinSet.cable.properties.name
            );
        }

        // Add slack info (if necessary)
        this.addSlackSummary(node);

        return node;
    }

    /**
     * Create subtree for a cable segment
     */
    // WARNING: For an internal segment node, pinSet is not a pinSet(!)  // ENH: Fix this
    createSegNode(seg, pinSet, cable, label, highlight = undefined, sortValue = undefined) {
        let node;

        if (pinSet.isInternal) {
            // Only highlight the internal seg, not the cable
            highlight = this.geomRepFor(pinSet.feature);

            node = this.newNode({
                id: pinSet.feature.getUrn(),
                feature: pinSet.feature,
                text: this.msg('internal_seg'),
                icon: this.getIconFor(pinSet.cable),
                sortValue: sortValue,
                filterChildren: true,
                highlight: highlight
            });

            const slackFeature = pinSet.slack;
            if (slackFeature) {
                node.icon = this.getIconFor(slackFeature);
                node.text = this.msg('slack_seg');
                node.slack = slackFeature;

                const slackLength = slackFeature.formattedFieldValue('length');
                if (slackLength) node.text += ` ${slackLength}`;
            }

            _.each(pinSet.children, (childPinSet, idx) => {
                if (!seg.properties.directed || childPinSet.pins.side != this.options.side) {
                    const sideNode = this._createSegNode(
                        childPinSet.feature,
                        childPinSet,
                        cable,
                        this.labelFor(childPinSet.feature, childPinSet.pins.side),
                        highlight,
                        idx.toString()
                    );
                    node.children.push(sideNode);
                }
            });
        } else {
            node = this._createSegNode(seg, pinSet, cable, label, highlight, sortValue);
        }

        return node;
    }

    _createSegNode(seg, pinSet, cable, label, highlight = undefined, sortValue = undefined) {
        // Create node for segment
        const node = this.newNode({
            id: seg.getUrn() + pinSet.pins.side,
            feature: seg,
            text: `${label} (${pinSet.n_connected}/${pinSet.pins.size})`,
            pins: pinSet.pins,
            icon: this.getIconFor(cable),
            highlight: highlight || this.geomRepFor(cable),
            filterText: cable.getTitle(),
            sortValue: sortValue
        });

        if (cable.isProposed()) {
            node.text = this.getNodeTextFor(cable);
            node.link = cable.getDelta();
            return node;
        }

        if (seg.isProposed()) return; // Do not create nodes for proposed segments

        seg._cable = cable; // ENH: Find a cleaner way

        // Add node for each pin
        this.addPinNodes(
            seg,
            'cable',
            pinSet.pins,
            pinSet.conns,
            node,
            cable,
            pinSet.cable_side,
            pinSet.circuits
        );

        return node;
    }

    // Node text for segment 'seg'
    labelFor(seg, cable_side) {
        if (seg.properties.directed) {
            return this.msg(cable_side); // ENH: Make message IDs more regular
        } else {
            return this.msg('cable_' + cable_side);
        }
    }

    // Image for 'feature'
    getIconFor(feature) {
        const config = this.configs[feature.getType()] || {};
        return config.image || this.portImage;
    }

    // --------------------------------------------------------------------------
    //                               FILTERING
    // --------------------------------------------------------------------------

    /**
     * Set choices for containment filter
     */
    setHousingFilterChoices(initialUrn) {
        // ENH: Fix Dropdown.setOptions() to update choices and use that
        this.housingFilterItem.dropdownOptions = this.housingFilterChoices();
        this.housingFilterItem.setValue(initialUrn);
        this.setHousingFilter(initialUrn);
    }

    /**
     * Choices for housing filter pulldown
     */
    housingFilterChoices() {
        const equipNode = this.equipTree.subtreeFor(this.housing.getUrn());

        this.housingChoices = [];
        for (const node of equipNode.path()) {
            const equip = node.feature;
            this.housingChoices.push({ value: equip.getUrn(), display_value: equip.getTitle() });
        }

        return this.housingChoices.reverse();
    }

    /**
     * Filter tree to segments ends inside 'housingUrn' (and its children)
     */
    setHousingFilter(housingUrn) {
        this.housingFilterUrn = housingUrn;
        const equipNode = this.equipTree.subtreeFor(housingUrn);
        this.segs = equipNode.allConnectableSegs(this.options.side);
        this.filter();
    }

    /**
     * True if 'node' is included in current filter
     */
    filterNode(node, parentVisible) {
        // Apply standard filter
        let visible = super.filterNode(node, parentVisible);

        // Apply containment filter to segment nodes
        if (visible) {
            if (node.pins) {
                visible = this.segs.includes(node.feature);
            } else {
                visible = false;
            }
        }

        return visible;
    }

    // --------------------------------------------------------------------------
    //                               SELECTION
    // --------------------------------------------------------------------------

    // Subclassed to inform owner
    selectionChanged(startSelection) {
        this.owner.selectionChanged(this, startSelection);
    }

    // Text representing current selected pin range in self (if any)
    selectionText(connected = undefined) {
        const sel = this.selection(connected);
        if (!sel) return '';
        let text = `${sel.cable.properties.name} #${sel.pins.rangeSpec()}`;
        return text;
    }

    // Size of selected pin range
    selectionSize(connected = undefined) {
        const sel = this.selection(connected);
        if (!sel) return 0;

        return sel.pins.size;
    }

    /*
     * Returns the currently selected cable, segment and pins (if any)
     * @param {boolean} Only return result if all nodes in this state
     */
    selection(connected = undefined) {
        // Check for nothing selected
        const nSel = this.selectedNodes.length;
        if (nSel == 0) return undefined;

        // Check for some already connected
        for (let iNode = 0; iNode < nSel; iNode++) {
            const node = this.selectedNodes[iNode];
            const nodeConnected = !!node.pin && !!node.conn && !this._connProposed(node);
            if (connected == false && nodeConnected) return undefined;
            if (connected == true && !nodeConnected) return undefined;
        }

        // Build result
        const firstPin = this.selectedNodes[0].pin;
        const lastPin = this.selectedNodes[nSel - 1].pin;

        return {
            seg: this.selectedNodes[0].feature,
            pins: new PinRange(this.selectedNodes[0].side, firstPin, lastPin),
            cable: this.selectedNodes[0].feature._cable
        };
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

        // Segment actions
        if (node.pins) {
            menu.addItem('lazy', 'show_circuits', data => this._doShowCircuitsFor(data));
            menu.addItem('lazy', 'show_paths', data => this.doShowPathsForChildren(data));
            menu.addItem('lazy', 'view_status_loc', data =>
                this.viewStatusLoc(feature, jsNode.text)
            );
        }

        // Pin actions
        if (node.pin) {
            menu.addItem('lazy', 'show_circuits', data => this._doShowCircuitsFor(data));
            menu.addItem('lazy', 'show_paths', data => this.doShowPaths(data));

            // nodes with proposed objects should be read only
            const connProposed = this._connProposed(node);
            if (node.conn && !connProposed) {
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

        // Refresh trees
        // ENH: Replace by handling of disconnect event
        if (this.owner.refreshTrees) {
            this.owner.refreshTrees();
        } else this.refreshFor(this.feature);
    }

    viewStatusLoc(feature, title) {
        const loc = myw.app.plugins.locManager.formattedLoc(feature);
        myw.dialog({ title: title, contents: loc, destroyOnClose: true, modal: false });
    }
}
