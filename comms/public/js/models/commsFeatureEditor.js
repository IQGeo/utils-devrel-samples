// Copyright: IQGeo Limited 2010-2023
import myw, {
    DisplayMessage,
    Dialog,
    DuplicateKeyError,
    FeatureEditor,
    Predicate,
    DBPredicate,
    Util
} from 'myWorld-client';
import $ from 'jquery';
import { find, findWhere, isNull, isUndefined, clone, extend } from 'underscore';
import React from 'react';

import EquipmentBreakdown from './equipmentBreakdown';
import SpecFieldEditor from './specFieldEditor';
import LaborCostsFieldEditor from './laborCostsFieldEditor';
import FeatureConflictEditorsPanel from '../validation/featureConflictEditorsPanel';
import FeatureChangeEditorsPanel from '../validation/featureChangeEditorsPanel';
import IntegrityEditorsPanel from '../validation/integrityEditorsPanel';
import ReactDOM from 'react-dom';

// Subclassed to provide more control over message display
class DisplayMessageClass extends DisplayMessage {
    render() {
        super.render();

        if (this.options.forceShowClose)
            this.messageBox.append(
                '<span type="button" class="close cancelAlert"><span>&times;</span></span>'
            );
        // add class to style comms message differently than core
        this.$el.addClass('comms-editor-message');
    }

    closeMessage() {
        super.closeMessage();

        if (this.options.closeCallback) this.options.closeCallback();
    }
}

export default class CommsFeatureEditor extends FeatureEditor {
    static {
        this.prototype.requiredSpecFields = ['name', 'retired', 'cost'];
    }

    constructor(owner, options) {
        super(owner, options);
        this.editGeom = 'editGeom' in options ? options.editGeom : true;
        // set specFieldEditor
        options.feature.fieldEditors = this._setSpecFieldEditor(options.feature);
        options.feature.fieldEditors = this._setLaborCostsFieldEditor(options.feature);

        // init super after setting custom field editors
        if (this._isDeltaFeature(myw.app.currentFeature, options.feature)) {
            this._setDeltaFeatureEditor(myw.app.currentFeature);
        } else super.initialize(...arguments);

        this.on('ready', this.handleReady, this);
        this.on('change', this.handleChange, this);

        // Additional event that should be fired at the end of a spec field change to ensure
        // specced fields are disabled correctly
        this.on('post_spec_change', this.handlePostSpecChange, this);

        // spec properties
        this.specManager = this.app.plugins['specManager'];
        this.specFieldName = this.specManager.getSpecFieldNameFor(this.feature.getType());

        this.map = this.app.map;

        // only set spec properties if spec field exists on feature
        if (this.specFieldName) {
            this.specDD = this.specManager.getSpecDDFor(this.feature);
            this.specFilter = { retired: { value: false } };
            this._setSpecFieldsState();
            this.currentSpecFeatures = this.getSpecFeatures(); //Lazy load spec features as required when resetting to master
        }
    }

    async handleReady() {
        if (!this.editGeom) {
            this.endGeomDrawMode();
            this.$el.find('.mapObject').remove();
        }

        // set specced fields from palette if spec field is set with valid spec feature
        if (this.feature.isNew) {
            const specFieldState = await this._getSpecFieldState();
            if (specFieldState.valid && specFieldState.feature) {
                const obj = {};
                obj.fieldName = this.specFieldName;
                await this.getSpecFeatures();
                this.handleChange(obj);
            }
        }
    }

    handleChange(ev) {
        if (ev.fieldName == this.specFieldName) {
            let spec = null;
            // if spec field is modfied, set teh value of specced fields
            const specName = this.getValue(this.specFieldName);
            const currentSpecFeatures = this._getCurrentSpecs();

            spec = findWhere(currentSpecFeatures, { id: specName });

            if (spec) {
                spec = spec.properties;
                Object.keys(spec).forEach(key => this._setSpeccedFieldValue(key, spec[key]));
            } else {
                this._clearSpeccedFields();
                this._clearSpecFilter();
            }
        }
    }

