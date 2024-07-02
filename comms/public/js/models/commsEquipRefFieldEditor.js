// Copyright (c) 2010-2023 IQGeo Group Plc. Use subject to conditions at $MYWORLD_HOME/Docs/legal.txt
import { ObjectNotFoundError, UnauthorizedError, MissingFeatureDD } from 'myWorld-client';
import { Input } from 'myWorld-client';
import { FieldEditor } from 'myWorld-client';
import { FeatureSelectionDialog } from 'myWorld-client';
import $ from 'jquery';
import myw from 'myWorld-client';
import EquipmentSelectionTreeView from '../connectivity_ui/equipmentSelectionTreeView';
import FilterInputItem from '../base/filterInputItem';

class StructureFeatureSelectionDialog extends FeatureSelectionDialog {
    /**
     * @override Do not call super if there is only one element
     */
    async displaySelectionList() {
        if (this.selectedFeatureSet.size() == 1) {
            await this.owner.setStructValue(this.selectedFeatureSet.items[0]);
        } else {
            this.owner.setEquipValue(null);
            super.displaySelectionList();
        }
    }
}

/**
 * Field editor to chose equipment features inside structures selected on the map. For fields of type reference, foreign_key.
 * If feature type for reference has been specified in DD, then only features of that type can be selected in the equipment
 * tree view.
 * @name CommsEquipRefFieldEditor
 * @constructor
 * @extends {FieldEditor}
 */
export class CommsEquipRefFieldEditor extends FieldEditor {
    static {
        this.prototype.className = 'text disabled-input';
        this.prototype.attributes = { disabled: 'true' };

        this.prototype.events = {
            'click #reference-field-selector': 'openDialog'
        };
    }

    constructor(owner, feature, fieldDD, options) {
        super(owner, feature, fieldDD, options);

        this._internalValue = this.feature.getProperties()[fieldDD.internal_name];

        const container = $('<div>', { id: 'related-field-container' });

        //Disabled input field
        this.control = new Input({
            value: this.fieldValue,
            cssClass: 'disabled-input ui-reference-feature',
            disabled: 'disabled'
        });

        this.editButton = $('<button/>', {
            id: 'reference-field-selector',
            class: 'field-edit-btn feature-edit-btn',
            title: this.msg('edit_feature')
        })
            .button()
            .appendTo(this.$el);

        // Add input field to container
        container.append(this.control.$el);
        container.append(this.editButton);

        //Initially assume readonly and hide edit button, setReadOnly will be called later
        this._isReadonly = true;
        this.control.$el.addClass('read-only');
        this.editButton.css('display', 'none');

        this.setElement(container);

        //enable firing 'change' event
        this.control.$el.on('input', this._changed.bind(this));
    }

    /**
     * Close any owned dialogs when removed.
     * @override Close select dialog if open
     */
    remove() {
        if (this.selectDialog) {
            if (this.selectDialog.isOpen()) this.selectDialog.close();
        }
        super.remove();
    }

    /**
     * Convert value for display
     * @param {*} fieldValue
     * @returns
     */
    convertValueForDisplay(fieldValue) {
        const fieldDD = this.fieldDD;
        const displayValues = this.feature.displayValues;

        if (displayValues && fieldDD.internal_name in displayValues) {
            fieldValue = displayValues[fieldDD.internal_name];
        }
        return fieldValue;
    }

    /**
     * Get value if set
     * @returns
     */
    getValue() {
        return this._internalValue ?? null;
    }

    /**
     * Returns true since we don't provide the user a way to set a reference feature.
     * which means we don't need to validate it.
     * @return {boolean}  True
     */
    validateValue(value) {
        return true;
    }

    /**
     * Sets value internally (not in UI)
     * @param {object} value
     * @private
     */
    _setInternalValue(value) {
        this._internalValue = value;
    }

    /**
     * Sets related to field to null on clear button click
     */
    reset() {
        if (this._isReadonly) return;

        this.setValue(null); //sets display value
    }

    /**
     * Enables or disables the associated inputs to match the given readonly value
     * @param {boolean} readonly
     */
    setReadonly(readonly = false) {
        //Overriding whole behavior so we're not calling super implementation
        if (this._isReadonly === readonly) return;
        this._isReadonly = readonly;
        if (!readonly) {
            //Note: We don't hide the button is subsequent calls to avoid confusing users
            this.control.$el.removeClass('read-only');
            this.editButton.css('display', 'block');
        }

        this.editButton
            .toggleClass('inactive', readonly)
            .prop('disabled', readonly)
            .css('opacity', readonly ? 0.5 : 1);
    }

    /**
     * Open the selection dialog
     */
    async openDialog() {
        if (!this.selectDialog) {
            this.selectDialog = await this._initialiseSelectionDialog();
        }

        if (!this.selectDialog?.isOpen()) {
            this.app.fire('reference-selection-opening', { origin: this });
            this.selectDialog.open();
            this.selectDialog.setFeatures(this._referencedFeatures);
            if (this._referencedFeatures.length == 1) {
                const feature = this._referencedFeatures[0];
                this.struct = await this.feature.database.getFeatureByUrn(
                    feature.properties.root_housing
                );
                this.setStructValue(this.struct);
            }
        }
    }

