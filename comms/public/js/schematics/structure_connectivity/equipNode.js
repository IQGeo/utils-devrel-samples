// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Node from './node.js';
import SchematicItem from '../schematicItem';

export default class EquipNode extends Node {
    static {
        this.prototype.type = 'equip';
    }

    /**
     * Init slots
     */
    constructor(equip) {
        super(equip, 'int');
    }

    /**
     * Map-displayable representation of self (a list of SchematicItems)
     */
    items(opts) {
        const items = [];
        items.push(this.symbolItem(opts));
        return items;
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    symbolItem(opts) {
        // Build point style
        const pointStyle = this.pointStyle();

        // Build label text and style
        const textStyle = new myw.TextStyle({
            text: this.feature.properties.name,
            color: '#AAAAAA',
            size: 0.4,
            sizeUnit: 'm',
            vAlign: 'bottom',
            vOffset: 0.8
        });

        return new SchematicItem(
            myw.geometry.point(this.coord(opts)),
            pointStyle.plus(textStyle),
            this.feature,
            this.feature.getTitle()
        );
    }

    /**
     * Style for symbol
     */
    pointStyle() {
        const config = myw.config['mywcom.equipment'][this.feature.getType()] || {};

        // Case: Configured
        if (config && config.image)
            return new myw.IconStyle({
                iconUrl: config.image,
                size: 2,
                sizeUnit: 'm',
                anchorX: 50,
                anchorY: 50,
                anchorXUnit: '%',
                anchorYUnit: '%'
            });

        // Case: Other
        return new myw.SymbolStyle({
            symbol: 'circle',
            color: '#00BB00',
            size: 1,
            sizeUnit: 'm'
        });
    }

    /**
     * Location of self's 'incoming' connection point
     */
    // Note: Side does not matter
    inCoord(opts, fromNode) {
        const offset = fromNode.col < this.col ? -0.5 : +0.5;
        return this.coord(opts, offset);
    }

    /**
     * Location of self's 'outgoing' connection point
     */
    // Note: Side does not matter
    outCoord(opts, toNode) {
        const offset = toNode.col < this.col ? -0.5 : +0.5;
        return this.coord(opts, offset);
    }

    /**
     * Location of self in map space (a lat/long coordinate)
     */
    // TODO: Duplicated with segmentNode
    coord(opts, colOffset = 0, rowOffset = 0) {
        const col = this.col + colOffset;
        const row = this.row + rowOffset;
        return opts.transform.convert([col, row]);
    }
}
