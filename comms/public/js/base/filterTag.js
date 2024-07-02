// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

/**
 * @class FilterTag
 * @param  {string} options.text FilterTag label text
 * @param  {function} options.onClose onClick handler
 *
 * @example
 * new FilterTag({
 *   text: "Hello World",
 *   onClose: function() {}
 * })
 *
 * @extends {FormComponent}
 */
class FilterTag extends myw.FormComponent {
    static {
        this.prototype.tagName = 'span';
        this.prototype.className = 'filter-tag';

        this.prototype.events = {
            'click .close-tag': '_onClose'
        };
    }

    constructor(options) {
        super(options);
        this.render(options);
    }

    render(options) {
        if (this.options.text) {
            this.$el.html(this.options.text).append('<i class="close-tag"></i>');
        }
        super.render(options);
        return this;
    }

    _onClose(el) {
        const options = this.options;
        if (options.onClose) {
            options.onClose.call({}, this);
        }
    }
}

export default FilterTag;