    /**
     * Disable specced fields
     * @param {*} ev
     */
    handlePostSpecChange(ev) {
        if (ev.fieldName == this.specFieldName) {
            let spec = null;
            const specName = this.getValue(this.specFieldName);
            const currentSpecFeatures = this._getCurrentSpecs();

            spec = findWhere(currentSpecFeatures, { id: specName });

            if (spec) {
                spec = spec.properties;
                Object.keys(spec).forEach(key => this._disableSpeccedField(key));
            }
        }
    }

    /**
     * Handler for the delete button
     * Overridden to improve message for users about to delete a design
     */
    deleteFeature() {
        this._deleteFeature(this.feature);
    }

    async _deleteFeature(feature) {
        const title = this.msg('comms_confirm_delete_title', {
            feature: feature.getTitle()
        });
        const message = await this._createDeleteMessage(feature);
        this._renderConfirmDelete(title, message, feature);
    }

    async _createDeleteMessage(feature) {
        // Config can be added by user, not supported by out of the box comms.
        const conf = myw.config['mywcom.featureEditor'];
        if (!conf) return;
        if (conf.deleteStructureWithEquipment) return;
        let equips;
        if ('equipment' in feature.featureDD.fields) {
            equips = await feature.followRelationship('equipment');
        }
        let message;
        if (equips.length > 0) {
            message = 'cannot_delete_with_equipment';
        }
        return message;
    }

    _renderConfirmDelete(title, message, feature) {
        const self = this;
        const container = document.createElement('div');
        container.setAttribute('id', 'equipment-breakdown');
        container.style['display'] = 'flex';
        container.style['justify-content'] = 'center';
        // Show dialog
        new Dialog({
            contents: container,
            destroyOnClose: true,
            title: title,
            buttons: {
                OK: {
                    text: this.msg('ok_btn'),
                    disabled: message,
                    click() {
                        this.close();
                        self._confirmedDelete(feature);
                    }
                },
                Cancel: {
                    text: this.msg('cancel_btn'),
                    class: 'right',
                    click() {
                        this.close();
                    }
                }
            }
        });
        ReactDOM.render(<EquipmentBreakdown feature={feature} message={message} />, container);
    }

    async _confirmedDelete(feature) {
        try {
            await feature.preDelete(this.app);

            //send delete to database (via transaction that can be defined in feature's model)
            const transaction = await feature.buildDeleteTransaction();
            await this._commsRunTransaction(transaction);
        } catch (reason) {
            let message = reason;
            if (reason.messageGroup && reason.messageId) {
                message = myw.msg(reason.messageGroup, reason.messageId);
            }
            this.displayMessage(message, 'error', true);
            throw reason;
        }

        await feature.posDelete(this.app);

        this.displayMessage(this.msg('deleted_ok', { title: feature.getTitle() }));

        // fire an event so that feature is removed from the layer
        this.app.fire('featureCollection-modified', {
            changeType: 'delete',
            feature: feature,
            featureType: feature.getType()
        });
        await Util.delay(1000);

        this.close();
        // fire an event so that feature is removed from the navigation stack
        this.app.fire('currentFeature-deleted');
        this.app.setCurrentFeatureSet([]);
    }

    // ------------------------------------------------------------------------
    //                               DELTA FEATURES
    // ------------------------------------------------------------------------

    /**
     * Checks if feature is a validation feature type
     * @param {MywFeature} feature
     * @returns {Boolean}
     */
    _isDeltaFeature(currentFeature, feature) {
        if (!currentFeature) return false;

        if (currentFeature.getUrn() !== feature.getUrn()) return false;

        if (currentFeature.validationFeatureType) return true;

        return false;
    }

    /**
     * Set feature editors for viewing changed/conflicting features in a design
     * Note that 'feature' has a property on it depending which type of validation feature it is
     * @param {MywFeature} feature
     */
    _setDeltaFeatureEditor(feature) {
        const isChangeFeature = feature.validationFeatureType == 'featureChange';
        const isConflictFeature = feature.validationFeatureType == 'conflictFeature';
        const isIntegrityError = feature.validationFeatureType == 'integrityError';

        //Will have lost custom featureEditor class as set on the fly so need to init here
        if (isConflictFeature) {
            this.options.fieldEditorsPanelClass = FeatureConflictEditorsPanel;
        } else if (isChangeFeature) {
            this.options.fieldEditorsPanelClass = FeatureChangeEditorsPanel;
        } else if (isIntegrityError) {
            this.options.fieldEditorsPanelClass = IntegrityEditorsPanel;
        }

        this.renderFieldEditors();
    }

