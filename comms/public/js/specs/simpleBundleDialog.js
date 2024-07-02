// Copyright: IQGeo Limited 2010-2023
import myw, { Dialog, DisplayMessage, Button, Input, Label, Dropdown, Form } from 'myWorld-client';
import { isNumber } from 'underscore';
import $ from 'jquery';

export default class SimpleBundleDialog extends Dialog {
    static {
        /**
         * @class Provides simple GUI for setting up bundle sizes
         *
         * @extends {myw.Dialog}
         */
        this.prototype.messageGroup = 'SimpleBundleDialog';

        this.prototype.className = 'simple-bundle-dialog';

        this.mergeOptions({
            buttons: {
                Save: {
                    text: '{:save_btn}',
                    class: 'primary-btn',
                    click() {
                        this.saveConfig();
                    }
                },
                Cancel: {
                    text: '{:cancel_btn}',
                    class: 'right',
                    click() {
                        this.close();
                    }
                }
            }
        });
    }

    /**
     * Initialize dialog
     *
     * @param {object} owner Spec Manager Dialog
     * @param {feature} specFeature feature the configuration is being setup for
     * @param {object} options dialog options.  Optional.
     */

    constructor(owner, specFeature, options) {
        const pinCount = specFeature.properties.fiber_count || specFeature.properties.copper_count;
        options = Object.assign(
            {
                title: `${specFeature.getTitle()} (${pinCount})`,
                destroyOnClose: true
            },
            options
        );
        super(options);
        this.owner = owner;
        this.specFeature = specFeature;

        this.cableStructure = JSON.parse(this.specFeature.properties.cable_structure || '[]');
        if (this.cableStructure.length < 1) this.cableStructure.push(this.createBundleLevel(true));

        // Setup parameters depending on technology
        if (this.specFeature.properties.fiber_count) {
            this.defaultBundleSize = 12;
            this.bundleElementLabel = '{:fibers}';
            this.pinCount = this.specFeature.properties.fiber_count;
        } else {
            this.defaultBundleSize = 5;
            this.bundleElementLabel = '{:copper_pairs}';
            this.pinCount = this.specFeature.properties.copper_count;
        }
    }

    render() {
        this.options.contents = this.createContent();
        super.render();
    }

    createContent() {
        // Create a new row for each level in the cable structure
        const rows = this.cableStructure.map((config, index) => {
            const { bundleSize, bundleType, colorScheme } = config;

            // Remove Level Button
            const removeButton = new Button({
                cssClass: 'level-delete-btn',
                disabled: index == this.cableStructure.length - 1,
                onClick: () => {
                    this.removeBundleLevel(config);
                }
            });

            //Create form element for bundle size
            const sizeInput = new Input({
                name: `size_${index}`,
                cssClass: 'size-input',
                type: 'number',
                value: bundleSize,
                step: 1,
                min: 0,
                max: 99,
                onChange: el => this.handleChange(index, 'bundleSize', parseInt(el.getValue(), 10))
            });

            //Create form element for bundle type
            let bundleTypeElement = null;
            if (index === this.cableStructure.length - 1) {
                bundleTypeElement = new Label({
                    label: this.bundleElementLabel,
                    cssClass: 'medium bundle-type-input'
                });
            } else {
                bundleTypeElement = new Dropdown({
                    cssClass: 'medium bundle-type-input',
                    options: [
                        { id: 'tube', label: this.msg('tube') },
                        { id: 'ribbon', label: this.msg('ribbon') },
                        { id: 'slot', label: this.msg('slot') },
                        { id: '', label: '' }
                    ],
                    selected: bundleType,
                    onChange: el => this.handleChange(index, 'bundleType', el.getValue())
                });
            }

            //Color Scheme
            let colorSchemeOptions = Object.keys(myw.config['mywcom.fiberColorSchemes']);
            const colorSchemeDropdown = new Dropdown({
                cssClass: 'medium',
                options: colorSchemeOptions,
                selected: colorScheme,
                onChange: el => this.handleChange(index, 'colorScheme', el.getValue())
            });

            return {
                components: [removeButton, sizeInput, bundleTypeElement, colorSchemeDropdown]
            };
        });

        const button = new Button({
            text: '{:add_btn}',
            cssClass: 'ui-button',
            onClick: this.addBundleLevel.bind(this)
        });
        rows.push({ components: [button] });

        this.form = new Form({
            messageGroup: this.messageGroup,
            rows: rows
        });

        this.$el.html(this.form.$el);
        this.$el.append($('<div>', { class: 'message-container' }));
    }

    /**
     *
     * @param {integer} index   Level of bundling
     * @param {string}  type    size or type
     */
    handleChange(index, type, val) {
        this.cableStructure[index][type] = val;
    }

    async saveConfig() {
        let cfg = this.cableStructure;

        try {
            // Validate, which throws errors if problems. Also returns a possibly cleaned up config
            cfg = this._validate(cfg);

            // Ensure config is converted back to a string
            if (cfg) cfg = JSON.stringify(cfg);

            this.specFeature.properties.cable_structure = cfg;
            await this.specFeature.datasource.updateFeature(this.specFeature);
            this.owner.updateCurrentGrid();
            this.close();
        } catch (err) {
            this.displayMessage(err, 'error');
            throw err; // So we get traceback
        }
    }

    addBundleLevel() {
        this.cableStructure.unshift(this.createBundleLevel());
        this.render();
    }

    createBundleLevel(isPinLevel = false) {
        const options = Object.keys(myw.config['mywcom.fiberColorSchemes']);

        return {
            bundleSize: this.defaultBundleSize,
            bundleType: isPinLevel ? null : 'tube',
            colorScheme: options.length ? options[0] : null
        };
    }

    removeBundleLevel(level) {
        this.cableStructure = this.cableStructure.filter(item => item !== level);
        this.render();
    }

    /*
     * Displays the message at the bottom of the dialog
     * @param {string} message
     * @param {string} type     'success'/'alert'/'info'/'error'
     */
    displayMessage(message, type) {
        new DisplayMessage({ el: this.$('.message-container'), type: type, message: message });
    }

    // Performs validation that bundle config adds up to our expected count
    // Also returns cleaned up copy of config with any unnessary outer most bundles removed
    _validate(cfg) {
        const expectedPinCount = this.pinCount;
        let calculatedCount = 0;
        const cleanCfg = [];

        let prevGoodSize = false;
        cfg.forEach(bundleEntry => {
            let bundleSize = bundleEntry.bundleSize;
            let goodSize = isNumber(bundleSize) && bundleSize > 0;

            if (goodSize) {
                prevGoodSize = true;

                calculatedCount = calculatedCount ? calculatedCount * bundleSize : bundleSize;
                cleanCfg.push(bundleEntry);
            } else {
                if (prevGoodSize) throw this.msg('inconsistent_bundles'); // Encountered missing bundle size when we already had encounted one
            }
        });

        // Do the bundle sizes add up to what was expected
        if (expectedPinCount != calculatedCount)
            throw this.msg('count_mismatch', {
                calculated: calculatedCount,
                expected: expectedPinCount
            });

        return cleanCfg;
    }
}
