// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from '../schematicItem';

export default class StructNode extends myw.Class {
    static {
        this.prototype.type = 'cable';
    }

    /**
     * Init slots
     */
    constructor(feature, children = []) {
        super();
        this.feature = feature;
        this.children = children;
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    item(opts) {
        // Build style
        const lineStyle = new myw.LineStyle({ color: '#CCCCCC', width: 4 });

        // Set default bounds
        const minCoord = this.coord(opts, 1.8, 0);
        const maxCoord = this.coord(opts, 3.2, 1);

        const minRowOffset = -0.8;
        const maxRowOffset = 0.8;

        // Find bounds of children
        for (const node of this.children) {
            let minColOffset = -0.8;
            let maxColOffset = 0.8;

            if (node.type == 'cable' && node.side == 'in') minColOffset = 0.8;
            if (node.type == 'cable' && node.side == 'out') maxColOffset = -0.8;

            const coord1 = node.coord(opts, minColOffset, minRowOffset);
            const coord2 = node.coord(opts, maxColOffset, maxRowOffset);

            minCoord[0] = Math.min(minCoord[0], coord1[0]);
            minCoord[1] = Math.min(minCoord[1], coord1[1]);
            maxCoord[0] = Math.max(maxCoord[0], coord2[0]);
            maxCoord[1] = Math.max(maxCoord[1], coord2[1]);
        }

        // Build geometry
        const coords = [
            [minCoord[0], minCoord[1]],
            [maxCoord[0], minCoord[1]],
            [maxCoord[0], maxCoord[1]],
            [minCoord[0], maxCoord[1]],
            [minCoord[0], minCoord[1]]
        ];

        return new SchematicItem(
            myw.geometry.lineString(coords),
            lineStyle,
            this.feature,
            this.feature.getTitle(),
            { highlights: [] } // Suppresses highlight
        );
    }

    /**
     * Location of self in map space (a lat/long coordinate)
     */
    // TODO: Duplicated with segmentNode
    coord(opts, col, row) {
        return opts.transform.convert([col, row]);
    }
}
