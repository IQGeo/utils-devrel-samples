// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import $ from 'jquery';
import _ from 'underscore';

/*eslint-disable no-await-in-loop*/
// Subclassed to suppress blue highlights ('current set')
class SchematicMap extends myw.MapControl {
    highlightFeature(feature) {}
    unHighlightFeature(feature) {}
    handleCurrentFeatureSet(e) {}
}

export default class SchematicControl extends myw.Control {
    static {
        this.prototype.messageGroup = 'SchematicControl';

        this.mergeOptions({
            contextmenuWidth: 130, // ENH: Compute this on the fly
            autoPan: false,
            showGrid: false // For debugging
        });
    }

    // ------------------------------------------------------------------------
    //                                 CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Initialise div and map
     */
    constructor(owner, options) {
        super(owner, options);

        // Init slots
        this.viewManager = this.app.layout.mapViewManager;
        this.styleSetCache = {};
        this.items = [];
        this.eventHandlers = [];
        this.expanded = false;

        // Create div
        this.id = 'schematic';
        this.container = $('<div>', { id: this.id, class: 'viewContainer' });
        $('#view-container-start').after(this.container);

        // Add title item
        this.titleItem = $('<div>', { class: 'viewContainerLabel' });
        this.titleItem.hide();
        this.container.append(this.titleItem);

        // Add control buttons
        this.createButtons();

        // Create map to display data
        this.map = new SchematicMap(this.app, this.id, 'schematic-world', {
            center: [0, 0],
            zoom: 10,
            contextmenuWidth: this.options.contextmenuWidth,
            crossOrigin: 'anonymous' //Added to prevent cloning on screenshots.
        });
        this.map.disableContextMenu();
        // Allow for more fine zooming.
        this.map.getView().setConstrainResolution(false);

        // Add layer to hold feature reps
        this.layer = new myw.GeoJSONVectorLayer({ map: this.map });
        this.map.setMaxZoom(25); // ENH: Set min too

        // Register with view manager
        this.viewManager.register(this.id, this.map, true);
        this.visible = false;
    }

    /**
     * Set the current schematic
     */
    async setSchematic(schematic) {
        // Get display options
        const opts = {};
        opts.layout = this.getLayoutOptsFor(schematic);
        opts.styles = await this.getFeatureStylesFor(schematic);
        opts.transform = schematic.getTransform(opts.layout);

        // Build new items (first, to minimise flashing on swap)
        const items = schematic.items(opts);
        if (this.options.showGrid && schematic.grid) {
            items.unshift(schematic.grid.item(opts));
        }

        // Swap to new schematic
        // Note: Everything after must should be synchronous
        if (this.schematic) this.clearSchematic();
        this.schematic = schematic;
        this.opts = opts;
        this.items = items;

        // Show them on map
        for (const item of this.items) {
            item.addToMap(this.map, this.layer);
        }
        this.map.enableContextMenu();

        // Set pane title
        const title = _.escape(this.schematic.title());
        this.titleItem.html('<b>' + title + '</b>');
        this.titleItem.css('left', `calc(50% - ${this.titleItem.outerWidth() / 2}px)`);
        this.titleItem.show();

        // Set map interaction
        myw.trace('schematics', 1, 'Activating:', this.schematic);
        this.schematic.activate(this);

        // Set initial highlight
        if (this.app.currentFeature) this.setCurrentFeature(this.app.currentFeature);

        // Listen for changes
        if (this.schematic.rebuild) {
            this.schematic.on('out-of-date', this.handleSchematicOutOfDate.bind(this));
        }

        this.app.on('currentFeature-deleted', this.handleCurrentFeatureDeleted.bind(this));
    }

    /**
     * Remove the current schematic (if there is one)
     * @param {Boolean} deactivate if true deactivate schematic
     * @returns
     */
    clearSchematic(deactivate = true) {
        if (!this.schematic) return;
        myw.trace('schematics', 1, 'Deactivating:', this.schematic);

        // Clear slot
        const schematic = this.schematic;
        this.schematic = undefined;
        this.currentFeature = null;

        // Clear existing interaction mode etc
        if (deactivate) schematic.deactivate(this);
        schematic.off('out-of-date');

        // Remove items from map
        for (const item of this.items) {
            item.removeFromMap(this.map, this.layer);
        }
        this.titleItem.hide();

        return schematic;
    }

