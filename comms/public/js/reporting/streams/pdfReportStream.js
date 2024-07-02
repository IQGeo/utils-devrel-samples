// Copyright: IQGeo Limited 2010-2023
import ReportStream from './reportStream';
import jsPDF from 'jspdf';
import _ from 'underscore';

export default class PdfReportStream extends ReportStream {
    static {
        /**
         * True if output is split into pages
         */
        this.prototype.isPaged = true;
    }

    /**
     * Options is a dict with keys:
     *   pageSize:    [width,height] in pt (optional)
     *   orientation: 'portrait' or 'landscape' (optional)
     */
    constructor(options = {}) {
        super(options);
        this.type = 'pdf';

        // Create document
        this.doc = new jsPDF({
            unit: 'pt',
            format: options.pageSize,
            orientation: options.orientation
        });

        this.styleStack = [];

        // Set margins
        const pageSize = this.doc.internal.pageSize;
        this._pos0 = { x: 45, y: 50 };
        this._posMax = {
            x: pageSize.getWidth() - this._pos0.x,
            y: pageSize.getHeight() - this._pos0.y
        };

        this._availableSize = {
            w: this._posMax.x - this._pos0.x,
            h: this._posMax.y - this._pos0.y
        };

        // Set initial position
        this._pos = _.clone(this._pos0);
        this.pageNumber = 1;

        // Set font size
        this.defaultFontSize = 9;
        this.doc.setFontSize(this.defaultFontSize);

        if (options.font) {
            this.doc.addFileToVFS('font.ttf', options.font);
            this.doc.addFont('font.ttf', 'arial', 'normal');
            this.doc.addFont('font.ttf', 'arial', 'bold');
            this.doc.setFont('arial');
        }
    }

    // ---------------------------------------------------------------------
    //                             LINE OUTPUT
    // ---------------------------------------------------------------------

    writeHeading(level, ...items) {
        const fontSize = this.defaultFontSize + (8 - level * 2);
        this._pushStyle({ fontSize: fontSize });
        this.writeLine(...items);
        this._popStyle();

        this._pos.y += fontSize / 4.0;
    }

    writeLine(...items) {
        const dims = this._lineDims(items);
        this._startLine(dims.h);
        this._writeItems(items);
    }

    /**
     * Get dimensions of 'items' in current font
     */
    _lineDims(items) {
        const dims = {
            w: 0,
            h: this.doc.getLineHeight()
        };

        for (const item of items) {
            const itemDims = this._itemDims(item);
            dims.w += itemDims.w;
            dims.h = Math.max(dims.h, itemDims.h);
        }

        return dims;
    }

    // ---------------------------------------------------------------------
    //                              TABLE OUTPUT
    // ---------------------------------------------------------------------

    /**
     * Output 'tab' (a ReportTable)
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
        const {
            colHeadings = {},
            colStyles = {},
            skipEmptyCols = false,
            style = 'classic'
        } = options;

        const cols = skipEmptyCols ? tab.usedColumns() : tab.columns;

        // Determine font size
        const ftSize = this.defaultFontSize;
        let tabProps = this._buildTableProps(tab, cols, colHeadings, colStyles, ftSize, style);
        const prop = tabProps.width / this._availableSize.w;
        if (prop > 1) {
            tabProps = this._buildTableProps(
                tab,
                cols,
                colHeadings,
                colStyles,
                ftSize / prop,
                style
            );
        }

        this._drawTableStyle(tab, tabProps, style);

        // Write rows
        tabProps.row = 0;
        this._pushStyle({ fontSize: tabProps.fontSize });
        for (const row of tab.rows) {
            this._writeRow(row, tabProps, colHeadings);
        }
        this._popStyle();
    }

    /**
     * Compute table dimensions if using 'fontSize'
     *
     * Returns object with properties:
     *   width
     *   cols
     *   colInfos
     *   rowInfos
     *   rowPad
     */
    _buildTableProps(tab, cols, colHeadings, colStyles, fontSize, style) {
        const defaultColPad = 0.4; // chars
        const rowPad = fontSize * 0.3;
        this._pushStyle({ fontSize: fontSize });

        // Compute col widths and row heights
        const [colElWidths, rowElHeights, headerRowHeight] = this._computeTableDims(
            tab,
            cols,
            colHeadings,
            rowPad
        );

        // Build table properties
        const tabProps = { cols, fontSize, rowPad, style };

        // Build column properties
        tabProps.colInfos = {};
        tabProps.width = 0;
        for (const col of cols) {
            const colStyle = colStyles[col];
            const leftPad = fontSize * (colStyle?.leftPad || defaultColPad);
            const rightPad = fontSize * (colStyle?.rightPad || defaultColPad);

            const colInfo = {
                leftPad,
                rightPad,
                width: colElWidths[col],
                alignment: colStyle?.hAlign
            };

            colInfo.fullWidth = colInfo.leftPad + colElWidths[col] + colInfo.rightPad;
            tabProps.width += colInfo.fullWidth;

            tabProps.colInfos[col] = colInfo;
        }

        // Build row properties
        tabProps.rowInfos = {};
        tabProps.rowInfos.headerRow = { height: headerRowHeight };
        tabProps.height = headerRowHeight;
        for (const i in tab.rows) {
            const rowInfo = {
                height: rowElHeights[i]
            };
            rowInfo.fullHeight = rowElHeights[i] + tabProps.rowPad * 2; // Pad above and below
            tabProps.height += rowInfo.fullHeight;

            tabProps.rowInfos[i] = rowInfo;
        }

        this._popStyle();

        return tabProps;
    }

