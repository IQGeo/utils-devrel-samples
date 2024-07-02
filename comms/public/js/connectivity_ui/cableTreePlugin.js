// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';
import _ from 'underscore';
import StructCableTreeView from './structCableTreeView';
import StructConduitTreeView from './structConduitTreeView';
import RouteCableTreeView from './routeCableTreeView';
import ConduitConnectionDialog from './conduitConnectionDialog';
import FeatureTreePlugin from './featureTreePlugin';

export default class CableTreePlugin extends FeatureTreePlugin {
    static {
        this.prototype.messageGroup = 'CableTreePlugin';

        this.mergeOptions({
            showStructConduits: false // Display conduit information in struct tree
        });

        this.prototype.statusDivId = 'related-cables-container-status';
    }

    constructor(owner, options) {
        super(owner, options);

        this.divId = 'related-cables-container';
        this.treeDivId = 'related-cables-tree-container';
        this.routeTreeDivId = 'route-related-cables-container';
        this.structCableTreeDivId = 'struct-related-cables-container';
        this.structConduitTreeDivId = 'struct-related-cables-conduits-container';

        this.saved_state = {};

        this.cableHolders = [
            ..._.keys(myw.config['mywcom.structures']),
            ..._.keys(myw.config['mywcom.routes']),
            ..._.keys(myw.config['mywcom.conduits'])
        ];

        this.showStructConduits = this.options.showStructConduits;
    }

    /**
     * Self's state to save over sessions
     */
    getState() {
        return {
            showStructConduits: this.showStructConduits
        };
    }

    /****** FeatureDetailsControl API *****/
    async updateFeatureDetailsDivFor(feature, parentDiv) {
        if (feature.properties.root_housing) {
            feature = await this.getRootHousing(feature);
        }

        // If current feature has cables ... show the tree
        if (this.cableHolders.includes(feature.getType())) {
            // Create divs and trees (if necessary)
            if (!this.div) {
                this.div = this._buildGuiItems();
                parentDiv.append(this.div);
            }

            // Reset display
            this.routeTreeDiv.hide();
            this.structCableTreeDiv.hide();
            this.structConduitTreeDiv.hide();

            // Determine type of tree to display
            // ENH: Nicer to start spinner first
            this.rootFeature = await this.getRootHousing(feature);
            const featureIsStruct = !_.has(this.rootFeature.featureDD.fields, 'cable_segments'); // ENH: Ask manager

            // Configure settings button
            // ENH: Delegate to view?
            const mgr = this.app.plugins.displayManager;
            this.settingsMenu.clear();
            mgr.addFiberColorButton(this.settingsMenu);
            mgr.addShowProposedButton(this.settingsMenu);
            mgr.addLocButton(this.settingsMenu);
            if (featureIsStruct) {
                this._addShowConduitsButton();
            }

            // Launch render
            if (featureIsStruct) {
                this.showStructTree();
            } else {
                this.showTree(this.routeTreeDiv, this.routeTreeView, this.rootFeature);
            }
            parentDiv.find(`#${this.divId}`).show();
        } else {
            parentDiv.find(`#${this.divId}`).hide();
        }
    }

    /**
     * Create divs and trees
     */
    _buildGuiItems() {
        // Create header
        const div = this._buildDivs(this.msg('title'));

        // Create tree view for routes
        this.routeTreeView = new RouteCableTreeView(this, { divId: this.routeTreeDivId });
        this.routeTreeDiv = $('<div>', { id: this.routeTreeDivId }).append(
            this.routeTreeView.container
        );
        this.treeDiv.append(this.routeTreeDiv);

        // Create tree view for cables at structures
        this.structCableTreeView = new StructCableTreeView(this, {
            divId: this.structCableTreeDivId
        });
        this.structCableTreeDiv = $('<div>', { id: this.structCableTreeDivId }).append(
            this.structCableTreeView.container
        );
        this.treeDiv.append(this.structCableTreeDiv);

        // Create tree view for conduits at structures
        this.structConduitTreeView = new StructConduitTreeView(this, {
            divId: this.structConduitTreeDivId,
            dragDrop: true
        });
        this.structConduitTreeDiv = $('<div>', {
            id: this.structConduitTreeDivId
        }).append(this.structConduitTreeView.container);
        this.treeDiv.append(this.structConduitTreeDiv);

        return div;
    }

    /**
     * Called when user changes the filter text
     */
    setFilter(str) {
        // ENH: Just do active tree
        this.routeTreeView.setFilter(str);
        this.structCableTreeView.setFilter(str);
        this.structConduitTreeView.setFilter(str);
    }

    /**
     * Show the tree for struct, either cables or cables+conduits
     */
    showStructTree() {
        if (this.showStructConduits) {
            this.structCableTreeDiv.hide();
            this.showTree(this.structConduitTreeDiv, this.structConduitTreeView, this.rootFeature);
        } else {
            this.structConduitTreeDiv.hide();
            this.showTree(this.structCableTreeDiv, this.structCableTreeView, this.rootFeature);
        }
    }

    /**
     * The feature to display tree for
     */
    async getRootHousing(feature) {
        if (feature.featureDD.fields.root_housing) {
            return this.followReference(feature, 'root_housing');
        } else {
            return feature;
        }
    }

    /**
     * Pop up the conduit connection dialog
     */
    showConduitConnectionDialog(struct, conduit) {
        return new ConduitConnectionDialog(this, struct, conduit);
    }

    /**
     * Add show conduits option to settings button
     */
    _addShowConduitsButton() {
        this.settingsMenu.addButton(
            this.msg('show_conduits'),
            treeButton => {
                this.toggleShowStructConduits();
            },
            treeButton => {
                return this.showStructConduits;
            }
        );
    }

    /**
     * Toggle display of conduits
     */
    toggleShowStructConduits() {
        this.showStructConduits = !this.showStructConduits;
        this.showStructTree();
    }

    /**
     * Helper to follow a reference field
     */
    // ENH: Use NetworkFeature.followReference()?
    async followReference(feature, field) {
        return _.first(await feature.followRelationship(field));
    }
}
