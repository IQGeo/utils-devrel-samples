// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class SchematicItem extends myw.Class {
    static {
        this.prototype.highlightColor = '#FF0000';
    }

    /**
     * Create from geometry, style and feature
     *
     * Supported options are:
     *   contextMenu:   A Menu object
     *   highlights: A list of URNs
     */
    // ENH: Make feature optional
    constructor(geom, style, feature, tooltip = null, options = {}) {
        super();
        this.urn = feature.getUrn();
        this.geom = geom;
        this.style = style;
        this.feature = feature;
        this.tooltip = tooltip;
        this.contextMenu = options.contextMenu;
        this.highlights = options.highlights || [this.urn];
        this.highlightLevel = 0;
    } // ENH:  Get from settings

    /**
     * String to show in trace messages
     */
    toString() {
        return `${this.constructor.name}(${this.urn})`;
    }

    /**
     * Display self on 'map'
     */
    addToMap(map, layer) {
        this.rep = this.buildRep(map, layer, this.style);
        this.rep.addToMap(map);
    }

    /**
     * Highlight self on 'map' (if necessary)
     */
    highlight(map, layer) {
        if (!this.highlightLevel) {
            const style = this.highlightStyleFor(this.style);
            this.highlightRep = this.buildRep(map, layer, style);
            this.highlightRep.addToMap(map);
        }
        this.highlightLevel++;
    }

    /**
     * Unhighlight self on 'map' (if necessary)
     */
    unhighlight(map, layer) {
        this.highlightLevel--;
        if (!this.highlightLevel) {
            this.highlightRep.removeFromMap();
        }
    }

    /**
     * Remove self from 'map'
     */
    removeFromMap(map, layer) {
        if (this.rep) {
            this.rep.removeFromMap();
            this.rep = null;
        }
        if (this.highlightRep) {
            this.highlightRep.removeFromMap();
            this.highlightRep = null;
        }
    }

    /**
     * Build map-displayable representation of self
     */
    // ENH: Replace feature rep by geoms when Core style support extended
    buildRep(map, layer, style) {
        const world = map.worldId;

        // Add geometry to feature
        // ENH: Remove need for this
        if (!this.feature.secondary_geometries) this.feature.secondary_geometries = {};
        const geomFieldName =
            'schematic_geom_' + Object.keys(this.feature.secondary_geometries).length; // ENH: Clear on rebuild

        this.feature.secondary_geometries[geomFieldName] = {
            world_type: world,
            world_name: world,
            type: this.geom.type,
            coordinates: this.geom.coordinates
        };

        // Build feature rep
        const opts = {};
        opts.worldName = world;
        opts.geomFieldName = geomFieldName;
        opts.styles = {};
        opts.styles.normal = style.olStyle(map.getView());
        opts.vectorSource = layer.getSource();

        const rep = new myw.FeatureRepresentation(this.feature, opts);

        // Set tooltip
        if (this.tooltip) {
            rep.bindTooltip(this.tooltip);
        }

        // Set owner
        rep.schematicItem = this;

        return rep;
    }

    /**
     * Builds version of 'style' for highlighting self on map
     */
    highlightStyleFor(style) {
        let hStyle;

        if (style.styles) {
            hStyle = new myw.Style();
            for (const subStyle of style.styles) {
                hStyle.add(this.highlightStyleFor(subStyle));
            }
        } else {
            hStyle = new style.constructor(style);

            if (style.type == 'icon') {
                hStyle.color = this.highlightColor;
                hStyle.size *= 1.5;
            } else {
                if (style.color && style.color != '#FFFFFF') hStyle.color = this.highlightColor;
                if (style.borderColor) hStyle.borderColor = this.highlightColor;
                hStyle.opacity = 0.8;
            }
        }

        return hStyle;
    }
}
