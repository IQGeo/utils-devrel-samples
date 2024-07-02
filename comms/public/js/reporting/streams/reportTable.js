// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
export default class ReportTable extends myw.MywClass {
    /**
     * Init slots of sel
     *
     * 'columns' is a list of column names
     */
    constructor(columns) {
        super();
        this.columns = columns;
        this.rows = [];
    }

    // Start new row
    nextRow() {
        this.rows.push({});
    }

    /**
     * Set the value of 'col' in the current row to be 'val'
     */
    add(col, val) {
        const row = this.rows[this.rows.length - 1];
        if (row[col] != undefined) throw Error('Column already set: ' + col);
        row[col] = val;
    }

    /**
     * Keys of non-empty columns (in order)
     */
    usedColumns() {
        const usedCols = [];

        for (const col of this.columns) {
            for (const row of this.rows) {
                if (row[col] !== undefined) {
                    usedCols.push(col);
                    break;
                }
            }
        }

        return usedCols;
    }
}