    /**
     * Write a row of table, handling page rollover etc
     */
    _writeRow(row, tabProps, colHeadings) {
        const rowPad = tabProps.rowPad;
        const rowHeight = this._rowDims(row, tabProps.cols).h;

        // Check for page overflow
        const nextY = this._pos.y + rowHeight + rowPad * 2;
        if (nextY > this._posMax.y) {
            this._startPage();
            tabProps.row = 0; // forces titles + resets stripes
        }

        // If starting new table .. write titles
        if (tabProps.row == 0 && Object.keys(colHeadings).length) {
            if (tabProps.style == 'modern') this._pushStyle({ bold: true, color: '#ffffff' });
            const hdrHeight = tabProps.rowInfos.headerRow.height;
            this._writeRowItems(tabProps.titles, hdrHeight, tabProps, rowPad, colHeadings);
            if (tabProps.style == 'modern') this._popStyle();
        }

        this._writeRowItems(row, rowHeight, tabProps, rowPad);

        tabProps.row += 1;
    }

    /**
     * Write a row of table and update current position
     */
    _writeRowItems(row, rowHeight, tabProps, rowPad, colHeadings = null) {
        this._pos.x = this._pos0.x;

        // Move to base of row
        this._pos.y += rowPad + rowHeight;

        // Draw items
        for (const col of tabProps.cols) {
            const colInfo = tabProps.colInfos[col];
            const item = colHeadings ? colHeadings[col] : row[col];
            const startX = this._pos.x;

            const width = this._itemDims(item).w;
            const alignment = colHeadings ? 'left' : colInfo.alignment;
            const startPad = this._getRowAlignmentPadding(alignment, colInfo, width);

            this._pos.x += startPad;
            this._drawItem(item);
            this._pos.x = startX + colInfo.fullWidth;
        }

        // Move to bottom of row
        this._pos.y += rowPad;
    }

    /**
     * Computes useful table dimension information
     * colElWidth is width of each col keyed on col name
     * rolElHeights is height of each row keyed on row index number
     * headerRowHeight is number
     * @returns {Array} colElWidths, rolElHeights and headerRowHeight
     */
    _computeTableDims(tab, cols, colHeadings, rowPad) {
        const colElWidths = {};
        const rowElHeights = {};
        let headerRowHeight = 0;
        for (const col of cols) {
            let maxWidth = 0;
            if (colHeadings[col]) {
                const headerDims = this._itemDims(colHeadings[col]);
                maxWidth = headerDims.w;
                headerRowHeight = headerDims.h + rowPad * 2;
            }
            let minHeight = this.doc.getLineHeight();

            for (const [i, row] of tab.rows.entries()) {
                const rowDims = this._itemDims(row[col]);
                const width = rowDims.w;
                maxWidth = Math.max(maxWidth, width);
                const height = rowDims.h;
                rowElHeights[i] = Math.max(rowElHeights[i] || 0, minHeight, height);
            }
            colElWidths[col] = maxWidth;
        }
        return [colElWidths, rowElHeights, headerRowHeight];
    }

    /**
     * Dimensions of row in current font
     */
    // ENH: width is meaningless since ignores column widths
    _rowDims(row, cols) {
        const dims = {
            w: 0,
            h: this.doc.getLineHeight()
        };

        for (const col of cols) {
            const itemDims = this._itemDims(row[col]);
            dims.w += itemDims.w;
            dims.h = Math.max(dims.h, itemDims.h);
        }

        return dims;
    }

