// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from '../schematicItem';

export default class PinTraceStructNode extends myw.Class {
    static {
        this.prototype.offset = {
            minRow: -0.15,
            maxRow: 0.15,
            minCol: -0.6,
            maxCol: 0.6
        };
    }

    /**
     * Init slots
     */
    constructor(feature, children = [], dir = null) {
        super();
        this.feature = feature;
        this.children = children;
        this.dir = dir;
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    item(opts) {
        // Build schematic item
        return new SchematicItem(
            myw.geometry.lineString(this.coords(opts)),
            this.style(opts),
            this.feature,
            this.feature.getTitle()
        );
    }

    /**
     * Builds to the style used by this structure node.
     */
    style(opts) {
        const style = new myw.Style();
        const lineStyle = new myw.LineStyle({ lineStyle: 'dot', color: '#CCCCCC', width: 2 });
        style.add(lineStyle);

        let orientation = 0;
        let vAlign = 'bottom';
        if (opts.layout.layout === 'vertical') {
            vAlign = 'right';
            orientation = 90;
        }
        if (opts.layout.layout === 'vertical' && this.dir === 'upstream') {
            vAlign = 'right';
            orientation = 270;
        }

        if (opts.layout.structureLabels) {
            const textStyle = new myw.TextStyle({
                text: this.feature.getTitle(),
                color: '#AAAAAA',
                size: 0.15,
                sizeUnit: 'm',
                vAlign,
                vOffset: 0.04,
                placement: 'point',
                orientation: orientation
            });

            style.add(textStyle);
        }
        return style;
    }

    /**
     * Build geometry coordinates for schematic item
     */
    coords(opts) {
        const minCoord = [];
        const maxCoord = [];

        // Find bounds of children
        for (const node of this.children) {
            const coord1 = [node.col + this.offset.minCol, node.row + this.offset.minRow];
            const coord2 = [node.col + this.offset.maxCol, node.row + this.offset.maxRow];

            minCoord[0] = Math.min(minCoord[0] || coord1[0], coord1[0]);
            minCoord[1] = Math.min(minCoord[1] || coord1[1], coord1[1]);
            maxCoord[0] = Math.max(maxCoord[0] || coord2[0], coord2[0]);
            maxCoord[1] = Math.max(maxCoord[1] || coord2[1], coord2[1]);
        }

        // Build geometry coordinates
        let coords = [
            [minCoord[0], (maxCoord[1] + minCoord[1]) / 2],
            [minCoord[0], maxCoord[1]],
            [maxCoord[0], maxCoord[1]],
            [maxCoord[0], minCoord[1]],
            [minCoord[0], minCoord[1]],
            [minCoord[0], (maxCoord[1] + minCoord[1]) / 2]
        ];

        // We need to reorder coordinates so that the labels show on the correct point when vertical/(both or downstream)
        if (opts.layout.layout === 'vertical' && this.dir !== 'upstream') {
            coords = [
                [maxCoord[0], (maxCoord[1] + minCoord[1]) / 2],
                [maxCoord[0], minCoord[1]],
                [minCoord[0], minCoord[1]],
                [minCoord[0], maxCoord[1]],
                [maxCoord[0], maxCoord[1]],
                [maxCoord[0], maxCoord[1]],
                [maxCoord[0], (maxCoord[1] + minCoord[1]) / 2]
            ];
        }

        return coords.map(coord => {
            return opts.transform.convert(coord);
        });
    }
}
