// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import PinFeatureTreeView from './pinFeatureTreeView';
import Menu from '../base/menu';
import PinRange from '../api/pinRange';
import EquipmentSelectionDialog from './equipmentSelectionDialog';

const otherSide = { in: 'out', out: 'in' };

/**
 * Tree view showing conduit ends within a structure
 *
 * Provides context menu for cutting conduits, etc
 */
// ENH: Share code with StructCableTreeView
export default class StructConduitTreeView extends PinFeatureTreeView {
    static {
        this.prototype.messageGroup = 'CableTreeView';

        this.mergeOptions({
            dragDrop: false // Enable drag/drop or not
        });
    }

    // Constructor
    constructor(owner, options) {
        super(owner, options);

        // Gather config info of interest
        this.configs = {
            ...myw.config['mywcom.cables'],
            ...myw.config['mywcom.equipment'],
            ...myw.config['mywcom.conduits']
        };

        this.defaultImage = 'modules/comms/images/features/default.svg';

        this.cableManager = this.app.plugins.cableManager;
        this.connectionManager = this.app.plugins.connectionManager;
        this.conduitManager = this.app.plugins.conduitManager;
        this.structManager = this.app.plugins.structureManager;
        this.structManager = this.app.plugins.structureManager;
        this.specManager = this.app.plugins.specManager;
    }

    // --------------------------------------------------------------------------
    //                                  TREE BUILDING
    // --------------------------------------------------------------------------

    // Build tree for 'struct'
    async getTreesFor(struct) {
        this.struct = struct;

        // Get contained objects
        const includeProposed = this.displayManager.showProposed;
        this.structContent = await this.structManager.structContent(struct, includeProposed);
        const tree = this.structContent.conduitTree();

        // Fetch and cache line of count information
        await this.locManager.getFeaturesLOCDetails(this.structContent.segs, includeProposed);

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
        let proposed = false;

        if (cableTreeNode.passThroughConduit) {
            node = this.createPassThroughNode(cableTreeNode, parentNode);
            proposed = node.proposed;
        } else {
            proposed = cableTreeNode.feature.isProposed();
            node = this.newFeatureNode(cableTreeNode.feature, parentNode, {
                isProposed: proposed,
                isLink: true
            });

            node.nodeType = cableTreeNode.nodeType;
        }

        if (cableTreeNode.conduitRun && !node.proposed)
            // Highlight whole conduit run
            node.highlight = this.geomRepFor(cableTreeNode.conduitRun);

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
        const segSide = otherSide[segNode.side];

        let text = this.displayManager.cableLabel(
            cable,
            seg,
            segNode.side,
            segNode.pins,
            segNode.n_connected
        );
        const decs = this.displayManager.segDecorations(seg, segSide, this.structContent.features);

        text = text + decs;

        const highlight = seg.isProposed() ? null : this.geomRepFor(cable);
        const link = seg.isProposed() ? cable.getDelta() : cable.getUrn();

        // Add node for side
        const node = this.newNode({
            id: seg.getUrn(),
            feature: seg,
            text: text,
            icon: this.getIconFor(cable),
            segSide: segSide,
            pins: segNode.pins,
            cable: cable,
            highlight: highlight,
            link: link,
            filterText: cable.getTitle()
        });

        parentNode.children.push(node);

        if (seg.isProposed()) return node;

        // Add node for each pin
        this.addPinNodes(
            seg,
            'cable',
            segNode.pins,
            segNode.conns,
            node,
            cable,
            segNode.cable_side,
            segNode.circuits
        );

        return node;
    }

    /*
     * Add sub-tree for pass through conduit
     */
    createPassThroughNode(passThroughNode, parentNode) {
        const conduit = passThroughNode.feature;
        const passThroughConduit = passThroughNode.passThroughConduit;
        const proposed = conduit.isProposed();

        const node = this.newFeatureNode(passThroughNode.feature, parentNode, {
            isLink: false,
            isProposed: proposed
        });

        node.text = this.displayManager.connectedConduitLabel(conduit, passThroughConduit);
        node.pass_through = true;
        node.passThroughConduit = passThroughConduit;

        // TODO: Use URNs, find better way
        node.linkedFeatures = [conduit, passThroughConduit];

        return node;
    }

