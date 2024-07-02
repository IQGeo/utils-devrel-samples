// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class SetTickMarkDialog extends myw.Dialog {
    static {
        this.prototype.messageGroup = 'SetTickMarkDialog';
        this.prototype.className = 'set-tick-mark-dlg';

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
        super(options, owner);
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
            messageGroup: 'SetTickMarkDialog',
            rows: [
                {
                    label: this.msg('tick_mark_input_label'),
                    components: [
                        new myw.Input({
                            name: 'addTickMark',
                            value: this.options.tickMark ?? null,
                            cssClass: 'medium'
                        })
                    ]
                }
            ]
        });

        this.input = this.form.getField('addTickMark');
        return this.form.$el;
    }

    /**
     * On ok click, validate input, call service to split seg
     */
    async handleOkClick() {
        this.input.clearError();

        // Get tickMark value
        let tickMark = this._getVal();
        if (tickMark != undefined) {
            // Confirm tick mark is integer
            const regExp = /^\d+$/;
            const isInteger = regExp.test(tickMark);
            if (isInteger) {
                tickMark = parseInt(tickMark);
            } else {
                this.input.renderError(this.msg('invalid_tick_mark'));
                return;
            }
        }

        // Set tick mark
        const seg = this.options.seg;
        try {
            await this.owner.cableManager.setTickMark(
                seg,
                tickMark,
                this.options.tickMarkField,
                this.options.spacing,
                this.options.tickMarkUnit
            );
        } catch (e) {
            if (e.message == 'overlapping_tick_mark') {
                const message = this.msg('overlapping_tick_mark', {
                    tickMark
                });
                this.input.renderError(message);
            } else if (e.message == 'UnitNotDefinedError') {
                const message = this.msg('tick_mark_spacing_no_unit');
                this.input.renderError(message);
            } else {
                this.input.renderError(e.message);
            }

            throw e;
        }

        // Refresh tree
        this.close();
        this.owner.refreshFor(this.owner.feature);
    }

    /**
     * Get value in stored units
     */
    _getVal() {
        return this.input.getValue();
    }
}
