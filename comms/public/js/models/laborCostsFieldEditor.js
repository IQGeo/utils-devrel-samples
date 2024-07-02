// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { StringFieldEditor, Input, FieldEditor } from 'myWorld-client';
import LaborCostsChooserControl from '../labor_costs/laborCostsChooserControl';

/**
 * Editor for labor costs fields<br/>
 * Renders a labor costs browser button
 * @name LaborCostsFieldEditor
 * @constructor
 * @extends {StringFieldEditor}
 */
class LaborCostsFieldEditor extends StringFieldEditor {
    static {
        this.prototype.tagName = 'div';
        this.prototype.className = 'labor-costs-input';
        this.prototype.messageGroup = 'LaborCostsFieldEditor';

        this.prototype.events = {
            'click .labor-costs-edit-btn': 'browseLaborCosts',
            'click .labor-costs-clear-btn': 'clearLaborCosts'
        };
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this.editor = this.owner.owner;
        this.buildEditorEl();
    }

    /**
     * build editor element
     */
    buildEditorEl() {
        const container = $('<span/>').css('display', 'flex');

        this.control = this.buildInput();
        this.clearButton = this.buildClearButton();
        const laborCostsButton = this.buildButton();

        container.append(this.control.$el);
        container.append(this.clearButton);
        container.append(laborCostsButton);

        this.setElement(container);
    }

    buildInput() {
        const control = new Input({
            value: this.fieldValue,
            disabled: !!this.fieldValue
        });

        control.$el.addClass('labor-costs-edit-input');

        return control;
    }

    /**
     * subclassed to fire change event
     */
    setValue(value) {
        FieldEditor.prototype.setValue.call(this, value);
        this.owner.trigger('change', { fieldName: 'labor-costs' });

        if (value != '') {
            this.control.$el.prop('disabled', true);
            this.enableClearButton();
        } else {
            this.control.$el.prop('disabled', false);
            this.disableClearButton();
        }
    }

    /**
     * build browse labor costs button
     */
    buildClearButton() {
        const button = $('<span/>').addClass('labor-costs-clear-btn');
        button[0].style['height'] = 'auto';
        if (!this.fieldValue) button.addClass('disabled');

        return button;
    }

    disable() {
        this.control.$el.prop('disabled', true);
        this.enableClearButton();
    }

    enableClearButton() {
        this.clearButton.removeClass('disabled');
    }

    disableClearButton() {
        this.clearButton.addClass('disabled');
    }

    /**
     * build browse labor costs button
     */
    buildButton() {
        const button = $('<span/>').addClass('labor-costs-edit-btn');
        button[0].style['height'] = 'auto';
        return button;
    }

    browseLaborCosts() {
        if (this.laborCostsChooser) {
            this.laborCostsChooser.open();
        } else {
            this.laborCostsChooser = this.initLaborCostsChooser();
        }
    }

    clearLaborCosts() {
        if (!this.control.getValue()) return;
        this.setValue('');
        this.disableClearButton();
    }

    initLaborCostsChooser() {
        const laborCostsChooser = new LaborCostsChooserControl(this, {
            laborCostFeatureName: this.editor.specFeatureName,
            feature: this.feature
        });
        return laborCostsChooser;
    }
}

export default LaborCostsFieldEditor;
