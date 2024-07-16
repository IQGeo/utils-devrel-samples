// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';

/**
 * A list of checkboxes
 *
 * Value is the names of the selected check boxes
 *
 * @example
 * new CheckboxList({
 *   itemDefs: [ {name: 'apple', label: "Apple", value: true}, ... ]
 * })
 *
 * @extends {FormComponent}
 */
class CheckboxList extends myw.FormComponent {
    static {
        this.prototype.tagName = 'ul';
        this.prototype.className = 'checkbox-list';
    }

    constructor(options) {
        super(options);
        this.owner = options.owner;

        // Callers can add to before render (add title, footer etc)
        this.rows = this._buildRows();
    }

    /**
     * Build rows to support rendering
     */
    _buildRows() {
        const rows = [];
        this.suffixLabels = {};
        this.checkboxes = {};

        this.options.itemDefs.map(itemDef => {
            const checkbox = new myw.Checkbox({
                name: itemDef.name,
                value: itemDef.value,
                disabled: this.options.readOnly,
                onChange: this.options.onCheckboxChange
            });

            const suffixLabel = new myw.Label({ label: '' });

            this.suffixLabels[itemDef.name] = suffixLabel;
            this.checkboxes[itemDef.name] = checkbox;

            rows.push({
                components: [
                    new myw.Label({
                        label: itemDef.label,
                        cssClass: 'checkboxField',
                        wrap: checkbox
                    }),

                    suffixLabel
                ]
            });
        });

        return rows;
    }

    render(options) {
        const form = new myw.Form({
            messageGroup: this.options.messageGroup,
            rows: this.rows
        });
        this.setElement(form.el);
        super.render(options);
        return this;
    }

    /**
     * Gets the value as an array of selected names
     */
    getValue() {
        const selectedNames = [];

        _.each(this.checkboxes, (checkbox, name) => {
            if (checkbox.getValue()) selectedNames.push(name);
        });

        return selectedNames;
    }

    /**
     * Sets the value as an array of selected names
     * clearOthers should be specified as true if you want the other names
     * to be cleared
     */
    setValue(selectedNames, clearOthers = false) {
        _.each(this.checkboxes, (checkbox, name) => {
            if (selectedNames.indexOf(name) != -1) {
                checkbox.setValue(true);
            } else if (clearOthers) {
                checkbox.setValue(false);
            }
        });
    }

    /**
     * Sets suffix label element HTML. These are to the right of each checkbox label
     */
    setSuffixLabel(name, html) {
        this.suffixLabels[name].$el.html(html);
    }

    /**
     * Clear the suffix labels for all checkbox rows
     */
    clearSuffixLabels() {
        Object.values(this.suffixLabels).forEach(comp => comp.$el.html(''));
    }

    reset() {
        this.clearSuffixLabels();
    }

    disable() {
        Object.values(this.checkboxes).forEach(checkbox => {
            checkbox.$el.prop('disabled', 'disabled');
        });
    }

    enable() {
        Object.values(this.checkboxes).forEach(checkbox => {
            checkbox.$el.prop('disabled', '');
        });
    }
}

export default CheckboxList;