    /**
     * Gets required padding to align a cell in a table.
     * Cells are left aligned by default
     */
    _getRowAlignmentPadding(alignment, colInfo, width) {
        let startPad;
        if (alignment == 'right') {
            startPad = colInfo.fullWidth - width;
        } else if (alignment == 'center') {
            startPad = (colInfo.fullWidth - width) / 2;
        } else {
            startPad = colInfo.leftPad;
        }

        return startPad;
    }

    /**
     * Draws table background (one of none, simple, striped)
     */
    _drawTableStyle(tab, tabProps, tabStyle) {
        const originalPos = { ...this._pos };

        let pos = { ...this._pos0 }; // Tables start at new row
        pos.y = originalPos.y + 1;

        const originalPageNumber = this.pageNumber;
        const hdrHeight = tabProps.rowInfos.headerRow.height;

        if (tabStyle !== 'none') {
            // Draw border around table
            const borderPos = { ...pos };
            borderPos.x -= 0.5;
            borderPos.y -= 0.5;
            if (tabStyle == 'modern') this._pushStyle({ drawColor: '#f2f2f2' });
            this._drawBorder(
                borderPos,
                tabProps.height + tabProps.rowPad,
                tabProps.width + 2,
                hdrHeight + tabProps.rowPad * 2
            ); // Pad border slightly as it looks better
            if (tabStyle == 'modern') this._popStyle();
        }

        if (tabStyle == 'classic') {
            this._drawSimpleTable(pos, tab, tabProps);
        }

        if (tabStyle == 'modern') {
            this._drawStripedTab(pos, tab, tabProps);
        }

        this.pageNumber = originalPageNumber;
        this.doc.setPage(this.pageNumber);

        this._pos = originalPos;
    }

    /**
     * Draws background for simple table (with header row on each page)
     */
    _drawSimpleTable(pos, tab, tabProps) {
        const hdrHeight = tabProps.rowInfos.headerRow.height;
        const rowPad = tabProps.rowPad;
        if (hdrHeight !== 0) {
            // Draw header row
            this._drawRowBackground(pos, tabProps.width, hdrHeight, rowPad, '#f2f2f2');
            this._drawBorder(pos, hdrHeight + rowPad * 2, tabProps.width + 2);
            pos.y += hdrHeight + rowPad * 2;
        }
        // Draw background (if requested)
        for (let i in tab.rows) {
            const rowHeight = tabProps.rowInfos[i].height + rowPad * 2;
            const nextY = pos.y + rowHeight + rowPad * 2;
            if (nextY > this._posMax.y) {
                this._startPage();
                pos.y = this._pos0.y;
                if (hdrHeight !== 0) {
                    // Draw header row on next page
                    this._drawRowBackground(pos, tabProps.width, hdrHeight, rowPad, '#f2f2f2');
                    this._drawBorder(pos, hdrHeight + rowPad * 2, tabProps.width + 2);
                    pos.y += hdrHeight + rowPad * 2;
                }
            }

            pos.y += rowHeight;
        }
    }

    /**
     * Draws background for striped table (with header row on each page)
     */
    _drawStripedTab(pos, tab, tabProps) {
        const hdrHeight = tabProps.rowInfos.headerRow.height;
        const rowPad = tabProps.rowPad;

        if (hdrHeight !== 0) {
            // Draw header row
            this._drawRowBackground(pos, tabProps.width + 1, hdrHeight, rowPad, '#0383bd');
            pos.y += hdrHeight + rowPad * 2;
        }

        // Draw background (if requested)
        let iRow = 0;
        for (let i in tab.rows) {
            const rowHeight = tabProps.rowInfos[i].height + rowPad * 2;
            const nextY = pos.y + rowHeight + rowPad * 2;

            if (nextY > this._posMax.y) {
                this._startPage();
                pos.y = this._pos0.y;
                iRow = 0;

                // Draw header row on next page
                if (hdrHeight !== 0) {
                    this._drawRowBackground(pos, tabProps.width + 1, hdrHeight, rowPad, '#0383bd');
                    pos.y += hdrHeight + rowPad * 2;
                }
            }

            if (iRow % 2) this._drawRowBackground(pos, tabProps.width, rowHeight, 0, '#f2f2f2');
            iRow += 1;
            pos.y += rowHeight;
        }
    }

