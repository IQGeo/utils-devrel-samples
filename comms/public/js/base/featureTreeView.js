// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';
import _ from 'underscore';
import 'jstree';
import Menu from './menu';
import * as DOMPurify from 'dompurify';

export default class FeatureTreeView extends myw.Control {
    /**
     * Control displaying a tree of feature objects (and their sub-properties)
     *
     * Supports highlighting, selection, context menu etc.
     *
     * Subclasses must implement:
     *    getTreesFor(feature)        Called during render
     *
     * They can also subclass:
     *    setTreeOptions()             Called during init
     *    setEventHandlers(feature)    Called after tree rebuild
     *    geomRepFor(feature,...)      Called during tree rebuild
     *    highlightsFor(node)          Called on hover
     *    contextMenuFor(node)         Called on right-click
     *    selectionChanged(start)      Called on left-click
     *    isDraggable(node)            Called on drag
     *    isDropSiteFor(node,dropNode) Called during drag
     *    dropOn(node,dropNode)        Called on drag release
     *
     * @constructs
     * @param  {object} owner  Owner of self
     * @param  {object}            options
     * @param  {string}            options.divId      DOM element to create tree in
     * @param  {boolean}           [options.selectMultiple=false]     If true, allow selection of multiple nodes
     * @param  {boolean}           [options.selectLeavesOnly=false]   If true, only allow selection leaf nodes only
     * @param  {boolean}           [options.dragDrop=false]   If true, enable drag and drop of tree elements
     * @param  {boolean}           [options.selectBranches=false]   If true, allows selection to include branches
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);
        this.setTreeOptions();

        // Holder for multiple selection
        this.selectedNodes = [];
        this.selectedNodeIds = [];

        // Div for tree
        this.container = $('<div>', { class: 'js-tree' });
        this.$el.append(this.container);

        // Class for 'busy' indication
        this.processingClass = 'feature-tree-processing';

        // highlights
        this._initHighlightLayer();

        // Managers, Datasource
        this.ds = this.app.getDatasource('myworld');

        // Filter string
        this.filterStr = '';

        // Set to false if invalid data is encountered during build of tree
        this.isValid = true;
    }

    /**
     * create temporary layer for housing highlight reps
     */
    _initHighlightLayer() {
        this.styleManager = new myw.StyleManager(this.app.map.getView());
        this.defaultLineStyle = { color: '#FF0000', weight: 6, opacity: 0.75 };
        this._highlightlayer = new myw.GeoJSONVectorLayer({
            map: this.app.map,
            zIndex: 199
        });
    }

    /*
     * Init this.treeOptions (a dict of jstree options)
     */
    setTreeOptions() {
        const self = this;

        this.treeOptions = {};

        this.treeOptions.plugins = ['wholerow', 'conditionalselect', 'sort', 'contextmenu'];

        this.treeOptions.core = {
            worker: false,
            themes: { dots: false },
            check_callback: this.checkOp.bind(this)
        };

        // Selection
        this.treeOptions.core.multiple = !!this.options.selectMultiple;

        this.treeOptions.conditionalselect = function (node, evt) {
            if (evt.ctrlKey) return false;

            if (self.options.selectLeavesOnly) {
                return this.is_leaf(node);
            } else {
                return true;
            }
        };

        // Element order
        this.treeOptions.sort = function (a, b) {
            const node1 = this.get_node(a);
            const node2 = this.get_node(b);
            return self.sortOrderFor(node1, node2);
        };

        // Drag drop
        if (this.options.dragDrop) {
            this.setDndTreeOptions();
        }

        // Context menu
        this.treeOptions.contextmenu = { select_node: false };
    }

    /*
     * Update this.treeOptions to enable drag & drop
     */
    setDndTreeOptions() {
        this.treeOptions.plugins.push('dnd');

        this.treeOptions.dnd = {
            // Enable hook for determining dragability
            is_draggable: nodes => {
                if (nodes.length != 1) return false;
                return this.isDraggable(nodes[0].original);
            },

            // Disable ctrl/meta key (node duplication)
            copy: false
        };
    }

