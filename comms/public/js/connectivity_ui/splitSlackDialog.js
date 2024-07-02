// Copyright: IQGeo Limited 2010-2023
import myw, { Dialog } from 'myWorld-client';

export default class SplitSlackDialog extends Dialog {
    static {
        this.prototype.messageGroup = 'SplitSlackDialog';
        this.prototype.className = 'split-slack-dlg';

        this.mergeOptions({
            destroyOnClose: true,
            title: '{:title}',
            buttons: {
                OK: {
                    text: '{:ok_btn}',
                    class: 'primary-btn',
                    click: async function () {
                        await this.handleOkClick();
                    }
                },
                Cancel: {
                    text: '{:cancel_btn}',
                    class: 'right',
                    click: function () {
                        this.owner.removeProcessingIndicator(this.options.jsNode);
                        this.close();
                    }
                }
            }
        });
    }

    /**
     *
     * @param {object} owner
     * @param {object} options
     */
    constructor(owner, options) {
        super(options);
        this.owner = owner;
    }

    /**
     * Build dialog
     */
    render() {
        this.options.contents = this._buildForm();
        super.render();
    }

    /**
     * build form with on myw.UnitInput component
     */
    _buildForm() {
        this.form = new myw.Form({
            messageGroup: 'SplitSlackDialog',
            rows: [
                {
                    label: this.msg('length_input_label'),
                    components: [
                        new myw.UnitInput({
                            name: 'splitLength',
                            value: '',
                            unitScaleDef: this.options.lengthScaleDef,
                            defaultUnit: this.options.displayUnit,
                            cssClass: 'medium'
                        })
                    ]
                }
            ]
        });

        this.input = this.form.getField('splitLength');
        this._scaleInitialValue();
        return this.form.$el;
    }

    /**
     * Set initial value (length of slack / 2)
     * Ensure it is displayed with the correct units
     */
    _scaleInitialValue() {
        const input = this.input;

        // Get the display and stored units
        const unit = this.options.storedUnit;
        const displayUnit = this.options.displayUnit;

        // Create intial value
        const initialValue = (this.options.slack.properties.length / 2).toString();

        // Ensure initi9al value will display corrrect units
        const initialValueScaled = input.unitScale.convert(initialValue, unit, displayUnit);

        // Set initial value in form
        input.options.value = initialValueScaled.toString();
        input.render();
    }

    /**
     * On ok click, validate input, call service to split slack
     */
    async handleOkClick() {
        const slack = this.options.slack;
        const splitLength = this._getVal();

        // Case: longer than existing slack or negative number
        if (splitLength > slack.properties.length || splitLength <= 0) {
            this.input.renderError(this.msg('invalid_split_length'));
        } else {
            await this.owner.cableManager.splitSlack(slack, splitLength);
            this.close();
            this.owner.refreshFor(this.owner.feature);
        }
    }

    /**
     * Get value in stored units
     */
    _getVal() {
        const storedUnit = this.options.storedUnit;
        return this.input.getUnitValue().valueIn(storedUnit);
    }
}
