// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import _ from 'underscore';
import myw from 'myWorld-client';
import FeaturePaletteButton from './featurePaletteButton';
import React from 'react';

import PaletteTooltip from './paletteTooltip';
import ReactDOM from 'react-dom/client';
import Route from '../models/route';

// Timer for long touch detection
let timerLongTouch;
// Long touch flag for preventing "normal touch event" trigger when long touch ends
let longTouch = false;

class FeaturePaletteControl extends myw.Control {
    static {
        this.prototype.messageGroup = '';
    }

    /**
     * @class  Palette for features. Provides buttons for activating editors and pre-populating selected fields.
     * Also supports placement of assemblies.
     * Content is configured by user using 'Add' button. Permitted object types are defined in settings.
     * @name FeaturePaletteControl
     * @example:
     *
     * @param  {Plugin}   owner
     * @param  {bool}     autoSave
     * @param  {object}   options
     * @param  {string}   options.divId    Id of the div where the palette should be created
     * @constructs
     * @extends {Control}
     */
    constructor(owner, autoSave, options) {
        super(owner, options);
        this.autoSave = autoSave;

        this.msg = this.owner.msg;
        this.setupConfigs();

        this.defaultImage = 'modules/comms/images/features/default.svg';

        this.render();
    }

    /**
     * Setup configuration for palette.
     * @abstract
     */
    setupConfigs() {}

    /**
     * Render UI
     */
    render() {
        const buttonList = $('<ul>', { id: this.owner.paletteId });
        this.$el.html(buttonList);

        let paletteBtn;
        this.paletteBtns = {};

        if (!this.owner.paletteList.length) {
            buttonList.append(`<div class="palette-msg">${this.msg('palette_empty')}</div>`);
        }

        // Build list of structure types currently available
        const structTypes = [];
        Object.keys(this.featureConfigs).forEach(key => {
            structTypes.push(key);
        });

        this.owner.paletteList.forEach(struct => {
            if (structTypes.includes(struct.feature_type)) {
                paletteBtn = new FeaturePaletteButton({ owner: this, model: struct });

                this.paletteBtns[struct.name] = paletteBtn;
                buttonList.append(paletteBtn.$el);
            }
        });

        this._configureMenu();
    }

    /**
     * Adds current feature to palette
     * @param {boolean} full If full substructure is to be added as well.
     *
     */
    async addCurrentObjToPalette(full = false) {
        const modePlugin = this.owner,
            feature = this.owner.app.currentFeature;
        if (feature) {
            let objDetails = await this.createObjectForPalette(feature, full);
            modePlugin.addToPaletteList(objDetails);
        }
    }

    /**
     * To be called when user clicks a button in palette
     * @param {Object} model Description of object to add
     * @param {boolean} isEquipment
     * @param {Object} options
     */
    async addFeature(model, isEquipment = false, options = {}) {
        const app = this.app;
        const detachedFeature = await app.database.createDetachedFeature(model.feature_type, true);

        detachedFeature.properties = { ...detachedFeature.properties, ...model.properties };

        // Wipe, id & name from the properties
        delete detachedFeature.properties[detachedFeature.keyFieldName];
        delete detachedFeature.properties['name'];

        app.setCurrentFeature(detachedFeature);
    }

    /**
     * Returns a json to used to save feature details the palette.
     * Saves the full assembly(all equipment and linear features down the heirarchy) if the full flag is true
     *
     * @param {MywFeature} feature
     * @param {boolean} full
     * @returns {Object}
     */
    async createObjectForPalette(feature, full) {
        const modePlugin = this.owner;
        const properties = { ...feature.getProperties() };

        // Wipe uniques properties
        this._deleteKeysFrom(
            [feature.keyFieldName, 'name', 'myw_orientation_location', 'circuits'],
            properties
        );
        const name = full ? this.msg('assembly') : feature.getTypeExternalName();
        let objDetails = {
            feature_type: feature.getType(),
            name: this._getUniqueNameForList(name, modePlugin.paletteList),
            properties
        };
        if (full && feature.featureDD.fields.equipment) {
            const equips = await feature.followRelationship('equipment');
            objDetails['equipment'] = [];
            equips.forEach(async equip => {
                if (equip.definedFunction() != 'slack') {
                    objDetails['equipment'].push(await this.createObjectForPalette(equip, true));
                }
            });
        }
        if (full && feature.featureDD.fields.conduits) {
            const conduits = await feature.followRelationship('conduits');
            objDetails['conduits'] = await Promise.all(
                conduits.map(async conduit => {
                    return this.createObjectForPalette(conduit, true);
                })
            );
        }
        if (full && feature.featureDD.fields.cables) {
            //No nesting should occur with cables.
            const cables = await feature.followRelationship('cables');
            objDetails['cables'] = await Promise.all(
                cables.map(async cable => {
                    return this.createObjectForPalette(cable, false);
                })
            );
        }
        if (feature instanceof Route) {
            objDetails.properties.in_structure = null;
            objDetails.properties.out_structure = null;
        }
        return objDetails;
    }

    /**
     * Display message
     * @param {string} message
     * @param {string} type
     */
    message(message, type) {
        new myw.DisplayMessage({ el: this.$('.message-container'), type: type, message: message });
    }

