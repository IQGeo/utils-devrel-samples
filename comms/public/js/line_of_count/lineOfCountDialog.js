// Copyright: IQGeo Limited 2010-2023
import myw, { Dialog, confirmationDialog } from 'myWorld-client';
import React from 'react';
import { Alert, Spin, Popconfirm } from 'antd';
import ReactDOM from 'react-dom/client';
import { some } from 'underscore';
import LineOfCountTable from './lineOfCountTable';

export default class LineOfCountDialog extends Dialog {
    /**
     * @class Provides GUI for setting status and LOC.
     * The intention is that this dialog knows nothing/little about the backend datamodel
     * which is handled by locManagerPlugin instance.
     *
     * @extends {Dialog}
     */

    static {
        this.prototype.messageGroup = 'LineOfCountDialog';
        this.prototype.className = 'status-loc-dialog';
    }

    /**
     * Initialize dialog for editing line of count for a feature (a segment or equipent)
     *
     * @param {*} owningFeature
     * @param {*} locManager
     * @param {*} options
     */
    constructor(owningFeature, locManager, side, options) {
        options = options || {};
        options.buttons = {
            Cancel: {
                text: '{:cancel_btn}',
                class: 'right',
                click() {
                    if (this.currentFeature) this.app.setCurrentFeature(this.currentFeature);
                    this.close();
                }
            },

            Ripple: {
                text: '{:ripple_btn}',
                class: 'right',
                disabled() {
                    return !this.hasUnsavedChanges;
                },
                click() {
                    this.ripple();
                }
            }
        };
        options.title = '{:title}';
        (options.destroyOnClose = true), (options.modal = false);

        super(options);
        super.render(this);

        this.owningFeature = owningFeature;
        this.app = locManager.app;
        this.locManager = locManager;
        this.side = side;
        this.hasUnsavedChanges = false;
        this.type = '';
        this.message = '';
        this.getSegConfig();
    }

    async getSegConfig() {
        this.segConfig = await this.locManager.getFeatureLOC(this.owningFeature, this.side);
        super.render(this);
        this.render();
    }

    async render() {
        this.renderTable();
        this.renderAlert();
    }

    async renderTable() {
        if (!this.tableRoot) {
            let div = document.createElement('div');
            div.setAttribute('class', 'loc__table');
            this.$el.prepend(div);
            const selected = document.getElementsByClassName('loc__table')[0];
            this.tableRoot = ReactDOM.createRoot(selected);
        }
        this.tableRoot.render(
            <LineOfCountTable
                locManager={this.locManager}
                owningFeature={this.owningFeature}
                side={this.side}
                segConfig={this.segConfig}
                onChange={cfg => {
                    this.segConfig = cfg;
                    this.hasUnsavedChanges = true;
                    super.render(this);
                    this.renderTable(this);
                }}
                onRowChange={cfg => {
                    this.segConfig = cfg;
                    this.hasUnsavedChanges = true;
                    super.render(this);
                    this.renderTable();
                }}
            />
        );
    }

    renderAlert() {
        if (!this.alertRoot) {
            let div = document.createElement('div');
            div.setAttribute('class', 'loc__alert');
            this.$el.append(div);
            const selected = document.getElementsByClassName('loc__alert')[0];
            this.alertRoot = ReactDOM.createRoot(selected);
        }
        this.alertVisible(true);
        setTimeout(() => {
            if (!this.keepAlert) {
                this.alertVisible(false);
            }
        }, 4000);
        if (!this.message) return;
        this.alertRoot.render(
            <>
                <Alert message={this.message} type={this.type} style={{ marginTop: '50px' }} />
                {this.keepAlert && <Spin className="loc__spinner" />}
            </>
        );
    }

    /**
     * Set visibility of alert
     * @param {boolean} visible
     */
    alertVisible(visible) {
        const alert = document.getElementsByClassName('loc__alert')[0];
        if (alert) {
            if (visible) alert.classList.remove('hide');
            else alert.classList.add('hide');
        }
    }

    /**
     * Validate and save line of count configuration for feature
     *
     * @param {Boolean} close - close dialog after save
     * @param {Boolean} doRefresh - refresh display of feature in detail tab after save
     * @returns
     */
    async saveConfig(close = true, doRefresh = true) {
        this.saving = true;
        let cfg = this.segConfig;

        let ok = false;

        this.displayMessage(this.msg('saving'), 'info');
        this.keepAlert = true;
        try {
            // Validate, which throws errors if problems.
            if (!(await this.validate(cfg, this.owningFeature, this.side))) return false;

            ok = await this.locManager.updateFeatureLOC(
                this.owningFeature,
                cfg,
                true,
                this.side,
                true
            );
            this.keepAlert = false;
            this.displayMessage(this.msg('was_saved'));
            this.hasUnsavedChanges = false;
            this.hasStaleData = true;

            // Allow caller to avoid refresh as internals of jstree triggers an event which will cause reset of
            // current feature set at the wrong time.
            if (doRefresh) this.refreshDisplay();

            if (close) {
                setTimeout(() => {
                    this.close();
                    const currFeature = this.app.currentFeature;
                    this.app.plugins.displayManager.trigger('state-changed', currFeature);
                }, 1000);
            }
        } catch (err) {
            this.saving = false;
            this.keepAlert = false;
            this.displayMessage(err, 'error');
            throw err; // So we get traceback
        }
        this.segConfig = await this.locManager.getFeatureLOC(this.owningFeature, this.side);
        this.saving = false;
        this.render();
        return ok;
    }