    /**
     * Get cached display options for 'schematic'
     */
    getLayoutOptsFor(schematic) {
        const optsCache = this.owner.options.layoutOpts;

        // Get cached options for this type
        const key = schematic.constructor.name;
        let layoutOpts = optsCache[key];
        if (!layoutOpts) {
            layoutOpts = optsCache[key] = {};
        }

        // Handle any new ones
        for (const optDef of schematic.getOptionDefs()) {
            if (!(optDef.name in layoutOpts)) {
                layoutOpts[optDef.name] = optDef.default;
            }

            // Handle defaults for multi choice
            if (optDef.multiple) {
                optDef.items.forEach(optItem => {
                    if (!(optItem.value in layoutOpts)) {
                        layoutOpts[optItem.value] = optItem.default;
                    }
                });
            }
        }

        return layoutOpts;
    }

    /**
     * Get configured styles for 'schematic'
     */
    async getFeatureStylesFor(schematic) {
        const key = schematic.constructor.name;
        let styles = this.styleSetCache[key];

        if (!styles) {
            styles = this.styleSetCache[key] = await this._getFeatureStylesFor(schematic);
        }

        return styles;
    }

    /**
     * Read configured styles for 'schematic'
     */
    async _getFeatureStylesFor(schematic) {
        // Geo-world layers
        // ENH: Get from application?
        // ENH: Get styles for these at init
        const layerNames = [
            'mywcom_structures',
            'mywcom_conduits',
            'mywcom_cables',
            'mywcom_equipment',
            'mywcom_coax_cables',
            'mywcom_coax_equipment',
            'mywcom_copper_cables',
            'mywcom_copper_equipment'
        ];

        // Customisation layers
        for (const layerName of schematic.styleLayerNames()) {
            layerNames.push(layerName);
        }

        // Get styles
        const styles = {};
        for (const layerName of layerNames) {
            let layerDef;
            try {
                layerDef = await this.app.system.getLayerWithName(layerName);
            } catch {
                myw.trace('schematics', 1, 'No such layer:', layerName);
                continue;
            }

            for (const item of layerDef.feature_types) {
                // TODO: Check is primary geom field
                if (item.field_name) {
                    const ftrStyles = {};
                    if (item.point_style)
                        ftrStyles.pointStyle = myw.PointStyle.parse(item.point_style);
                    if (item.line_style) ftrStyles.lineStyle = myw.LineStyle.parse(item.line_style);
                    if (item.fill_style) ftrStyles.fillStyle = myw.FillStyle.parse(item.fill_style);
                    if (item.text_style) ftrStyles.textStyle = myw.TextStyle.parse(item.text_style);
                    styles[item.name] = ftrStyles;
                }
            }
        }

        return styles;
    }

    /**
     * Bounds of items of current schematic (if any)
     */
    getDataBounds() {
        let bounds;

        for (const item of this.items) {
            if (item.geom) {
                const bbox = item.geom.bbox();
                bounds = this._extendBounds(bounds, [bbox[0], bbox[1]]);
                bounds = this._extendBounds(bounds, [bbox[2], bbox[3]]);
            }
        }

        return bounds;
    }

    /**
     * Extend 'bounds' to include 'coord'
     */
    // ENH: Move to utils
    _extendBounds(bounds, coord) {
        if (!bounds) {
            return myw.latLngBounds(coord, coord);
        } else {
            bounds.extend(new myw.latLng(coord[1], coord[0]));
            return bounds;
        }
    }

    // ------------------------------------------------------------------------
    //                                MAP BUTTONS
    // ------------------------------------------------------------------------

    /**
     * Build the map buttons
     */
    createButtons() {
        const div = $('<div>', { id: 'schematic-buttons' }).appendTo(this.container);

        this.layoutButton = $(
            '<button type="button" class="schematicsCloseButton overMapButton" title="{:close}"/>'
        )
            .click(this.hide.bind(this))
            .appendTo(div);

        this.shrinkButton = $(
            '<button type="button" class="shrinkHalfButton overMapButton" title="{:shrink}"/>'
        )
            .click(this.shrink.bind(this))
            .appendTo(div);

        this.expandButton = $(
            '<button type="button" class="expandMoreButton overMapButton" title="{:expand}"/>'
        )
            .click(this.expand.bind(this))
            .appendTo(div);

        this.translate(div);
    }

    // ------------------------------------------------------------------------
    //                                  ACTIONS
    // ------------------------------------------------------------------------

    /**
     * Toggle value of boolean layout option 'name'
     */
    async toggleLayoutOption(name, resetView) {
        await this.setLayoutOption(name, !this.opts.layout[name], resetView);
    }

