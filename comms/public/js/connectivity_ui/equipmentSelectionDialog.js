// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { msg } from 'myWorld-client';
import EquipmentSelectionTreeView from './equipmentSelectionTreeView';
import FilterInputItem from '../base/filterInputItem';

export default class EquipmentSelectionDialog extends myw.Dialog {
    /**
     * Dialog for selecting a piece of equipment within a structure
     */

    static {
        this.prototype.messageGroup = 'EquipmentSelectionDialog';
        this.prototype.className = 'connections-dialog-form';

        this.mergeOptions({
            destroyOnClose: true,
            minWidth: 490,
            title: '{:title}',
            height: 600,
            position: { my: 'center', at: 'center', of: window },
            buttons: {
                set: {
                    text: '{:select}',
                    class: 'primary-btn select-btn',
                    disabled: true,
                    click() {
                        this.select();
                    }
                },
                close: {
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
     * Init slots of self
     */
    constructor(owner, struct, callback, options = {}) {
        super(options);
        this.owner = owner;
        this.struct = struct;
        this.callback = callback;

        this.app = owner.app;
        this.structManager = this.app.plugins.structureManager;
    }

    /**
     * Build dialog
     */
    async render() {
        this.treeView = new EquipmentSelectionTreeView(this, {
            selectBranches: true,
            selectMultiple: false
        });
        this.treeView.renderFor(this.struct);

        // Set info showing what we will connect
        this.prefix = $('<span>', { text: this.msg('label_prefix') + ': ' });
        this.label = $('<span>');

        // Create textual filter item
        this.filterItem = new FilterInputItem(str => this.treeView.setFilter(str));
        this.filterItem.$el.css({ 'margin-left': 'auto' });

        // Build header
        const headerDiv = $('<div>', { class: 'tree-header' })
            .append(this.prefix)
            .append(this.label)
            .append(this.filterItem.$el);

        // Set dialog content
        this.options.contents = $('<div>', { class: 'connect-port-container' })
            .append(headerDiv)
            .append(this.treeView.container);

        // ENH: TreeView auto-selects app.currentFEature .. but dialog doesn't reflect that
        this.updateLabel();

        super.render();

        this.$el.on('dialogopen', () => {
            this.resize();
        });

        // Resize the form on window resize
        $(window)
            .resize(() => {
                this.resize();
            })
            .resize();
    }

    /**
     * Resize dialog
     */
    resize() {
        this.$el.css({
            'max-height': $(window).height() - 110,
            'overflow-y': 'auto',
            'overflow-x': 'hidden'
        });
    }

    /**
     * Update state after change of selection
     */
    selectionChanged(source, startSelection) {
        this.updateLabel();

        let feature = this.treeView.selection();
        const enabled = !!feature;

        const actionButton = this.$el // ENH: Find a safer way!
            .dialog('widget')
            .find('.ui-dialog-buttonset')
            .find('.select-btn');

        actionButton.button('option', 'disabled', !enabled);
    }

    updateLabel() {
        this.label.html(this.treeView.selectionText());
    }

    /**
     * Callback for select button
     */
    async select(e) {
        const feature = this.treeView.selection();
        this.callback(feature);
        this.close();
    }
}
