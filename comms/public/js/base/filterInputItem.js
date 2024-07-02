import $ from 'jquery';
import myw from 'myWorld-client';

/**
 * Embeddable input item for dynamic filtering on a text string
 *
 * Has a 'search' icon and clear button
 */
export default class FilterInputItem extends myw.Input {
    constructor(callback) {
        super({
            onKeyUp: data => this._handleChange(data.getValue()),
            cssClass: 'filter-input-item'
        });
        this.callback = callback;

        // Note: Can't set this via style as gets overridden by input style
        this.$el.css({
            height: '22px'
        });

        this.$el.on('click', event => this._handleClick(event));
    }

    /**
     * Called when user changes value
     */
    _handleChange(str) {
        // Set or remove the 'x'
        // ENH: Replace by proper button
        const clearBtnClass = 'filter-input-item-populated';
        if (str != '') {
            this.$el.addClass(clearBtnClass);
        } else {
            this.$el.removeClass(clearBtnClass);
        }

        // Inform owner
        this.callback(str);
    }

    /**
     * Called when user clicks in item
     */
    _handleClick(event) {
        if (event.offsetX < 12) {
            this.setValue('');
            this._handleChange('');
        }
    }
}