    // ------------------------------------------------------------------------
    //                               SPECS
    // ------------------------------------------------------------------------

    async getSpecFeatures() {
        const filter = this._getSpecFilterPredicate();
        const features = (this.currentSpecFeatures = await this.specManager.getSpecsForPredicate(
            this.feature.getType(),
            filter
        ));
        return features;
    }

    getSpecFilter() {
        return this.specFilter;
    }

    removeFromSpecFilter(fieldName) {
        this._setSpecFilterFor(fieldName, true);
        this.trigger('specFilter-changed');
    }

    _setSpecFieldEditor(feature) {
        const specField = myw.app.plugins['specManager'].getSpecFieldNameFor(feature.getType());
        if (!specField) return feature.fieldEditors;

        const extraFieldEditors = {};
        extraFieldEditors[specField] = SpecFieldEditor;
        // don't overwrite existing custom field editors
        let fieldEditors = clone(feature.fieldEditors);
        extend(fieldEditors, extraFieldEditors);

        return fieldEditors;
    }

    /**
     * sets the state of spcced fields and the spec field based on the value of the spec field
     * sets the spec filter for the spec dialog
     */
    async _setSpecFieldsState() {
        const specFieldState = await this._getSpecFieldState();

        if (!specFieldState.valid) return;

        const speccedFields = this.specManager.getSpeccedFieldsFor(this.feature);
        const visibleFields = this.feature.getFieldsOrder();

        speccedFields.forEach(fieldName => {
            if (fieldName !== 'name' && visibleFields.includes(fieldName)) {
                // disable field editor if valid spec has been set
                if (specFieldState.feature) this._disableFieldEditor(fieldName);
            }
        });

        if (specFieldState.feature) {
            const specFieldEditor = this.getFieldEditor(this.specFieldName);
            specFieldEditor.disable();
        }
    }

    /**
     * Gets the state of of the spec field when editor is rendered
     * @return {object} whether the spec field value is valid (null can be valid) and if there is a real child spec feature
     */
    async _getSpecFieldState() {
        // ENH: refactor, this is confusing
        let state = { valid: false, feature: false };
        let specFeature = null;
        const specFieldName = this.specManager.getSpecFieldNameFor(this.feature.getType());
        const specFieldValue = this.feature.properties[specFieldName];

        // no spec field or no spec field available
        if (!specFieldName || isUndefined(specFieldValue)) return state;

        // spec field is null so is valid
        if (isNull(specFieldValue)) {
            state = { valid: true, feature: false };
        } else {
            // bad references aren't valid
            if (!this.feature.isNew) {
                specFeature = await this.feature.followReference(specFieldName);
            } else {
                // editor open from palette
                const specFeatureType = this.specManager.getSpecFeatureTypeFor(
                    this.feature.getType()
                );
                // check if value from palette returns a valid spec feature
                const filter = `[name] = '${specFieldValue}'`;
                specFeature = await this.datasource.getFeatures(specFeatureType, { filter });
                specFeature = specFeature[0];
            }
            // if there is a child spec feature, its valid
            if (specFeature) state = { valid: true, feature: true };
            else state = { valid: true, feature: false };
        }

        return state;
    }

    /** get current spec features
     *  @return {FeatureSet}
     */
    _getCurrentSpecs() {
        return this.currentSpecFeatures;
    }

    _disableSpeccedField(fieldName, value) {
        const fieldPanel = find(
            this.fieldPanels,
            fieldPanel => !!fieldPanel.fieldEditors[fieldName]
        );
        // ensure physical field exists on feature
        if (fieldPanel) {
            // exclude 'name' field, is key field
            // Enhance ask dd for key field
            if (fieldName !== 'name' && fieldName !== 'specification') {
                this._disableFieldEditor(fieldName);
            }
        }
    }

