// Copyright: IQGeo Limited 2010-2023
import ReportStream from './reportStream';
import Excel from 'exceljs';

export default class ExcelReportStream extends ReportStream {
    static {
        this.prototype.messageGroup = 'XlsxReportStream';
    }

    constructor(options = {}) {
        super(options);
        this.type = 'xlsx';

        this.doc = new Excel.Workbook();

        this._pos = {};
        this._pos.y = 0;
        this._pos.x = 0;

        // Set font size
        this.defaultFontSize = 11;
        this._minColWidth = 1; //Chars
        this._minRowHeight = 20;
    }

    // ---------------------------------------------------------------------
    //                             LINE OUTPUT
    // ---------------------------------------------------------------------

    /**
     * Writes heading at 'level' for any items
     * If current worksheet has not been set (newSection hasnt been called yet) creates a currentWorksheet
     */
    writeHeading(level, ...items) {
        if (!this.currentWorksheet) {
            this.currentWorksheet = this.doc.addWorksheet(this.msg('page_1'), {
                views: [{ showGridLines: true }]
            });
        }

        const fontSize = this.defaultFontSize + (8 - level * 2);
        this._writeItems(items, { size: fontSize, bold: true });
        this._pos.y += 1;
        this._pos.x = 0;
    }

    /**
     * Writes 'items' to doc
     * Creates current worksheet if necesary
     */
    writeLine(...items) {
        if (!this.currentWorksheet) {
            this.currentWorksheet = this.doc.addWorksheet(this.msg('page_1'), {
                views: [{ showGridLines: true }]
            });
        }

        this._writeItems(items);
        this._pos.y += 1;
        this._pos.x = 0;
    }

    // ---------------------------------------------------------------------
    //                              TABLE OUTPUT
    // ---------------------------------------------------------------------

    /**
     * Output 'tab' (a ReportTable)
     * Creates currentWorksheet if necesary
     *  options contains:
     *      'colHeadings' is a list of reportItems keyed by column name.
     *      'colStyles' is a list of ColumnStyle objects keyed by column name.
     *      'skipEmptyCols' boolean to skip cols with no items in
     *      'style': One of simple, striped, none (defaults to simple)
     *
     * A ColumnStyle is an object with properties
     *    leftPad    Space to left of cells (in nominal chars) (default: 0.2)
     *    rightPad   Space to right of cells (in nominal chars) (default: 0.2)
     *    hAlign     One of 'left' 'center' or 'right': How to align text horizontally in table cell
     */
    writeTable(tab, options = {}) {
        if (!this.currentWorksheet) {
            this.currentWorksheet = this.doc.addWorksheet(this.msg('page_1'), {
                views: [{ showGridLines: true }]
            });
        }

        const {
            colHeadings = {},
            colStyles = {},
            skipEmptyCols = false,
            style = 'classic'
        } = options;

        this._pos.x = 0;
        const cols = skipEmptyCols ? tab.usedColumns() : tab.columns;

        this._drawTableStyle(tab, colHeadings, cols, style);

        const xlsxColStyles = {};
        for (const col of cols) {
            xlsxColStyles[col] = this._xlsxColStyleFor(colStyles[col] || {});
        }

        const colWidths = {};

        if (Object.keys(colHeadings).length) {
            //Write Headings (and align text to left)
            for (const col of cols) {
                const item = colHeadings[col];
                const width = this._writeTableItem(item, {
                    bold: true,
                    alignment: { horizontal: 'left' }
                });
                colWidths[col] = width;
                this._pos.x += 1;
            }
            this._pos.y += 1;
        }

        // Write data
        this._pos.x = 0;

        for (const row in tab.rows) {
            for (const col of cols) {
                const item = tab.rows[row][col];
                const style = xlsxColStyles[col];
                const width = this._writeTableItem(item, style);
                colWidths[col] = Math.max(colWidths[col] || 0, width);
                this._pos.x += 1;
            }
            this._pos.x = 0;
            this._pos.y += 1;
        }

        cols.forEach((col, i) => {
            const colName = this._getColumnCodeFromNumber(this._pos.x + i);
            const width = colWidths[col];
            this.setColumnWidth(colName, width);
        });
        this._pos.x = 0;
    }