    /** Validate loc configuation and show message if not valud
     *
     */
    async validate(cfg, owningFeature, side) {
        const result = await this.locManager.validate(cfg, owningFeature, side);
        if (!result.valid) {
            this.saving = false;
            this.keepAlert = false;
            this.displayMessage(this.msg(result.msg, result.args), 'error');
            return false;
        }
        return true;
    }

    /**
     * Refresh UI (eg detail tab) that is displaying line of count information
     */
    refreshDisplay() {
        if (this.app.currentFeature)
            this.app.plugins.displayManager.trigger('state-changed', this.app.currentFeature);
    }

    /*
     * Displays the message at the bottom of the dialog
     * @param {string} message
     * @param {string} type     'success'/'alert'/'info'/'error'
     */
    displayMessage(message = '', type = 'info') {
        this.message = message;
        this.type = type;
        this.render();
    }

    /**
     * Ripple line of count configuration for feature down connected network
     *
     * @returns
     */
    async ripple() {
        // Validate before ripple
        let cfg = this.segConfig;
        if (!(await this.validate(cfg, this.owningFeature, this.side))) return false;

        this.keepAlert = true;
        this.displayMessage(this.msg('running_ripple'), 'info');
        try {
            let featuresForUpdate = await this.locManager.ripple(
                this.owningFeature,
                this.side,
                cfg
            );
            this.displayMessage(this.msg('ripple_complete'), 'info');
            this.keepAlert = false;
            this.displayMessage(
                // Deduct one to avoid confusing user as we have already saved loc on origin feature.
                this.msg('segs_to_update', {
                    num_processed: featuresForUpdate.length,
                    num_updates: featuresForUpdate.length
                }),
                'info'
            );

            if (featuresForUpdate.length > 0) this._promptUpdates(featuresForUpdate);
        } catch (err) {
            this.keepAlert = false;
            this.displayMessage(
                this.msg(err.message.id, { feature: err.message.feature }),
                'error'
            );
        }
    }

    /**
     * Prompt user to confirm they want to change listed LOC owning features
     *
     * @param {*} features
     */
    async _promptUpdates(features) {
        // Ensure we don't add feature twice
        // ENH: Do what tracing does so we can add two sides of same equipment
        const showFeatures = [];
        const originConfig = this.segConfig;

        // Set tooltip for map highlight
        features.forEach(feature => {
            const locStrLines = this.locManager.formattedLocFromRipple(
                feature,
                feature._loc_side,
                originConfig
            );
            feature.tooltip = () => locStrLines.join('<br>');
            feature.getResultsHoverText = () => locStrLines.join('&#10;');
            if (!some(showFeatures, f => f.getUrn() == feature.getUrn())) {
                showFeatures.push(feature);
            }
        });

        await this.app.setCurrentFeatureSet(showFeatures);

        const dialog = confirmationDialog({
            modal: false,
            title: this.msg('confirm_update_title'),
            msg: this.msg('confirm_update_msg', { num: features.length })
        });

        dialog.confirmPromise.then(async confirmed => {
            if (confirmed) {
                this.keepAlert = true;
                this.displayMessage(this.msg('running_update'), 'info');

                await this.locManager.rippleUpdate(
                    features,
                    this.owningFeature,
                    this.side,
                    originConfig
                );

                // Ensure internal state of dialog is reflects what is nowon server
                this.segConfig = await this.locManager.getFeatureLOC(this.owningFeature, this.side);
                this.saving = false;
                this.hasUnsavedChanges = false;
                this.render();

                this.keepAlert = false;
                this.displayMessage(this.msg('update_complete'), 'success');
                this.refreshDisplay();
                this.hasStaleData = false;
            } else {
                this.keepAlert = false;
                this.displayMessage(this.msg('update_cancelled'), 'success');
                const prevFeature = this.app.prevCurrentFeature;
                this.app.setCurrentFeatureSet([]);
                if (prevFeature) this.app.setCurrentFeature(prevFeature);
            }
        });
    }

    /**
     * Fetch and cache line of count status picklist
     *
     */
    async cacheStatusPicklist() {
        const options = await this.locManager.statusPicklist();
        options.unshift('');
        this.statusPicklist = options;
    }

    /**
     * Close dialog, prompting user to confirm if there are unsaved changes
     * @returns
     */
    close() {
        if (!this.hasUnsavedChanges && !this.hasStaleData) {
            super.close();
            return;
        }

        confirmationDialog({
            modal: false,
            title: this.msg('confirm_close'),
            msg: this.msg('confirm_closed_unsaved_changes'),
            confirmCallback: async () => {
                super.close();
            }
        });
    }
}
