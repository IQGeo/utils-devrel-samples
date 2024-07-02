// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import $ from 'jquery';

export default class RadioButtonSet extends myw.FormComponent {
    static {
        this.prototype.tagName = 'ul';
        this.prototype.className = 'focused-select-menu';
        this.prototype.events = { 'click li': '_onChange' };
    }

    constructor(options) {
        super(options);
        this.render(options);
    }

    render(options) {
        options.options.forEach(option => {
            const listItem = $('<li>').text(option);
            this.$el.append(listItem);

            if (option == this.options.selected) {
                listItem.addClass('selected');
                this.setValue(this.options.selected);
            }
        });
    }

    /**
     * Styles and stores the selected list-element
     * @param  {object} ev Backbone event
     */
    _onChange(ev) {
        const currentlySelected = this.$('li.selected');
        $(ev.currentTarget).addClass('selected');
        this.selectedValue = $(ev.currentTarget).text();
        this.setValue(this.selectedValue);

        if ($(ev.currentTarget)[0] === currentlySelected[0]) {
            // same button clicked consecutively
            return;
        } else {
            currentlySelected.removeClass('selected'); // un-select the previously selected value
        }

        // call super only if changed
        super._onChange();
    }
}
