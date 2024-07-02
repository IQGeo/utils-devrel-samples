// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import CableConduitTreeView from './cableConduitTreeView';
import CommsDialog from '../base/commsDialog';
import FilterInputItem from '../base/filterInputItem';

export default class ConduitConnectionDialog extends CommsDialog {
    static {
        this.prototype.messageGroup = 'ConduitConnectionDialog';
        this.prototype.className = 'connections-dialog-form';

        this.mergeOptions({
            destroyOnClose: true,
            minWidth: 490,
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
     * Init slots of self
     */
    constructor(owner, struct, fromConduit) {
        super({ title: '{:title}' });
        this.owner = owner;
        this.struct = struct;
        this.fromConduit = fromConduit;
        this.app = owner.app;

        this.conduitManager = this.app.plugins.conduitManager;

        // Share save tree state with owner
        this.saved_state = this.owner.saved_state;
    }

    /**
     * Create the dialog and applies localisation
     */
    async render() {
        this.treeView = new CableConduitTreeView(this, {});
        this.treeView.renderFor(this.struct);

        // Set info showing what we will connect
        this.fromLabel = $('<span>');
        this.toLabel = $('<span>');

        // Build filter item
        this.filterItem = new FilterInputItem(str => this.treeView.setFilter(str));
        this.filterItem.$el.css({ 'margin-left': 'auto' });

        // Build header div
        const headerDiv = $('<div>', { class: 'tree-header' })
            .append(this.fromLabel)
            .append($('<span>', { text: '->' }))
            .append(this.toLabel)
            .append(this.filterItem.$el);

        // Set contents
        this.options.contents = $('<div>', { class: 'connect-conduit-container' })
            .append(headerDiv)
            .append(this.treeView.container);

        this.updateLabel();

        super.render();

        this.setTitle(`${this.msg('title')} ${this.struct.getTitle()}`);

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

    resize() {
        this.$el.css({
            'max-height': $(window).height() - 110,
            'overflow-y': 'auto',
            'overflow-x': 'hidden'
        });
    }

    /**
     * Update self's state for change in selecion
     */
    selectionChanged(source, startSelection) {
        let sel = this.treeView.selection();

        this.toConduit = undefined;
        if (
            sel &&
            sel.getType() == this.fromConduit.getType() &&
            sel.getUrn() != this.fromConduit.getUrn()
        )
            this.toConduit = sel;

        this.updateLabel();

        // Set state of 'connect' button
        const enabled = !!this.toConduit;
        this.$el
            .dialog('widget')
            .find('.ui-dialog-buttonset')
            .find('.connect-btn')
            .button('option', 'disabled', !enabled);
    }

    updateLabel() {
        this.fromLabel.text(`${this.fromConduit.getTitle()}`);
        const toString = this.toConduit ? this.toConduit.getTitle() : '';
        this.toLabel.text(toString);
    }

    /**
     * Connects conduits
     */
    async connect(e) {
        try {
            await this.conduitManager.connectConduits(
                this.struct,
                this.fromConduit,
                this.toConduit
            );
        } catch (cond) {
            this.treeView.showError('connect_failed', cond);
            return;
        }

        this.close();
    }
}
