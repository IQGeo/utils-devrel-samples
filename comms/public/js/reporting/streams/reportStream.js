// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
export default class ReportStream extends myw.MywClass {
    static {
        /**
         * True if supports pageSize and orientation options
         */
        this.prototype.isPaged = false;
    }

    /**
     * Converts a report item to a standard shape, runs hooks etc
     *
     * 'item' is a string, number or ReportItem.
     *
     * Returns a ReportElement with properties:
     *    text
     *    style
     *    image
     */
    parseItem(item) {
        if (item == undefined) return { text: '' };

        // Case: Raw value
        if (item.constructor === String) return { text: this._escapeText(item) };
        if (item.constructor === Number) return { text: this._escapeText(item.toString()) };
        if (this._isImage(item)) return { text: '', image: item, scale: 1 };

        // Case: Report item
        if (item.value == undefined) return { text: '' };

        if (this._isImage(item.value))
            return { text: '', image: item.value, scale: item.scale || 1 };

        const text = this._escapeText(item.value.toString());
        if (item.style) return { text: text, style: item.style };

        // Case: Styled string (style components)
        const style = { ...item };
        delete style.value; // ENH: Delete hook methods
        return { text: text, style: style };
    } // Backstop

    /**
     * Starts a new section in report (eg new sheet/page)
     */
    newSection(title, nLines) {
        return null;
    }

    _isImage(value) {
        return value instanceof HTMLElement; // TBR: Use HTMLImageElement when PLAT-6692 is fixed
    }

    /**
     * Returns Image 'img' as a base64-encoded PNG
     */
    _asPngBase64(img) {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var dataURL = canvas.toDataURL('image/png');
        return dataURL.replace(/^data:image\/(png|jpg);base64,/, '');
    }

    /**
     * Replace reserved chars in 'text'
     */
    // Backstop implementation does nothing
    _escapeText(text) {
        return text;
    }
}
