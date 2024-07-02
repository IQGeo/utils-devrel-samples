// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import LinestringStyleForm from './styleforms/LinestringStyleForm';
import LabelForm from './styleforms/LabelForm';
import PointStyleForm from './styleforms/PointStyleForm';
import PolygonStyleForm from './styleforms/PolygonStyleForm';
import FeatureModePlugin from '../modes/featureModePlugin';
import FeatureModePluginButton from '../modes/featureModePluginButton';
import MarkupPaletteControl from './markupPaletteControl';
import markupImgSrc from 'modules/comms/images/toolbar/markup_mode.svg';

export default class MarkupModePlugin extends FeatureModePlugin {
    static {
        this.prototype.messageGroup = 'MarkupModePlugin';
        this.prototype.paletteId = 'iqgapp-markup-palette';
        this.prototype.paletteListOption = 'markupPaletteList';
        this.prototype.pluginId = 'markupMode';

        this.mergeOptions({
            autoSave: true,
            disableInMaster: true
        });

        this.prototype.buttons = {
            toggle: class extends FeatureModePluginButton {
                static {
                    this.prototype.imgSrc = markupImgSrc;
                }
            }
        };
    }

    /**
     * @class Provides mode and palette for editing structure network.t
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);

        this.markupFeatureTypes = myw.config['iqgapp.markup.featureTypes'] || {};

        this.initialized = this._asyncInit();

        this.setPaletteList(this.options.markupPaletteList);

        this.active = true;
        this.enabled = false;

        this.app.on('featureCollection-modified', this.handleFeatureEdited, this);
    }

    async _asyncInit() {
        return this.app.database.getDDInfoFor(_.keys(this.markupFeatureTypes)).then(dd => {
            this.featureDD = dd;
        });
    }

    setPaletteList(list) {
        if (list && list.length > 0) {
            this.paletteList = this.options.markupPaletteList;
        } else {
            this.makeDefaultPalette();
        }
    }

    /**
     * Create a default palette list from the markupFeatureTypes, sets this.paletteList
     * @returns
     */
    async makeDefaultPalette() {
        await this.initialized;
        const featureDD = this.featureDD;
        const markupFeatureTypes = this.markupFeatureTypes;
        const result = [];

        Object.keys(markupFeatureTypes).forEach(k => {
            const v = markupFeatureTypes[k];
            result.push({
                name: featureDD[k].external_name,
                feature_type: k,
                properties: {
                    ...v.styles,
                    ...v.properties
                }
            });
        });
        this.paletteList = result;
    }

    /**
     *
     * @param {string} type
     * @returns
     */
    defaultStylesFor(type) {
        return this.markupFeatureTypes[type].styles;
    }

    /**
     * @param {string} type
     * @returns {} Constructor for style form for 'type'
     */
    styleFormFor(type) {
        const formClassName = this.markupFeatureTypes[type].formClass;

        const lookupClass = {
            LinestringStyleForm: LinestringStyleForm,
            LabelForm: LabelForm,
            PointStyleForm: PointStyleForm,
            PolygonStyleForm: PolygonStyleForm
        };
        return lookupClass[formClassName];
    }

    /**
     * @returns {object} List of valid objects that can appear in palette with their image
     */
    markupConfigs() {
        return _.mapObject(this.markupFeatureTypes, (v, k) => {
            return { palette: true, image: v.image };
        });
    }

    /**
     * @override Subclassed to set edit mode for the markup features
     */
    _setEditMode() {
        this.app.setEditMode(true, _.keys(this.markupFeatureTypes));
    }

    /**
     * Set active mode of plugin.
     * @param {} active
     * @override Subclassed to make inactive if in master
     */
    async setActive(active) {
        if (this.options.disableInMaster && !myw.app.getDelta()) {
            active = false;
        }
        super.setActive(active);
    }

    /**
     * Fills palette with buttons
     * @param {MywFeature} feature -  Can be used to filter contents of palette
     * @override Subclass to instantiate markup palette control
     */
    _populatePalette(feature) {
        if (!this.palette)
            this.palette = new MarkupPaletteControl(this, this.options.autoSave, {
                divId: this.paletteId
            });
        this.palette.render();
    }

    /**
     * Restore saved palette list from application state for this
     * plugin.
     * @override Subclassed to use default from settings if saved list is empty
     */
    async _restoreSavedPaletteList() {
        await super._restoreSavedPaletteList();
        if (this.paletteList.length == 0) {
            await this.makeDefaultPalette();
        }
    }

    updateFeatureGeometry(feature, geom) {
        feature.geometry.coordinates = geom;
        return feature.datasource.updateFeature(feature);
    }

    updateFeatureText(feature, txt) {
        if (feature.properties.text != txt) {
            feature.properties.text = txt;
            return feature.datasource.updateFeature(feature);
        }
    }

    updateFeatureAngle(feature, angle) {
        if (feature.properties.myw_orientation_location != angle) {
            feature.properties.myw_orientation_location = angle;
            return feature.datasource.updateFeature(feature);
        }
    }

    updateFeatureOffset(feature, offset_width) {
        const s = JSON.stringify(offset_width);
        if (feature.properties.offset_width != s) {
            feature.properties.offset_width = s;
            return feature.datasource.updateFeature(feature);
        }
    }

    updateFeature(feature, angle, txt, offset_width) {
        let changed = false;
        if (feature.properties.myw_orientation_location != angle) {
            feature.properties.myw_orientation_location = angle;
            changed = true;
        }
        if (feature.properties.text != txt) {
            feature.properties.text = txt;
            changed = true;
        }
        const s = JSON.stringify(offset_width);
        if (feature.properties.offset_width != s) {
            feature.properties.offset_width = s;
            changed = true;
        }
        if (changed) return feature.datasource.updateFeature(feature);
    }

    /**
     * Watches for deletion of delta owner and deletes any markup features owned by it
     * @param {event} e
     * @returns
     */
    async handleFeatureEdited(e) {
        if (!e.feature || !this.app.plugins.workflow.isDeltaOwner(e.feature)) return;

        // Handle deletion of delta owner
        if (e.changeType == 'delete') {
            this.deleteMarkupForDesign(e.feature.getUrn());
        }
    }

    /**
     * Deletes markup features owned by 'owner.
     * @param {string} URN of owner of markup features to be deleted
     * @returns
     */
    async deleteMarkupForDesign(owner) {
        const options = { filter: `[owner] = '${owner}'`, delta: '' };
        myw.app.database.setSessionVar('activeDelta', owner);

        const ds = this.app.getDatasource('myworld');
        const transaction = new myw.Transaction(this.app.database);
        /*eslint-disable no-await-in-loop*/
        for (let markupTable of _.keys(this.markupFeatureTypes)) {
            myw.app.database.setSessionVar('activeDelta', owner);
            const markupFeatures = await ds.getFeatures(markupTable, options);

            for (let feature of markupFeatures) {
                await transaction.addDelete(feature);
                if (markupTable == 'iqgapp_markup_photo') {
                    const item_options = { filter: `[owner] = '${feature.getUrn()}'`, delta: '' };
                    const itemFeatures = await ds.getFeatures(
                        'iqgapp_markup_photo_item',
                        item_options
                    );
                    for (let itemFeature of itemFeatures) {
                        await transaction.addDelete(itemFeature);
                    }
                }
            }
        }
        myw.app.database.setSessionVar('activeDelta', myw.app.getDelta());
        await ds.runTransaction(transaction);
    }
}