    /**
     * True if 'operation' is permited (see check_callback in jsTree doc)
     */
    checkOp(operation, node, parent, position, more) {
        if (operation == 'create_node') return true;
        if (operation == 'move_node') return this.checkMoveNodeOp(node, parent, position, more);
        if (operation == 'delete_node') return true;
        return false;
    }

    // Display tree for 'feature'
    async renderFor(feature) {
        this.isValid = true;
        this.feature = feature;
        this.rootUrn = feature.getUrn();

        // Destroy any existing tree
        this.clearHighlights();
        if (this.container.jstree) this.container.jstree('destroy');

        // Add loading indicator
        if (!this.container.find('.js-tree-loading-label').length)
            this.container.append(
                $('<div>', { class: 'js-tree-loading-label', text: 'Loading...' })
            ); // ENH: use spinner

        // Display tree (preventing deep copy of data)
        const data = await this.getTreesFor(feature);
        this.treeOptions.core.data = function (node, cb) {
            return cb(data);
        };
        this.treeOptions.contextmenu.items = this.contextMenuItemsFor.bind(this);
        this.container.jstree(this.treeOptions);

        // Apply current filter (if any)
        this.filter();

        // Set behaviour
        this.setEventHandlers();
    }

    // Set root feature
    async refreshFor(feature) {
        if (this.jstree()) {
            this.jstree().settings.core.data = await this.getTreesFor(feature);
        }

        // Re-get because previous call can invalidate tree
        if (this.jstree()) {
            this.jstree().refresh();
        }

        // Reapply current filter
        this.filter();
    }

    // ------------------------------------------------------------------------------
    //                                 TREE BUILDING
    // ------------------------------------------------------------------------------

    /*
     * Tree nodes to display for 'feature' (must be overridden)
     */
    async getTreesFor(feature) {
        return [];
    }

    /*
     * Create tree node for 'feature'
     * @param  {Feature} feature
     * @param  {object}  parentNode
     * @param  {number}  sortGroup  Controls sort order within branch
     * @param  {bool}    isLink  If true, node behaves as a feature link
     * @param  {string}  nodeID  Used as node id if provided, otherwise feature URN used
     * @param  {string}  nodeType
     * @param  {string}  li_attr
     * @return {object}  Tree node
     */
    // ENH: Support custom opts
    newFeatureNode(feature, parentNode = null, opts = {}) {
        const nodeId = opts.nodeId || feature.getUrn();

        let proposed = opts.isProposed;
        const highlight = proposed ? null : this.geomRepFor(feature);

        // Create node
        const node = this.newNode({
            id: nodeId,
            text: this.getNodeTextFor(feature),
            icon: this.getIconFor(feature),
            feature: feature,
            highlight: highlight,
            filterText: feature.getTitle().toLowerCase(),
            filterChildren: true,
            nodeType: opts.nodeType,
            link: opts.isLink,

            sortGroup: opts.sortGroup,
            isRoot: !parentNode,
            sortValue: opts.sortValue
        });

        if (opts.isLink) node.link = proposed ? feature.getDelta() : feature.getUrn();
        if (opts.li_attr) node.li_attr = { class: opts.li_attr }; // ENH: Replace by style attribute

        node.state.selected = this._isCurrentFeature(feature);
        node.proposed = proposed;

        // Add to parent
        if (parentNode) parentNode.children.push(node);

        return node;
    }

    /*
     * Create tree node from dict 'props'
     *
     * Special keys are:
     *   id, text, icon, li_attr (see https://www.jstree.com/docs/json/)
     *   feature, highlight, highlight2, link, sortGroup, sortValue (see below)
     */
    newNode(props) {
        const node = { ...props };
        node.text = DOMPurify.sanitize(node.text);
        node.children = [];

        if (!node.icon) {
            node.li_attr = { class: 'jstree-root-node' }; // ENH: Rename this style jstree-no-icon
        }

        node.state = {};
        if (node.id) {
            node.state.opened = this.getStateFor(node.id);
        }

        return node;
    }

    /*
     * Expand tree node 'jsNode' (if necessary)
     */
    // ENH: Expand parents too
    openNode(jsNode) {
        this.jstree().open_node(jsNode);
    }

    /*
     * True if 'feature' is the app's current feature
     */
    _isCurrentFeature(feature) {
        return this.app.currentFeature && feature.getUrn() === this.app.currentFeature.getUrn();
    }

