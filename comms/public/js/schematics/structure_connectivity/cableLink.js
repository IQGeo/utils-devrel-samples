// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from '../schematicItem';

export default class CableLink extends myw.Class {
    static {
        this.prototype.type = 'cable';
    }

    /**
     * Create link from node1 to node2
     */
    constructor(node1, node2, cable) {
        super();
        this.node1 = node1;
        this.node2 = node2;
        this.feature = cable;
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    item(opts) {
        // Get colour
        let color = '#00BB00';
        const config = opts.styles[this.feature.getType()];
        if (config && config.lineStyle && config.lineStyle.color) {
            color = config.lineStyle.color;
        }

        // Build geometry
        let coords = [this.node1.outCoord(opts), this.node2.inCoord(opts)];

        // Build line style
        // TODO: Duplicated with segmentNode
        const lineStyle = new myw.LineStyle({
            color: color,
            width: 8,
            widthUnit: 'px'
        });

        return new SchematicItem(
            myw.geometry.lineString(coords),
            lineStyle,
            this.feature,
            this.feature.getTitle()
        );
    }
}
