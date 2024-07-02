// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from 'modules/comms/js/schematics/schematicItem';

export default class RoutePathLink extends myw.Class {
    static {
        /**
         * Conduit colours, keyed by usage threshold (%)
         */
        this.prototype.conduitColors = {
            0: '#7CD267',
            10: '#FFD966',
            20: '#FF6060'
        };
    }

    /**
     * Create link
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
    // ENH: Split this up! Add separate link class for conduits?
    item(layoutOpts) {
        // Set default style
        let lineStyle = new myw.LineStyle({ color: '#AAAAAA' });
        let textStyle;

        // If style configured .. use that instead
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

        // Set conduit style
        let tooltip = this.feature.getTitle();
        if (this.type == 'conduit') {
            if (layoutOpts.conduitCapacity) {
                // Get diameter
                const diameter = this.feature.properties.diameter || 2; // mm

                // Coumpute usage
                let usedDiameter = 0;
                for (const cable of this.cables) {
                    usedDiameter += cable.properties.diameter || diameter; // TODO: DevDB specific
                }
                const usedPercent = (usedDiameter / this.feature.properties.diameter) * 100;

                // Set line thickness
                lineStyle.width = Math.max(diameter / 200, 0.2);
                lineStyle.widthUnit = 'm';

                // Adjust label position (if showing)
                if (textStyle && layoutOpts.labels) {
                    textStyle.vOffset = lineStyle.width / 2;
                }

                // Set line colour
                for (const thresh in this.conduitColors) {
                    if (usedPercent >= thresh) lineStyle.color = this.conduitColors[thresh];
                }

                // Set tooltip
                tooltip += `<br>${diameter}mm ${usedPercent.toFixed(0)}%`;
            } else {
                lineStyle.width = 0.3;
                lineStyle.widthUnit = 'm';
            }

            if (!layoutOpts.labels) textStyle = undefined;
        }

        const style = new myw.Style();
        if (lineStyle) style.add(lineStyle);
        if (textStyle) style.add(textStyle);

        return new SchematicItem(
            myw.geometry.lineString(this.coords(layoutOpts)),
            style,
            this.feature,
            tooltip
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

        return this.feature.properties.name;
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
        const coord1 = this.coord(this.row - 1, this.col, layoutOpts);
        const coord2 = this.coord(this.row + 1, this.col, layoutOpts);
        return [coord1, coord2];
    }

    /**
     * Location of [row,col] in map space (a lat/long coordinate)
     */
    // TODO: Duplicated with node
    coord(row, col, layoutOpts) {
        return layoutOpts.transform.convert([row, col]);
    }
}
