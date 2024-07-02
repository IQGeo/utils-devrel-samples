// Copyright: IQGeo Limited 2010-2023
import ReportStream from './reportStream';

export default class HtmlReportStream extends ReportStream {
    constructor() {
        super();
        this.type = 'html';
        this.doc = '';
        this.fontSize = 12;
        this.elStack = [];
    }

    /**
     * Output a section heading
     */
    writeHeading(level, ...items) {
        this._startEl('h' + level);
        this._writeItems(items);
        this._endEl();
    }

    /**
     * Output a line
     */
    writeLine(...items) {
        this._writeItems(items);
        this.doc += '<br>';
    }

    /**
     * Output 'tab' (a ReportTable)
     *
     * Supported options are:
     *    style         one of 'classic', 'modern' or 'none' (default 'modern')
     *    colHeadings   a list of reportItems keyed by column name.
     *    colStyles     a list of ColumnStyle objects keyed by column name.
     *    skipEmptyCols if true, skip columns with no items in
     *
     * A ColumnStyle is an object with properties:
     *    leftPad    Space to left of cells (in nominal chars) (default: 0.2)
     *    rightPad   Space to right of cells (in nominal chars) (default: 0.2)
     *    hAlign     One of 'left' 'center' or 'right': How to align text horizontally in table cell
     */
    writeTable(tab, options = {}) {
        const {
            colHeadings = {},
            colStyles = {},
            skipEmptyCols = false,
            style = 'modern'
        } = options;

        // Deal with defaults
        const cols = skipEmptyCols ? tab.usedColumns() : tab.columns;

        // Build html column styles
        const htmlColStyles = {};
        for (const col of cols) {
            htmlColStyles[col] = this._htmlColStyleFor(colStyles[col] || {});
        }

        // Start table element
        const tableStyle = this._tableStyles(style);
        this._startEl('table', tableStyle);

        // Write column headings if they exist
        // ENH: Use thead tag?
        const headerStyle = this._tableHeaderStyles(style);
        if (Object.keys(colHeadings).length) {
            this._startEl('tr', headerStyle);
            for (const col of cols) {
                const item = colHeadings[col];
                this._startEl('td', {
                    ...htmlColStyles[col],
                    'text-align': 'left'
                });
                this._writeItems([item]);
                this._endEl();
            }
            this._endEl();
        }

        // Write data
        for (const row in tab.rows) {
            const rowStyle = this._tableRowStyle(style, row);
            this._startEl('tr', rowStyle);

            for (const col of cols) {
                const item = tab.rows[row][col];
                let style = htmlColStyles[col];
                if (!item) {
                    // Ensure empty rows are drawn
                    const height = '19px';
                    style = Object.assign({}, htmlColStyles[col], { height });
                }
                this._startEl('td', style);
                this._writeItems([item]);
                this._endEl();
            }
            this._endEl();
        }

        // End table element
        this._endEl();
    }

    /**
     * Download self's content as 'filename'
     */
    saveAs(fileName) {
        // Build downloadable object
        const blob = new Blob([this.fullDoc()], { type: 'text/html' });

        // Create a temporary element and run it
        // See https://stackoverflow.com/questions/17493027/can-i-open-a-new-window-and-populate-it-with-a-string-variable/17493054
        const el = window.document.createElement('a');
        el.href = window.URL.createObjectURL(blob);
        el.download = fileName;
        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
    }

    /**
     * Document with header tags etc
     */
    fullDoc() {
        const font = '{font-family: Arial; font-size: 12px}';
        const bodyStyles = `body ${font} td ${font}`;

        return `<html> <head> <style>${bodyStyles}</style> </head> <body>${this.doc}</body> </html>`;
    }

    // ---------------------------------------------------------------------
    //                                HELPERS
    // ---------------------------------------------------------------------

    /**
     * Add items to doc
     */
    _writeItems(items) {
        for (const item of items) {
            this._drawItem(item);
        }
    }

    /**
     * Add item to doc
     */
    _drawItem(item) {
        if (item && item.renderer) {
            return item.renderer(this, item);
        }

        const el = this.parseItem(item);

        if (el.image) {
            const imgBase64 = this._asPngBase64(el.image);
            const height = el.scale * this.fontSize * 1.2;
            this.doc += `<img src="data:image/png;base64,${imgBase64}" height=${height}>`;
        } else {
            if (el.style) this._startEl('span', this._htmlStyleFor(el.style));
            this.doc += el.text;
            if (el.style) this._endEl();
        }
    }

