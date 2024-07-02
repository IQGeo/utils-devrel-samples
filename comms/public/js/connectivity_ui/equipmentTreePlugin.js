// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import _ from 'underscore';
import myw from 'myWorld-client';
import EquipmentTreeView from './equipmentTreeView';
import CableConnectionDialog from './cableConnectionDialog';
import FeatureTreePlugin from './featureTreePlugin';

export default class EquipmentTreePlugin extends FeatureTreePlugin {
    static {
        this.prototype.messageGroup = 'EquipmentTreePlugin';

        this.mergeOptions({
            isConnectDialogPinned: false
        });

        this.prototype.statusDivId = 'related-equipment-container-status';
    }

    constructor(owner, options) {
        super(owner, options);

        this.divId = 'related-equipment-container';
        this.treeDivId = 'related-equipment-tree-container';

        this.saved_state = {};

        this.equipmentHolders = [
            ..._.keys(myw.config['mywcom.structures']),
            ..._.keys(myw.config['mywcom.equipment'])
        ];

        this.isConnectDialogPinned = this.options.isConnectDialogPinned;
    }

    /****** FeatureDetailsControl API *****/
    updateFeatureDetailsDivFor(feature, parentDiv) {
        // If current feature has (or is) equipment ... show the tree
        if (this.equipmentHolders.includes(feature.getType())) {
            // Create divs and tree view (if necessary)
            if (!this.div) {
                this.div = this._buildGuiItems();
                parentDiv.append(this.div);
            }

            // Show it
            this.showTree(parentDiv.find(`#${this.divId}`), this.treeView, feature);
        } else {
            parentDiv.find(`#${this.divId}`).hide();
        }
    }

    /**
     * Create divs and tree
     */
    _buildGuiItems() {
        // Create header and tree div
        const div = this._buildDivs(this.msg('title'));

        // Set options
        const dispMgr = this.app.plugins.displayManager;
        dispMgr.addFiberColorButton(this.settingsMenu);
        dispMgr.addShowProposedButton(this.settingsMenu);
        dispMgr.addLocButton(this.settingsMenu);

        // Create tree
        this.treeView = new EquipmentTreeView(this, { divId: this.treeDivId }); // ENH: Set style for selected ports
        this.treeDiv.append(this.treeView.container);

        return div;
    }

    /**
     * Called when user changes the filter text
     */
    setFilter(str) {
        this.treeView.setFilter(str);
    }

    /**
     * Pop up the cable connection dialog
     */
    showCableConnectionDialog(struct, feature) {
        const cableConnDialog = new CableConnectionDialog(
            this,
            struct,
            feature,
            this.isConnectDialogPinned
        );

        cableConnDialog.once('pinStateChanged', isPinned => {
            // ENH: Just as for this in getState()
            this.isConnectDialogPinned = isPinned;
        });
    }

    // Self's state to save over sessions
    getState() {
        return {
            isConnectDialogPinned: this.isConnectDialogPinned
        };
    }
}