    /**
     * Draws table styles (one of none, striped, simple or undefined)
     */
    _drawTableStyle(tab, colHeadings, cols, tabStyle) {
        const originalPos = { ...this._pos };

        if (tabStyle !== 'none') {
            this.drawBorder(colHeadings, cols, tab, tabStyle);
        }

        if (tabStyle == 'classic' && Object.keys(colHeadings).length) {
            // Fill header cells light grey
            const topLeft = this._getCellName();
            const colName = this._getColumnCodeFromNumber(this._pos.x + cols.length - 1);
            const bottomRight = `${colName}${this._pos.y + 1}`;
            this._drawRowFill(topLeft, bottomRight, '#f2f2f2');
        }

        if (tabStyle == 'modern') {
            //Fill header blue (if headers exist)
            if (Object.keys(colHeadings).length) {
                const topLeft = this._getCellName();
                const colName = this._getColumnCodeFromNumber(this._pos.x + cols.length - 1);
                const bottomRight = `${colName}${this._pos.y + 1}`;
                this._drawRowFill(topLeft, bottomRight, '#0383bd');
                this._pos.y += 1;
            }
            // Do not add stripes to table in excel
        }

        this._pos = originalPos;
    }

    /**
     * Draw border around cells of table (and headings if required)
     */
    drawBorder(colHeadings, cols, tab, tabStyle) {
        const hasHeaders = Object.keys(colHeadings).length;
        //Draw border around cells
        const topLeft = this._getCellName();
        const colName = this._getColumnCodeFromNumber(this._pos.x + cols.length - 1);
        const colHdrsLen = hasHeaders ? 1 : 0;
        const bottomRight = `${colName}${this._pos.y + tab.rows.length + colHdrsLen}`;
        const color = tabStyle == 'modern' ? this.hexToARGB('#f2f2f2') : null;
        this.drawBorderAround(this.currentWorksheet, topLeft, bottomRight, color);

        if (tabStyle == 'classic' && hasHeaders) {
            //Draw border around headings
            const topLeft = this._getCellName();
            const colName = this._getColumnCodeFromNumber(this._pos.x + cols.length - 1);
            const bottomRight = `${colName}${this._pos.y + 1}`;
            this.drawBorderAround(this.currentWorksheet, topLeft, bottomRight);
        }
    }

    /**
     * Put fill of COLOR in cells in range between STARTCELL (top left) and ENDCELL (bottom right)
     */
    _drawRowFill(startCell, endCell, color) {
        //Get start row and column
        const startCellColumn = startCell.charAt(0);
        const startRow = parseInt(startCell.substring(1));

        //Get end row and column
        const endCellColumn = endCell.charAt(0);
        const endRow = parseInt(endCell.substring(1));

        let endColumn = this.currentWorksheet.getColumn(endCellColumn);
        let startColumn = this.currentWorksheet.getColumn(startCellColumn);

        endColumn = endColumn._number;
        startColumn = startColumn._number;
        //For each row and column
        for (let y = startRow; y <= endRow; y++) {
            const row = this.currentWorksheet.getRow(y);

            for (let x = startColumn; x <= endColumn; x++) {
                const cell = row.getCell(x);
                const style = {
                    fgColor: { argb: this.hexToARGB(color) },
                    type: 'pattern',
                    pattern: 'solid'
                };

                cell.fill = style;
            }
        }
    }