    /**
     * Set value of layout option 'name'
     */
    async setLayoutOption(name, value, resetView) {
        this.opts.layout[name] = value;
        await this.setSchematic(this.schematic);
        if (resetView) this.setDefaultView();
    }

    /**
     * If schematic is valid, rebuild display (keeping view unchanged) otherwise return undefined
     */
    async rebuildSchematic() {
        if (!this.schematic || !this.schematic.rebuild) return;

        myw.trace('schematics', 1, 'Rebuilding: Start:', this.schematic);

        this.schematic.deactivate(this); // Prevents multiple rebuilds

        const rebuilt = await this.schematic.rebuild();

        // case: schematic is no longer valid, do not activate and set
        if (!rebuilt) {
            this.clearSchematic(false);
            return;
        }

        this.schematic.activate(this);
        await this.setSchematic(this.schematic);

        myw.trace('schematics', 2, 'Rebuilding: End:', this.schematic);

        return this;
    }

    /**
     * Set map view to show all data
     */
    setDefaultView() {
        const bounds = this.getDataBounds();
        if (!bounds) return;

        // ENH: Use this.extendBoundsBy(bounds, 0.05) instead
        bounds.extend(myw.latLng((bounds.getNorth() + bounds.getSouth()) * -0.1, bounds.getEast()));
        const zoom = this.map.getBoundsZoom(bounds);
        myw.trace('schematics', 3, 'Setting Default View:', this.schematic, bounds, zoom);

        this.map.setView(bounds.getCenter(), zoom);
    }

    /**
     * Helper to extend myw.lngLatBounds 'bounds' by fac
     */
    // ENH: Support on  myw.lngLatBounds
    extendBoundsBy(bounds, fac) {
        const width = bounds.getEast() - bounds.getWest();
        const height = bounds.getNorth() - bounds.getSouth();

        const min = new myw.latLng(
            bounds.getWest() - width * fac,
            bounds.getSouth() - height * fac
        );
        const max = new myw.latLng(
            bounds.getEast() + width * fac,
            bounds.getNorth() + height * fac
        );
        bounds.extend(min);
        bounds.extend(max);
    }

    /**
     * Add self to display
     */
    show() {
        // Display self
        if (this.expanded) {
            this.viewManager.showInFull(this.id);
        } else {
            this.viewManager.show(this.id);
        }
        this.visible = true;
        this.refresh();

        // Listen for highlight events etc
        this.setAppEventHandlers();
    }

    /**
     * Remove self from display
     */
    hide() {
        // Stop listening for highlight events etc
        this.removeAppEventHandlers();

        // Remove and existing highlight
        this.setCurrentFeature(null);

        // Hide self
        this.viewManager.hide(this.id);
        this.visible = false;
    }

    /**
     * Expand view to fill screen
     */
    expand() {
        if (this.viewManager.showInFull(this.id)) {
            this.expandButton.hide();
            this.shrinkButton.show();
            this.expanded = true;
            this.refresh();
        }
    }

    /**
     * Shink view to half fill screen
     */
    shrink() {
        if (this.viewManager.show(this.id)) {
            this.expandButton.show();
            this.shrinkButton.hide();
            this.expanded = false;
            this.refresh();
        }
    }

    /**
     * Re-centre and redraw map
     */
    refresh() {
        if (this.map) this.map.invalidateSize();
    }

    // ------------------------------------------------------------------------
    //                                 EVENT HANDLING
    // ------------------------------------------------------------------------

    /**
     * Listen for application events
     */
    setAppEventHandlers() {
        this.handleEvent(this.app, 'highlight-feature', evt =>
            this.highlightFeature(evt.feature, true)
        );
        this.handleEvent(this.app, 'unhighlight-feature', evt =>
            this.highlightFeature(evt.feature, false)
        );
        this.handleEvent(this.app, 'comms-highlight-feature', evt =>
            this.highlightFeature(evt.feature, true)
        );
        this.handleEvent(this.app, 'comms-unhighlight-feature', evt =>
            this.highlightFeature(evt.feature, false)
        );
        this.handleEvent(
            this.app,
            'comms-highlight-features',
            evt => this.highlightFeatures(evt.urns, true) // splices nodes
        );
        this.handleEvent(
            this.app,
            'comms-unhighlight-features',
            evt => this.highlightFeatures(evt.urns, false) // splice nodes
        );
        this.handleEvent(this.app, 'currentFeature-changed', evt =>
            this.setCurrentFeature(evt.feature)
        );
    }