    /**
     * Build HTML style for 'colStyle'
     */
    _htmlColStyleFor(colStyle) {
        const style = { 'padding-left': '5px', 'padding-right': '5px' };
        style['padding-top'] = '2px';
        style['padding-bottom'] = '2px';

        if (colStyle.leftPad !== undefined)
            style['padding-left'] = colStyle.leftPad * this.fontSize + 'px';

        if (colStyle.rightPad !== undefined)
            style['padding-right'] = colStyle.rightPad * this.fontSize + 'px';

        if (colStyle.hAlign !== undefined) {
            style['text-align'] = colStyle.hAlign;
        }

        return style;
    }

    /**
     * Build an html style from myWorld style
     */
    _htmlStyleFor(style) {
        const hmtlStyle = {};

        for (let [prop, val] of Object.entries(style)) {
            switch (prop) {
                case 'color':
                    hmtlStyle[prop] = val;
                    break;

                case 'bold':
                    hmtlStyle['font-weight'] = val ? 'bolder' : 'normal';
                    break;

                case 'underline':
                    hmtlStyle['text-decoration'] = val ? 'underline' : 'none';
                    break;

                case 'backgroundColor':
                    hmtlStyle['background-color'] = val;
                    break;
            }
        }

        return hmtlStyle;
    }

    /**
     * HTML styles to be applied to whole table element
     */
    _tableStyles(tabStyle) {
        const styles = {};
        styles['padding-left'] = '10px';
        styles['padding-right'] = '10px';
        styles['border-collapse'] = 'collapse';

        if (tabStyle == 'modern') {
            styles['border'] = '1px solid #f2f2f2';
        } else if (tabStyle !== 'none') {
            styles['border'] = '1px solid black';
        }

        return styles;
    }

    /**
     * HTML styles to be applied to table header row
     */
    _tableHeaderStyles(tabStyle) {
        const styles = {};
        styles['text-align'] = 'left';
        styles['position'] = 'sticky';
        styles['top'] = '-3px';

        if (tabStyle == 'classic') {
            styles['color'] = '#000000';
            styles['font-weight'] = 'bold';
            styles['background-color'] = '#f2f2f2';
            styles['border-bottom'] = '1px solid black';
        }

        if (tabStyle == 'modern') {
            styles['background-color'] = '#0383bd';
            styles['color'] = '#ffffff';
        }

        return styles;
    }

    /**
     * Get styles to be applied to a row of the table
     */
    _tableRowStyle(tabStyle, rowNo) {
        const styles = {};

        if (rowNo % 2 && tabStyle == 'modern') {
            styles['background-color'] = '#f2f2f2';
        }

        return styles;
    }

    /**
     * Start an HTML element
     *
     * Optional 'style' is a dict of html style properties
     */
    _startEl(type, style = null, opts = {}) {
        this.doc += '<' + type;

        const allOpts = { ...opts };

        if (style) {
            allOpts['style'] = this._styleStringFor(style);
        }

        for (const key in allOpts) {
            let val = allOpts[key];
            this.doc += ' ' + `${key}="${val}"`;
        }

        this.doc += '>';

        this.elStack.push(type);
    }

    /**
     * End current HTML element
     */
    _endEl() {
        const type = this.elStack.pop();
        this.doc += '</' + type + '>';
    }

    /**
     * Build an HTML style string from a dict of style properties
     */
    _styleStringFor(htmlStyle) {
        let styleStr = '';
        let sep = '';
        for (let [prop, val] of Object.entries(htmlStyle)) {
            styleStr += `${sep}${prop}:${val}`;
            sep = ';';
        }
        return styleStr;
    }

    /**
     * Replace reserved chars in 'text'
     */
    _escapeText(text) {
        var specialChars = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
            '/': '&#x2F;',
            '`': '&#x60;',
            '=': '&#x3D;'
        };

        let escapedText = '';

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            escapedText += specialChars[ch] || ch;
        }

        return escapedText;
    }
}
