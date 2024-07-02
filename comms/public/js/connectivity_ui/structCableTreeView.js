// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import PinFeatureTreeView from './pinFeatureTreeView';
import Menu from '../base/menu';
import SplitSlackDialog from './splitSlackDialog';
import PinRange from '../api/pinRange';

const otherSide = { in: 'out', out: 'in' };

/**
 * Tree view showing cable ends within a structure
 *
 * Provides context menu for listing circuts, tracing, adding slack, etc
 */
// ENH: Share code with StructCableTreeView
export default class StructCableTreeView extends PinFeatureTreeView {
    static {
        this.prototype.messageGroup = 'CableTreeView';
    }

    // Constructor
    constructor(owner, options) {
        super(owner, options);

        // Gather config info of interest
        this.configs = {
            ...myw.config['mywcom.cables'],
            ...myw.config['mywcom.equipment']
        };

        this.defaultImage = 'modules/comms/images/features/default.svg';

        this.structManager = this.app.plugins.structureManager;
        this.cableManager = this.app.plugins.cableManager;
        this.connectionManager = this.app.plugins.connectionManager;
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
        const tree = this.structContent.cableTree();

        this.updateValid(this.structContent.isValid, this.structContent);

        // Fetch and cache line of count information
        await this.locManager.getFeaturesLOCDetails(this.structContent.segs, includeProposed);

        // Build tree
        const rootNode = this.createNode(tree);

        // Add slack icons/total lengths to cable nodes
        rootNode.children.forEach(node => this.addSlackSummary(node));

        return rootNode.children;
    }

    /*
     * Build tree for 'cableTreeNode' (recursive)
     */
    createNode(cableTreeNode, parentNode = null, sortValue = undefined) {
        // Case: Cable segment
        if (cableTreeNode.pins) {
            return this.createCableSegNode(cableTreeNode, parentNode, sortValue);
        }

        // Create node for feature
        const proposed = cableTreeNode.feature.isProposed();
        const node = this.newFeatureNode(cableTreeNode.feature, parentNode, {
            isLink: true,
            isProposed: proposed
        });

        // Apply specific sort to non-cable nodes (cable nodes will then sort alphabetically)
        if (cableTreeNode.nodeType != 'cable') node.sortValue = sortValue;

        if (cableTreeNode.isInternal) {
            node.segment = cableTreeNode.feature;
            node.cable = cableTreeNode.cable;
            node.isInternal = true;

            const slackFeature = cableTreeNode.slack;
            if (slackFeature) {
                node.feature = slackFeature;
                node.link = slackFeature.getUrn();
                node.text = this.msg('slack_seg');
                node.icon = this.getIconFor(slackFeature);
                node.slack = slackFeature;

                const slackLength = slackFeature.formattedFieldValue('length');
                if (slackLength) node.text += ` ${slackLength}`;
            } else {
                node.link = cableTreeNode.cable.getUrn();
                node.text = this.msg('internal_seg');
                node.icon = this.getIconFor(cableTreeNode.cable);

                // Include length (if any)
                const segLength = cableTreeNode.feature.formattedFieldValue('length');
                if (segLength) node.text += ` ${segLength}`;
            }
        }

        if (proposed) return node;

        // Add children
        _.each(cableTreeNode.children, (childNode, idx) => {
            this.createNode(childNode, node, idx.toString());
        });

        if (!parentNode) node['li_attr'] = { class: 'jstree-root-node' }; // ENH: Do this in super

        return node;
    }