    /**
     * Stop listening for application events
     */
    removeAppEventHandlers() {
        this.removeEventHandlers(this.app);
    }

    /**
     * Set the currently selected feature
     */
    setCurrentFeature(feature) {
        if (this.currentFeature) {
            this.highlightFeature(this.currentFeature, false);
        }
        this.currentFeature = feature;
        if (this.currentFeature) {
            this.highlightFeature(this.currentFeature, true);
        }
    }

    /**
     * Highlight or unhighlight 'feature'
     */
    highlightFeature(feature, highlight) {
        const urn = feature.getUrn();
        myw.trace('schematics', 4, 'Highlight', urn, highlight);
        this._highlightItem(urn, highlight);
    }

    /**
     * Highlight or unhighlight 'feature urns'
     * Used for splice nodes in equipment tree
     */
    highlightFeatures(urns, highlight) {
        urns.forEach(urn => {
            this._highlightItem(urn, highlight);
        });
    }

    /**
     * Highlight or unhighlight schematic item with 'urn'
     * @param {String} urn
     * @param {Boolean} highlight
     */
    _highlightItem(urn, highlight) {
        for (const item of this.items) {
            // ENH: Build lookup table
            if (item.highlights.includes(urn)) {
                if (highlight) {
                    item.highlight(this.map, this.layer);
                } else {
                    item.unhighlight(this.map, this.layer);
                }
            }
        }
    }

    /**
     * Handle deletion of current feature. We force clear the schematic.
     * handleSchematicOutOfDate is not suitable as reference to deleted feature is still available
     */
    handleCurrentFeatureDeleted() {
        myw.trace('schematics', 1, 'currentFeature-delected detected:', this.schematic);
        this.clearSchematic(false);
    }

    /**
     * Called when schematic detects it is dirty
     */
    async handleSchematicOutOfDate() {
        // ENH: Remove event listener when not visible?
        myw.trace('schematics', 1, 'Out-of-date detected:', this.schematic);
        if (this.visible) {
            try {
                await this.rebuildSchematic();
            } catch (e) {
                // This can happen if feature has been deleted and request made to get the features contents
                // ENH See if we can avoid this request.
                myw.trace('schematics', 1, 'failed to rebuild schematic', e.message);
            }
        }
    }

    /**
     * Register an event handler on 'target' (and remember)
     */
    handleEvent(target, event, handler) {
        target.on(event, handler);
        this.eventHandlers.push([target, event, handler]);
    }

    /**
     * Unregister all event handlers on 'target'
     */
    removeEventHandlers() {
        for (const [target, event, handler] of this.eventHandlers) {
            target.off(event, handler);
        }
        this.eventHandlers = [];
    }

    /**
     *  Exports the schematic by repositioning the schematic to the center of the map and ajusting
     *  the resolution.
     *
     *  ENH: Allow aspect ratio to be based in. This function should not have knowldege of the
     *  needed aspect ratio.
     */
    async export(options = { format: 'canvas' }) {
        return new Promise(resolve => {
            // Grab values from map so that they can be set after the export.
            const size = this.map.getSize();
            const bounds = this.map.getLayers().getArray()[1].getSource().getExtent();
            const width = bounds[2] - bounds[0];
            const height = bounds[3] - bounds[1];
            const zoom = this.map.getZoom();

            //Increase the size by increasing the resolution. (Some browsers do not allow for the canvas to exceed the size of the display)
            const resolution = window.screen.width * window.screen.height; //ENH: Find a better way to calculate resolution.

            //ENH: These values can be passed in.
            //Aspect ratios are set to fit in a letter size print out.
            const ratio = width < height ? 0.88 : 1.8;

            //Use the resolution and ratio to determine the size to export.
            const dimensions = [
                Math.round(Math.sqrt(resolution * ratio)),
                Math.round(resolution / Math.sqrt(resolution * ratio))
            ];

            const padding = Math.max(dimensions[0], dimensions[1]) / 15; //Determine padding based on dimensions.

            this.map.once('rendercomplete', () => {
                this.map.takeScreenshot({ format: options.format }).then(screenShot => {
                    resolve(screenShot);
                    this.map.setSize(size);
                    this.map.setZoom(zoom);
                });
            });

            //Ajust the size of the map.
            this.map.setSize(dimensions);
            this.map.getView().fit(bounds, {
                padding: [padding, padding, padding, padding],
                size: dimensions
            });
        });
    }
}
