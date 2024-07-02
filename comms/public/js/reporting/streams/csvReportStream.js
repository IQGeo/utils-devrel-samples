// Copyright: IQGeo Limited 2010-2023
import ReportStream from './reportStream';

export default class CsvReportStream extends ReportStream {
    constructor() {
        super();
        this.type = 'csv';
        this.doc = '';
    }

    /**
     * Output a section heading
     */
    writeHeading(level, ...items) {
        this.writeLine(...items);
    }

    /**
     * Output a line
     */
    writeLine(...items) {
        this._writeItems(items);
        this.doc += '\n';
    }

    /**
     * Output 'tab' (a ReportTable)
     *  options contains:
     *      'colHeadings' is a list of reportItems keyed by column name.
     *      'colStyles' is a list of ColumnStyle objects keyed by column name. (unused in csv report)
     *      'skipEmptyCols' boolean to skip cols with no items in
     *      'style': One of simple, striped, none (defaults to simple) (unsed in csv report)
     *
     * A ColumnStyle is an object with properties
     *    leftPad    Space to left of cells (in nominal chars) (default: 0.2)
     *    rightPad   Space to right of cells (in nominal chars) (default: 0.2)
     *    hAlign     One of 'left' 'center' or 'right': How to align text horizontally in table cell
     */
    writeTable(tab, options = {}) {
        const { colHeadings = {}, skipEmptyCols = false } = options;
        // Deal with defaults
        const cols = skipEmptyCols ? tab.usedColumns() : tab.columns;

        // Leave a gap
        this.writeLine();

        // Write column headings
        let sep = '';
        for (const col of cols) {
            this.doc += sep;
            sep = ',';
            const item = colHeadings[col];
            this._writeItems([item]);
        }
        this.doc += '\n';

        // Write data
        for (const row in tab.rows) {
            let sep = '';

            for (const col of cols) {
                this.doc += sep;
                sep = ',';
                let item = tab.rows[row][col];
                this._writeItems([item]);
            }

            this.doc += '\n';
        }
    }

    /**
     * Download self's content as 'filename'
     */
    saveAs(fileName) {
        // Build downloadable object
        const blob = new Blob([this.doc], { type: 'text/csv' });

        // Create a temporary element and run it
        // See https://stackoverflow.com/questions/17493027/can-i-open-a-new-window-and-populate-it-with-a-string-variable/17493054
        const el = window.document.createElement('a');
        el.href = window.URL.createObjectURL(blob);
        el.download = fileName;
        document.body.appendChild(el);
        el.click();
        document.body.removeChild(el);
    }

    // ---------------------------------------------------------------------
    //                                HELPERS
    // ---------------------------------------------------------------------

    /**
     * Add items to doc at current cell
     */
    _writeItems(items) {
        for (const item of items) {
            this._drawItem(item);
        }
    }

    /**
     * Add item to doc at current cell
     */
    _drawItem(item) {
        if (item && item.renderer) {
            item.renderer(this, item);
            return;
        }

        const el = this.parseItem(item);
        if (el.image) el.text = '<img>';
        this.doc += el.text;
    }

    /**
     * Replace reserved chars in 'text'
     */
    _escapeText(text) {
        var specialChars = {
            '"': '"""'
        };

        let escapedText = '';

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            escapedText += specialChars[ch] || ch;
        }

        // If the string contains a comma, wrap with additional quotes
        if (escapedText.includes(',')) return `"${escapedText}"`;
        return escapedText;
    }
}