    _setSpeccedFieldValue(fieldName, value) {
        const fieldPanel = find(
            this.fieldPanels,
            fieldPanel => !!fieldPanel.fieldEditors[fieldName]
        );
        // ensure physical field exists on feature
        if (fieldPanel) {
            // exclude 'name' field, is key field
            // Enhance ask dd for key field
            if (fieldName !== 'name') {
                this.setValue(fieldName, value);
                this.trigger('change', { fieldName });
            }
        }
    }

    _clearSpeccedFields() {
        const fieldPanels = this.fieldPanels;

        fieldPanels.forEach(fieldPanel => {
            const fieldEditors = fieldPanel.fieldEditors;
            Object.keys(fieldEditors).forEach(fieldName => {
                if (this._fieldInSpec(fieldName)) {
                    this.setValue(fieldName, null);
                    this._enableFieldEditor(fieldName);
                }
            });
        });
    }

    /**
     * sets the fitler to be used to retrieve features from the db
     * @param {string} field name
     * @param {fieldValue} field value
     */
    setSpecFilter() {
        const fieldPanels = this.fieldPanels;
        fieldPanels.forEach(panel => {
            const fieldEditors = panel.fieldEditors;
            Object.keys(fieldEditors).forEach(field => {
                if (this._fieldInSpec(field)) {
                    this._setSpecFilterFor(field);
                }
            });
        });
    }

    /**
     * add or remove item to this.specFilter keyed on field name
     * @param {string}  fieldName
     * @param {Boolean} remove whether the field is to be removed from this.specFilter
     */
    _setSpecFilterFor(fieldName, remove = false) {
        const fieldEditor = this.getFieldEditor(fieldName);
        const fieldDD = fieldEditor.fieldDD;
        let val = fieldEditor.getValue();

        if (remove || !val) {
            delete this.specFilter[fieldName];
            return;
        }

        const hasUnits = this._fieldHasUnits(fieldDD);
        let descriptionValue = hasUnits ? fieldEditor.convertValueForDisplay(val) : val;

        if (fieldDD.type === 'double' && hasUnits) {
            let displayValue = parseFloat(fieldEditor.control.$el.val()); //ENH - Get display value from control
            let range = this.unround(displayValue);

            this.specFilter[fieldName] = {
                minValue: fieldEditor.convertValueString(range.minValue.toString()),
                maxValue: fieldEditor.convertValueString(range.maxValue.toString()),
                description: fieldDD.external_name + ': ' + descriptionValue
            };
        } else {
            this.specFilter[fieldName] = {
                value: val,
                description: fieldDD.external_name + ': ' + descriptionValue
            };
        }
    }

    /**
     * Returns the minimum and maximum values that round to this number
     * @param {number} number The number to unround
     * @returns { object } Object with minValue and maxValue properties
     */
    unround(number) {
        let numberParts = number.toString().split('.');
        let decimalPlaces = numberParts.length > 1 ? numberParts[1].length : 0;
        let offset = Math.pow(10, -1 * decimalPlaces) * 0.5;
        return {
            minValue: number - offset,
            maxValue: number + offset,
            offset: offset
        };
    }

    /**
     * returns true if field is in feature spec table
     * @param  {string} fieldName
     * @return {Boolean}
     */
    _fieldInSpec(fieldName) {
        if (this.requiredSpecFields.includes(fieldName)) return false;

        const fieldInSpec = find(this.specDD.fields, field => !!this.specDD.fields[fieldName]);
        return fieldInSpec;
    }

    /**
     * builds myWorld query string based on current state of editor
     * @return {string} myWorld query string
     */
    _getSpecFilterPredicate() {
        let fieldFilters = Object.entries(this.specFilter).map(([field, def]) => {
            let fieldFilterParts = [];
            if ('value' in def) fieldFilterParts.push(Predicate.eq(field, def.value));
            if ('minValue' in def) fieldFilterParts.push(Predicate.gte(field, def.minValue));
            if ('maxValue' in def) fieldFilterParts.push(Predicate.lte(field, def.maxValue));

            return fieldFilterParts.reduce((prev, curr) => {
                if (!prev) return curr;
                return prev.and(curr);
            });
        });

        return fieldFilters.reduce((prev, curr) => {
            if (!prev) return curr;
            return prev.and(curr);
        });
    }

