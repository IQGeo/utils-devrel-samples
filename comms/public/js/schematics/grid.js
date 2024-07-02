// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Transform from '../base/transform';

export default class Grid extends myw.Class {
    /**
     * Create
     */
    constructor() {
        super();
        this.rows = {};
    }

    /**
     * The value of cell [col,row]
     */
    cell(col, row) {
        col = Math.floor(col + 0.5);
        row = Math.floor(row + 0.5);
        const cols = this.rows[row] || {};
        return cols[col];
    }

    /**
     * Set the value of cell [col,row]
     */
    setCell(col, row, val) {
        col = Math.floor(col + 0.5);
        row = Math.floor(row + 0.5);
        let cols = this.rows[row];
        if (!cols) cols = this.rows[row] = {};
        cols[col] = val;
    }

    /**
     * Next free cell above [col,row]
     */
    nextFreeRow(col, row, inc = 1, val = undefined) {
        while (this.cell(col, row)) {
            if (this.cell(col, row) === val) break;
            row += inc;
        }
        return row;
    }

    /**
     * Next free cell to the right of [col,row]
     */
    nextFreeCol(col, row, inc = 1, val = undefined) {
        while (this.cell(col, row)) {
            if (this.cell(col, row) === val) break;
            col += inc;
        }
        return col;
    }

    /**
     * Schematic item for visualising self
     */
    item(opts) {
        return new GridItem(opts);
    }
}

/**
 * Schematic item for visualising a grid (for debugging)
 */
class GridItem extends myw.Class {
    constructor(opts) {
        super();
        this.transform = opts.transform;
        this.highlights = [];
    }

    /**
     * Show on 'map'
     */
    addToMap(map, layer) {
        this.reps = [];

        const max = 50;
        const lineStyle = new myw.LineStyle({ color: '#DDDDDD', lineStyle: 'dot' });
        const olStyle = lineStyle.olStyle(map.getView());

        for (let row = -max; row < max; row++) {
            this.addLine(layer, [-max, row], [max, row], olStyle);
            this.addLabel(map, layer, [0, row], row);
        }

        for (let col = -max; col < max; col++) {
            this.addLine(layer, [col, -max], [col, max], olStyle);
            this.addLabel(map, layer, [col, 0], col);
        }
    }

    /**
     * Add a grid line
     */
    addLine(layer, cell1, cell2, olStyle) {
        const trans = new Transform().translate(-0.5, -0.5).append(this.transform);
        const coord1 = trans.convert(cell1);
        const coord2 = trans.convert(cell2);
        const geom = myw.geometry.lineString([coord1, coord2]);
        const rep = layer.addGeom(geom, olStyle);
        this.reps.push(rep);
    }

    /**
     * Add a grid label
     */
    // ENH: Pass in style with textProp
    addLabel(map, layer, cell, label) {
        const textStyle = new myw.TextStyle({
            text: `${label}`,
            color: '#EEEEEE',
            size: 0.3,
            sizeUnit: 'm'
        });
        const olStyle = textStyle.olStyle(map.getView());

        const coord = this.transform.convert(cell);
        const geom = myw.geometry.point(coord);
        const rep = layer.addGeom(geom, olStyle);
        this.reps.push(rep);
    }

    /**
     * Remove self from 'map'
     */
    removeFromMap(map, layer) {
        for (const rep of this.reps) {
            layer.remove(rep);
        }
        this.reps = [];
    }
}