    _deleteKeysFrom(keys, obj) {
        keys.forEach(key => {
            delete obj[key];
        });
    }

    /*
     * If name already exists appends a unique number at the end of the name to make it unique
     * @param  {string} name
     * @return {string}
     */
    _getUniqueNameForList(name, list) {
        const nameIsNotUnique = list.find(obj => {
            return obj.name === name;
        });

        if (nameIsNotUnique) {
            let splitName = name.split('-');
            const trailingNum = parseInt(splitName[splitName.length - 1], 10);
            if (trailingNum) {
                splitName.pop();
                name = splitName.join('-') + `-${trailingNum + 1}`;
            } else {
                name = `${name}-1`;
            }
            return this._getUniqueNameForList(name, list);
        } else {
            return name;
        }
    }

    /*
     * Uses jquery.contextMenu to create a menu that appears on right click on a PaletteButton
     * The menu has options to 'rename' and 'remove' the PaletteButton
     * @private
     */
    _configureMenu() {
        if (this.$el.contextMenu) this.$el.contextMenu('destroy');
        const self = this;
        this.$el.contextMenu({
            // define which elements trigger this menu
            selector: 'li.palette-btn',
            zIndex: 2,
            //define the elements of the menu
            items: {
                rename: {
                    name: self.msg('rename'),
                    callback: (key, options) => {
                        self.paletteBtns[options.$trigger.text()].openRenameDialog();
                    }
                },
                remove: {
                    name: self.msg('remove'),
                    callback: (key, options) => {
                        self.paletteBtns[options.$trigger.text()].remove();
                    }
                },
                separator1: '---------',
                add_current_object: self._addCurrentObjConfig(),
                add_current_assembly: self._addCurrentObjConfig(true),
                separator2: '---------',
                reset_to_default: {
                    name: self.msg('reset_to_default'),
                    callback: (key, options) => {
                        self._restoreToDefault();
                    }
                }
            }
        });

        this.$el.contextMenu({
            // define which elements trigger this menu
            selector: 'ul',
            zIndex: 2,

            // define the elements of the menu
            items: {
                add_current_object: self._addCurrentObjConfig(),
                add_current_assembly: self._addCurrentObjConfig(true),
                separator: '---------',
                reset_to_default: {
                    name: self.msg('reset_to_default'),
                    callback: (key, options) => {
                        self._restoreToDefault();
                    }
                }
            }
        });

        if (myw.isTouchDevice && myw.Util.isIOS) {
            //we pass the original event object because the jQuery event in ios
            //object is normalized to w3c specs and does not provide the TouchList
            //fogbugz(#9748)
            this.$('li.palette-btn').on('touchstart touchmove touchend touchcancel', event => {
                this.handleTouch(event, 'li.palette-btn');
            });
            this.$('ul').on('touchstart touchmove touchend touchcancel', event => {
                self.handleTouch(event, 'ul');
            });
        }
    }

    /*
     * This method is used for ios touch devices to handle touch events
     */
    handleTouch(event, contextMenuTarget) {
        switch (event.type) {
            case 'touchstart':
                if (longTouch) longTouch = false;

                if (!timerLongTouch)
                    timerLongTouch = setTimeout(
                        function () {
                            // Flag for preventing "normal touch event" trigger when touch ends.
                            longTouch = true;
                            this.$(contextMenuTarget).contextMenu({
                                x: event.pageX,
                                y: event.pageY
                            });
                            timerLongTouch = null;
                        }.bind(this),
                        1000
                    );

                break;
            case 'touchmove':
                clearTimeout(timerLongTouch);
                timerLongTouch = null;
                break;

            case 'touchend':
                // If timerLongTouch is still running, then this is not a long touch
                // so stop the timer
                clearTimeout(timerLongTouch);
                timerLongTouch = null;

                if (longTouch) {
                    event.preventDefault();
                    longTouch = false;
                }
                break;
            default:
                return;
        }
    }

    /**
     * Callback for adding objects to palette buttons
     * @param {boolean} full
     * @returns {Object} configuration information
     */
    _addCurrentObjConfig(full = false) {
        return {
            name: full ? this.msg('add_current_assembly') : this.msg('add_current_object'),
            callback: (key, options) => {
                this.addCurrentObjToPalette(full);
            },
            disabled: (key, options) => {
                if (
                    !this.owner.app.currentFeature ||
                    !_.keys(this.featureConfigs).includes(this.owner.app.currentFeature.getType())
                ) {
                    return true;
                }
            }
        };
    }

    /**
     * Display dialog for user to confirm if he wants to reset palette list
     * Restores the palette list to the default user's list
     * @private
     */
    _restoreToDefault() {
        myw.confirmationDialog({
            title: this.msg('reset_to_default'),
            msg: this.msg('restore_confirm_msg'),
            confirmCallback: this._restoreSavedPaletteList.bind(this)
        });
    }

    /*
     * Sets up the saved palette list for the current application as the user's current palette list
     * @private
     */
    async _restoreSavedPaletteList() {
        await this.owner._restoreSavedPaletteList();
        this.render();
    }

    /**
     * Gets palette icon
     * @param {string} structType
     * @returns {string} URL for icon
     * @abstract
     */
    getIconFor(featureType) {}
}

export default FeaturePaletteControl;