    /**
     * clears the current filter
     */
    _clearSpecFilter() {
        this.specFilter = { retired: { value: false } };
    }

    // ------------------------------------------------------------------------
    //                               LABOR COSTS
    // ------------------------------------------------------------------------

    _setLaborCostsFieldEditor(feature) {
        const laborCostsField = myw.app.plugins.laborCostsManager.getLaborCostsFieldNameFor(
            feature.getType()
        );
        if (!laborCostsField) return feature.fieldEditors;

        const extraFieldEditors = {};
        extraFieldEditors[laborCostsField] = LaborCostsFieldEditor;
        // don't overwrite existing custom field editors
        let fieldEditors = clone(feature.fieldEditors);
        extend(fieldEditors, extraFieldEditors);

        return fieldEditors;
    }

    getLaborCostFeatures() {
        return Object.values(this.app.plugins.laborCostsManager.getLaborCostsFor(this.feature));
    }

    // ------------------------------------------------------------------------
    //                               SUBCLASS
    // ------------------------------------------------------------------------

    close() {
        super.close();
        this._clearSpecFilter();
    }

    setValue(fieldName, value) {
        const fieldEditor = this.getFieldEditor(fieldName);
        const hasUnits = this._fieldHasUnits(fieldEditor.fieldDD);

        if (!hasUnits) {
            fieldEditor.setValue(value);
        } else {
            // Work around for core issue case 16232 and 20237
            const convertedValue = fieldEditor.convertValueForDisplay(value);
            fieldEditor.displayValue = fieldEditor.initialDisplayValue = convertedValue;
            fieldEditor.fieldValue = value;
            fieldEditor.control.setValue(convertedValue);
        }
    }

    /*
     * If the feature has equipment info attached to it, send it along with the updated feature data
     */
    getChanges(feature) {
        let featureData = super.getChanges(feature);
        // TODO review setting geometry w/ out a  geomDrawmode
        if (!featureData.geometry && feature.geometry) featureData.geometry = feature.geometry;
        if (feature.equipment) featureData['equipment'] = feature.equipment;
        if (feature.children?.conduits) featureData['conduits'] = feature.children.conduits;
        if (feature.children?.cables) featureData['cables'] = feature.children.cables;

        return featureData;
    }

    // ------------------------------------------------------------------------
    //                               HELPERS
    // ------------------------------------------------------------------------

    _fieldIsString(type) {
        return type.substring(0, 6) == 'string';
    }

    _fieldHasUnits(fieldDD) {
        return fieldDD.unit_scale || fieldDD.unit || fieldDD.display_unit;
    }

    _disableFieldEditor(fieldName) {
        const fieldEditor = this.getFieldEditor(fieldName);
        const fieldDD = fieldEditor.fieldDD;
        fieldDD.read_only = new DBPredicate('bool_const', true);
        fieldEditor.setReadonly(true);
    }

    _enableFieldEditor(fieldName) {
        const fieldEditor = this.getFieldEditor(fieldName);
        const fieldDD = fieldEditor.fieldDD;
        fieldDD.read_only = new DBPredicate('bool_const', false);
        fieldEditor.setReadonly(false);
    }

    displayMessage(message, type, forceShowClose = false, closeCallback) {
        new DisplayMessageClass({
            el: this.$('.message-container'),
            type: type,
            message: message,
            forceShowClose: forceShowClose,
            closeCallback: closeCallback
        });

        this.adjustFeatureEditorHeights();
        // Scroll to the bottom of the container element so the message is clearly visible
        const el = this.options.el ? this.options.el[0] : this.el;
        el.scrollTop = el.scrollHeight;
    }

    /**
     * Adjusts the height of feature-edit-container making sure to display the message
     */
    adjustFeatureEditorHeights() {
        const editContainerDivs = $('.feature-edit-container').children();
        // nonFieldDivsHeight starts at 14 because that is the height of the bottom banner
        let nonFieldDivsHeight = 14;
        for (let i = 0; i < editContainerDivs.length; i++) {
            if (editContainerDivs[i].className !== 'feature-fields-and-map-label') {
                nonFieldDivsHeight += editContainerDivs[i].clientHeight;
            }
        }
        const featureEditorHeight = $('#feature-editor').height();
        const featureEditActionsHeight = $('.feature-edit-actions').height();
        const messageHeight = $('.comms-editor-message').height() ?? 0; //Find height of message (or 0)
        const newEditContainerHeight =
            featureEditorHeight - featureEditActionsHeight - nonFieldDivsHeight - messageHeight;

        $('.feature-edit-container').height(newEditContainerHeight);
    }

