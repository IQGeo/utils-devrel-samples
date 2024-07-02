// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Menu from '../base/menu';
import inactiveContextMenuItem from 'images/inactiveContextMenuItem.png';
import activeContextMenuItem from 'images/activeContextMenuItem.png';

export default class SchematicMode extends myw.MapInteractionMode {
    static {
        this.prototype.messageGroup = 'SchematicMode';
    }

    // ------------------------------------------------------------------------
    //                                 CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Initialize slots of self
     *
     * 'view' is a SchematicControl
     */
    constructor(map, view, schematic, autoPan) {
        super(map);
        this.app = map.app;
        this.schematic = schematic;
        this.autoPan = autoPan;
        this.defaultContextMenu = this.defaultContextMenu(view, view.opts.layout);
        this.olListeners = [];
    }

    /**
     * Called when self is activated
     */
    enable() {
        this.map.on('feature-mouseover', this.handleMouseOver.bind(this), this);
        this.olOn(this.map.contextmenu, 'open', this.setContextMenu.bind(this));
    }

    /**
     * Called when self is deactivated
     */
    disable() {
        this.map.off('feature-mouseover', this.handleMouseOver.bind(this), this);
        this.olAllOff();
    }

    // ------------------------------------------------------------------------
    //                                 CONTEXT MENU
    // ------------------------------------------------------------------------

    /**
     * Called before context menu is activated
     */
    setContextMenu(event) {
        const item = this.schematicItemAt(event);

        // Find menu items to show
        let menu = this.defaultContextMenu;
        if (item && item.contextMenu) menu = item.contextMenu;

        // Set them as current context menu
        this.map.contextmenu.clear();
        for (const menuItem of menu.olItems()) {
            this.map.contextmenu.push(menuItem);
        }
    }

    /**
     * The schematic item at the location of 'event' (if any)
     */
    schematicItemAt(event) {
        const olFeatures = this.olFeaturesAt(event.pixel);
        for (const olFeature of olFeatures) {
            if (olFeature._rep && olFeature._rep.schematicItem) return olFeature._rep.schematicItem;
        }
    }

    // ------------------------------------------------------------------------
    //                               DEFAULT CONTEXT MENU
    // ------------------------------------------------------------------------

    /**
     * Map context menu for current schematic (a Menu)
     */
    defaultContextMenu(view, layoutOpts) {
        const spacerIcon = inactiveContextMenuItem; // Just to align

        const menu = new Menu(this.messageGroup, spacerIcon);

        // Add generic options
        menu.addItem(1, 'reset_view', view.setDefaultView.bind(view));

        // Add custom options
        for (const optDef of this.schematic.getOptionDefs()) {
            if (optDef.items && optDef.multiple) {
                this.addMenuMultiChoiceItem(menu, optDef, layoutOpts, view);
            } else if (optDef.items) {
                this.addMenuChoiceItem(menu, optDef, layoutOpts[optDef.name], view);
            } else {
                this.addMenuToggleItem(menu, optDef, layoutOpts[optDef.name], view);
            }
        }

        // Add rebuild (if supported)
        if (this.schematic && this.schematic.rebuild) {
            menu.addItem(1, 'rebuild', view.rebuildSchematic.bind(view));
        }

        return menu;
    }

    /**
     * Add context menu entry for multi choice option 'optDef'
     */
    addMenuMultiChoiceItem(menu, optDef, layoutOpts, view) {
        const icons = {
            true: activeContextMenuItem,
            false: inactiveContextMenuItem
        };
        const submenu = new Menu();
        optDef.items.forEach(optItem => {
            const label = optItem.text || optItem.value;

            submenu.addItem(
                1,
                optItem.value,
                view.toggleLayoutOption.bind(view, optItem.value, optDef.resetView),
                true,
                label,
                icons[!!layoutOpts[optItem.value]]
            );
        });
        menu.addSubMenu(1, optDef.name, submenu, true, optDef.text);
    }

    /**
     * Add context menu entry for choice option 'optDef'
     */
    // ENH: Provide helpers on menu class
    addMenuChoiceItem(menu, optDef, optValue, view) {
        const icons = {
            true: activeContextMenuItem,
            false: inactiveContextMenuItem
        };
        const submenu = new Menu();

        // Build submenu
        for (let itemDef of optDef.items) {
            if (!itemDef.value) {
                itemDef = { value: itemDef };
            }
            submenu.addItem(
                1,
                itemDef.value,
                view.setLayoutOption.bind(view, optDef.name, itemDef.value, optDef.resetView),
                true,
                itemDef.text || itemDef.value,
                icons[optValue == itemDef.value]
            );
        }

        // Add it
        menu.addSubMenu(1, optDef.name, submenu, true, optDef.text);
    }

    /**
     * Add context menu entry for boolean option 'optDef'
     */
    addMenuToggleItem(menu, optDef, optValue, view) {
        const icons = {
            true: activeContextMenuItem,
            false: inactiveContextMenuItem
        };

        const label = optDef.text || optDef.name;

        menu.addItem(
            1,
            optDef.name,
            view.toggleLayoutOption.bind(view, optDef.name, optDef.resetView),
            true,
            label,
            icons[!!optValue]
        );
    }

    // ------------------------------------------------------------------------
    //                                 MOUSE EVENTS
    // ------------------------------------------------------------------------

    /**
     * Called when user clicks on map
     */
    handleMapClick(event) {
        // If over an item .. highlight on main map
        const reps = event.featureReps;
        if (reps && reps.length) {
            this.app.setCurrentFeature(reps[0].feature, { keepFeatureSet: true, zoomTo: true });
        }
    }

    /**
     * Called when user moves mouse
     */
    handleMouseOver(event) {
        // Clear existing highling
        if (this.currentFeature) {
            this.app.fire('unhighlight-feature', { feature: this.currentFeature });
            this.currentFeature = undefined;
        }

        // If over an item .. highlight on main map
        const rep = event.featureRep;
        if (rep) {
            if (this.autoPan) this.ensureVisibleOnGeoMap(rep.feature);
            this.app.fire('highlight-feature', { feature: rep.feature });
            this.map.highlightFeature(rep.feature);
            this.currentFeature = rep.feature;
        }
    }

    /**
     * Ensure 'feature' is visible on geo world map
     */
    ensureVisibleOnGeoMap(feature) {
        const bbox = feature.getGeometryInWorld('geo').bbox();
        const bounds = new myw.latLngBounds([
            [bbox[0], bbox[1]],
            [bbox[2], bbox[3]]
        ]);

        if (!this.app.map.getBounds().intersects(bounds)) {
            this.app.map.panTo(bounds.getCenter());
        }
    }

    // -------------------------------------------------------------------------
    //                          OPENLAYERS HELPERS
    // -------------------------------------------------------------------------

    /**
     * The OpenLayers features at 'pixel'
     */
    olFeaturesAt(pixel) {
        const olFeatures = [];
        this.map.forEachFeatureAtPixel(pixel, function (olFeature, layer) {
            olFeatures.push(olFeature);
        });
        return olFeatures;
    }

    /**
     * Add listener for an OpenLayers event
     */
    // TBR: Workaround for annoying OL event API
    olOn(olObject, eventType, callback) {
        const listener = olObject.on(eventType, callback);
        this.olListeners.push([olObject, eventType, callback]);
        return listener;
    }

    /**
     * Remove all OpenLayers event listeners
     */
    olAllOff() {
        for (const [olObject, eventType, callback] of this.olListeners) {
            olObject.un(eventType, callback);
        }
        this.olListeners = [];
    }
}
