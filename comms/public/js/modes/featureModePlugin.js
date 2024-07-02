// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';
import FeatureModePluginButton from './featureModePluginButton';

class FeatureModePlugin extends myw.Plugin {
    static {
        // These need to be set by subclass
        this.prototype.messageGroup = '';

        this.prototype.paletteId = '';
        this.prototype.paletteListOption = '';
        this.prototype.pluginId = '';

        this.mergeOptions({
            autoSave: true
        });

        // Plugin button to display on toolbar. Subclass must define and set appropriate imgSrc
        this.prototype.buttons = {
            toggle: class extends FeatureModePluginButton {
                static {
                    this.prototype.imgSrc = '';
                }
            }
        };
    }

    /**
     * @class Provides parent class for a mode and palette for features.
     * @param {Application} owner The application that owns the plugin
     * @param {Object} options Options for the plugin configuration.
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.paletteList = this.options[this.paletteListOption] || [];
        this.active = true;
        this.enabled = false;
    }

    /**
     *  Return state to be retained over application restarts
     *  @returns {Object}
     */
    getState() {
        const state = {};
        state[this.paletteListOption] = this.paletteList;
        return state;
    }

    /**
     * Sets active state of self
     * @param {boolean} active
     */
    async setActive(active) {
        this.active = active;
        if (this.enabled) this.disable();
        this.trigger('changed-state');
    }

    /**
     * Toggles enabled state of self
     */
    toggle() {
        const currentFeature = this.app.currentFeature;
        if (this.enabled) {
            // Case: inserting a feature, warn
            if (currentFeature && currentFeature.isNew) {
                this.confirmDialog();
            } else this.disable();
        } else this.enable();
    }

    /**
     * Opens confirmation dialog, if next mode is passed, enable it, if confirmed
     * @param {ApplicationMode} nextMode
     */
    confirmDialog(nextMode = null) {
        const title = this.msg('changing_from_mode');

        const confirmCallback = () => {
            this.app.featureNavigation.updateResults('previous');
            if (nextMode) {
                nextMode.enable();
            } else {
                this.disable();
            }
        };

        return myw.confirmationDialog({
            title: title,
            msg: this.msg('confirm_mode_change', {
                featureType: this.app.currentFeature.getTypeExternalName()
            }),
            confirmCallback: confirmCallback
        });
    }

    /**
     * Open palette, switch to edit mode
     */
    enable() {
        // Case: coming from another mode with unsaved new feature, warn
        if (
            this.app.applicationMode &&
            this.app.applicationMode.readyToDisable &&
            !this.app.applicationMode.readyToDisable()
        ) {
            this.app.applicationMode.confirmDialog(this);
            return;
        }

        this.enabled = true;
        this.app.setApplicationMode(this);
        this._createPalette();

        // Go into edit mode
        this._setEditMode();

        this.owner.app.recordFunctionalityAccess(`comms.palette.${this.constructor.name}`);
        this.trigger('changed-state');
    }

    /**
     * Close palette and remove edit mode
     * @param {Object} options
     */
    disable(options = { disableEditMode: true }) {
        if (!this.readyToDisable()) {
            return;
        }
        this.enabled = false;
        this.trigger('changed-state');
        if (options.disableEditMode) this.app.setEditMode(false);

        this.app.layout.centerLayout.close('east');
    }

    /**
     * If inserting new, unsaved feature return false
     * @returns Boolean
     */
    readyToDisable() {
        const currentFeature = this.app.currentFeature;
        if (currentFeature && currentFeature.isNew) return false;
        else return true;
    }

    /**
     *  Creates palette UI container
     */
    _createPalette() {
        if (this.app.layout.centerLayout.panes.east)
            this.app.layout.centerLayout.panes.east.remove();
        $('<div>', {
            id: this.paletteId,
            class: 'ui-layout-east mywcom-palette-container z-index-1'
        }).prependTo($('#layout-map-view'));

        Object.assign(this.app.layout.centerLayout.options.east, {
            paneSelector: '#' + this.paletteId,
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
        this._populatePalette(this.app.currentFeature);
    }

    /**
     * Fills palette with buttons
     * @param {MywFeature} feature -  Can be used to filter contents of palette
     * @abstract
     */
    _populatePalette(feature) {}

    /**
     * Set edit mode
     */
    _setEditMode() {}

    /**
     * Add feature to palette
     * @param {MywFeature} feature
     */
    addToPaletteList(feature) {
        this.paletteList.push(feature);
        this._populatePalette(this.app.currentFeature);
    }

    /**
     * Restore saved palette list from application state for this
     * plugin.
     */
    async _restoreSavedPaletteList() {
        let paletteList;
        const appState = await this.app.getSavedState(true, true);

        if (appState && appState.plugins[this.pluginId]) {
            paletteList = appState.plugins[this.pluginId][this.paletteListOption];
        }

        this.paletteList = paletteList || [];
    }
}

export default FeatureModePlugin;
