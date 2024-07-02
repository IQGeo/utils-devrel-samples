// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import _ from 'underscore';
import myw from 'myWorld-client';
import FeaturePaletteControl from './featurePaletteControl';
import FeaturePaletteButton from './featurePaletteButton';

/**
 * @class Provides mode and palette for adding cables and equipment.
 * @extends {FeatureModePlugin}
 */
class EquipmentPaletteControl extends FeaturePaletteControl {
    static {
        this.prototype.messageGroup = 'EquipmentModePlugin';
    }

    /**
     * The three configs are lists of features that can appear in
     * the palette and the housings they can be in.
     * @override
     */
    setupConfigs() {
        this.equipmentConfigs =
            _.pick(myw.config['mywcom.equipment'], v => {
                return v.palette;
            }) || {};
        this.cableConfigs =
            _.pick(myw.config['mywcom.cables'], v => {
                return v.palette;
            }) || {};
        this.conduitConfigs =
            _.pick(myw.config['mywcom.conduits'], v => {
                return v.palette;
            }) || {};
    }

    /**
     * Render UI
     * @override Delegate to renderForFeature
     */
    render() {
        this.renderForFeature(this.app.currentFeature);
    }

    /**
     * Render equipment entries appropriate for placing in 'feature'
     * @param {MywFeature} feature
     */
    async renderForFeature(feature) {
        this.feature = feature;

        this.buttonList = $('<ul>');
        const msgContainer = $('<div>', { class: 'message-container' });
        this.$el.html(this.buttonList);

        this._configureMenu();

        // Build list of equipment types that current feature can house
        const equipTypes = [];
        Object.keys(this.equipmentConfigs).forEach(key => {
            if (feature && this.isValidEquipment(this.equipmentConfigs[key], feature)) {
                equipTypes.push(key);
            }
        });

        const housings = [].concat(
            ..._.pluck(Object.values(myw.config['mywcom.equipment']), 'housings')
        );
        const isHousing = feature && housings.includes(feature.getType());

        // Build list of cable types
        const cableTypes = Object.keys(this.cableConfigs);
        const conduitTypes = Object.keys(this.conduitConfigs);
        const otherTypes = cableTypes.concat(conduitTypes);

        this.paletteBtns = {};
        this.owner.paletteList.forEach(item => {
            if (equipTypes.includes(item.feature_type)) {
                this._addButtonToPalette(item, feature, true);
            } else if (!isHousing && otherTypes.includes(item.feature_type)) {
                this._addButtonToPalette(item, feature);
            }
        });
        if (!this.buttonList.children().length) {
            this.buttonList.append(`<div class="palette-msg">${this.msg('palette_empty')}</div>`);
        }
        this.buttonList.append(msgContainer);

        this._configureMenu();
    }

    /**
     * Add equipment or assembly buttons to palette
     * @param {Object} item
     * @param {MywFeature} feature
     * @param {boolean} isEquipment
     */
    _addButtonToPalette(item, feature, isEquipment = false) {
        const paletteBtn = new FeaturePaletteButton({
            owner: this,
            feature,
            model: item,
            isEquipment: isEquipment
        });
        this.paletteBtns[item.name] = paletteBtn;
        this.buttonList.append(paletteBtn.$el);
    }

    /**
     * Callback for adding objects to palette buttons
     * @param {boolean} full
     * @returns {Object} configuration information
     * @override Handle different layout for config
     */
    _addCurrentObjConfig(full = false) {
        return {
            name: full ? this.msg('add_current_assembly') : this.msg('add_current_object'),
            callback: (key, options) => {
                this.addCurrentObjToPalette(full);
            },
            disabled: (key, options) => {
                const allTypes = [
                    ..._.keys(this.equipmentConfigs),
                    ..._.keys(this.cableConfigs),
                    ..._.keys(this.conduitConfigs)
                ];
                if (!this.feature || !allTypes.includes(this.feature.getType())) {
                    return true;
                }
            }
        };
    }

    /**
     * Adds current feature to palette.
     * @param {boolean} full If full substructure is to be added as well.
     * @override Sets current feature to housing
     */
    async addCurrentObjToPalette(full = false) {
        const modePlugin = this.owner,
            feature = this.owner.app.currentFeature;
        if (feature) {
            let objDetails = await this.createObjectForPalette(feature, full);
            modePlugin.addToPaletteList(objDetails);
            const name = full ? this.msg('assembly') : feature.getTypeExternalName(); // eslint-disable-line
            let housingUrn = feature.properties.housing
                ? feature.properties.housing
                : feature.properties.root_housing;
            if (housingUrn) {
                let housing = await this.owner.app.database.getFeatureByUrn(housingUrn);
                if (housing) this.app.setCurrentFeature(housing);
            }
        }
    }

    /**
     * Sets up the saved palette list for the current application as the user's current palette list
     * @private
     * @override Invoke renderForFeature rather than plain render.
     */
    async _restoreSavedPaletteList() {
        let paletteList;
        const appState = await this.app.getSavedState(true, true);

        if (appState && appState.plugins.equipmentMode) {
            paletteList = appState.plugins.equipmentMode.equipmentPaletteList;
        }

        this.owner.paletteList = paletteList || [];
        this.renderForFeature(this.feature);
    }

    /*
     * Checks if the feature can house the equipment
     * @param  {object}       equip
     * @param  {Feature}  feature
     * @return {Boolean}
     */
    isValidEquipment(equip, feature) {
        return equip.housings && equip.housings.includes(feature.getType());
    }

    /**
     * Gets palette icon
     * @param {string} featureType
     * @returns {string} URL for icon
     * @override Gets icon from appropriate config
     */
    getIconFor(featureType) {
        if (this.equipmentConfigs[featureType]) {
            return this.equipmentConfigs[featureType].image;
        } else if (this.cableConfigs[featureType]) {
            return this.cableConfigs[featureType].image;
        } else if (this.conduitConfigs[featureType]) {
            return this.conduitConfigs[featureType].image;
        } else return 'modules/comms/images/features/default.svg';
    }

    /**
     * Adds feature described by 'model'. Creates detached feature and makes it the current one.
     * @param {Object} model
     * @param {boolean} isEquipment
     * @param {Object} options
     * @override Handle housing aspects of equipment
     */
    async addFeature(model, isEquipment = false, options = {}) {
        const app = this.app;
        const detachedFeature = await app.database.createDetachedFeature(model.feature_type, true);

        detachedFeature.properties = { ...detachedFeature.properties, ...model.properties };
        // Wipe, id & name from the properties
        delete detachedFeature.properties[detachedFeature.keyFieldName];
        delete detachedFeature.properties['name'];

        if (isEquipment) {
            // Set the housing as the current feature and set its geometry to the current feature's geom
            const currentFeature = options.feature;
            const housingUrn = currentFeature ? currentFeature.getUrn() : null;

            // Set the root housing to be current feature root housing (if it has one, otherwise to the feature itself)
            const rootHousingUrn = currentFeature
                ? currentFeature.properties.root_housing || housingUrn
                : null;

            const geom = currentFeature.geometry;

            detachedFeature.properties = Object.assign(detachedFeature.properties, {
                housing: housingUrn,
                root_housing: rootHousingUrn
            });

            if (currentFeature)
                detachedFeature.setGeometry(geom.type, geom.coordinates, geom.world_name);
            if (model.equipment) detachedFeature['equipment'] = model.equipment;
        } else {
            delete detachedFeature.geometry;
        }

        await app.setCurrentFeatureSet([detachedFeature], { currentFeature: detachedFeature });
    }
}

export default EquipmentPaletteControl;