    /*
     * Add sub-tree for given cable segment
     */
    createCableSegNode(segNode, parentNode, sortValue = undefined) {
        const seg = segNode.feature;
        const segSide = otherSide[segNode.side];

        const proposed = seg.isProposed();
        if (proposed) return; // Don't display proposed segments

        const cable = segNode.cable;
        const link = cable.getUrn();

        // Build label
        let sideStr;
        if (cable.properties.directed) {
            sideStr = this.msg('side_' + segNode.side);
        } else {
            sideStr = this.msg('cable_' + segNode.side);
        }

        const decs = this.displayManager.segDecorations(seg, segSide, this.structContent.features);
        const text = `${sideStr} (${segNode.n_connected}/${segNode.pins.size})` + decs;

        // Add node for side
        const node = this.newNode({
            id: `${segNode.side}_${seg.getUrn()}`,
            feature: seg,
            cable: cable,
            text: text,
            icon: this.getIconFor(cable),
            pins: segNode.pins,
            link: link,
            sortValue: sortValue,
            segment: seg,
            side: segNode.side,
            segSide: segSide,
            isInternal: segNode.isInternal
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
            segNode.cable_side,
            segNode.circuits
        );

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
        this.listenTo(this.connectionManager, 'connected disconnected', event => {
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

        if (!feature) return;

        // make node from other deltas read only
        const proposed = feature.isProposed();
        if (proposed) return;

        const menu = new Menu(this.messageGroup);

        // Segment end actions
        if (node.segment) {
            // Add slack modification options
            if (node.slack) {
                if (editable) {
                    menu.addItem('slack', 'edit_slack', data => this.editSlack(data));
                    menu.addItem('slack', 'split_slack', data => this.splitSlack(data));
                } else {
                    menu.addItem('slack', 'view_slack', data => this.viewSlack(data));
                }
            }

            // Add slack creation options
            if ((node.isInternal && !node.pins) || !node.isInternal) {
                if (node.side == 'out') {
                    menu.addItem(
                        'slack_creation',
                        'create_slack',
                        data => this.createSlack(data, 'out'),
                        editable
                    );
                }

                if (node.side == 'in') {
                    menu.addItem(
                        'slack_creation',
                        'create_slack',
                        data => this.createSlack(data, 'in'),
                        editable
                    );
                }
            }

            // Add tick mark option
            if (node.cable && this.specManager.getSpecFor(node.cable)) {
                menu.addItem('set_props', 'set_tick_mark', data => this.setTickMarkFor(data));
            }

            // Add containment option
            menu.addItem('set_props', 'set_equipment', data => this.setSegmentContainment(data));
        }

        // Segment actions
        if (node.pins) {
            menu.addItem('lazy', 'show_circuits', data => this._doShowCircuitsFor(data));
            menu.addItem('lazy', 'show_paths', data => this.doShowPathsForChildren(data));

            const hasLOC = this.locManager.hasLOC(node.segment);

            if (this.isCuttable(node)) {
                menu.addItem(
                    'cut_cable',
                    'cut_cable',
                    data => this.doCutCable(data, false),
                    !node.segment.properties.circuits?.length && !hasLOC
                );

                const enabled =
                    myw.app.currentFeature.hasSplices && myw.app.currentFeature.hasSplices();
                menu.addItem(
                    'cut_cable',
                    'cut_cable_connect',
                    data => this.doCutCable(data, true),
                    enabled
                );
            }

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
    //                                SLACK
    // ------------------------------------------------------------------------------

    async createSlack(data, side) {
        try {
            const jsNode = this.getJsNodeFor(data);
            const node = this.getNodeFor(data);
            const segFeature = node.segment;
            const struct = this.feature;

            this.addProcessingIndicator(jsNode);

            const detSlack = await this.cableManager.createDetSlackAtSide(segFeature, struct, side);
            // open slackEditor
            this.app.setCurrentFeature(detSlack);
            this.removeProcessingIndicator(jsNode);
        } catch (err) {
            this.showError('add_slack_failed', err);
            this.refreshFor(this.feature);
            throw err;
        }
    }

    async splitSlack(data) {
        try {
            const jsNode = this.getJsNodeFor(data);
            const node = this.getNodeFor(data);
            const slack = node.slack;

            this.addProcessingIndicator(jsNode);

            this._renderSplitSlackDialog(slack, jsNode);
        } catch (err) {
            this.showError('split_slack_failed', err);
            this.refreshFor(this.feature);
            throw err;
        }
    }

    async editSlack(data) {
        const node = this.getNodeFor(data);
        const slack = node.slack;
        this.app.setCurrentFeature(slack, { edit: true });
    }

    async viewSlack(data) {
        const node = this.getNodeFor(data);
        const slack = node.slack;
        this.app.setCurrentFeature(slack);
    }

    /**
     *
     * @param {feature} slack slack to split
     * @param {object} jsNode for removing processing indicator on cancel
     */
    async _renderSplitSlackDialog(slack, jsNode) {
        const dlgOptions = {};
        // Get the units of field from dd
        const fieldDD = slack.getFieldDD('length');

        // Set options
        dlgOptions.displayUnit = fieldDD.display_unit;
        dlgOptions.storedUnit = fieldDD.unit;
        dlgOptions.displayFormat = fieldDD.display_format;
        dlgOptions.slack = slack;
        dlgOptions.jsNode = jsNode;
        dlgOptions.lengthScaleDef = myw.config['core.units'].length;

        return new SplitSlackDialog(this, dlgOptions);
    }

    // ------------------------------------------------------------------------------
    //                                CABLE CUTTING
    // ------------------------------------------------------------------------------

    async doCutCable(data, connect) {
        const node = this.getNodeFor(data);

        let spliceHousing = undefined;
        if (connect) {
            if (this.app.currentFeature.hasSplices && this.app.currentFeature.hasSplices()) {
                spliceHousing = myw.app.currentFeature;
            } else {
                this.showError('cut_cable_splice_needed');
            }
        }
        await this.cableManager.cutCableAt(
            this.feature,
            node.segment,
            node.side == 'in',
            spliceHousing
        );
        this.refreshFor(this.feature);
    }

    /**
     * Determine if segment is cuttable
     * @param {Segment} segment
     * @returns
     */
    isCuttable(node) {
        const segment = node.segment;
        const slackType = this.cableManager.slackTypeForSegment(segment);
        if (segment.properties.housing?.startsWith(slackType)) return false;

        return (
            (segment.properties.in_structure == this.feature.getUrn() &&
                segment.properties.in_segment) ||
            (segment.properties.out_structure == this.feature.getUrn() &&
                segment.properties.out_segment)
        );
    }
}
