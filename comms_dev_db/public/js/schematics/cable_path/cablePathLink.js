// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from 'modules/comms/js/schematics/schematicItem';

export default class CablePathLink extends myw.Class {
    /**
     * Create link
     */
    constructor(type, feature, node1, node2) {
        super();
        this.type = type;
        this.feature = feature;
        this.node1 = node1;
        this.node2 = node2;
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    item(layoutOpts) {
        let lineStyle, textStyle;

        // If style configured .. use that
        const featureType = this.feature.getType();
        if (featureType in layoutOpts.styles) {
            const styleDef = layoutOpts.styles[featureType];

            // Get line style
            if (styleDef.lineStyle) {
                lineStyle = styleDef.lineStyle;
            }

            // Get label style and content
            if (styleDef.textStyle) {
                textStyle = styleDef.textStyle;
            }
        }

        // If no line style configured .. set default
        if (!lineStyle) {
            lineStyle = new myw.LineStyle({ color: '#AAAAAA', width: 3, widthUnit: 'px' });
        }

        // If no label configured .. set default
        if (!textStyle) {
            textStyle = new myw.TextStyle({
                text: this.labelText(),
                color: lineStyle.color || '#AAAAAA',
                size: 0.5,
                sizeUnit: 'm',
                vAlign: 'bottom',
                vOffset: 0.02,
                placement: 'line'
            });
        }

        // Build full style
        const style = new myw.Style(lineStyle, textStyle);

        return new SchematicItem(
            myw.geometry.lineString(this.coords(layoutOpts)),
            style,
            this.feature,
            this.feature.getTitle()
        );
    }

    /**
     * String to show next to link
     */
    labelText() {
        if (this.type == 'route' && this.feature.parent) {
            const len = this.feature.dist - this.feature.parent.dist;
            return this.displayStrFor('length', len, 'm');
        }

        if (this.feature.properties.length) {
            const len = this.feature.properties.length;
            return this.displayStrFor('length', len, 'm'); //TODO: Use DD unit
        }

        return this.feature.name;
    }

    /**
     * Format 'value' for display in GUI
     */
    // ENH: Find an easier way!
    displayStrFor(scaleName, val, unit) {
        const unitScaleDef = myw.config['core.units'][scaleName];
        const unitScale = new myw.UnitScale(unitScaleDef);
        const unitVal = unitScale.value(val, unit);
        const displayUnit = myw.applicationDefinition.displayUnits.length;

        return unitVal.toString(displayUnit, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    /**
     * Geometry
     */
    coords(layoutOpts) {
        const coord1 = this.node1.coord(layoutOpts, this.col);
        const coord2 = this.node2.coord(layoutOpts, this.col);
        return [coord1, coord2];
    }
}
