// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicItem from '../schematicItem';

export default class PinTraceLink extends myw.Class {
    /**
     * Create link from node1 to node2
     */
    constructor(node1, node2, feature) {
        super();
        this.node1 = node1;
        this.node2 = node2;
        this.feature = feature;
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    item(opts) {
        // Build geometry
        let coords = [this.node1.coord(opts), this.node2.coord(opts)];

        // Build line style
        const style = new myw.Style();
        // ENH: Make style depend on link type
        const lineStyle = new myw.LineStyle({ color: '#AAAAAA', width: 3 });
        style.add(lineStyle);

        if (opts.layout.cableLabels || opts.layout.locLabels) {
            // Build label text and style
            const textStyle = new myw.TextStyle({
                text: this.labelText(opts.layout.locLabels),
                color: '#AAAAAA',
                size: 0.15,
                sizeUnit: 'm',
                vAlign: 'bottom',
                vOffset: 0.02,
                placement: 'line'
            });
            style.add(textStyle);
        }

        return new SchematicItem(
            myw.geometry.lineString(coords),
            style,
            this.feature,
            this.feature.tooltip()
        );
    }

    /**
     * String to show next to link
     */
    labelText(locLabel) {
        if (this.feature.properties.name && this.feature.fibers) {
            if (this.feature.loc && locLabel) {
                return `${this.feature.loc}`; // Case: Cable
            }
            return `${this.feature.properties.name} #${this.feature.fibers}`; // Case: Cable
        } else {
            const fromStr = this.feature.from_ || ''; // Case: Connection
            return fromStr.replace('Fibers: ', '');
        }
    }
}
