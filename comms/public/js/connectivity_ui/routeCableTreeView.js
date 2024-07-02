// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import PinFeatureTreeView from './pinFeatureTreeView';
import Menu from '../base/menu';
import PinRange from '../api/pinRange';

/**
 * Tree view showing cables within a route
 *
 * Provides context menu for listing circuts, tracing, etc
 */
export default class RouteCableTree extends PinFeatureTreeView {
    static {
        this.prototype.messageGroup = 'CableTreeView';
    }

    // Constructor
    constructor(owner, options) {
        options.dragDrop = true; // ENH: Don't modify arg
        super(owner, options);

        this.configs = {
            ...myw.config['mywcom.cables'],
            ...myw.config['mywcom.conduits'],
            ...myw.config['mywcom.equipment']
        };

        this.defaultImage = 'modules/comms/images/features/default.svg';

        this.conduitManager = this.app.plugins.conduitManager;
        this.structManager = this.app.plugins.structureManager;
    }

    // --------------------------------------------------------------------------
    //                                  TREE BUILDING
    // --------------------------------------------------------------------------

    // Build tree for 'feature'
    async getTreesFor(route) {
        // Get contained objects
        const includeProposed = this.displayManager.showProposed;
        const routeContent = await this.structManager.routeContent(route, includeProposed);
        const cableTree = routeContent.cableTree();

        // Fetch and cache line of count information
        await this.locManager.getFeaturesLOCDetails(routeContent.segs, includeProposed);

        // Build tree (including node for route)
        const node = this.createNode(cableTree);
        return [node];
    }

    // Build tree for 'cableTreeNode' (recursive)
    createNode(cableTreeNode, parentNode = null) {
        // Case: Cable segment
        if (cableTreeNode.pins) {
            return this.createCableSegNode(cableTreeNode, parentNode);
        }

        // Case: Conduit
        const proposed = cableTreeNode.feature.isProposed();
        const node = this.newFeatureNode(cableTreeNode.feature, parentNode, {
            sortGroup: 2,
            isLink: true,
            isProposed: proposed
        });

        if (proposed) return node;

        // Use conduit run for highlight
        if (cableTreeNode.conduitRun) node.highlight = this.geomRepFor(cableTreeNode.conduitRun);

        if (!parentNode) node['li_attr'] = { class: 'jstree-root-node' }; // ENH: Do this in super

        // Add children
        if (cableTreeNode.children) {
            for (const childNode of cableTreeNode.children) {
                this.createNode(childNode, node);
            }
        }

        // Set tree state
        this.setDefaultState(node, true);

        return node;
    }

    // Add sub-tree for given cable segment
    createCableSegNode(segNode, parentNode) {
        const seg = segNode.feature;
        const cable = segNode.cable;
        const proposed = cable.isProposed();

        const link = proposed ? cable.getDelta() : cable.getUrn();
        const highlight = proposed ? null : this.geomRepFor(cable);

        // Add node for cable
        const node = this.newNode({
            id: seg.getUrn(),
            feature: seg,
            text: this.getNodeTextFor(cable),
            icon: this.getIconFor(cable),
            highlight: highlight,
            pins: segNode.pins,
            link: link,
            filterText: cable.getTitle(),
            sortGroup: 1
        });
        parentNode.children.push(node);

        if (proposed) return node;

        // Add node for each pin
        this.addPinNodes(
            segNode.feature,
            'cable',
            segNode.pins,
            [],
            node,
            segNode.cable,
            segNode.cable_side,
            segNode.circuits
        );

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

    // ------------------------------------------------------------------------------
    //                                CONTEXT MENU
    // ------------------------------------------------------------------------------

    /*
     * Retruns context menu for 'jsNode' (a Menu)
     * @param  {Object} node jsTree node the right click was initiated on
     */
    contextMenuFor(jsNode) {
        const node = jsNode.original;
        const menu = new Menu(this.messageGroup);
        const feature = node.feature;

        // hide context menu for proposed objects
        if (feature.isProposed()) return;

        // Segment actions
        if (node.pins) {
            menu.addItem('lazy', 'show_circuits', data => this._doShowCircuitsFor(data));

            menu.addItem('lazy', 'show_paths', data => this.doShowPathsForChildren(data));

            const featureType = feature && feature.getType();
            const editable = this.app.isFeatureEditable(featureType, feature);
            if (editable && this.locManager.isLocEditable(feature))
                menu.addItem('lazy', 'edit_status_loc', data => this.editStatusLoc(feature));
            menu.addItem('lazy', 'view_status_loc', data =>
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

        // Conduit options
        if (this.conduitManager.isContinuousConduitType(feature)) {
            menu.addItem('trace', 'show_conduit_path', data => {
                this.showConduitPath(data);
            });
        }

        // Reports
        const reportManager = this.app.plugins.reportManager;

        // Add pin information to feature ENH: Allow passing options to reports
        if (node.pin) feature.pins = new PinRange(node.side, node.pin);
        if (node.pins) feature.pins = node.pins;
        if (this.selectedNodes.length > 1) feature.pins = this.selectedPins();

        const reports = reportManager.reportsFor(feature);

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

    // --------------------------------------------------------------------------
    //                             DRAG & DROP
    // --------------------------------------------------------------------------

    // True if 'node' can be dragged
    isDraggable(node) {
        const feature = node.feature;
        const featureType = feature && feature.getType();

        // Case: design not in editable state
        if (!this.app.isFeatureEditable(featureType, feature)) return false;

        // Case: not a feature
        if (!feature) return false;

        // Case: feature is proposed
        if (feature.isProposed()) return false;

        // Case: is a pin node
        if (node.nodeType == 'pin') return false;
        return true;
    }

    /*
     * True if 'dropNode' is a suitable drop location for 'node'
     */
    isDropSiteFor(node, dropNode) {
        if (!node.feature || !dropNode.feature) return false;

        // Prevent null drag
        if (node.feature.properties.housing == dropNode.feature.getUrn()) return false;

        const housings = node.feature.properties.cable
            ? myw.config['mywcom.cables'][node.feature.properties.cable.split('/')[0]].housings
            : myw.config['mywcom.conduits'][node.feature.type].housings;

        return _.contains(housings, dropNode.feature.getType());
    }

    /*
     * Callback for drop of 'node' onto 'dropNode' (backstop: does nothing)
     *
     * 'dropNode' has already been validated as a drop site for 'node'
     */
    async dropOn(node, dropNode) {
        // Utilize manager (which may raise errors)
        await this.conduitManager.moveInto(node.feature, dropNode.feature);

        // If get to here, there was no error, ensure we modify the cached feature housing
        node.feature.properties.housing = dropNode.feature.getUrn();

        // Ensure moved item is still visible in tree
        this.openNode(dropNode);
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
}
