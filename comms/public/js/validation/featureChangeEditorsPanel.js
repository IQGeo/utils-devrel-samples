import myw from 'myWorld-client';
import $ from 'jquery';
import GeometryFieldViewEditor from './geometryFieldViewEditor';

export default class FeatureChangeEditorsPanel extends myw.FieldEditorsPanel {
    static {
        this.prototype.messageGroup = 'FeatureChangeEditor';
    }

    /**
     * Creates a form for editing a feature's properties
     * @param  {DDFeature}  feature     Feature to edit
     * @param  {Array<string>}  fields      Internal names of fields to include, in display order
     * @param  {jQueryElement}  container   jquery object for an element on which to build the form
     *
     * @override
     */
    buildForm(feature, fields, container) {
        //get all fieldDDs in display order
        const fieldDDs = fields.map(fieldName => feature.featureDD.fields[fieldName]);
        const tableEl = $('<div>', { class: 'field-editor-table' });

        this.fieldEditors = {};
        this.fieldElements = {};

        container.append(tableEl);

        //  First, structure the table into rows to handle the new_row options
        const rows = [];
        const addedDDs = [];
        let newRow = [];
        fieldDDs.forEach(fieldDD => {
            const fieldName = fieldDD.internal_name;
            if (addedDDs.includes(fieldName)) return; //already in the panel
            if (!this._isFieldEditable(fieldDD, feature)) return; //calculated or read only field, do nothing

            addedDDs.push(fieldName);

            if (fieldDD.new_row !== false && newRow.length) {
                rows.push(newRow);
                newRow = [];
            }
            newRow.push(fieldDD);
        });
        if (newRow.length) rows.push(newRow);

        // Override here to add geometry rows.
        const geometryFieldsChanged = feature
            .getGeometryFieldNamesInWorld('geo')
            .filter(geomFieldName => this._isChangedField(geomFieldName));

        geometryFieldsChanged.forEach(geometryFieldName => {
            const geometryFieldDD = feature.getFieldDD(geometryFieldName);
            this.options.fieldEditorMapping[geometryFieldDD.type] = GeometryFieldViewEditor;
            this.options.fields.push(geometryFieldName);
            rows.push([geometryFieldDD]);
        });

        //build the form for editing
        rows.forEach((row, rowIndex) => {
            let containerEl = $('<div>');
            containerEl.css('display', 'contents');
            row.forEach((fieldDD, index) => {
                const fieldName = fieldDD.internal_name;
                this.buildFormElements(feature, fieldName, fieldDD, containerEl);
            });

            //  Manually inject first and last row classes here
            if (rowIndex == 0) {
                containerEl.addClass('first-row');
            }

            if (rowIndex == rows.length - 1) {
                containerEl.addClass('last-row');
            }

            tableEl.append(containerEl);
        });

        this.update(feature);

        Object.values(this.fieldEditors).forEach(fieldEditor => {
            this.listenTo(fieldEditor, 'change', this._propagateEvent);
        });
    }

    /**
     * Builds the form elements for a given field
     * @param  {Feature}    feature     Feature being edited
     * @param  {string}         fieldName   Internal name of the field
     * @param  {fieldDD}        fieldDD
     * @param  {jQueryElement}  container   jQuery object for an element on which to add the form elements for the specified field
     *
     * @override
     */
    buildFormElements(feature, fieldName, fieldDD, container) {
        super.buildFormElements(feature, fieldName, fieldDD, container);

        const { fieldNameElement, valueElement } = this.fieldElements[fieldName];

        const isChangedField = this._isChangedField(fieldName);

        if (isChangedField) {
            const fieldEditor = this.getFieldEditor(feature, fieldDD);
            const tooltipMsg = this._getTooltipMsg(fieldEditor, fieldDD);
            const labelColor = myw.config['mywcom.conflictStyles'].change.color;

            fieldNameElement.attr('title', tooltipMsg);
            fieldNameElement.attr('color', labelColor);
            this._setRowElementColor(feature, fieldNameElement, fieldDD.internal_name);

            valueElement.attr('title', tooltipMsg);
            valueElement.attr('color', labelColor);
            this._setRowElementColor(feature, valueElement, fieldDD.internal_name);

            const displayValue = this._getUpdatedFromDisplayValue(fieldEditor, fieldName);
            this._buildContextMenuAttributes(valueElement, fieldName, displayValue);

            if (feature.getGeometry(fieldName)) {
                const tooltip = this._createGeometryTooltip(feature, fieldName);
                const { fieldNameElement, valueElement } = this.fieldElements[fieldName];
                fieldNameElement.attr('title', tooltip);
                valueElement.attr('title', tooltip);
            }
        }
    }

