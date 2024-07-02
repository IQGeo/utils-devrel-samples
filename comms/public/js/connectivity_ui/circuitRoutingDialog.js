// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { msg } from 'myWorld-client';
import EquipmentPinTreeView from './equipmentPinTreeView';
import FilterInputItem from '../base/filterInputItem';

export default class CircuitRoutingDialog extends myw.Dialog {
    static {
        this.prototype.messageGroup = 'CircuitRoutingDialog';
        this.prototype.className = 'connections-dialog-form';

        this.mergeOptions({
            destroyOnClose: true,
            minWidth: 490,
            title: '{:title}',
            height: 600,
            position: { my: 'center', at: 'center', of: window },
            buttons: {
                set: {
                    text: '{:set_path}',
                    class: 'primary-btn set-path-btn',
                    disabled: true,
                    click() {
                        this.setPath();
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
    constructor(owner, options, circuit, struct) {
        super(options);
        this.owner = owner;
        this.struct = struct;

        this.app = owner.app;
        this.connectionManager = this.app.plugins.connectionManager;
    }

    /**
     * Build dialog
     */
    async render() {
        this.treeView = new EquipmentPinTreeView(this, {});
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

        let sel = this.treeView.fiberSelection(true);
        const enabled = !!sel;

        const setPathBtn = this.$el // ENH: Find a safer way!
            .dialog('widget')
            .find('.ui-dialog-buttonset')
            .find('.set-path-btn');

        setPathBtn.button('option', 'disabled', !enabled);
    }

    updateLabel() {
        this.label.html(this.treeView.selectionText());
    }

    /**
     * Callback for set path button
     */
    async setPath(e) {
        const sel = this.treeView.selection();
        await this.owner.setPath(sel.feature, sel.pins);
        this.close();
    }
}