    // --------------------------------------------------------------------------
    //                                  RENDERING
    // --------------------------------------------------------------------------
    /*
     * Set event handlers
     */
    setEventHandlers() {
        super.setEventHandlers();

        // Listen for connectivity changes
        this.stopListening(this.connectionManager);
        this.stopListening(this.conduitManager);

        this.listenTo(this.connectionManager, 'connected disconnected', event => {
            this.handleConnectionChange(event);
        });

        this.listenTo(this.conduitManager, 'connected disconnected', event => {
            this.handleConnectionChange(event);
        });
    }

    /*
     * Refresh the tree if connections have changed
     */
    handleConnectionChange(event) {
        this.refreshFor(this.feature);
    }

    // Icon to display in subtree for 'feature'
    getIconFor(feature) {
        const cfg = this.configs[feature.getType()] || {};
        return cfg.image || this.defaultImage;
    }

    // ------------------------------------------------------------------------------
    //                                CONTEXT MENU
    // ------------------------------------------------------------------------------

    /*
     * Creates context menu items appropriate for node
     * @param  {Object} node jsTree node the right click was initiated on
     */
    contextMenuFor(jsNode) {
        const node = jsNode.original;
        const feature = node.feature;
        const feature_type = feature && feature.getType();
        const editable = this.app.isFeatureEditable(feature_type, feature);

        const menu = new Menu(this.messageGroup);

        if (!feature) return;

        // make node from other deltas read only
        const proposed = feature.isProposed();
        if (proposed) return;

        // Segment actions
        if (node.pins) {
            menu.addItem('lazy', 'show_circuits', data => this._doShowCircuitsFor(data));

            menu.addItem('lazy', 'show_paths', data => this.doShowPathsForChildren(data));

            // Tick Marks
            if (node.cable && this.specManager.getSpecFor(node.cable)) {
                menu.addItem('set_props', 'set_tick_mark', data => this.setTickMarkFor(data));
            }

            // Segment containment
            menu.addItem('set_props', 'set_equipment', data => this.setSegmentContainment(data));

            if (editable && this.locManager.isLocEditable(feature))
                menu.addItem('loc', 'edit_status_loc', data => this.editStatusLoc(feature));
            menu.addItem('loc', 'view_status_loc', data =>
                this.viewStatusLoc(feature, jsNode.text)
            );
        }

        // Pin actions
        if (node.pin) {
            menu.addItem('lazy', 'show_circuits', data => this._doShowCircuitsFor(data));
            menu.addItem('lazy', 'show_paths', data => this.doShowPaths(data));

            menu.addItem('trace', 'trace_upstream', data => this.doTrace(data, 'upstream'));
            menu.addItem('trace', 'trace_downstream', data => this.doTrace(data, 'downstream'));
            menu.addItem('trace', 'trace_both', data => this.doTrace(data, 'both'));
        }

        // Conduit actions
        if (node.pass_through) {
            menu.addItem('conduit', 'disconnect_conduit', data => {
                this.disconnectConduit(data);
            });
        }

        if (this.conduitManager.isContinuousConduitType(feature)) {
            menu.addItem('conduit', 'show_conduit_path', data => {
                this.showConduitPath(data);
            });

            if (!node.pass_through) {
                menu.addItem('conduit', 'join_conduits', data => {
                    this.showConduitConnectionDialog(data);
                });
            }
        }

        // Reports
        const reportManager = this.app.plugins.reportManager;
        const reports = reportManager.reportsFor(feature);

        // Add pin information to feature ENH: Allow passing options to reports
        if (node.pin) feature.pins = new PinRange(node.side, node.pin);
        if (node.pins) feature.pins = node.pins;
        if (this.selectedNodes.length > 1) feature.pins = this.selectedPins();

        // ENH: Sort
        for (const [name, report] of Object.entries(reports)) {
            menu.addItem(
                'reports',
                'report_' + name,
                data => this.showReport(data, report),
                true,
                report.typeName()
            );
        }

        return menu;
    }

