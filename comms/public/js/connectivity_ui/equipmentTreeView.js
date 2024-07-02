// Copyright: IQGeo 2010-2023
import _ from 'underscore';
import myw from 'myWorld-client';
import PinRange from '../api/pinRange';
import PinFeatureTreeView from './pinFeatureTreeView';
import Menu from '../base/menu';
import PortConnectionDialog from './portConnectionDialog';

/**
 * Tree view showing equipment within a structure
 *
 * Provides context menu for adding equipment, connecting ports, tracing, etc
 */
/*eslint-disable no-await-in-loop*/
export default class EquipmentTreeView extends PinFeatureTreeView {
    static {
        this.prototype.messageGroup = 'EquipmentTreeView';
    }

    // ------------------------------------------------------------------------------
    //                                 CONSTRUCTION
    // ------------------------------------------------------------------------------

    // Constructor
    constructor(owner, options) {
        options.selectMultiple = true;
        options.dragDrop = true;
        super(owner, options);

        this.app = this.owner.app;
        this.ds = this.app.getDatasource('myworld');
        this.equipConfigs = myw.config['mywcom.equipment'] || {};
        this.cableConfigs = myw.config['mywcom.cables'] || {};

        this.equipmentManager = this.app.plugins.equipmentManager;
        this.structManager = this.app.plugins.structureManager;
        this.cableManager = this.app.plugins.cableManager;
        this.reportManager = this.app.plugins.reportManager;

        // Build list of equipment types that can appear in palette
        this.paletteEquipConfigs = _.pick(this.equipConfigs, config => config.palette) || {};

        this.spliceImage = 'modules/comms/images/features/splice.svg';
        this.defaultEquipmentImage = 'modules/comms/images/features/default.svg';
        this.app.on('cut-cable', event => {
            this.handleCutCable(event);
        });
    }

    /*
     * On Cut Cable, refresh the render
     */
    handleCutCable(event) {
        this.refreshFor(this.feature);
    }

    /*
     * Set event handlers
     */
    setEventHandlers() {
        super.setEventHandlers();

        // Update tree when fibers connected / disconnected
        this.stopListening(this.connectionManager);
        this.listenTo(this.connectionManager, 'connected disconnected', options => {
            this.handleConnectionChange(options);
        });

        // Update tree when equipment containment changed
        this.stopListening(this.cableManager);
        this.listenTo(this.cableManager, 'segment_containment', options => {
            this.refreshFor(this.struct);
        });

        // On hover, highlight all contained equipment
        this.container.on('hover_node.jstree', (evt, data) => {
            if (data.node.original) {
                this.highlightContainedEquips(data.node.original, true);
            }
        });

        // On de-hover, remove highlights
        this.container.on('dehover_node.jstree', (evt, data) => {
            if (data.node.original) {
                this.highlightContainedEquips(data.node.original, false);
            }
        });
    }

    /*
     * Display tree for 'feature'
     *
     * Subclassed to Scroll to the added node when adding object from context menu
     */
    async renderFor(feature) {
        await super.renderFor(feature);

        if (this.addNodeMode) {
            const selectedOffset = this.$el.find('.jstree-clicked').offset();
            const top = selectedOffset ? selectedOffset.top : 0;

            const parentContainer = this.$el.closest('#feature-details');
            parentContainer.scrollTop(top - parentContainer.outerHeight() / 2);
            this.addNodeMode = false;
        }
    }

    /*
     * Called when pins are connected or disconnected
     */
    handleConnectionChange(options) {
        this.refreshFor(this.feature);
    }

    /**
     * Highlight or unhighlight all equipment in subtree of 'node'
     */
    // ENH: Move to pinTreeView?
    highlightContainedEquips(node, highlight) {
        if (node.equips) {
            for (const equipNode of node.equips) {
                if (!equipNode) continue; // ENH: Find what causes this and remove workaround
                if (highlight) {
                    this.app.fire('comms-highlight-feature', { feature: equipNode.feature });
                } else {
                    this.app.fire('comms-unhighlight-feature', { feature: equipNode.feature });
                }
                this.highlightContainedEquips(equipNode, highlight);
            }
        }
    }

