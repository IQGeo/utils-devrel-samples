// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import React from 'react';
import ReactDOM from 'react-dom/client';
import ReactValidationDialog from './ValidationDialog/reactValidationDialog';

class ValidationPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'ValidationPlugin';
        this.prototype.dialogPosition = { my: 'top', at: 'top', of: '#map_canvas' };
    }

    /**
     * Provides dialogs for running design check and master data validation
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
        this.dialogs = {};
        this.dataValidationState = this.options?.dataValidationState || {};
        this.checkDesignState = this.options?.checkDesignState || {};
        this.changesFilterState = this.options?.changesFilterState || {};
        this.validationErrors = null;
        // Handle changes to delta owners
        this.app.on('database-view-changed', this.handleDatabaseViewChanged, this);
        this.app.on('featureCollection-modified', this.handleFeatureModified, this);
    }

    handleVisible(dialogName) {
        const div = document.getElementById(dialogName);
        div.classList.toggle('react-dialog_hide');
    }

    createDialogDivElement(dialogName) {
        const div = document.createElement('div');
        div.setAttribute('id', dialogName);
        const body = document.getElementById('myWorldApp');
        body.appendChild(div);
    }

    shouldShowOrCreateModal(modalOptions) {
        if (document.getElementById(modalOptions.data.dialogName)) {
            this.handleVisible(modalOptions.data.dialogName);
        }
        if (!document.getElementById(modalOptions.data.dialogName)) {
            this.createDialogDivElement(modalOptions.data.dialogName);
            const root = ReactDOM.createRoot(document.getElementById(modalOptions.data.dialogName));

            root.render(
                <ReactValidationDialog
                    title={this.msg(modalOptions.data.title)}
                    modalType={modalOptions.data.modalType}
                    modalContainerName={modalOptions.data.dialogName}
                    owner={this}
                    readOnly={modalOptions.data?.readOnly ?? null}
                    options={this.options}
                    checkboxLabels={modalOptions.data.checkboxLabels}
                    inWindow={modalOptions.data?.inWindow ?? true}
                    deltaOnly={false}
                    deltaValidationState={this.options.deltaValidationState}
                    app={this.app}
                    ds={this.app.getDatasource('myworld')}
                    handleVisible={this.handleVisible}
                />
            );
        }
    }

    async changesFilterDialog() {
        const modalOptions = {
            data: {
                modalType: 'changesFilter',
                title: 'changes_filter',
                dialogName: 'changes_filter_dialog',
                checkboxLabels: [
                    'structures',
                    'routes',
                    'conduits',
                    'conduit_runs',
                    'equipment',
                    'cables',
                    'segments',
                    'connections',
                    'circuits',
                    'line_of_counts',
                    'other'
                ]
            }
        };
        this.shouldShowOrCreateModal(modalOptions);
    }

    /**
     * Open data validation dialog
     */
    async dataValidation() {
        const modalOptions = {
            data: {
                modalType: 'dataValidation',
                title: 'dialog_title',
                dialogName: 'data_validation_dialog',
                checkboxLabels: [
                    'structures',
                    'routes',
                    'conduits',
                    'conduit_runs',
                    'equips',
                    'cables',
                    'segments',
                    'connections',
                    'circuits',
                    'line_of_counts',
                    'other'
                ]
            }
        };
        const div = document.getElementById(modalOptions.data.dialogName);
        if (div) {
            div.remove();
        }
        this.shouldShowOrCreateModal(modalOptions);
    }

    /**
     * Open dialog for checking design.
     *
     * Will stop and destroy previous instance if no longer matches rules for current design state
     */
    async checkDesignDialog() {
        const modalOptions = {
            data: {
                modalType: 'checkDesign',
                title: 'check_design',
                dialogName: `check_design_dialog-${this.ds.delta}`,
                checkboxLabels: [
                    'structures',
                    'routes',
                    'conduits',
                    'conduit_runs',
                    'equips',
                    'cables',
                    'segments',
                    'connections',
                    'circuits',
                    'line_of_counts',
                    'other'
                ]
            }
        };

        this.shouldShowOrCreateModal(modalOptions);
    }

    /**
     * Returns a dialog for checking all data integrity, conflics and design rules applicable for the current delta
     * Intended to be a one shot used, check the rules
     */
    async checkDesignDialogReadOnly() {
        const modalOptions = {
            data: {
                modalType: 'checkDesignReadOnly',
                title: 'check_design',
                dialogName: `check_design_dialog-${this.ds.delta}-readonly`,
                inWindow: true,
                readOnly: true,
                checkboxLabels: [
                    'structures',
                    'routes',
                    'conduits',
                    'conduit_runs',
                    'equips',
                    'cables',
                    'segments',
                    'connections',
                    'circuits',
                    'line_of_counts',
                    'other'
                ]
            }
        };

        const div = document.getElementById(modalOptions.data.dialogName);
        if (div) {
            div.remove();
        }

        this.shouldShowOrCreateModal(modalOptions);
    }

    /**
     * Sets this.validationErrors variable to number
     * @param {number} warningsCount - passed number of warnings
     */
    setValidationWarnings(warningsCount) {
        this.validationErrors = warningsCount;
    }

    /**
     * Sets variables to proper context for proper modal type.
     * @param {string} modalType - name of modal
     * @param {string} objectName - name of object key
     * @param {object} state - passed state, i.e. context
     * @returns
     */
    setStateToSave(modalType, objectName, state) {
        if (modalType === 'dataValidation') {
            this.dataValidationState[objectName] = state;
            return;
        }
        if (modalType === 'checkDesign') {
            this.checkDesignState[objectName] = state;
            return;
        }
        if (modalType === 'changesFilter') {
            this.changesFilterState[objectName] = state;
            return;
        }
    }

    /**
     * State to save dataValidation over sessions,
     */
    getState() {
        return {
            dataValidationState: this.dataValidationState,
            checkDesignState: this.checkDesignState,
            changesFilterState: this.changesFilterState
        };
    }

    /**
     * Ensure dialogs still valid for current delta state
     */
    async handleFeatureModified(e) {
        if (e.changeType != 'update') return;

        const dialog = this.dialogs.checkDesign;

        if (dialog) {
            const valid = await dialog.validForDelta(this.ds.delta);

            if (!valid) {
                dialog.stopValidation(true);
                delete this.dialogs.checkDesign;
            }
        }
    }

    /**
     * Ensure dialogs destroyed if current delta changed
     */
    handleDatabaseViewChanged(e) {
        const checkDesignDialog = this.dialogs.checkDesign;

        if (checkDesignDialog) {
            delete this.dialogs.checkDesign;
            checkDesignDialog.stopValidation(true);
        }
    }
}

ValidationPlugin.prototype.buttons = {
    dialog: class extends myw.PluginButton {
        static {
            this.prototype.id = 'validation-dialog';
            this.prototype.titleMsg = 'dialog';
            this.prototype.imgSrc = 'modules/comms/images/toolbar/validation.svg';
        }

        async initialize(...args) {
            myw.PluginButton.prototype.initialize.apply(this, args);

            const hasPerm = await this.hasPermission();
            if (!hasPerm) this.remove();
        }

        action() {
            this.owner.dataValidation();
        }

        // Does the user have permission to use this button
        // Part of the API for the tools palette
        async hasPermission() {
            return this.app.userHasPermission('mywcom.checkMaster');
        }
    }
};

export default ValidationPlugin;
