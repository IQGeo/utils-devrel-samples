// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { Plugin } from 'myWorld-client';
import ToolsPaletteControl from './toolsPaletteControl';

class ToolsModePlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'ToolsModePlugin';

        this.prototype.buttons = {
            toggle: class extends myw.PluginButton {
                static {
                    this.prototype.id = 'a-tools-mode';
                    this.prototype.titleMsg = 'toolbar_msg'; //for automated tests
                    this.prototype.imgSrc = 'modules/comms/images/toolbar/tools_mode.svg';
                }

                initUI() {
                    this.setState();
                    this.listenTo(this.owner, 'changed-state', this.setState);
                }

                setState() {
                    this.$el.toggleClass('inactive', !this.owner.active);
                    this.$el.toggleClass('active', this.owner.enabled);
                }

                action() {
                    if (this.$el.hasClass('inactive')) return;
                    this.owner.toggle();
                }
            }
        };
    }

    /**
     * @class Provides palette for activating productivity tools
     *
     * Each productivity tool is itself a plugin. Tools are registered with self using the
     * toolButtons initialisation option (a list of plugin button IDs).
     *
     * This class controls which buttons are displayed in the palette, based on database editability etc.
     * Also maintains a set of currently active tools
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.paletteId = 'mywcom-tools-palette';
        this.toolButtonIds = this.options.toolButtons || [];

        // Find mapping from button -> plugin
        this.toolPluginIds = {};

        this.toolButtonIds.map(buttonId => {
            const buttonIdParts = buttonId.split('.');
            if (buttonIdParts.length > 1) {
                const pluginId = buttonIdParts[0];
                this.toolPluginIds[buttonId] = pluginId;
            } else {
                console.log('Bad plugin button: ' + buttonId); // ENH: Better to throw error?
            }
        });

        // Set initial state
        this.active = true;
        this.enabled = false;
        this.activeTools = [];
        this.dbEditable = true; // Gets updated by StateManagerPlugin, if active
    }

    /**
     * Show or hide palette
     */
    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    /**
     * Open palette, open active tools
     */
    enable() {
        this.app.setApplicationMode(this);
        this.enabled = true;

        this.createPalette(this.enabledButtons());
        this.trigger('changed-state');

        // Re-activate previously active tools
        // TODO: Only if they are still enabled
        for (const plugin of this.activeTools) {
            if (this.pluginEnabled(plugin)) plugin.activate();
        }
    }

    /**
     * Close palette and active tools
     */
    disable() {
        this.app.layout.centerLayout.close('east');
        this.enabled = false;
        this.trigger('changed-state');

        // Remember active tools
        this.activeTools = this.getActiveTools();

        // Close them
        for (const plugin of this.activeTools) {
            plugin.deactivate();
        }
    }

    /**
     * Build list of enabled plugins based on application state
     *
     * Called by StateManagerPlugin when design state changes etc
     */
    // ENH: Rename as updateState() or similar
    async setActive(dbEditable) {
        this.dbEditable = dbEditable;
        if (this.palette) this.updatePalette(this.enabledButtons());
        this.trigger('changed-state');

        // Close any plugins that are no longer enabled
        for (const plugin of this.getActiveTools()) {
            if (!this.pluginEnabled(plugin)) plugin.deactivate();
        }
    }

    /**
     * List of enabled buttons (in display order)
     */
    enabledButtons() {
        const buttons = [];

        for (const buttonId of this.toolButtonIds) {
            const plugin = this.pluginFor(buttonId);
            if (plugin && this.pluginEnabled(plugin)) {
                buttons.push(buttonId);
            }
        }

        return buttons;
    }

    /*
     * The tools that are currently active (a list of plugins)
     */
    getActiveTools() {
        const activeTools = [];

        for (const buttonId of this.toolButtonIds) {
            const plugin = this.pluginFor(buttonId);
            if (plugin && plugin.isActive && plugin.isActive()) activeTools.push(plugin);
        }

        return activeTools;
    }

    /**
     * The plugin for 'buttonId' (if there is one)
     */
    pluginFor(buttonId) {
        const pluginId = this.toolPluginIds[buttonId];
        if (!pluginId) return;
        return this.app.plugins[pluginId];
    }

    /**
     * True if 'plugin' can be activate for current DB state
     */
    pluginEnabled(plugin) {
        return this.dbEditable || !plugin.onlyEdit;
    }

    /**
     * Build / rebuild the palette
     */
    createPalette(buttons) {
        if (this.app.layout.centerLayout.panes.east)
            this.app.layout.centerLayout.panes.east.remove();
        $('<div>', {
            id: this.paletteId,
            class: 'ui-layout-east mywcom-palette-container z-index-1'
        }).prependTo($('#layout-map-view'));

        Object.assign(this.app.layout.centerLayout.options.east, {
            paneSelector: `#${this.paletteId}`,
            size: this.largePalette ? '250' : '125',
            spacing_open: 0,
            spacing_closed: 1,
            resizeWhileDragging: false,
            slidable: false,
            resizable: false,
            closable: true,
            resizeWithWindow: false,
            enableCursorHotkey: false,
            initHidden: false,
            hideToggleOnSlide: false,
            togglerLength_open: 0,
            togglerLength_closed: 0
        });

        this.app.layout.centerLayout.addPane('east');
        delete this.palette; //Since we are creating a brand new palette

        this.palette = new ToolsPaletteControl(this, {
            divId: this.paletteId,
            toolButtons: buttons
        });
    }

    /**
     * Update palette choices
     */
    updatePalette(buttons) {
        this.palette.options.toolButtons = this.enabledButtons();
        this.palette.render();
    }
}

export default ToolsModePlugin;