    // ------------------------------------------------------------------------------
    //                                   DRAG & DROP
    // ------------------------------------------------------------------------------

    /*
     * True if 'node' can be dragged to a new housing
     */
    isDraggable(node) {
        const feature = node.feature;
        const featureType = feature && feature.getType();

        // Case: Design not in editable state
        if (!this.app.isFeatureEditable(featureType, feature)) return false;

        // Case: feature is proposed
        if (feature && feature.isProposed()) return false;

        // Case: splice is proposed
        if (node.nodeType == 'splice') {
            if (node.conns.delta) return false;
            else return true;
        }
        // Case: no Feature
        if (!feature) return false;

        // Case: is a pin feature
        if (node.nodeType == 'pin') return false;
        return _.has(this.equipConfigs, featureType);
    }

    /*
     * True if 'dropNode' is a suitable drop location for 'node'
     */
    isDropSiteFor(node, dropNode) {
        const feature = node.feature;
        const dropFeature = dropNode.feature;

        // Prevent modify proposed objects
        if (dropFeature.isProposed()) return false;

        // Splice nodes don't have a feature
        if (node.nodeType == 'splice') {
            if (
                dropFeature &&
                (dropFeature.featureDD.fields.fiber_splices ||
                    dropFeature.featureDD.fields.copper_splices)
            )
                return true;
        }

        if (!feature || !dropFeature) return false;

        // Don't allow move to own housing
        if (feature.properties.housing == dropFeature.getUrn()) {
            return false;
        }

        // Allow drop if node is a suitable housing
        return _.includes(this.equipConfigs[feature.type].housings, dropFeature.type);
    }

    /*
     * Callback for drop of 'node' onto 'dropNode'
     */
    async dropOn(node, dropNode) {
        const feature = node.feature;

        if (node.nodeType === 'splice') {
            let rootHousingUrn;
            const housingUrn = dropNode.feature.getUrn();
            if (dropNode.feature.properties.root_housing) {
                rootHousingUrn = dropNode.feature.properties.root_housing;
            } else {
                rootHousingUrn = housingUrn;
            }
            await this._updateConnsFor(node, housingUrn, rootHousingUrn);
        } else {
            const toHousing = dropNode.feature;

            // Re-parent the feature
            await this.equipmentManager.moveAssembly(feature, toHousing);
        }

        // Ensure moved item is still visible in tree
        this.openNode(dropNode);
    }

    /**
     *
     * @param {object} spliceNode
     * @param {MywFeature} newHousing
     */
    async _updateConnsFor(spliceNode, housingUrn, rootHousingUrn) {
        const connUrns = [];
        const conns = spliceNode.conns.conns;

        conns.forEach(cn => {
            connUrns.push(cn.urn);
        });

        return this.connectionManager.moveConns(connUrns, housingUrn, rootHousingUrn);
    }

    // ------------------------------------------------------------------------------
    //                             TREE BUILDING
    // ------------------------------------------------------------------------------

    /*
     * Build equipment tree
     */
    async getTreesFor(feature) {
        this.struct = await this.getRootHousing(feature);
        this.rootUrn = this.struct.getUrn(); // Key for saved state

        // Get full set of data for tree
        const includeProposed = this.displayManager.showProposed;
        this.structContent = await this.structManager.structContent(this.struct, includeProposed);
        this.equipTree = this.structContent.equipTree();

        // Fetch and cache line of count information for segments and equipment
        // ENH: Include this with contents call?
        await this.locManager.getFeaturesLOCDetails(this.structContent.segs, includeProposed);
        await this.locManager.getFeaturesLOCDetails(this.structContent.equips, includeProposed);

        // Create tree nodes, walking down tree
        const tree = this.createEquipNode('struct', this.equipTree);

        return [tree];
    }

