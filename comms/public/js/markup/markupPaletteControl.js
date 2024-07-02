// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';
import FeaturePaletteControl from '../modes/featurePaletteControl';
import MarkupPaletteButton from './markupPaletteButton';

export default class MarkupPaletteControl extends FeaturePaletteControl {
    static {
        this.prototype.messageGroup = 'MarkupModePlugin';
    }

    /**
     * @class  Palette for routes and structures. Provides buttons for activating
     *         editors and pre-populating selected fields. Also supports placement of assemblies
     *
     *         Content is configured by user using 'Add' button. Permitted object types are defined
     *         in settings.
     *
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
        super(owner, autoSave, options);
        this.autoSave = autoSave;

        this.msg = owner.msg;
        this.defaultImage = 'modules/comms/images/features/default.svg';
        this.render();
    }

    /**
     * Render UI
     */
    async render() {
        this.featureConfigs = await this.owner.markupConfigs();
        console.log(this.featureConfigs);
        const buttonList = $('<ul>', { id: `${this.owner.paletteId}-list` });
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
                paletteBtn = new MarkupPaletteButton({ owner: this, model: struct });
                this.paletteBtns[struct.name] = paletteBtn;
                buttonList.append(paletteBtn.$el);
            }
        });

        this._configureMenu();
    }

    getIconFor(featureType) {
        const config = this.featureConfigs[featureType] || {};
        return config.MarkupPaletteImage || config.image || this.owner.defaultImage;
    }

    /*
     * Uses jquery.contextMenu to create a menu that appears on right click on a PaletteButton
     * The menu has options to 'rename' and 'remove' the PaletteButton
     * @private
     * @override Subclassed to exclude 'Add Assembly' buttons
     * ENH featurePaletteControl.configureMenu should be refactored to make this easier
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
}
