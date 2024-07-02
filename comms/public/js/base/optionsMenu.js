// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';

/**
 * A pulldown list of boolean options
 */
// ENH: Rebuild this as a button with pulldown
class OptionsMenu extends myw.Control {
    static {
        this.prototype.messageGroup = 'OptionsMenu';
        this.prototype.className = 'control-setting';

        this.mergeOptions({
            ownerDivId: '' // Applies context menu to this.className under this id
        });
    }

    constructor(owner, options) {
        super(owner, options);
        this.items = [];
    }

    /**
     * Add button controlling display of objects from other designs
     */

    // Clear current menu itms
    clear() {
        this.items = [];
        this.render();
    }

    // Add a new button
    addButton(name, toggleCallback, stateCheck) {
        const newButton = {
            name: name,
            callback: () => {
                toggleCallback(this);
            },
            icon: ($element, key, item) => {
                if (stateCheck(this)) {
                    return 'context-menu-icon-checkmark';
                } else {
                    key.removeClass('context-menu-icon-checkmark'); // ensure checkmark is removed
                    return '';
                }
            }
        };

        this.items.push(newButton);
        this.render();
    }

    // Render the menu
    render() {
        const selector = this._selector();

        // Remove any previous menu
        $.contextMenu('destroy', selector);

        if (!this.items.length) return; // No menu to show

        $.contextMenu({
            // define which elements trigger this menu
            selector: selector,
            zIndex: 2,
            trigger: 'left',
            hideOnSecondTrigger: true,
            // define the elements of the menu
            items: this.items
        }).bind(this);

        this.$el.on('click', event => this.click(event));
    }

    click(event) {
        event.stopPropagation();
        this.$el.trigger('contextmenu');
    }

    // Derive selector to apply menu to
    _selector() {
        let selector = `.${this.className}`;

        if (this.options.ownerDivId) selector = `#${this.options.ownerDivId} ${selector}`;

        return selector;
    }
}

export default OptionsMenu;