    /*
     * Create node for equipTree and its children
     */
    createEquipNode(nodeType, equipTree, parentNode = null) {
        const feature = equipTree.feature;

        // Check for not required
        if (!this._includeFeature(feature)) return;

        // Create node
        const proposed = feature.isProposed();
        const node = this.newFeatureNode(feature, parentNode, {
            isLink: true,
            isProposed: proposed
        });
        node.nodeType = nodeType;
        if (!parentNode) node['li_attr'] = { class: 'jstree-root-node' };

        if (proposed) return node;

        // Get circuits
        const inCircuits = [];
        const outCircuits = [];
        equipTree.circuits.forEach(circuit => {
            if (circuit.pins.side == 'in') inCircuits.push(circuit);
            if (circuit.pins.side == 'out') outCircuits.push(circuit);
        });

        // Add nodes for ports
        const pinTree = equipTree.pins;
        if (pinTree.in_pins) this.addPortNodes(feature, 'in', pinTree.in_pins, node, inCircuits);
        if (pinTree.out_pins)
            this.addPortNodes(feature, 'out', pinTree.out_pins, node, outCircuits);
        if (pinTree.splices)
            this.addSpliceNodes(feature, pinTree.splices, equipTree.splice_circuits, node);

        // Add nodes for contained equipment
        const childTrees = equipTree.children;
        node.equips = [];
        for (const childPinTree of childTrees) {
            node.equips.push(this.createEquipNode('equip', childPinTree, node));
        }

        // Add explicitly contained cables
        // ENH: Show which segment ends and contained (handling slacks etc)
        if (nodeType == 'equip') {
            for (const cableUrn of equipTree.cables('explicit')) {
                const cable = this.structContent.features[cableUrn];

                const cableNode = this.newFeatureNode(cable, node, {
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

    /**
     * Add splice nodes
     */
    addSpliceNodes(feature, conns, circuits, parentNode) {
        const splices = this.groupSpliceConns(conns);

        for (const splice of splices) {
            this.addSpliceNode(feature, splice, circuits, parentNode);
        }

        this.setDefaultState(parentNode, true);

        return parentNode;
    }

    /**
     * Group 'conns' by from and to segment
     *
     * Returns a list of 'splice' objects with properties:
     *   id
     *   from_cable
     *   to_cable
     *   conns
     */
    // ENH: Implement a splice object
    groupSpliceConns(conns) {
        const splices = {};

        conns.forEach(conn => {
            // Build splice ID (grouping proposed obejcts by delta they come from)

            if (!conn.to_feature || !conn.from_feature) {
                this.updateValid(false, conn);
                return;
            }

            let id = [
                conn.conn_rec.properties.housing,
                conn.from_feature.getUrn(),
                conn.to_feature.getUrn(),
                conn.delta
            ].join('_');

            // Create splice object (if necessary)
            let splice = splices[id];
            if (!splice)
                splice = splices[id] = {
                    id: id,
                    from_cable: conn.from_cable,
                    to_cable: conn.to_cable,
                    conns: [],
                    delta: conn.delta,
                    deltaTitle: conn.deltaTitle,
                    proposed: conn.delta && conn.delta != this.ds.getDelta()
                };

            // Add connection to it
            splice.conns.push(conn);
        });

        return Object.values(splices);
    }

    /**
     * Create a node for splice connections 'splice' (which all run between the same two sgements)
     */
    addSpliceNode(feature, splice, circuits, parentNode) {
        // Build label
        const text = this.displayManager.spliceLabel(splice);
        const link = splice.proposed ? splice.delta : undefined;

        // Create splice node
        const spliceNode = this.newNode({
            id: splice.id,
            text: text,
            icon: this.spliceImage,
            nodeType: 'splice',
            conns: splice, // ENH: Should be splice.conns?
            link: link,
            proposed: splice.proposed,
            filterText: text
        });

        // Add pins
        for (const conn of splice.conns) {
            this.addPinNodes(
                conn.from_feature,
                'splice',
                conn.from_pins,
                [conn],
                spliceNode,
                conn.from_cable,
                null,
                circuits
            );
        }

        parentNode.children.push(spliceNode);

        return spliceNode;
    }

    getIconFor(feature) {
        const featureType = feature.getType();

        const equipConfig = this.equipConfigs[featureType] || {};
        const cableConfig = this.cableConfigs[featureType] || {};

        return equipConfig.image || cableConfig.image || this.defaultEquipmentImage;
    }

    // ------------------------------------------------------------------------------
    //                                CONTEXT MENU
    // ------------------------------------------------------------------------------

    /*
     * Returns context menu to display for 'jsNode' (a Menu)
     * @param  {Object} node jsTree node the right click was initiated on
     */
    contextMenuFor(jsNode) {
        const node = jsNode.original;
        const nodeType = node.nodeType;
        const feature = node.feature;
        const feature_type = feature && feature.getType();
        const editable = this.app.isFeatureEditable(feature_type, feature);
        const singleSelect = this.selectedNodes.length <= 1;
        const splice = node.pinType === 'splice';

        // proposed object nodes should be read only
        const nodeFeatureProposed = feature ? feature.isProposed() : false;
        if (nodeFeatureProposed) return;

        const menu = new Menu(this.messageGroup);

        // Add equipment and internal cables
        if (singleSelect && ['struct', 'equip'].includes(nodeType)) {
            const addEquipMenu = this.addEquipMenuFor(node.feature, editable);

            if (addEquipMenu.nItems() > 0) {
                menu.addSubMenu('edit', 'add', addEquipMenu, editable);
            }

            // add internal cables
            if (nodeType == 'struct') {
                this._addCableMenuFor(node.feature, addEquipMenu, editable);
            }
        }

        // Cable connection
        if (
            feature &&
            (feature.featureDD.fields.fiber_splices || feature.featureDD.fields.copper_splices)
        ) {
            menu.addItem(
                'conn',
                'connect_cables',
                data => this.showCableConnectionDialog(data),
                editable
            );
        }

        // Copy and cut
        if (singleSelect && nodeType == 'equip') {
            menu.addItem('clipboard', 'cut_assembly', data => this.cutAssembly(data), editable);
            menu.addItem('clipboard', 'copy_assembly', data => this.copyAssembly(data), editable);
        }

        // Paste
        const c = this.equipmentManager.assemblyClipboard;
        const pasteFeature = c && c.feature;
        const canPaste =
            feature && pasteFeature && this._canHouseEquip(feature, pasteFeature.getType());

        if (
            singleSelect &&
            canPaste &&
            (!c.cut || feature.getUrn() != pasteFeature.properties.housing)
        ) {
            // Cut cannot be pasted back to its same housing, but copies can
            let label;
            if (c.cut) {
                label = this.msg('paste_cut_assembly', { title: pasteFeature.getTitle() });
            } else {
                label = this.msg('paste_copy_assembly', { title: pasteFeature.getTitle() });
            }

            menu.addItem(
                'clipboard',
                'paste_assembly',
                data => this.pasteAssembly(data, pasteFeature, c.cut),
                editable,
                label
            );
        }

        // Side actions
        if (node.pins) {
            if (editable && this.locManager.isLocEditable(feature, node.pins.side))
                menu.addItem('loc', 'edit_status_loc', data =>
                    this.editStatusLoc(feature, node.pins.side)
                );

            menu.addItem('loc', 'view_status_loc', data =>
                this.viewStatusLoc(feature, jsNode.text, node.pins.side)
            );

            menu.addItem('lazy', 'show_circuits', data => this._doShowCircuitsFor(data), true);

            menu.addItem('lazy', 'show_paths', data => this.doShowPathsForChildren(data));
        }

        // Splice Nodes
        if (nodeType == 'splice') {
            menu.addItem('lazy', 'show_circuits', data => this._showCircuitsForSplice(data));
            menu.addItem('lazy', 'show_paths', data => this.doShowPathsSplice(data));
        }

        // Pin actions
        if (node.pin) {
            // disable context menu for proposed splice + its pins
            if (splice && node.proposed) return;

            menu.addItem('lazy', 'show_circuits', data => this._doShowCircuitsFor(data));

            // Tracing
            menu.addItem('lazy', 'show_paths', data => this.doShowPaths(data));

            menu.addItem('trace', 'trace_upstream', data => this.doTrace(data, 'upstream'));

            menu.addItem('trace', 'trace_downstream', data => this.doTrace(data, 'downstream'));

            menu.addItem('trace', 'trace_both', data => this.doTrace(data, 'both'));

            const distanceTraces = [
                { tech: 'fiber', id: 'otdr_upstream', distType: 'otdr', direction: 'upstream' },
                { tech: 'fiber', id: 'otdr_downstream', distType: 'otdr', direction: 'downstream' },
                { tech: 'copper', id: 'ewl_upstream', distType: 'ewl', direction: 'upstream' },
                { tech: 'copper', id: 'ewl_downstream', distType: 'ewl', direction: 'downstream' }
            ];

            const items = distanceTraces.filter(item => item.tech === this._techFor(node));
            items.forEach(item => {
                menu.addItem(
                    item.distType,
                    item.id,
                    data => this.openDistanceTraceDialog(data, item.direction, item.tech),
                    singleSelect
                );
            });

            // Connect / disconnect
            // enable gazumping of proposed connections
            const connProposed = this._connProposed(node);
            if (node.conn && !connProposed) {
                menu.addItem(
                    'conn',
                    'disconnect',
                    data => this.disconnect(data),
                    editable && (singleSelect || !!this.selectedPins(true))
                );
            } else {
                menu.addItem(
                    'conn',
                    'connect',
                    data => this.showPortConnectionDialog(data),
                    editable && (singleSelect || !!this.selectedPins(false))
                );
            }
        }

        // Reports
        if (singleSelect && ['struct', 'equip'].includes(nodeType)) {
            const reportManager = this.app.plugins.reportManager;
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
        }

        return menu;
    }

    /*
     * Creates an context menu with a list of equipments to can add to 'feature'
     * @param  {myw.Feature}  feature
     * @param  {boolean}      true if item should be enabled
     */
    addEquipMenuFor(feature, editable) {
        const menu = new Menu(this.messageGroup);
        let menus = {};

        // Figure out all sub menus for equipment
        Object.keys(this.paletteEquipConfigs).forEach(equip_type => {
            if (this._canHouseEquip(feature, equip_type)) {
                const itemDD = this.ds.featuresDD[equip_type];
                const label = itemDD.external_name || equip_type;
                const tech = this.paletteEquipConfigs[equip_type].tech;

                if (!(tech in menus)) {
                    menus[tech] = [];
                }
                menus[tech].push({
                    equip_type: equip_type,
                    label: label
                });
            }
        });
        if (
            (Object.keys(menus).length == 2 && 'mixed' in menus) ||
            Object.keys(menus).length == 1
        ) {
            // if the only menus are mixed and a single tech, don't do the sub menus
            Object.keys(menus).forEach(techMenu => {
                for (const item of menus[techMenu]) {
                    menu.addItem(
                        'equip',
                        item.equip_type,
                        data => this.addFeature(item.equip_type, feature),
                        editable,
                        item.label
                    );
                }
            });
            menu.sortItems();
        } else {
            // add all tech submenus to the returned menu
            Object.keys(menus).forEach(techMenu => {
                const subMenu = new Menu(this.messageGroup);
                const menuName = techMenu.charAt(0).toUpperCase() + techMenu.slice(1);
                for (const item of menus[techMenu]) {
                    subMenu.addItem(
                        'equip',
                        item.equip_type,
                        data => this.addFeature(item.equip_type, feature),
                        editable,
                        item.label
                    );
                }
                subMenu.sortItems();
                menu.addSubMenu('edit', techMenu, subMenu, editable, menuName);
            });
        }
        return menu;
    }

    /**
     * Creates an item in the addEquipMenu for adding internal cables
     * @param {MywFeature} feature structure feature
     * @param {Object} menu menu to apdd item to
     * @param {boolean} editable ture if item should be enabled
     */
    _addCableMenuFor(feature, menu, editable) {
        this.cableManager.cableFeatureTypes.forEach(cableType => {
            if (!this._canHouseCable(feature, cableType)) return;

            const itemDD = this.ds.featuresDD[cableType];
            const label = itemDD.external_name || '';
            menu.addItem(
                'cables',
                cableType,
                data => this._addInternalCable(cableType, data),
                editable,
                label
            );
        });
    }

    /*
     * Open editor for equipment 'feature_type'
     */
    async addFeature(featureType, housingFeature) {
        this.addNodeMode = true;
        const app = this.app;

        const detachedFeature = await this._getDetachedFeature(featureType, housingFeature);

        // Set geometry
        const { type, coordinates, world_name } = housingFeature.geometry;
        detachedFeature.setGeometry(type, coordinates, world_name);

        // Make if the current feature
        await app.setCurrentFeatureSet([]); // Clear select set
        app.setCurrentFeature(detachedFeature);
    }

    /**
     * Inserts an internal cable into structure
     * @param {string} featureType feature type
     * @param {object} data tree node data
     */
    async _addInternalCable(featureType, data) {
        const node = this.getNodeFor(data);
        const housingFeature = node.feature;

        const detachedCableFeature = await this.app.database.createDetachedFeature(
            featureType,
            true
        );
        detachedCableFeature.properties.directed = true;
        detachedCableFeature.isInternal = true;

        const geomType = 'LineString';
        const coordinates = [
            housingFeature.geometry.coordinates,
            housingFeature.geometry.coordinates
        ];
        const worldName = housingFeature.geometry.world_name;

        detachedCableFeature.setGeometry(geomType, coordinates, worldName);

        await this.app.setCurrentFeatureSet([]); // Clear select set
        this.app.setCurrentFeature(detachedCableFeature);
    }

    /**
     * returns a detached feature with housing propserties
     * @param {string} featureType
     * @param {MywFeature} housingFeature
     */
    async _getDetachedFeature(featureType, housingFeature) {
        const detachedFeature = await this.app.database.createDetachedFeature(featureType, true);

        // Wipe instance-specific properties // ENH: Is this required?
        delete detachedFeature.properties[detachedFeature.keyFieldName];
        delete detachedFeature.properties['name'];

        // Set housing
        const housingUrn = housingFeature.getUrn();

        // Set root housing
        const rootHousingUrn = housingFeature.properties.root_housing || housingUrn;
        detachedFeature.properties = Object.assign(detachedFeature.properties, {
            housing: housingUrn,
            root_housing: rootHousingUrn
        });

        return detachedFeature;
    }

    // ------------------------------------------------------------------------------
    //                                   TRACING
    // ------------------------------------------------------------------------------

    /**
     * The feature and pins to trace from for node selection 'sel' (hook for subclasses)
     *
     * @returns {object} with members features and pins
     */
    traceTargetFor(sel, direction) {
        // For splices, start downstream traces from 'to' side
        if (sel.node.pinType == 'splice' && direction != 'upstream') {
            const fromPins = sel.node.conn.from_pins;
            const toPins = sel.node.conn.to_pins;

            return {
                feature: sel.node.conn.to_feature,
                pins: new PinRange(
                    toPins.side,
                    sel.pins.low - fromPins.low + toPins.low,
                    sel.pins.high - fromPins.high + toPins.high
                )
            };
        }

        // Otherwise use super
        return super.traceTargetFor(sel, direction);
    }

    // ------------------------------------------------------------------------------
    //                               CONNECT / DISCONNECT
    // ------------------------------------------------------------------------------

    /*
     * Open the cable connection dialog
     */
    showCableConnectionDialog(data) {
        const node = this.getNodeFor(data);
        this.owner.showCableConnectionDialog(this.struct, node.feature);
    }

    /*
     * Open the port connection dialog
     */
    showPortConnectionDialog(data) {
        const sel = this.selectedPinsForEvent(data);
        new PortConnectionDialog(this, this.struct, sel.node.feature, sel.pins);
    }

    // ------------------------------------------------------------------------------
    //                                  CUT & PASTE
    // ------------------------------------------------------------------------------

    cutAssembly(data) {
        const node = this.getNodeFor(data);
        const f = node && node.feature;

        if (f) this.equipmentManager.assemblyClipboard = { cut: true, feature: f };
    }

    copyAssembly(data) {
        const node = this.getNodeFor(data);
        const f = node && node.feature;

        if (f) this.equipmentManager.assemblyClipboard = { cut: false, feature: f };
    }

    async pasteAssembly(data, feature, isCut) {
        const node = this.getNodeFor(data);
        const toHousing = node && node.feature;

        if (!toHousing) return;

        let fromHousing;
        fromHousing = _.first(await feature.followRelationship('housing'));

        let deleteConnections = false;
        if (isCut) {
            const [fromRootHousing, toRootHousing] = await Promise.all([
                this.getRootHousing(fromHousing),
                this.getRootHousing(toHousing)
            ]);

            // Only going to delete connections if a cut/paste and its to a different structure
            if (fromRootHousing.getUrn() != toRootHousing.getUrn()) {
                const connections = await this.equipmentManager.connectionsIn(feature);
                deleteConnections = connections.length > 0;
            }
        }

        if (deleteConnections) {
            myw.confirmationDialog({
                title: this.msg('move_assembly'),
                msg: this.msg('move_assembly_confirm', {
                    title: feature.getTitle(),
                    from: fromHousing.getTitle(),
                    to: toHousing.getTitle()
                }),
                confirmCallback: () => {
                    this._pasteAssembly(feature, toHousing, isCut);
                }
            });
        } else {
            this._pasteAssembly(feature, toHousing, isCut);
        }
    }

    async _pasteAssembly(equipmentFeature, toHousingFeature, isCut) {
        try {
            if (isCut) {
                await this.equipmentManager.moveAssembly(equipmentFeature, toHousingFeature);

                this.equipmentManager.assemblyClipboard = undefined; // only let a cut be pasted once
            } else {
                await this.equipmentManager.copyAssembly(equipmentFeature, toHousingFeature);
            }
            this.app.setCurrentFeature(this.app.currentFeature);
        } catch (e) {
            this.showError('paste_failed', e);
            throw e;
        }
    }

    // ------------------------------------------------------------------------------
    //                                  HELPERS
    // ------------------------------------------------------------------------------

    /*
     * Returns the structure that houses given feature
     */
    async getRootHousing(feature) {
        if (feature.featureDD.fields.root_housing) {
            const res = await feature.followRelationship('root_housing');
            return res[0];
        } else {
            return feature;
        }
    }

    async getHousing(feature) {
        if (feature.featureDD.fields.root_housing) {
            const res = await feature.followRelationship('housing');
            return res[0];
        } else {
            return feature;
        }
    }

    /*
     * True if 'feature' can house equipment of type 'equip_type'
     * @param  {Feature}  feature
     * @param  {object}   equip_type
     * @return {Boolean}
     */
    _canHouseEquip(feature, equipType) {
        const config = this.equipConfigs[equipType] || {};
        return config.housings && config.housings.includes(feature.getType());
    }

    /**
     * True if 'feature' can house cable of type 'cableType'
     * @param {MywFeature} feature
     * @param {string} cableType
     * @return {Boolean}
     */
    _canHouseCable(feature, cableType) {
        const config = this.cableConfigs[cableType];
        return config.housings && config.housings.includes(feature.getType());
    }

    /**
     * True if 'feature' should be included in the tree
     */
    _includeFeature(feature) {
        if (feature.definedFunction && feature.definedFunction() == 'slack') return false;
        return true;
    }

    /**
     * Returns tech of 'node'
     */
    _techFor(node) {
        return this.connectionManager.techFor(node.feature, node.side);
    }
}
