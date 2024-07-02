// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-base';
import CablePinTreeView from './cablePinTreeView';
import EquipmentPinTreeView from './equipmentPinTreeView';
import RadioButtonSet from '../base/radioButtonSet';
import CommsDialog from '../base/commsDialog';
import FilterInputItem from '../base/filterInputItem';

export default class PortConnectionDialog extends CommsDialog {
    static {
        this.prototype.messageGroup = 'PortConnectionDialog';
        this.prototype.className = 'port-connections-dialog-form';

        this.mergeOptions({
            destroyOnClose: true,
            minWidth: 750, // Has no effect?
            height: 600,
            position: { my: 'center', at: 'center', of: window },
            buttons: {
                Save: {
                    text: '{:save}',
                    class: 'primary-btn connect-btn',
                    disabled: true,
                    click(e) {
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
    constructor(owner, struct, equip, pins) {
        super({ title: '{:title}' });
        this.owner = owner;
        this.struct = struct;
        this.equip = equip;
        this.fromPins = pins;

        this.app = owner.app;
        this.connectionManager = this.app.plugins.connectionManager;
        this.treeActive = null;
        this.selected = this.owner.selected || this.msg('cables');
    }

    /**
     * Create the dialog and applies localisation
     */
    async render() {
        this.buildGuiItems();
        this.buildDivs();

        super.render();

        this.setTitle(`${this.msg('connect')}: ${this.equip.getTitle()}`);

        // Set active tree
        this.equipTreeView.container.hide(); // set active tree to cable pin tree by default
        if (!this.activeTree) {
            if (this.selected == this.msg('cables')) {
                this.activeTree = this.cableTreeView;
                this.cableTreeView.container.show();
                this.equipTreeView.container.hide();
            } else {
                this.activeTree = this.equipTreeView;
                this.equipTreeView.container.show();
                this.cableTreeView.container.hide();
            }
        }

        // Update from and to labels
        this.updateLabel();

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
     * Create widgets
     */
    buildGuiItems() {
        // Build labels showing what we will connect
        this.fromLabel = $('<span></span>');
        this.toLabel = $('<span></span>');

        // Build filter item
        this.filterItem = new FilterInputItem(str => this.setFilter(str));

        // Build tree selector
        // ENH: Use core radio buttonset component when its available Fogbugz Case 19364
        this.treeSelectorDiv = $('<span></span>');
        const treeSelector = new RadioButtonSet({
            options: [this.msg('cables'), this.msg('equipment')],
            selected: this.selected,
            onChange: this._toggleActiveTree.bind(this)
        });
        this.treeSelectorDiv.append(treeSelector.$el);

        // Build equipment tree
        this.equipTreeView = new EquipmentPinTreeView(this, {
            side: this.fromPins.side
        });

        // Build cable tree
        this.cableTreeView = new CablePinTreeView(this, {
            side: this.fromPins.side
        });

        // Launch rendering
        this.equipTreeView.renderFor(this.struct);
        this.cableTreeView.renderFor(this.struct, this.equip);
    }

    /**
     * Lay out widgets
     */
    buildDivs() {
        // Build options div
        const optionsDiv = $('<div>', { class: 'tree-options' })
            .append(this.filterItem.$el)
            .append(this.treeSelectorDiv);

        // Build header
        const headerDiv = $('<div>', { class: 'tree-header' })
            .append(this.fromLabel)
            .append($('<span>', { text: ` -> ` }))
            .append(this.toLabel)
            .append(optionsDiv);

        // Build content
        // ENH: Use TreeView.$el and add cableTreeHousingFilterItem to that
        this.options.contents = $('<div>', { class: 'connect-port-container' })
            .append(headerDiv)
            .append(this.cableTreeView.container)
            .append(this.cableTreeView.housingFilterItem.$el)
            .append(this.equipTreeView.container);
    }

    /**
     * toggle active tree instance, clear
     */
    _toggleActiveTree(event) {
        this.cableTreeView.container.toggle();
        this.cableTreeView.selectedNodes = [];

        this.equipTreeView.container.toggle();
        this.equipTreeView.selectedNodes = [];

        this.updateLabel();

        this.owner.selected = event.selectedValue; //Stash selected on owner to stop dialog forgetting tab on close

        if (this.activeTree instanceof CablePinTreeView) {
            this.activeTree = this.equipTreeView;
            this.cableTreeView.housingFilterItem.$el.hide();
        } else {
            this.activeTree = this.cableTreeView;
            this.cableTreeView.housingFilterItem.$el.show();
        }
    }

    /**
     * Limit trees to items matching 'str'
     */
    setFilter(str) {
        this.equipTreeView.setFilter(str);
        this.cableTreeView.setFilter(str);
    }

    resize() {
        this.$el.css({
            'max-height': $(window).height() - 110,
            'overflow-y': 'auto',
            'overflow-x': 'auto'
        });
    }

    /**
     * Update self's state for change in selecion
     */
    selectionChanged(source, startSelection) {
        // Force selection to required size (if possible)
        let sel = source.selection();
        if (sel) {
            source.setSelectionLength(this.fromPins.size);
            sel = source.selection(false);
        }
        this.updateLabel();

        const [fromTech, toTech] = this.getConnectionTechs(sel);

        // Set state of 'connect' button
        const enabled = !!sel && sel.pins.size == this.fromPins.size && fromTech === toTech;
        this.$el
            .dialog('widget')
            .find('.ui-dialog-buttonset')
            .find('.connect-btn')
            .button('option', 'disabled', !enabled);
    }

    /**
     * Calculates technologies of sides of a potential connection
     *
     * @param {*} Current selection
     * @returns {Array<string>} technologies
     */
    getConnectionTechs(sel) {
        if (!sel) return [undefined, undefined];
        let toFeature;

        if (this.activeTree instanceof CablePinTreeView) toFeature = sel.seg;
        else toFeature = sel.feature;

        const toTech = this.connectionManager.techFor(toFeature, sel.pins.selectionChanged);
        const fromTech = this.connectionManager.techFor(this.equip, this.fromPins.side);
        return [fromTech, toTech];
    }

    updateLabel() {
        const fromSideName = this.msg(this.fromPins.side);
        this.fromLabel.html(`${fromSideName}:${this.fromPins.rangeSpec()}`);
        this.toLabel.html(this.activeTree.selectionText());
    }

    /**
     * Connects port to selected fiber
     */
    async connect() {
        const sel = this.activeTree.selection();
        let toFeature;

        if (this.activeTree instanceof CablePinTreeView) toFeature = sel.seg;
        else toFeature = sel.feature;

        const tech = this.connectionManager.techFor(toFeature, sel.pins.side);
        const ripple = this.app.plugins.locManager.autoRipple;

        // Make the connection
        try {
            await this.connectionManager.connect(
                tech,
                this.equip,
                this.fromPins,
                toFeature,
                sel.pins,
                this.equip,
                ripple
            );
        } catch (cond) {
            // ENH: Provide showError() helper
            const details = cond.message || cond;

            myw.dialog({
                destroyOnClose: true,
                title: this.msg('connect_failed'),
                contents: this.msg(details)
            });
            throw cond; // so we get traceback
        }

        this.close();
    }
}
