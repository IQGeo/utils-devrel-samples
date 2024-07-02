// Copyright: IQGeo Limited 2010-2023
import EquipmentPaletteControl from './equipmentPaletteControl';
import FeatureModePluginButton from './featureModePluginButton';
import FeatureModePlugin from './featureModePlugin';

class EquipmentModePlugin extends FeatureModePlugin {
    static {
        this.prototype.messageGroup = 'EquipmentModePlugin';
        this.prototype.paletteListOption = 'equipmentPaletteList';
        this.prototype.paletteId = 'mywcom-equipment-palette';
        this.prototype.pluginId = 'equipmentMode';

        this.prototype.buttons = {
            toggle: class extends FeatureModePluginButton {
                static {
                    this.prototype.imgSrc = 'modules/comms/images/toolbar/equipment_mode.svg';
                }
            }
        };
    }

    /**
     * @class Provides a mode and palette for equipment features.
     * @param {Application} owner The application that owns the plugin
     * @param {Object} options Options for the plugin configuration.
     * @constructs
     * @extends {Plugin}
     * @override
     */
    constructor(owner, options) {
        super(owner, options);

        this.app.on('currentFeature-changed currentFeatureSet-changed', args => {
            const detached = args.feature && args.feature.isNew;
            if (!detached && this.enabled) this._populatePalette(args.feature);
        });
    }

    /**
     * Instantiates palette and fills it with equipment items appropriate for 'feature'.
     * @param {MywFeature} feature
     * @override
     */
    _populatePalette(feature) {
        if (!this.palette)
            this.palette = new EquipmentPaletteControl(this, this.options.autoSave, {
                divId: this.paletteId
            });
        this.palette.renderForFeature(feature);
    }
}

export default EquipmentModePlugin;
