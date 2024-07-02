// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';
import SpecChooserControl from '../specs/specChooserControl';

/**
 * Editor for spec fields<br/>
 * Renders a spec browser button
 * @name SpecFieldEditor
 * @constructor
 * @extends {StringFieldEditor}
 */
class SpecFieldEditor extends myw.StringFieldEditor {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'spec-input';
        this.prototype.messageGroup = 'SpecFieldEditor';

        this.prototype.events = {
            'click .spec-edit-btn': 'browseSpecs',
            'click .spec-clear-btn': 'clearSpec'
        };
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this.editor = this._getEditor(this.owner.owner);
        this.buildEditorEl();
    }

    /**
     * Returns the editor instance, handles the case where the editor is in a tab
     * @param {Object} owner
     * @returns instance of myw.FeatureEditor
     */
    _getEditor(owner) {
        // ENH: this is a bit ugly, need to find a better way to get the editor
        if (owner.tabs === undefined) {
            return owner;
        } else {
            return owner.owner;
        }
    }

    /**
     * build editor element
     */
    buildEditorEl() {
        const container = $('<span/>').css('display', 'flex');

        this.control = this.buildInput();
        this.clearButton = this.buildClearButton();
        this.specButton = this.buildButton();

        container.append(this.control.$el);
        container.append(this.clearButton);
        container.append(this.specButton);

        this.setElement(container);
    }

    buildInput() {
        const control = new myw.Input({
            value: this.fieldValue
        });

        control.$el.addClass('spec-edit-input');

        return control;
    }

    /**
     * subclassed to fire change event
     */
    setValue(value) {
        myw.FieldEditor.prototype.setValue.call(this, value);
        this.owner.trigger('change', { fieldName: this.fieldDD.internal_name });
        this.owner.owner.trigger('post_spec_change', { fieldName: this.fieldDD.internal_name });

        if (value != '') {
            this.setReadonly(true);
            this.enableClearButton();
        } else {
            this.setReadonly(false);
            this.disableClearButton();
        }
    }

    /**
     * build browse spec button
     */
    buildClearButton() {
        const button = $('<span/>').addClass('spec-clear-btn disabled');
        button[0].style['height'] = 'auto';
        return button;
    }

    disable() {
        this.setReadonly(true);
        this.enableClearButton();
    }

    enableClearButton() {
        this.clearButton.removeClass('disabled');
    }

    disableClearButton() {
        this.clearButton.addClass('disabled');
    }

    /**
     * build browse spec button
     */
    buildButton() {
        const button = $('<span/>').addClass('spec-edit-btn');
        button[0].style['height'] = 'auto';
        return button;
    }

    browseSpecs() {
        this.editor.setSpecFilter();
        if (this.specChooser) {
            this.specChooser.open();
        } else {
            this.specChooser = this.initSpecChooser();
        }
    }

    clearSpec() {
        if (!this.control.getValue()) return;
        this.setValue('');
        this.disableClearButton();
    }

    initSpecChooser() {
        const specChooser = new SpecChooserControl(this, {
            specFeatureName: this.editor.specFeatureName,
            feature: this.feature
        });
        return specChooser;
    }
}

export default SpecFieldEditor;
