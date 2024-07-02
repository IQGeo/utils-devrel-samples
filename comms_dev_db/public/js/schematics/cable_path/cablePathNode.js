// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from 'modules/comms/js/schematics/schematicItem';

export default class CablePathNode extends myw.Class {
    /**
     * Create graph node for 'feature'
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
        let pointStyle, textStyle;

        // If style configured .. use that
        const featureType = this.feature.getType();
        if (featureType in layoutOpts.styles && this.type != 'cable') {
            const styleDef = layoutOpts.styles[featureType];

            // Get point style
            if (styleDef.pointStyle) {
                pointStyle = Object.assign(styleDef.pointStyle); // ENH: Implement style.copy()
                pointStyle.anchorX = 0;
                pointStyle.anchorY = 0;
            }

            // Get label style (overriding alignment)
            if (styleDef.textStyle) {
                textStyle = Object.assign(styleDef.textStyle);

                if (layoutOpts.layout == 'vertical') {
                    textStyle.hAlign = 'right';
                    textStyle.vAlign = 'middle';
                    textStyle.hOffset = textStyle.size; // TODO: Use icon size
                    textStyle.vOffset = 0;
                } else {
                    textStyle.hAlign = 'center';
                    textStyle.vAlign = 'bottom';
                    textStyle.hOffset = 0;
                    textStyle.vOffset = textStyle.size; // TODO: Use icon size
                    textStyle.angle = 30; // TODO: Has no effect
                }
            }
        }

        // Handle default style
        if (!pointStyle) pointStyle = this.pointStyle();

        // Build full style
        const style = new myw.Style();
        if (pointStyle) style.add(pointStyle);
        if (textStyle) style.add(textStyle);

        return new SchematicItem(
            myw.geometry.point(this.coord(layoutOpts)),
            style,
            this.feature,
            this.tooltip()
        );
    }

    /**
     * Icon to show for self (an Icon)
     */
    pointStyle() {
        const config = myw.config['mywcom.structures'][this.feature.getType()] || {};

        // Case: Structure
        if (config && config.image) {
            return new myw.IconStyle({
                iconUrl: config.image,
                size: 20,
                sizeUnit: 'px',
                anchorX: 10,
                anchorY: 10
            });
        }

        // Case: Splaice
        if (this.type == 'splice') {
            return new myw.IconStyle({
                iconUrl: 'modules/comms/images/schematics/splice.svg',
                size: 26,
                sizeUnit: 'px',
                anchorX: 16,
                anchorY: 13
            });
        }

        // Case: Other
        return new myw.IconStyle({
            iconUrl: 'modules/comms/images/schematics/blob.svg',
            size: 26,
            sizeUnit: 'px',
            anchorX: 13,
            anchorY: 13
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
    coord(layoutOpts, col) {
        col = col || this.col;
        return layoutOpts.transform.convert([this.row, this.col]);
    }
}
