// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from '../schematicItem';

export default class PinTraceNode extends myw.Class {
    /**
     * Create graph node for 'feature'
     *
     * 'dir' is direction relative to parent ('upstream' or 'downstream')
     */
    constructor(type, parentNode = null, feature = null, dir = null) {
        super();
        this.type = type;
        this.feature = feature;
        this.dir = dir;
        this.children = [];
        if (parentNode) parentNode.children.push(this);
    }

    /**
     * Children of self in direction 'dir'
     */
    childrenInDir(dir) {
        if (dir == 'upstream') {
            return this.children.filter(n => n.dir == 'upstream');
        } else {
            return this.children.filter(n => n.dir != 'upstream');
        }
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    item(opts) {
        // Set draw style
        const style = new myw.Style();

        // If showing labels ..
        if (opts.layout.equipmentLabels && this.feature.properties.name && this.type != 'cable') {
            // Set basic options
            const textStyle = new myw.TextStyle({
                text: this.feature.properties.name,
                size: 0.25,
                sizeUnit: 'm',
                borderWidth: 1,
                backgroundColor: '#EEEEEE'
            });

            // Adjust leaf labels
            if (opts.layout.layout == 'horizontal' && !this.children.length) {
                textStyle.hAlign = this.dir === 'upstream' ? 'right' : 'left';
                textStyle.vAlign = 'middle';
            }

            style.add(textStyle);
        } else {
            // Set basic options
            style.add(this.pointStyle());
        }

        return new SchematicItem(
            myw.geometry.point(this.coord(opts)),
            style,
            this.feature,
            this.feature.tooltip()
        );
    }

    /**
     * Style for rendering self's point
     */
    pointStyle() {
        // Case: From Config
        const config = myw.config['mywcom.equipment'][this.feature.getType()] || {};
        if (config && config.image)
            return new myw.IconStyle({
                iconUrl: config.image,
                size: 24,
                sizeUnit: 'px',
                anchorX: 50,
                anchorY: 50,
                anchorXUnit: '%',
                anchorYUnit: '%'
            });

        // Case: Splice
        if (this.type === 'conn') {
            return new myw.IconStyle({
                iconUrl: 'modules/comms/images/schematics/splice.svg',
                size: 20,
                anchorX: 50,
                anchorY: 50,
                anchorXUnit: '%',
                anchorYUnit: '%'
            });
        }

        // Case: Other
        return new myw.IconStyle({
            iconUrl: 'modules/comms/images/schematics/blob.svg',
            size: 20,
            sizeUnit: 'px',
            anchorX: 50,
            anchorY: 50,
            anchorXUnit: '%',
            anchorYUnit: '%'
        });
    }

    /**
     * Hover text for self
     */
    tooltip() {
        let tooltip = this.feature.getTitle();
        return tooltip;
    }

    /**
     * Location of self in map space (a lat/long coordinate)
     */
    coord(opts) {
        return opts.transform.convert([this.col, this.row]);
    }
}