    /*
     * Set default state for 'node'
     * @param  {string}   node
     * @param {boolean}   open
     */
    setDefaultState(node, open) {
        const state = this.getSavedState(this.rootUrn);
        if (!state) node.state.opened = open;
    }

    /*
     * True if node 'nodeId' should be displayed open
     * @param  {string}   nodeId
     * @return {boolean}
     */
    getStateFor(nodeId) {
        const state = this.getSavedState(this.rootUrn);
        return state && state.open.includes(nodeId);
    }

    /*
     * Gets open state for feature 'urn'
     */
    getSavedState(urn) {
        if (!this.owner.saved_state) return;
        return this.owner.saved_state[urn];
    }

    /*
     * Redraw tree
     */
    redraw(full = false) {
        if (this.container.jstree) this.jstree().redraw(full);
    }

    // The current jsTree instance (if there is one)
    jstree() {
        return this.container.jstree(true); // 'true' to get existing instance
    }

    // ------------------------------------------------------------------------------
    //                                 INTERACTION
    // ------------------------------------------------------------------------------

    /*
     * Set event handlers after change to this.feature
     */
    setEventHandlers() {
        // On hover, highlight current node on map
        this.container.on('hover_node.jstree', (evt, data) => {
            const geoms = this.highlightsFor(data.node);
            this.setHighlights(geoms);
        });

        // Restore default highlight on dehover
        this.container.on('dehover_node.jstree', (evt, data) => {
            this.clearHighlights();
        });

        // On click, set current feature (if a 'link' node)
        this.container.on('select_node.jstree', (evt, data) => {
            const features = data.node.original.linkedFeatures;
            if (features) return this.app.setCurrentFeatureSet(features);

            const featureUrn = data.node.original.link;
            if (featureUrn) {
                this.followLink(featureUrn);
            }
        });

        // On select nodes, call changedSelection()
        this.container.on('changed.jstree', (evt, data) => {
            this.handleSelectionChange(data);
        });

        // On drag, call drop hook
        this.container.on('move_node.jstree', async (evt, data) => {
            const node = data.node.original;
            const jsDropNode = this.jstree().get_node(data.parent);
            const dropNode = jsDropNode.original;
            if (!this.isDropSiteFor(node, dropNode)) return;

            try {
                this.addProcessingIndicator(jsDropNode);
                await this.dropOn(node, dropNode);
                this.removeProcessingIndicator(jsDropNode);
            } catch (err) {
                this.removeProcessingIndicator(jsDropNode);
                this.refreshFor(this.feature);
                this.showError('drop_failed', err);
            }
        });

        // On open/close tree, remember tree state
        this.container.on('open_node.jstree close_node.jstree', (evt, data) => {
            this.saveState(data);
        });
    }

    async followLink(featureUrn) {
        const feature = await this.app.database.getFeatureByUrn(featureUrn);
        if (feature && !this._isCurrentFeature(feature)) {
            this.app.setCurrentFeature(feature);
        }
    }

    // ------------------------------------------------------------------------------
    //                                FILTERING
    // ------------------------------------------------------------------------------

    /**
     * Limit to nodes that match 'str'
     */
    setFilter(str) {
        this.filterStr = str.toLowerCase();
        this.filter();
    }

    /**
     * Set visibility of self's trees
     */
    filter() {
        const jsTree = this.jstree();
        if (!jsTree) return;

        for (const jsNode of jsTree.get_json()) {
            this.filterTree(jsNode);
        }
    }

    /**
     * Set visibility of 'jsNode' and its children (recursive)
     */
    filterTree(jsNode, parentVisible = false) {
        const jstree = this.jstree();
        const node = jstree.get_node(jsNode.id).original;

        myw.trace(
            'TreeView',
            3,
            'Filtering',
            node.id,
            node.filterText,
            node.filterChildren,
            parentVisible
        );

        // If parent visible .. then show the whole subtree
        let visible = this.filterNode(node, parentVisible);

        // Check and update all children
        if (node.filterChildren) {
            let anyChildVisible = false;
            for (const childJsNode of jsNode.children) {
                const childVisible = this.filterTree(childJsNode, visible);
                anyChildVisible ||= childVisible;
            }
            visible ||= anyChildVisible;
        }

        // Update this node
        this.showNode(jsNode, visible);
        myw.trace('TreeView', 3, 'Filtered', node.id, visible);

        return visible;
    }