    /**
     * Draw background fill for upcoming row
     */
    _drawRowBackground(pos, width, rowHeight, rowPad, color) {
        const fullRowHeight = rowHeight + rowPad * 2;
        this._pushStyle({ backgroundColor: color });
        this.doc.rect(pos.x, pos.y, width, fullRowHeight, 'F');
        this._popStyle();
    }

    /**
     * Draws border around table respecting page breaks
     */
    _drawBorder(pos, height, width, headerHeight = 0) {
        if (pos.y + height > this._posMax.y) {
            // Draw border around first page
            const originalPageNumber = this.pageNumber;
            this.doc.line(pos.x, pos.y, pos.x + width, pos.y, 'S'); //Top 1
            this.doc.line(pos.x, this._posMax.y, pos.x + width, this._posMax.y, 'S'); //Bottom 1
            this.doc.line(pos.x, pos.y, pos.x, this._posMax.y, 'S'); //Left 1
            this.doc.line(pos.x + width, pos.y, pos.x + width, this._posMax.y, 'S'); //Right 1

            height -= this._posMax.y - headerHeight - pos.y;
            let overSpill = height;

            // Draw border around next pages
            while (overSpill > 0) {
                this._startPage();
                // Line extends over page boundary
                overSpill = this._pos0.y + height - this._posMax.y;
                height -= this._posMax.y - headerHeight - this._pos0.y;

                let yMax = height + headerHeight + this._posMax.y;
                if (overSpill > 0) yMax = this._posMax.y;
                this.doc.line(pos.x, this._pos0.y, pos.x + width, this._pos0.y, 'S'); //Top
                this.doc.line(pos.x, yMax, pos.x + width, yMax, 'S'); //Bottom
                this.doc.line(pos.x, this._pos0.y, pos.x, yMax, 'S'); //Left
                this.doc.line(pos.x + width, this._pos0.y, pos.x + width, yMax, 'S'); //Right
            }

            //Set back to original page
            this.pageNumber = originalPageNumber;
            this.doc.setPage(this.pageNumber);
        } else {
            this.doc.line(pos.x, pos.y, pos.x + width, pos.y, 'S'); //Top
            this.doc.line(pos.x, pos.y + height, pos.x + width, pos.y + height, 'S'); //Bottom
            this.doc.line(pos.x, pos.y, pos.x, pos.y + height, 'S'); //Left
            this.doc.line(pos.x + width, pos.y, pos.x + width, pos.y + height, 'S'); //Right
        }
    }

    /**
     * Download self's content
     */
    saveAs(fileName) {
        this.doc.save(fileName);
    }

    // ---------------------------------------------------------------------
    //                              ITEM RENDERING
    // ---------------------------------------------------------------------

    /**
     * Add items to doc and update current postion
     */
    _writeItems(items) {
        for (const item of items) {
            this._pos.x += this._drawItem(item).w;
        }
    }

    /**
     * Add item to doc at current position
     *
     * Returns dimensions of rendered object
     */
    _drawItem(item) {
        if (item && item.renderer) {
            return this._itemRenderer(item);
        }

        const el = this.parseItem(item);

        if (el.image) {
            return this._drawImage(el.image, el.scale);
        } else {
            return this._drawText(el.text, el.style);
        }
    }

    /**
     * Add image at current position with 'height' (in chars)
     */
    _drawImage(img, scale) {
        const dims = this._imageDims(img, scale);
        img = this._asPngBase64(img);

        this.doc.addImage(img, 'png', this._pos.x, this._pos.y - dims.h, dims.w, dims.h);
        return dims;
    }

    /**
     * Add image at current position with 'height' (in chars)
     */
    _drawText(text, style = null) {
        // Set styles
        if (style) this._pushStyle(style);
        const dims = this.doc.getTextDimensions(text);

        // Draw text
        if (style) this._drawTextBackground(style, this._pos, dims);
        this.doc.text(this._pos.x, this._pos.y, text, { baseline: 'bottom' });
        if (style) this._drawTextUnderline(style, this._pos, dims);

        // Remove styles
        if (style) this._popStyle();

        return dims;
    }

    /**
     * Draw background fill for upcoming text
     */
    _drawTextBackground(style, pos, dims) {
        if (style.backgroundColor) {
            this._pushStyle({ fillColor: style.backgroundColor });
            this.doc.rect(pos.x - 1, pos.y - dims.h, dims.w + 2, dims.h + 1, 'F');
            this._popStyle();
        }
    }

