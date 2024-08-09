// Copyright: IQGeo Limited 2010-2023
import StructurePaletteControl from './structurePaletteControl';
import FeatureModePlugin from './featureModePlugin';
import FeatureModePluginButton from './featureModePluginButton';

/**
 * @class Provides mode and palette for adding structure features.
 * @extends {FeatureModePlugin}
 */
class StructureModePlugin extends FeatureModePlugin {
    static {
        this.prototype.messageGroup = 'StructureModePlugin';
        this.prototype.paletteId = 'mywcom-structure-palette';
        this.prototype.paletteListOption = 'structurePaletteList';
        this.prototype.pluginId = 'structureMode';

        this.prototype.buttons = {
            toggle: class extends FeatureModePluginButton {
                static {
                    this.prototype.imgSrc = 'modules/comms/images/toolbar/structure_mode.svg';
                }
            }
        };
    }

    /**
     * Fills palette with buttons
     * @param {MywFeature} feature -  Can be used to filter contents of palette
     * @override Instantiate StructurePaletteControl
     */
    _populatePalette(feature) {
        if (!this.palette)
            this.palette = new StructurePaletteControl(this, this.options.autoSave, {
                divId: this.paletteId
            });
        this.palette.render();
    }

    /**
     * Sets application edit mode
     * @override Set edit mode for structures
     */
    _setEditMode() {
        this.app.setEditMode(true, this.app.plugins.structureManager.allStructureTypes);
    }
}

export default StructureModePlugin;