    /**
     * True if 'node' is included in current filter
     */
    filterNode(node, parentVisible) {
        // Case: Parent matched filter (so subtree is visible)
        if (parentVisible || !this.filterStr.length) return true;

        // Case: Filterable node
        if (node.filterText) {
            return node.filterText.toLowerCase().includes(this.filterStr);
        }

        // Case: Intermediate node (only visible if child is)
        return false;
    }

    /**
     * Show or hide 'jsNode'
     */
    showNode(jsNode, show) {
        const jsTree = this.jstree();

        if (show) {
            jsTree.show_node(jsNode);
        } else {
            jsTree.hide_node(jsNode);
        }
    }

    // ------------------------------------------------------------------------------
    //                                SELECTION MANAGEMENT
    // ------------------------------------------------------------------------------

    /**
     * Extend selection to cover the 'n' nodes (if we can)
     * Returns true if enough nodes
     */
    setSelectionLength(n) {
        if (n > this.selectedNodes.length)
            return this.selectNextNNodes(n - this.selectedNodes.length);
        if (n < this.selectedNodes.length)
            return this.deselectLastNNodes(this.selectedNodes.length - n);
        return true;
    }

    /**
     * Extend selection to cover the next 'n' nodes
     */
    selectNextNNodes(n) {
        let successfullyExtended = true;

        for (let i = 0; i < n; i++) {
            const lastSelectedNodeId = this.selectedNodeIds[this.selectedNodeIds.length - 1];

            //Find its index amongst its siblings
            const nextNode = this.container.jstree('get_next_dom', lastSelectedNodeId, true);
            this.container.jstree('select_node', nextNode, true);

            if (nextNode[0]) {
                this.selectedNodeIds.push(nextNode[0].id);
                this.selectedNodes = this.selectedNodeIds.map(
                    nodeId => this.container.jstree('get_node', nodeId).original
                );
            } else {
                successfullyExtended = false;
            }
        }

        return successfullyExtended;
    }

    /**
     * Reduce selection by 'n' nodes
     */
    deselectLastNNodes(n) {
        for (let i = 0; i < n; i++) {
            const lastSelectedNodeId = this.selectedNodeIds[this.selectedNodeIds.length - 1];

            //Find its index amongst its siblings
            const lastSelectedNode = this.container.jstree('get_node', lastSelectedNodeId);
            this.container.jstree('deselect_node', lastSelectedNode, true);
            this.selectedNodeIds.pop();
            this.selectedNodes.pop();
        }

        return true;
    }

    /**
     * Called when selected nodes changed
     */
    handleSelectionChange(data) {
        const jstree = data.instance;
        let startSelection = false;
        let selectedNodeIds = [];

        if (this._isSelectable(data)) {
            startSelection = this.selectedNodeIds.length === 0;
            selectedNodeIds = jstree.get_selected();

            if (selectedNodeIds) {
                if (selectedNodeIds.length > 1) {
                    // jstree returns selection in order it was made, resulting in selectedNodeIds sometimes
                    // being in an odd order if a user has been shift-clicking from higher to lower nodes or adding
                    // to the selection
                    const parentNode = jstree.get_node(data.node.parent);
                    const children = parentNode.children;

                    selectedNodeIds = _.sortBy(selectedNodeIds, nodeId => {
                        return children.indexOf(nodeId);
                    });
                }
            }
        }

        this.selectedNodeIds = selectedNodeIds;

        this.selectedNodes = this.selectedNodeIds.map(nodeId => jstree.get_node(nodeId).original);

        this.selectionChanged(startSelection);
    }

    /**
     * True if jstree nodef for 'data' is selectable
     */
    _isSelectable(data) {
        const jstree = data.instance;
        const node = data.node;

        // Check for nothing selected
        if (!node) return false;

        // Check for has children
        if (this.options.selectBranches) return true;
        if (jstree.is_leaf(node)) return true;

        // Check for has dummy child
        if (node.children.length != 1) return false;
        const childNode = jstree.get_node(node.children[0]);
        if (childNode.original == '<lazy_evaluated>') return true;

        return false;
    }

