// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Node from './node.js';
import SchematicItem from '../schematicItem';

export default class SegmentNode extends Node {
    static {
        this.prototype.type = 'cable';
    }

    /**
     * Init slots. 'slack' is the owning slack equip (if any)
     */
    constructor(cable, seg, side, slack) {
        super(seg, side);
        this.cable = cable;
        this.slack = slack;
    }

    /**
     * String to show in debugger
     */
    toString() {
        return 'SegmentNode(' + this.feature.getUrn() + ')';
    }

    /**
     * Map-displayable representation of self (a list of SchematicItems)
     */
    items(opts) {
        // Get colour
        let color = '#00BB00';
        const config = opts.styles[this.cable.getType()];
        if (config && config.lineStyle && config.lineStyle.color) {
            color = config.lineStyle.color;
        }

        // Add line
        const items = [];
        items.push(this.lineItem(opts, color));

        // Add slack symbol (if necessary)
        if (this.slack) {
            items.push(this.slackItem(opts, color, -0.2));
            items.push(this.slackItem(opts, color, 0.2));
        }

        return items;
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    lineItem(opts, color) {
        // Set line style
        let style = new myw.LineStyle({
            color: color,
            width: 8,
            widthUnit: 'px'
        });
        const tickField = this.side == 'in' ? 'out_tick' : 'in_tick';
        const tickMark = this.feature.properties[tickField];

        // Add label
        if (!this.slack) {
            // Get text
            const text =
                tickMark || tickMark == 0
                    ? `${this.cable.properties.name} @${tickMark}`
                    : this.cable.properties.name;

            const textStyle = new myw.TextStyle({
                text: text,
                color: color,
                size: 0.5,
                sizeUnit: 'm',
                vAlign: 'bottom',
                vOffset: 0.03,
                placement: 'line'
            });
            style = style.plus(textStyle);
        }

        // Build geometry
        const width = 2.0; // rows
        const coords = [this.coord(opts, -width / 2), this.coord(opts, width / 2)];

        // Get tooltip
        const tooltip =
            tickMark || tickMark == 0
                ? `${this.cable.getTitle()} @${tickMark}`
                : this.cable.getTitle();

        return new SchematicItem(myw.geometry.lineString(coords), style, this.cable, tooltip, {
            highlights: [this.feature.getUrn(), this.cable.getUrn()]
        });
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    slackItem(opts, color, offset) {
        // Set draw style
        const pointStyle = new myw.SymbolStyle({
            symbol: 'circle',
            color: '#FFFFFF',
            borderColor: color,
            size: 1.8,
            sizeUnit: 'm'
        });

        return new SchematicItem(
            myw.geometry.point(this.coord(opts, offset)),
            pointStyle,
            this.slack,
            this.slack.getTitle()
        );
    }

    /**
     * Location of self's incoming link connection point
     */
    inCoord(opts) {
        const offset = this.side == 'in' ? 1 : -1;
        return this.coord(opts, offset);
    }

    /**
     * Location of self's outgoing link connection point
     */
    // Note: Side is important for internal nodes due to slacks
    outCoord(opts) {
        const offset = this.side == 'out' ? -1 : 1;
        return this.coord(opts, offset);
    }

    /**
     * Location of self in map space (a lat/long coordinate)
     */
    // Note: Side is important for internal nodes due to slacks
    coord(opts, colOffset = 0, rowOffset = 0) {
        const col = this.col + colOffset;
        const row = this.row + rowOffset;
        return opts.transform.convert([col, row]);
    }
}