    // ------------------------------------------------------------------------
    //                               TRANSACTIONS
    // ------------------------------------------------------------------------

    /**
     * Inserts a new feature into the database
     *
     * @param  {featureData} featureJson
     * @return {promise<DDFeature>}
     *
     * Overwritten to:
     *  - call comms specific transaction method
     *  - map aborts to messages
     */
    //ENH: Provide way to do this in core
    async insertFeature(featureJson) {
        let feature = this.feature;

        //run preInsert hook
        await feature.preInsert(featureJson, this.app);

        //run transaction
        const { transaction, opIndex } = await feature.buildInsertTransaction(featureJson);
        const res = await this._commsRunTransaction(transaction);

        //get feature from database (gets values updated by database triggers)
        const id = res.ids[opIndex];
        feature = await this.datasource.getFeature(feature.getType(), id);

        //run post insert hook
        await feature.posInsert(featureJson, this.app);
        this.displayMessage(this.msg('created_ok', { title: feature.getTitle() }));
        return feature;
    }

    /**
     * Sends a set of changes to a feature to the database
     *
     * @param  {featureData} featureJson
     * @return {promise<DDFeature>}
     *
     * Overwritten to:
     *  - call comms specific transaction method
     *  - map aborts to messages
     */
    //ENH: Provide way to do this in core
    async updateFeature(featureJson) {
        let feature = this.feature;
        const preUpdateGeoJson = feature.asGeoJson();

        //Run pre update hook
        await feature.preUpdate(featureJson, this.app);

        //Run transaction
        const transaction = await feature.buildUpdateTransaction(featureJson);
        await this._commsRunTransaction(transaction);

        await feature.update(); //refresh feature properties
        await feature.posUpdate(preUpdateGeoJson, this.app); //run post update hook
        this.displayMessage(this.msg('saved_ok'));
        return feature;
    }

    /**
     * Runs 'transaction' handling error localisation
     */
    async _commsRunTransaction(transaction) {
        try {
            const res = await this.datasource.comms.runTransaction(transaction);
            return res;
        } catch (reason) {
            if (reason.message.includes('SQLITE_CONSTRAINT: UNIQUE constraint failed'))
                throw new DuplicateKeyError(); //Hack for core bug 19953 and nm bug 19941 (native app not handling duplicate key errors correctly)
            if (reason instanceof DuplicateKeyError) throw reason;
            reason.messageGroup = reason.messageGroup || this.messageGroup; // See Fogbugz 17773
            reason.messageId = reason.messageId || reason.message.replace(/ /g, '_');
            throw reason;
        }
    }

    /**
     * Run posInsert triggers on FEATURES (nested features)
     * ENH: add ability to run all or certain js triggers
     * @param {Array} features
     * @returns {Promise}
     */
    runNestedFeatureTriggers(features) {
        const triggers = [];
        features.forEach(feature =>
            triggers.push(feature.posInsert(feature.asGeoJson(), this.app))
        );
        return Promise.allSettled(triggers);
    }

    /**
     * @description Updates css to account for that button so container can adjust
     * when window is shortened from the vertical axis.
     *
     * Used in feature editors where a button is placed
     * above the save and cancel buttons. i.e. Preview or Set Path.
     */
    adjustContainerHeight() {
        const actionButtonsPanelHeight = this.app.isHandheld
            ? this.options.phoneActionButtonsAndHeaderHeight
            : this.options.actionButtonsPanelHeight;

        const panelHeaderHeight = this.$('.panel-header').outerHeight();

        this.$('.feature-edit-container').css(
            'height',
            `calc(100% - ${actionButtonsPanelHeight} - 50.55px - ${panelHeaderHeight}px)`
        );
    }
}
