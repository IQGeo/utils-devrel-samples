// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from 'modules/comms/js/schematics/schematicItem';

export default class RoutePathNode extends myw.Class {
    /**
     * Create graph node for 'feature'
     * 'dir' is direction relative to parent ('upstream' or 'downstream')
     */
    constructor(type, feature, row, col) {
        super();
        this.type = type;
        this.feature = feature;
        this.row = row;
        this.col = col;
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    item(layoutOpts) {
        // Get style
        const style = new myw.Style();

        const featureType = this.feature.getType();
        if (featureType in layoutOpts.styles) {
            const styleDef = layoutOpts.styles[featureType];

            if (styleDef.pointStyle) {
                // PORT: Suppress rotation
                style.add(styleDef.pointStyle);
            }

            if (styleDef.textStyle) {
                const textStyle = myw.TextStyle.parse(styleDef.text_style);

                // Override label position
                if (layoutOpts.layout == 'vertical') {
                    textStyle.hAlign = 'right';
                    textStyle.vAlign = 'middle';
                    textStyle.hOffset = textStyle.size * 2; // TODO: Use icon size
                    textStyle.vOffset = 0;
                } else {
                    textStyle.hAlign = 'center';
                    textStyle.vAlign = 'bottom';
                    textStyle.hOffset = 0;
                    textStyle.vOffset = textStyle.size * 2; // TODO: Use icon size
                    textStyle.angle = 30; // TODO: Has no effect
                }

                style.add(textStyle);
            }
        } else {
            style.add(this.pointStyle());
        }

        return new SchematicItem(
            myw.geometry.point(this.coord(layoutOpts)),
            style,
            this.feature,
            this.feature.tooltip()
        );
    }

    /**
     * Icon to show for self (an OpenLayers Icon)
     */
    pointStyle() {
        // Case: From Config
        const config = myw.config['mywcom.structures'][this.feature.getType()] || {};
        if (config && config.image)
            return new myw.IconStyle({
                iconUrl: config.image,
                size: 20,
                sizeUnit: 'px',
                anchorX: 10,
                anchorY: 10
            });

        // Case: Junction or dummy
        return new myw.IconStyle({
            iconUrl: 'modules/comms/images/schematics/splice.svg',
            size: 30,
            sizeUnit: 'px',
            anchorX: 15,
            anchorY: 15
        });
    }

    /**
     * Hover text for self
     */
    tooltip() {
        let tooltip = this.feature.getTitle();
        // tooltip += ` [${this.row},${this.col}] ${this.dir}`; // TODO: DEBUG
        return tooltip;
    }

    /**
     * Set position in [row,col] space
     */
    setPosition(row, col) {
        this.row = row;
        this.col = col;
    }

    /**
     * Location of self in map space (a lat/long coordinate)
     */
    coord(layoutOpts) {
        return layoutOpts.transform.convert([this.row, this.col]);
    }
}