    //returns true if a given field should show an asterisk next to it
    shouldShowAsterisk(fieldDD, keyFieldName) {
        const isKeyField = fieldDD.internal_name === keyFieldName;
        if (isKeyField) return true;
        if (fieldDD.mandatory) {
            //adding an asterisk for a mandatory boolean field that starts with a default value is confusing for the user as he might
            // think he needs to check the box
            if (
                fieldDD.type == 'boolean' &&
                fieldDD.default !== null &&
                fieldDD.default !== undefined
            )
                return false;

            return true;
        }

        return false;
    }

    _getTooltipMsg(fieldEditor, fieldDD) {
        const originalDisplayValue = this._getUpdatedFromDisplayValue(
            fieldEditor,
            fieldDD.internal_name
        );
        if (!originalDisplayValue) return this.msg('null');
        return this.msg('base_value', { baseValue: originalDisplayValue });
    }

    /**
     * Creates a string from base geometry
     */
    _createGeometryTooltip(feature, fieldName) {
        const originalGeom = this.app.currentFeature.base.getGeometry(fieldName);

        const origGeomStr = originalGeom
            ? `${originalGeom.getType()}(${originalGeom.flatCoordinates().length})`
            : null;

        const tooltip = origGeomStr
            ? this.msg('base_value', {
                  baseValue: origGeomStr
              })
            : this.msg('null');

        return tooltip;
    }

    /**
     * Work out if FIELDNAME is in list of changedFields
     */
    _isChangedField(fieldName) {
        if (this.app.currentFeature.changedFields?.includes(fieldName)) return true;
        return false;
    }

    _isConflictingField(fieldName) {
        return false;
    }

    /**
     * Get display value for FIELDNAME from original feature
     */
    _getUpdatedFromDisplayValue(fieldEditor, fieldName) {
        const originalValue = this.app.currentFeature.base.properties[fieldName];
        return fieldEditor.convertValueForDisplay(originalValue);
    }

    /**
     * Get display value for FIELDNAME (a geom field) from original feature
     */
    _getUpdatedFromGeomStr(fieldName) {
        const originalGeom = this.app.currentFeature.base.getGeometry(fieldName);

        return originalGeom
            ? `${originalGeom.getType()}(${originalGeom.flatCoordinates().length})`
            : this.msg('null');
    }

    /**
     * Sets label of conflicting fields to labelConflictColor and changed fields to labelChangeColor
     */
    _setRowElementColor(feature, rowElement, fieldName) {
        const labelChangeColor = myw.config['mywcom.conflictStyles'].change.color;
        const labelConflictColor = myw.config['mywcom.conflictStyles'].conflict.color;

        //Conflicting field
        if (this._isConflictingField(fieldName)) rowElement.css('color', labelConflictColor);
        else if (this._isChangedField(fieldName)) rowElement.css('color', labelChangeColor);
    }

    _buildContextMenuAttributes(valueElement, fieldName, displayValue) {
        const randomNumber = Math.floor(Math.random() * 10001);
        valueElement.data('fieldName', fieldName);
        valueElement.data('value', displayValue);
        valueElement.data('rand', randomNumber); //So the context menu rebuilds
        valueElement.addClass(`conflicting-value-element ${fieldName} ${randomNumber}`);
        valueElement.on('contextmenu', this.contextMenuItems.bind(this));
    }

    /**
     * Sets selected field to base, taking into account geometries
     */
    updateField(key, target) {
        const fieldName = target.$trigger.data('fieldName');

        const isGeomField = this.app.currentFeature
            .getGeometryFieldNamesInWorld('geo')
            .includes(fieldName);
        if (isGeomField) {
            //Change all geoms to base as may be using secondary geom in models
            this.owner.feature.geometry = this.app.currentFeature.base.geometry;
            this.owner.feature.secondary_geometries =
                this.app.currentFeature.base.secondary_geometries;
            if (this.app.map.isGeomDrawMode()) {
                this.app.map.endCurrentInteractionMode();
                this.owner.activateGeomDrawMode(this.owner.feature);
            }

            return;
        }
        const newValue = this.app.currentFeature.base.properties[fieldName];
        this.owner.setValue(fieldName, newValue);
    }

    /**
     * Creates context menu on items found by selector
     * rand is required so the context menu rebuilds each time
     */
    contextMenuItems(e) {
        const fieldName = $(e.currentTarget).data('fieldName');
        const value = $(e.currentTarget).data('value');
        const rand = $(e.currentTarget).data('rand');
        const buildFunc = function ($triggerElement, e) {
            return {
                callback: this.updateField.bind(this),
                items: {
                    updateField: { name: this.msg('update_field', { value }) }
                }
            };
        };
        $.contextMenu({
            selector: `.conflicting-value-element.${fieldName}.${rand}`,
            build: buildFunc.bind(this)
        });
        e.preventDefault();
    }
}