    // Hook for subclasses
    // ENH: Replace by event
    selectionChanged(startSelection) {}

    // ------------------------------------------------------------------------------
    //                                  DRAG & DROP
    // ------------------------------------------------------------------------------

    /*
     * True if 'jsNode' is a valid dropsite
     */
    checkMoveNodeOp(jsNode, parent, position, more) {
        // Prevent dropping in between node
        if (more.dnd && more.pos != 'i') return false;

        // Find nodes
        const dragNode = jsNode && jsNode.original;
        let dropNode = more.dnd && more.ref && more.ref.original;

        // more.dnd is set when the plugin is checking if the node can be moved to a position
        if (!dropNode && more.core) dropNode = parent && parent.original;
        if (!dragNode || !dropNode) return false;

        // Call hook
        return this.isDropSiteFor(dragNode, dropNode);
    }

    /*
     * True if 'node' can be dragged (backstop: true)
     */
    isDraggable(node) {
        return true;
    }

    /*
     * True if 'dropNode' is a suitable drop location for 'node' (backstop: false)
     */
    isDropSiteFor(node, dropNode) {
        return false;
    }

    /*
     * Callback for drop of 'node' onto 'dropNode' (backstop: does nothing)
     */
    async dropOn(node, dropNode) {}

    // ------------------------------------------------------------------------------
    //                                HIGHLIGHT
    // ------------------------------------------------------------------------------

    /*
     * Build a geometry representation for use in highlight
     */
    geomRepFor(feature, geom = undefined, id = undefined, color = undefined, style = undefined) {
        return {
            id: id || feature.getUrn(),
            feature: feature,
            geom: geom || feature.geometry,
            color: color || '#FF0000',
            style: style
        };
    }

    /*
     * Geometries to highlight on map when hovering over 'node'
     * Backstop implementation: Use node.highlight (if set)
     */
    highlightsFor(node) {
        const res = [];
        if (node.original.highlight) res.push(node.original.highlight);
        if (node.original.highlight2) res.push(node.original.highlight2);
        return res;
    }

    /**
     * Highlight 'geomReps' on map
     */
    setHighlights(geomReps) {
        this.clearHighlights();
        for (const geomRep of geomReps) {
            const style = this.getStyleFor(geomRep);
            if (geomRep.geom.type === 'LineString') {
                this._highlightlayer.addLine(geomRep.geom.coordinates, style);
            } else {
                this._highlightlayer.addPoint(geomRep.geom.coordinates, style);
            }
        }
    }

    /**
     * Get style object for higlight features
     */
    getStyleFor(geomRep) {
        let style;

        if (geomRep.geom.type == 'LineString') {
            const geomRepStyle = geomRep.style || this.defaultLineStyle;

            style = new myw.LineStyle({
                // ENH: Pass in style objects
                color: geomRepStyle.color,
                width: geomRepStyle.weight,
                opacity: geomRepStyle.opacity || 1
            });

            if (geomRepStyle.arrows) style.lineStyle = 'arrowed';
        } else {
            // use normal highlight style for points
            const styles = myw.StyleManager.getDefaultStyles('Point');
            style = styles.normal;
        }
        return style;
    }

    // Clear all highlights
    clearHighlights() {
        this._highlightlayer.clear();
    }

    // ------------------------------------------------------------------------------
    //                                 CONTEXT MENU
    // ------------------------------------------------------------------------------

    // Context menu items to display for 'node'
    contextMenuItemsFor(node) {
        return this.contextMenuFor(node)?.jsTreeItems();
    }

    // Context menu to display for 'node' (a Menu)
    contextMenuFor(node) {
        return new Menu(this.messageGroup);
    }

    // ------------------------------------------------------------------------------
    //                                     OTHER
    // ------------------------------------------------------------------------------

    // Hook for subclasses
    getIconFor() {
        return '';
    }

    /*
     * Returns number indicating node order (negative means 'node1 before node2')
     */
    sortOrderFor(node1, node2) {
        node1 = node1.original;
        node2 = node2.original;

        if (node1.sortGroup != node2.sortGroup) return node1.sortGroup - node2.sortGroup;

        if (this.localeCompareSupportsOptions()) {
            const strA = node1.sortValue || node1.text;
            const strB = node2.sortValue || node2.text;
            return strA.localeCompare(strB, undefined, { numeric: true, sensitivity: 'base' });
        }
    }

