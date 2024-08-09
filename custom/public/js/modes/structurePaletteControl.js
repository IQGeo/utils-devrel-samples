// Copyright: IQGeo Limited 2010-2023
import _ from 'underscore';
import myw from 'myWorld-client';
import FeaturePaletteControl from './featurePaletteControl';

/**
 * @class Provides palette UI for adding structure features.
 * @extends {FeaturePaletteControl}
 */
class StructurePaletteControl extends FeaturePaletteControl {
    static {
        this.prototype.messageGroup = 'StructureModePlugin';
    }

    /**
     * Setup the features that can appear in the palette
     * @override Fill config with structure/route/conduit config
     */
    setupConfigs() {
        this.featureConfigs = Object.assign(
            {},
            _.pick(myw.config['mywcom.structures'], v => {
                return v.palette;
            }),
            _.pick(myw.config['mywcom.routes'], v => {
                return v.palette;
            }),
            _.pick(myw.config['mywcom.conduits'], v => {
                return v.palette;
            })
        );
    }

    /**
     * Get icon for palette
     * @param {string} featureType
     * @returns {string} URL for icon
     * @override Get icon from structure palette config
     */
    getIconFor(featureType) {
        const config = this.featureConfigs[featureType] || {};
        return config.structurePaletteImage || config.image || this.owner.defaultImage;
    }

    /**
     * To be called when user clicks a button in palette
     * @param {Object} model Description of object to add
     * @param {boolean} isEquipment
     * @param {Object} options
     * @override Handle conduits and cables
     */
    async addFeature(model) {
        const app = this.app;
        const detachedFeature = await app.database.createDetachedFeature(model.feature_type, true);

        detachedFeature.properties = { ...detachedFeature.properties, ...model.properties };

        // Wipe, id & name from the properties
        delete detachedFeature.properties[detachedFeature.keyFieldName];
        delete detachedFeature.properties['name'];

        if (model.equipment) detachedFeature['equipment'] = model.equipment;

        if (model.conduits || model.cables) {
            detachedFeature.children = {};
        }

        // Nesting cables/conduits in children because 'cables' is a function on feature and was causing issues.
        // ENH: should move 'equipment' under children in the future as well.
        if (model.conduits) detachedFeature.children.conduits = model.conduits;
        if (model.cables) detachedFeature.children.cables = model.cables;

        // Need to handle equipment

        app.setCurrentFeature(detachedFeature);
    }
}

export default StructurePaletteControl;