    /**
     * Download self's content
     */
    saveAs(fileName) {
        this.doc.xlsx.writeBuffer().then(data => {
            const blob = new Blob([data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const el = window.document.createElement('a');
            el.href = window.URL.createObjectURL(blob);
            el.download = fileName;
            document.body.appendChild(el);
            el.click();
            document.body.removeChild(el);
        });
    }

    // ---------------------------------------------------------------------
    //                              ITEM RENDERING
    // ---------------------------------------------------------------------

    /**
     * Add items to doc at current cell
     */
    _writeItems(items, options = {}) {
        for (const item of items) {
            this._drawItem(item, options);
        }
    }

    /**
     * Add item to doc at current cell
     */
    _drawItem(item, options) {
        if (item && item.renderer) {
            return item.renderer(this, item);
        }

        const el = this.parseItem(item);
        if (el.image) {
            this._drawImage(el.image, el.scale);
        } else {
            this._drawText(el, options);
        }
    }

    /**
     * Add image to doc and update column width and row height to fit
     */
    _drawImage(img, scale) {
        const dims = this._imageDims(img, scale);

        img = this._asPngBase64(img);
        const base64Img = `<img src="data:image/png;base64,${img}"`;

        const imageId = this.doc.addImage({ base64: base64Img, extension: 'png' });

        this.currentWorksheet.addImage(imageId, {
            tl: { col: this._pos.x, row: this._pos.y },
            ext: { width: dims.w, height: dims.h },
            editAs: 'absolute'
        });
        const row = this.currentWorksheet.getRow(this._pos.y + 1);
        row.height = Math.max(dims.h * 0.8, this._minRowHeight);
    }

    /**
     * Add text to current cell with style 'options'
     */
    _drawText(el, options) {
        const cellName = this._getCellName();
        const cell = this.currentWorksheet.getCell(cellName);

        const richTextItem = { text: el.text };
        let style = { ...options };
        if (el.style) {
            const elStyle = el.style;
            const tempStyle = this._getStyle(elStyle);
            style = Object.assign(style, tempStyle);
            if (style.fill) cell.fill = style.fill;
            if (style.alignment) cell.alignment = style.alignment;
        }

        richTextItem.font = style;

        if (cell.value?.richText) {
            cell.value.richText.push(richTextItem);
        } else {
            cell.value = { richText: [richTextItem] };
        }
    }

    /**
     * Add item to cell
     * Can add background to cell
     */
    _writeTableItem(item, options) {
        if (item && item.renderer) {
            return item.renderer(this, item).w;
        }

        const el = this.parseItem(item);
        let width = 0;
        if (el.image) {
            width = (this._imageDims(el.image, el.scale).w * 1.5) / this.defaultFontSize; //Convert to excel width units (with fudge factor)
        } else {
            width = this._textDims(el.text);
        }

        const cellName = this._getCellName();
        const cell = this.currentWorksheet.getCell(cellName);

        const regExp = /^-?\d*\.?\d*$/; // Test if string is number
        const isNumeric = regExp.test(el.text) && el.text !== '-';

        //If it doesnt have letters or special chars must be numeric - output as such
        if (isNumeric && el.text) {
            //Output number
            cell.value = parseFloat(el.text);
            if (options.alignment) cell.alignment = options.alignment;
            if (el.style) {
                const style = this._getStyle(el.style);
                cell.font = style;

                if (style.fill) cell.fill = style.fill;
            }

            return width;
        }

        this._writeItems([item], options);
        return width;
    }

    _getStyle(elStyle) {
        const style = {};
        if (elStyle.color) style.color = { argb: this.hexToARGB(elStyle.color) };

        if (elStyle.bold) style.bold = true;

        if (elStyle.fontSize) style.size = elStyle.fontSize;

        if (elStyle.underline) style.underline = true;

        if (elStyle.backgroundColor)
            style.fill = {
                fgColor: { argb: this.hexToARGB(elStyle.backgroundColor) },
                type: 'pattern',
                pattern: 'solid'
            };

        return style;
    }

    // ---------------------------------------------------------------------
    //                              POSITIONING
    // ---------------------------------------------------------------------

    /**
     * Create a new sheet
     * @param {String} title
     */
    newSection(title) {
        this.currentWorksheet = this.doc.addWorksheet(title, {
            views: [{ showGridLines: true }]
        });

        this._pos.x = 0;
        this._pos.y = 0;
    }

    /**
     * Get dimensions of item in current font
     */
    _imageDims(img, scale) {
        const height = scale * this.defaultFontSize * 1.5; //Add fudge to increase size of images so it matches other streams
        const width = height * (img.width / img.height);
        return { w: width, h: height };
    }

    _textDims(text) {
        return Math.max(text.length + 2, this._minColWidth);
    }

    // ---------------------------------------------------------------------
    //                              HELPERS
    // ---------------------------------------------------------------------

    _xlsxColStyleFor(colStyle) {
        const style = {};
        if (colStyle.hAlign !== undefined) {
            style['alignment'] = { horizontal: colStyle.hAlign };
        }
        return style;
    }

    /**
     *
     * @returns String of cell eg A1
     */
    _getCellName() {
        const columnCode = this._getColumnCodeFromNumber(this._pos.x);
        return `${columnCode}${this._pos.y + 1}`;
    }

    /**
     * For given int returns excel column code (eg 1->A, 27 -> AA)
     * @param {int} number
     * @returns {String}
     */
    _getColumnCodeFromNumber(number) {
        const alphabetLength = 26;

        const y = number.toString(alphabetLength);
        const chars = y.split('');
        let alpha = '';
        for (let i = 0; i < chars.length; i++) {
            let charFactor = 65;
            const curChar = chars[i];
            if (isNaN(curChar)) {
                alpha += String.fromCharCode(curChar.toUpperCase().charCodeAt() + 10);
            } else {
                if (i < chars.length - 1) {
                    charFactor--;
                }
                alpha += String.fromCharCode(parseInt(curChar) + charFactor);
            }
        }
        return alpha;
    }

    /**
     * Converts hex string to argb string (needed by exceljs)
     * @param {String} hexString
     * @returns String ARGB string (transparency assumed to always be 0)
     */
    hexToARGB(hexString) {
        return `FF${hexString.substring(1)}`;
    }

    /**
     * Draw border around cells
     * @param  {string}   startCell - Range start cell (top-left)
     * @param  {string}   endCell   - Range end cell (bottom-right)
     */
    drawBorderAround(sheet, startCell, endCell, color = 'FF000000') {
        //Get start row and column
        const startCellColumn = startCell.charAt(0);
        const startRow = parseInt(startCell.substring(1));

        //Get end row and column
        const endCellColumn = endCell.charAt(0);
        const endRow = parseInt(endCell.substring(1));

        let endColumn = sheet.getColumn(endCellColumn);
        let startColumn = sheet.getColumn(startCellColumn);

        if (!endColumn) throw new Error('End column not found');
        if (!startColumn) throw new Error('Start column not found');

        endColumn = endColumn._number;
        startColumn = startColumn._number;

        let i = 0;
        let j = 0;
        let iMax = endRow - startRow;
        let jMax = endColumn - startColumn;

        //For each row and column
        for (let y = startRow; y <= endRow; y++) {
            const row = sheet.getRow(y);

            for (let x = startColumn; x <= endColumn; x++) {
                const cell = row.getCell(x);

                //If cell is on edge of table put border on outer edge of cell
                if (!cell.border) cell.border = {};

                if (j == 0) cell.border.left = { style: 'medium', color: { argb: color } };

                if (j == jMax) cell.border.right = { style: 'medium', color: { argb: color } };

                if (i == 0) cell.border.top = { style: 'medium', color: { argb: color } };

                if (i == iMax) cell.border.bottom = { style: 'medium', color: { argb: color } };

                j++;
            }
            j = 0;
            i++;
        }
    }

    setColumnWidth(colName, width) {
        const col = this.currentWorksheet.getColumn(colName);
        col.width = width;
    }
}