    /*
     * True if the browser supports options in localeCompare
     * @return {boolean}
     */
    localeCompareSupportsOptions() {
        try {
            'foo'.localeCompare('bar', 'i');
        } catch (e) {
            return e.name === 'RangeError';
        }
        return false;
    }

    /*
     * Saves self's state in owner.saved_state
     * @param {object} nodeData Used to get the tree model
     */
    // TODO: Just return the state
    saveState(nodeData) {
        if (!this.owner.saved_state) return;

        let model = nodeData.instance._model.data;
        let state = { open: [] };
        for (let i in model) {
            if (i in model) {
                if (i !== $.jstree.root) {
                    if (model[i].state.opened) {
                        state.open.push(i);
                    }
                }
            }
        }
        this.owner.saved_state[this.rootUrn] = state;
    }

    /*
     * Returns the data node on which action was invoked
     */
    getNodeFor(data) {
        return this.getJsNodeFor(data).original;
    }

    /*
     * Returns the JS Tree node on which action was invoked
     */
    getJsNodeFor(data) {
        const inst = $.jstree.reference(data.reference);
        return inst.get_node(data.reference);
    }

    /*
     * Helper to add an icon to the right of a node's text
     */
    addRightIcon(node, iconName) {
        const icon = $('<i>', {
            class: 'jstree-icon jstree-icon-right',
            style: `background-image: url("${iconName}");`
        });

        node.text += icon[0].outerHTML;
    }

    /*
      Add busy indicator to node
    */
    addProcessingIndicator(node) {
        const busyDiv = $('<div>', { class: this.processingClass });

        const tree = this.jstree();

        // Use API to get Jquery DOM element for the node
        const domNode$ = tree.get_node(node.id, true);

        if (!domNode$) return; // Not in the tree

        // Add directly to tree DOM to avoid refresh
        $(domNode$.children('a')[0]).append(busyDiv);
    }

    /*
      Removes busy indicator from node
    */
    removeProcessingIndicator(node) {
        const tree = this.jstree();

        // Use API to get Jquery DOM element for the node
        const domNode$ = tree.get_node(node.id, true);

        if (!domNode$) return; // Not in the tree

        $(domNode$.children('a')[0])
            .find('.' + this.processingClass)
            .remove();
    }

    /**
     * Display an error message for exception 'cond'
     */
    showError(msgId, cond, msgGroup = undefined) {
        msgGroup = msgGroup || this.messageGroup;
        const title = myw.msg(msgGroup, msgId);
        const details = myw.msg(msgGroup, cond.message); // ENH: Include params?
        this.showMessage(title, details);
        throw cond; // To get traceback // ENH: Only if internal error
    }

    /*
      Show message in modal dialog
    */
    showMessage(title, message) {
        myw.dialog({
            destroyOnClose: true,
            title: title,
            contents: message
        });
    }

    /**
     * Label to show for 'feature'
     * @param {MywFeature} feature
     */
    getNodeTextFor(feature) {
        return feature.getTitle();
    }

    // ------------------------------------------------------------------------------
    //                                     PROPOSED OBJECTS
    // ------------------------------------------------------------------------------

    /**
     * determine if a node's connection is proposed
     * @param {*} node
     */
    _connProposed(node) {
        if (!node.conn) return false;

        const conn = node.conn;

        if (conn && conn.delta) {
            if (conn.delta != this.ds.getDelta()) return true;
        } else {
            return false;
        }
    }

    /**
     * shows delta feature details when clicking on proposed object
     * @param {*} evt
     */
    async _showDelta(evt) {
        const deltaUrn = $(evt.target).attr('mywcom-delta');
        if (deltaUrn) {
            try {
                await this.followLink(deltaUrn);
            } catch (e) {
                if (e.name == 'ObjectNotFoundError') {
                    this.app.message(this.app.msg('missing_object_error'));
                }
            }
        }
    }

    updateValid(check, object) {
        if (!check) {
            this.isValid = false;
            myw.trace('comms_tree_view', 5, 'Invalid data in', this.constructor.name);
        }
    }
}
