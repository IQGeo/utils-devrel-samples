// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-base';
import CablePinTreeView from './cablePinTreeView';
import React from 'react';
import ReactDOM from 'react-dom/client';
import CommsDialog from '../base/commsDialog';
import FilterInputItem from '../base/filterInputItem';
import { Alert } from 'antd';

export default class CableConnectionDialog extends CommsDialog {
    static {
        this.prototype.messageGroup = 'CableConnectionDialog';
        this.prototype.className = 'connections-dialog-form';

        this.mergeOptions({
            destroyOnClose: true,
            pinnable: true, // Adds a pin/unpin button on the title bar; When pinned remains open between connects/disconnects
            minWidth: 1050,
            height: 600,
            position: { my: 'center', at: 'center', of: window },
            buttons: {
                Save: {
                    text: '{:save}',
                    class: 'primary-btn connect-btn',
                    disabled: true,
                    click() {
                        this.connect();
                    }
                },
                Close: {
                    text: '{:close_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                }
            }
        });
    }

    /**
     * Create instance displaying cables in 'struct'
     */
    constructor(owner, struct, housing, isPinned) {
        super({
            title: '{:title}',
            close: close.bind() //Makes sure the x button in the dialog header calls the close() method
        });
        this.owner = owner;
        this.struct = struct;
        this.housing = housing;
        this.isPinned = isPinned;

        this.app = owner.app;
        this.structManager = this.app.plugins.structureManager;
        this.connectionManager = this.app.plugins.connectionManager;
    }

    /**
     * Set title on dialog.
     *
     * @override Place pin toggle icon if dialog is pinnable
     *
     * @param {String} title
     */
    setTitle(title) {
        if (this.options.pinnable) {
            const pinToggleIcon = this._createPinBtn();
            const titleDiv =
                '<div class="pinnable-dialog-title">' +
                pinToggleIcon[0].outerHTML +
                title +
                '<div>';
            this.$el.dialog('widget').find('.ui-dialog-title').html(titleDiv);
        } else {
            super.setTitle(title);
        }
    }

    /**
     * Create and display dialog
     */
    async render() {
        // Create GUI items
        this.fromItems = this._createSideItems('in', 'from_label');
        this.toItems = this._createSideItems('out', 'to_label');

        this.options.contents = $('<div>', { class: 'connect-cable-container' })
            .append(this.fromItems.div)
            .append(this.toItems.div);

        // Create dialog
        $.widget(
            'ui.dialog',
            $.extend({}, $.ui.dialog.prototype, {
                _title(title) {
                    if (!this.options.title) {
                        title.html('&#160;');
                    } else {
                        title.html(this.options.title);
                    }
                }
            })
        );
        super.render();

        // Set title
        this.setTitle(`${this.msg('title')} ${this.struct.getTitle()}`);

        // Restore state
        if (this.options.pinnable) {
            this._setPinState(this.$el.dialog('widget').find('.lock-editor'));
            this.$el
                .dialog('widget')
                .find('.lock-editor')
                .on('click', ev => this.togglePinnedState(ev));
        }

        // Resize to fit dialog on open
        this.$el.on('dialogopen', () => {
            this.resize();
        });

        // Resize the form on window resize
        $(window)
            .resize(() => {
                this.resize();
            })
            .resize();

        this.setupLabel();
    }

    /**
     * Create tree, label and filter items for 'side'
     */
    _createSideItems(side, msg_id) {
        // Create header items
        const labelPrefix = $('<span>', { class: 'bold-font', text: this.msg(msg_id) });
        const label = $('<span>');

        // Create tree
        const tree = new CablePinTreeView(this, {
            side: side,
            selectLeavesOnly: true,
            selectMultiple: true
        });

        // Create textual filter item
        const filterItem = new FilterInputItem(str => tree.setFilter(str));
        filterItem.$el.css({ 'margin-left': 'auto' });

        // Build header
        const header = $('<div>', { class: 'tree-header' });
        header.append(labelPrefix).append(label).append(filterItem.$el);

        // Build div
        const div = $('<div>', { class: 'connect-cable-tree' })
            .append(header)
            .append(tree.container)
            .append(tree.housingFilterItem.$el);

        // Launch render
        tree.renderFor(this.struct, this.housing);

        return { label, tree, filterItem, div };
    }

    /*
     * Creates a pin/unpin toggle button
     * @return {jQueryElement}
     */
    _createPinBtn() {
        const pinToggleIcon = $('<span>', { class: 'lock-editor' });
        this._setPinState(pinToggleIcon);
        return pinToggleIcon;
    }

    /*
     * Assigns the active class to the icon if the dialog is pinned and vice versa
     * Assigns an appropriate title to the icon
     * @param  {jQueryElement} pinIcon
     */
    _setPinState(pinIcon) {
        const titleMsg = this.isPinned ? 'unpin_dialog' : 'pin_dialog';
        pinIcon.toggleClass('active', this.isPinned).attr('title', this.msg(titleMsg));
    }

    /**
     * Toggles the isPinned flag and sets the state of the pin icon
     */
    togglePinnedState(ev) {
        this.isPinned = !this.isPinned;
        this.trigger('pinStateChanged', this.isPinned);
        this._setPinState($(ev.currentTarget));
    }

    resize() {
        this.$el.css({
            'max-height': $(window).height() - 110,
            'max-width': $(window).width() - 30
        });
    }

    async close(delay = false) {
        if (delay) await myw.Util.delay(2000); // to show completion message for 2 seconds
        super.close();
    }

    /**
     * Called when user selects a node in tree view 'source'
     *
     * If startMulti is true, operation is start of a multiple select
     *
     * User will only be able to modify the number of selected nodes
     * in the From panel.
     */
    selectionChanged(source, startMulti) {
        const sourceTree = this.fromItems.tree;
        const targetTree = this.toItems.tree;

        // Force length of selections to match
        const sourceLen = sourceTree.selectedNodes.length;
        const targetLen = targetTree.selectedNodes.length;

        if (sourceLen != targetLen) targetTree.setSelectionLength(sourceLen);

        const [sourceTech, targetTech] = this.getConnectionTechs();

        // Enable / disable connect button
        const sourceSelSize = sourceTree.selectionSize(false);
        const targetSelSize = targetTree.selectionSize(false);

        const housingCanHouseSource =
            this.housing.featureDD.fields[`${sourceTech}_splices`] !== undefined;
        const housingCanHouseTarget =
            this.housing.featureDD.fields[`${targetTech}_splices`] !== undefined;

        const connectEnabled =
            sourceSelSize && // Anything not already connected selected in source
            targetSelSize && // Anything not already connected selected in target
            sourceSelSize == targetSelSize && // Same number of rows selected
            sourceTech == targetTech &&
            housingCanHouseSource &&
            housingCanHouseTarget;
        this.disableButton('connect-btn', !connectEnabled);
    }

    /**
     * Calculates technologies of sides of a potential connection
     * @returns {Array<string>} technologies
     */
    getConnectionTechs() {
        const sourceTree = this.fromItems.tree;
        const targetTree = this.toItems.tree;

        const sourceSel = sourceTree.selection();
        const targetSel = targetTree.selection();

        let sourceTech;
        let targetTech;

        if (sourceSel) sourceTech = this.connectionManager.techFor(sourceSel.seg);
        if (targetSel) targetTech = this.connectionManager.techFor(targetSel.seg);

        return [sourceTech, targetTech];
    }

    disableButton(btnClass, disable) {
        this.$el
            .dialog('widget')
            .find('.ui-dialog-buttonset')
            .find(`.${btnClass}`)
            .button('option', 'disabled', disable);
    }

    updateLabels() {
        this.fromItems.label.html(this.fromItems.tree.selectionText());
        this.toItems.label.html(this.toItems.tree.selectionText());
    }

    // Callback for connect button
    async connect(e) {
        // Disable to prevent user clicking many times
        this.disableButton('connect-btn', true);

        this._showBusy();

        const fromSel = this.fromItems.tree.selection();
        const toSel = this.toItems.tree.selection();

        // These will match as connect button won't be enabled if they aren't
        const [fromTech, toTech] = this.getConnectionTechs();

        const ripple = this.app.plugins.locManager.autoRipple;

        this.toggleLabel();
        this.setLabelText(this.msg('connecting_cables'), 'info');
        try {
            // Do connection
            await this.connectionManager.connect(
                fromTech,
                fromSel.seg,
                fromSel.pins,
                toSel.seg,
                toSel.pins,
                this.housing,
                ripple
            );
            this.setLabelText(this.msg('connected_success'), 'success');

            // Refresh or close
            if (this.isPinned) {
                this.refreshTrees();
                this.toggleLabel(true);
            } else {
                this.close(true);
            }
        } catch (cond) {
            this.setLabelText(this.msg('connect_failed'), 'error');
            this.toggleLabel(true);
            // ENH: Provide showError() helper
            myw.dialog({
                destroyOnClose: true,
                title: this.msg('connect_failed'),
                contents: this.msg(cond.message)
            });

            this._showBusy(false);
            return; // Connect button purposely left disabled
        }
    }

    /*
     * So the connected or disconnected nodes are updated on the trees
     */
    refreshTrees() {
        this.fromItems.tree.refreshFor(this.struct);
        this.toItems.tree.refreshFor(this.struct);
    }

    /*
     * Adds or removes busy-ness indication
     */
    _showBusy(isBusy = true) {
        const trees = [this.fromItems.tree, this.toItems.tree];

        if (!isBusy) {
            // Redraws trees which removes busy indicators
            trees.forEach(tree => tree.jstree().redraw(true));
            return;
        }

        // Add busy indicators to selected nodes in each tree
        trees.forEach(tree => {
            const nodeIds = tree.selectedNodeIds;
            const jstree = tree.jstree();

            nodeIds.forEach(nodeId => {
                const jsNode = jstree.get_node(nodeId);
                tree.addProcessingIndicator(jsNode);
            });
        });
    }

    setupLabel() {
        let messageContainer = document.createElement('div');
        messageContainer.classList.add('connect-cables-message');
        messageContainer.classList.add('hidden');
        const buttonPane = this.el.parentNode.querySelectorAll('.ui-dialog-buttonpane');
        buttonPane[0].appendChild(messageContainer);
        this.root = ReactDOM.createRoot(messageContainer);
    }

    async toggleLabel(delay = false) {
        if (delay) {
            await myw.Util.delay(2000); // show completion message for 2 seconds if dialog is pinned
        }
        let messageContainer = document.getElementsByClassName('connect-cables-message')[0];
        messageContainer.classList.toggle('hidden');
    }

    setLabelText(text, type) {
        this.root.render(<Alert style={{ margin: '12px' }} message={text} type={type} />);
    }
}