    /**
     * Draw underline for text
     */
    _drawTextUnderline(style, pos, dims) {
        if (style.underline) {
            this._pushStyle({ drawColor: this.doc.getTextColor() });
            this.doc.line(pos.x, pos.y, pos.x + dims.w, pos.y, 'S');
            this._popStyle();
        }
    }

    // ---------------------------------------------------------------------
    //                              STYLE STACK
    // ---------------------------------------------------------------------

    _pushStyle(style) {
        const orig = {};

        if (style.color) {
            orig.color = this.doc.getTextColor();
            this.doc.setTextColor(style.color);
        }

        if (style.bold) {
            orig.font = this.doc.getFont();
            const font = { ...orig.font };
            font.fontStyle = style.bold ? 'bold' : 'normal';
            this.doc.setFont(font.fontName, font.fontStyle);
        }

        if (style.backgroundColor) {
            orig.backgroundColor = this.doc.getFillColor();
            this.doc.setFillColor(style.backgroundColor);
        }

        if (style.drawColor) {
            orig.drawColor = this.doc.getDrawColor();
            this.doc.setDrawColor(style.drawColor);
        }

        if (style.fontSize) {
            orig.fontSize = this.doc.getFontSize();
            this.doc.setFontSize(style.fontSize);
        }

        this.styleStack.push(orig);
    }

    _popStyle() {
        const orig = this.styleStack.pop();
        if (orig.color) this.doc.setTextColor(orig.color);
        if (orig.font) this.doc.setFont(orig.font.fontName, orig.font.fontStyle);
        if (orig.backgroundColor) this.doc.setFillColor(orig.backgroundColor);
        if (orig.drawColor) this.doc.setDrawColor(orig.drawColor);
        if (orig.fontSize) this.doc.setFontSize(orig.fontSize);
    }

    // ---------------------------------------------------------------------
    //                              POSITIONING
    // ---------------------------------------------------------------------

    /**
     * Starts a new page
     * Tries to fit next table on the same page using nLines hint
     */
    newSection(title, nLines = null) {
        if (this._pos.y == this._pos0.y) return; //Dont need a new section if at start of page already

        //Check if table fits in remaining space
        if (nLines) {
            const rowHeight = this.doc.getTextDimensions('P').h + this.doc.getFontSize() * 0.3 * 2; //rowHeight with rowPad
            const tableHeight = rowHeight * (nLines + 1) * 1.3; //nLines + 1 for header row (with fudge)
            const remaningHeight = this._posMax.y - this._pos.y;
            if (tableHeight < remaningHeight) return; //No need to start new page
        }
        this._startPage();
    }

    /**
     * Get dimensions of item in current font
     */
    _itemDims(item) {
        if (item && item.renderer) {
            return this._itemRenderer(item, false);
        }

        const el = this.parseItem(item);
        if (el.image) {
            return this._imageDims(el.image, el.scale);
        } else {
            return this.doc.getTextDimensions(el.text);
        }
    }

    /**
     * Get dimensions of item in current font
     */
    _imageDims(img, scale) {
        const height = scale * this.doc.getFontSize(); // ENH: Find a cleaner way
        const width = height * (img.width / img.height);
        return { w: width, h: height };
    }

    /**
     * Calls item renderer and returns dims in current font
     * @param {Boolean} draw wether the item should be drawn
     * @returns Item dims in current font
     */
    _itemRenderer(item, draw) {
        const dims = item.renderer(this, item, draw); //Chars
        const ftSize = this.doc.getFontSize();
        return { w: dims.w * ftSize, h: dims.h * ftSize };
    }

    /**
     * Start a new line (handling page overflow)
     *
     * Returns true if started new page
     */
    _startLine(height) {
        // Check for page overflow
        const startPage = this._pos.y + height > this._posMax.y;
        if (startPage) {
            this._startPage();
        }

        // Move to bottom of line
        this._pos.x = this._pos0.x;
        this._pos.y += height;

        return startPage;
    }

    /**
     * Start next line
     */
    _startPage() {
        const numberOfPages = this.doc.internal.getNumberOfPages();
        if (numberOfPages > this.pageNumber) {
            this.pageNumber += 1;
            this.doc.setPage(this.pageNumber);
        } else {
            this.pageNumber += 1;
            this.doc.addPage();
        }

        this._pos = _.clone(this._pos0);
    }
}
