import myw from 'myWorld-client';
import $ from 'jquery';
import PaletteTooltip from './paletteTooltip';
import React from 'react';
import ReactDOM from 'react-dom/client';

//const regex = /(myw\.|const )([A-Z]\w+)\s?=\s?([\w\.]+)\.extend\((.*)\{/g;

class FeaturePaletteButton extends myw.View {
    static {
        this.prototype.messageGroup = 'StructureModePlugin';
        this.prototype.tagName = 'li';
        this.prototype.className = 'palette-btn';

        this.prototype.events = {
            click: 'action'
        };
    }

    /**
     * @class Button for palettes. Some activity delegated to owner so subclassing of this button class is not needed.
     * @param {Object} options
     * @constructs
     * @extends View
     */
    constructor(options) {
        super(options);
        this.model = options.model;
        this.owner = options.owner;
        this.isEquipment = this.options.isEquipment || false;
        this.initUI();
    }

    /**
     * Build UI for button
     * @returns DOM element
     */
    initUI() {
        const icon = this.getIconFor(this.model.feature_type);
        let button = this.$el
            .html(`<div><img src="${icon}"></div>`)
            .append(`<div>${this.model.name}</div>`);

        const el = document.getElementById(`${this.model.name}-tooltip-container`);
        if (!el) {
            let rootDiv = document.createElement('div');
            rootDiv.setAttribute('id', `${this.model.name}-tooltip-container`);
            button[0].append(rootDiv);
            const root = ReactDOM.createRoot(rootDiv);
            root.render(
                <PaletteTooltip
                    id={`${this.model.name}-tooltip-container`}
                    content={this.model.name}
                    height="67px"
                />
            );
        }

        return button;
    }

    /**
     * Get palette image for 'featureType'
     * ENH: Replace by sample of draw style (see legend mechanism)
     * @param {string} featureType
     * @returns {string} URL for image
     */
    getIconFor(featureType) {
        return this.owner.getIconFor(featureType);
    }

    /**
     * Save current proposed feature (if necessary)
     */
    async action() {
        // ENH: Find a cleaner way
        const app = this.options.owner.app;
        const dtlsControl = app.getDetailsControl();

        if (this.owner.autoSave && dtlsControl && dtlsControl.editor) {
            const editor = dtlsControl.editor;
            editor.once('saved', this._action, this);
            editor.save();
        } else this._action();
    }

    /**
     * Action when button is clicked.
     */
    async _action() {
        await this.owner.addFeature(this.model, this.isEquipment, this.options);
    }

    /**
     * Open dialog to allow user to rename item in palette
     */
    openRenameDialog() {
        const inputRow = new myw.Label({
            label: this.msg('new_btn_name'),
            wrap: new myw.Input({ value: this.model.name }),
            beginWithLabel: true
        });

        const content = $('<div>')
            .append(inputRow.el.outerHTML)
            .append($('<div>', { class: 'palette-error' }));

        const self = this;

        const renameDialog = new myw.Dialog({
            title: this.msg('rename_structure_insert_btn'),
            contents: content.html(),
            modal: true,
            destroyOnClose: true, // Keep DOM tidy
            buttons: {
                OK: {
                    text: this.msg('ok_btn'),
                    click() {
                        try {
                            self._rename(this.$el.find('input').val());
                        } catch (e) {
                            this.$el.find('.palette-error').text(e.message);
                            return;
                        }
                        this.close();
                    }
                },
                Cancel: {
                    text: this.msg('close_btn'),
                    class: 'right',
                    click() {
                        this.close();
                    }
                }
            }
        });

        renameDialog.open();
    }

    /**
     * Do actual renaming
     * @param {string} newName
     */
    _rename(newName) {
        const paletteList = this.owner.owner.paletteList;

        // Check if new name already in use
        const newNameEntry = paletteList.find(obj => {
            return obj.name == newName;
        });

        if (newNameEntry) throw new Error(this.msg('name_used'));

        this.owner.paletteBtns[newName] = this.owner.paletteBtns[this.model.name];
        delete this.owner.paletteBtns[this.model.name];
        this.owner.owner.paletteList[
            this.owner.owner.paletteList.findIndex(struct => struct.name === this.model.name)
        ].name = newName;
        this.model.name = newName;
        this.initUI();
    }

    /**
     * Remove palette item (and this)
     */
    remove() {
        this.$el.remove();
        this.owner.owner.paletteList = this.owner.owner.paletteList.filter(
            equip => equip.name !== this.model.name
        );
    }
}

export default FeaturePaletteButton;