    // ------------------------------------------------------------------------------
    //                                CONTINUOUS CONDUIT
    // ------------------------------------------------------------------------------

    async disconnectConduit(data) {
        const jsNode = this.getJsNodeFor(data);
        const node = this.getNodeFor(data);
        const conduitFeature = node.feature;
        const rootHousing = this.feature;

        let result;

        try {
            this.addProcessingIndicator(jsNode);
            result = await this.conduitManager.disconnectConduit(conduitFeature, rootHousing);
            this.removeProcessingIndicator(jsNode);
            this.refreshFor(this.feature);
        } catch (e) {
            this.removeProcessingIndicator(jsNode);
            this.showError('disconnect_conduit_failed', e);
            throw e;
        }

        if (!result.ok) this.showMessage('Disconnect/cut failed', result.error); //ENH: Replace by server condition
    }

    showConduitConnectionDialog(data) {
        const node = this.getNodeFor(data);
        const conduitFeature = node.feature;

        this.owner.showConduitConnectionDialog(this.feature, conduitFeature);
    }

    // ------------------------------------------------------------------------------
    //                                CONDUITS
    // ------------------------------------------------------------------------------

    async showConduitPath(data) {
        const jsNode = this.getJsNodeFor(data);
        const node = this.getNodeFor(data);
        const conduitFeature = node.feature;
        const app = this.app;

        let res;
        try {
            this.addProcessingIndicator(jsNode);
            res = await conduitFeature.continuousConduits();
            this.removeProcessingIndicator(jsNode);

            // Show result
            if (res.length) {
                app.setCurrentFeatureSet(res, { currentFeature: null, zoomTo: false });
                app.map.fitBoundsToFeatures(app.currentFeatureSet.items);
            }
        } catch (e) {
            this.removeProcessingIndicator(jsNode);
            this.showError('conduit_trace_failed', e);
            throw e;
        }
    }

    // --------------------------------------------------------------------------
    //                             DRAG & DROP
    // --------------------------------------------------------------------------

    // True if 'node' can be dragged
    isDraggable(node) {
        const feature = node.feature;
        const featureType = feature && feature.getType();

        // Case: Design not in editable state
        if (!this.app.isFeatureEditable(featureType, feature)) return false;
        // Case: feature is proposed
        if (feature && feature.isProposed()) return false;
        return !_.isUndefined(node.cable);
    }

    /*
     * True if 'dropNode' is a suitable drop location for 'node'
     */
    isDropSiteFor(node, dropNode) {
        const cable = node.cable;
        const seg = node.feature;
        const dropFeature = dropNode.feature;

        // Also get other side of drop conduit as we may be able to drop on that
        const passThrough = dropNode.passThroughConduit;

        if (!cable || !dropFeature) return false;

        // Compare root housing as can only drop segments onto conduits under the same route
        const segRootHousing = seg.properties.root_housing;
        const dropRootHousing = dropFeature.properties.root_housing;
        const passThroughRootHousing = passThrough && passThrough.properties.root_housing;

        if (segRootHousing != dropRootHousing && segRootHousing != passThroughRootHousing)
            return false;

        const cfg = this.cableManager.cableConfig[cable.getType()];
        const housings = cfg && cfg.housings;
        const dropNodeType = dropFeature.getType();

        return _.includes(housings, dropNodeType);
    }

    /*
     * Callback for drop of 'node' onto 'dropNode'
     *
     * 'dropNode' has already been validated as a drop site for 'node'
     */
    async dropOn(node, dropNode) {
        await this.conduitManager.moveInto(node.feature, dropNode.feature);

        // If get to here, there was no error, ensure we modify the cached feature housing
        node.feature.properties.housing = dropNode.feature.getUrn();

        // Refresh on drop as dropped features could appear in >1 places for this tree
        this.refreshFor(this.feature);
    }
}