    /**
     * Initialise the selection dialog. First with the dialog to select the structure if the
     * field we are editing is blank.
     * @returns
     */

    async _initialiseSelectionDialog() {
        const onDone = feature => {
            this.selectDialog.close();
            if (!feature) this.setEquipValue(feature);
            return true;
        };

        //obtain referenced features. "if" check is required in case they have been set beforehand via a call to setValue()
        if (!this._referencedFeatures)
            this._referencedFeatures = await this._getRelationshipFeatures();

        this.equipTypeConstraints = await this.app.database.getDDInfoFor(this.fieldDD.typeParams);
        const typeConstraints = await this.app.database.getDDInfoFor(
            Object.keys(myw.config['mywcom.structures'])
        );

        this.app.fire('reference-selection-opening', { origin: this });
        const dialog = new StructureFeatureSelectionDialog(this, {
            title: this.msg('selection_dialog_title', {
                field_name: this.fieldDD.external_name
            }),
            features: this._referencedFeatures,
            typeConstraints,
            onDone
        });
        return dialog;
    }

    /**
     * Any features currently referenced by the field.
     * @returns {MywFeature}
     */
    async _getRelationshipFeatures() {
        const app = this.app;
        try {
            const features = await this.feature.followRelationship(this.fieldDD.internal_name); //await is necessary for catching async errors below
            return features;
        } catch (e) {
            if (
                e instanceof ObjectNotFoundError ||
                e instanceof UnauthorizedError ||
                e instanceof MissingFeatureDD
            )
                app.message(app.msg('missing_object_error'));
            else {
                app.message(`${app.msg('unexpected_error')}: ${e.message}`);
                console.error(e);
            }
            return [];
        }
    }

    /**
     * Checks that field is a reference field
     * @returns {boolean}
     */
    _isReference() {
        const reference_types = ['reference', 'reference_set'];
        return reference_types.includes(this.fieldDD.baseType);
    }

    /**
     * Build component containing equipment tree
     */
    async renderEquipmentTree() {
        this.treeView = new EquipmentSelectionTreeView(this, {
            selectBranches: true,
            selectMultiple: false
        });
        await this.treeView.renderFor(this.struct);

        // Set info showing what we will connect
        this.prefix = $('<span>', { text: this.msg('label_prefix') + ': ' });
        this.label = $('<span>');

        // Create textual filter item
        this.filterItem = new FilterInputItem(str => this.treeView.setFilter(str));
        this.filterItem.$el.css({ 'margin-left': 'auto' });

        // Build header
        const headerDiv = $('<div>', { class: 'tree-header' })
            .append(this.prefix)
            .append(this.label)
            .append(this.filterItem.$el);

        // Set dialog content
        this.options.contents = $('<div>', { class: 'comms-equipment-select-container' })
            .append(headerDiv)
            .append(this.treeView.container);

        this.updateLabel();

        //this.setElement(this.options.contents);
        const element = this.selectDialog.$el.find('#featureset-selection');
        element.empty();
        element.append(this.options.contents);

        super.render();

        this.$el.on('dialogopen', () => {
            this.resize();
        });

        // Resize the form on window resize
        $(window)
            .resize(() => {
                this.resize();
            })
            .resize();
    }

    /**
     * Update label on main editor showing selected equipment
     */
    updateLabel() {
        this.label.html(this.treeView.selectionText());
    }

    /**
     * Resize dialog
     */
    resize() {
        this.$el.css({
            'max-height': $(window).height() - 110,
            'overflow-y': 'auto',
            'overflow-x': 'hidden'
        });
    }

    /**
     * Called when selection changed in the tree view. Updates current reference.
     *
     * @param {*} pinTree
     * @param {boolean} startSelection
     */
    async selectionChanged(pinTree, startSelection) {
        if (pinTree.selectedNodeIds.length == 1) {
            // Ensures we get a valid URN
            const urn = pinTree.selectedNodes[0].feature.getUrn();
            const rec = await this.feature.datasource.getFeatureByUrn(urn);
            this.setEquipValue(rec);
        }
    }

    /**
     * Sets (changes) the current equipment value
     * @param {import('myWorld/features').Feature} rec new value
     */
    setEquipValue(rec) {
        if (!rec) {
            this._referencedFeatures = [];
            this._setInternalValue(null);
            this.feature.displayValues[this.fieldDD.internal_name] = '';
        } else {
            if (!(rec.type in this.equipTypeConstraints)) {
                return;
            }
            this._referencedFeatures = [rec];
            this._setInternalValue(this._isReference() ? rec.getUrn() : rec.getId());
            this.feature.displayValues[this.fieldDD.internal_name] = rec.getTitle() || '';
        }
        this.control.setValue(this.convertValueForDisplay(''));
        this.render();
    }

    /**
     * Sets (changes) the current structure value
     * @param {import('myWorld/features').Feature} rec new value
     */
    async setStructValue(rec) {
        this.struct = rec;
        await this.renderEquipmentTree();
    }
}

// Makes it accessible to platform as a field editor that is specifed on config page.
myw.CommsEquipRefFieldEditor = CommsEquipRefFieldEditor;

export default CommsEquipRefFieldEditor;
