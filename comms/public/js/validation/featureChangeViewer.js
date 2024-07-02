import myw from 'myWorld-client';
import _ from 'underscore';
import GeometryFieldViewer from './geometryFieldViewer';
import $ from 'jquery';

/**
 * Extend featureViewer to:
 * Create geometry field viewers if geometry field of feature has been changed
 * Display changed fields in change color
 * Display field group headers in change color
 */
class featureChangeViewer extends myw.FeatureViewer {
    static {
        this.prototype.messageGroup = 'FeatureChangeViewer';
    }

    /**
     * Renders a readonly list displaying the properties of a feature
     * @param  {Feature}    feature             Since this method is accessed from other classes as well
     * @param  {jQueryElement}  tableBodyEl         Element where row elements will be added
     * @param  {boolean}        [renderAll=false]   Whether null and default values should be rendered
     *
     * ENH: We need to find a way to make use of the prototype function renderAttributeList to avoid copy/paste from prototype.
     * @override
     */
    renderAttributeList(feature, tableBodyEl, renderAll) {
        const fieldsOrder = feature.getFieldsOrder();
        const geometryFieldsChanged = this.feature
            .getGeometryFieldNamesInWorld('geo')
            .filter(geomFieldName => this._isChangedField(geomFieldName));

        geometryFieldsChanged.forEach(geometryField => {
            const geometryFieldDD = feature.getFieldDD(geometryField);
            this.fieldViewerMapping[geometryFieldDD.type] = GeometryFieldViewer;
            fieldsOrder.push(geometryField);
        });

        let numAttributesDisplayed = 0;

        const renderedDDs = [];
        const renderedViewers = [];
        fieldsOrder.forEach(fieldName => {
            const fieldDD = feature.getFieldDD(fieldName);
            if (!feature.matchesPredicate(fieldDD.visible)) return;
            const fieldDisplay = this.createFieldDisplay(feature, fieldDD, { renderAll });

            if (!this.hasNullOrDefaultValues)
                this.hasNullOrDefaultValues = this._hasNullOrDefaultValue(feature, fieldDD);

            if (fieldDisplay) {
                const { elements, fieldViewer } = fieldDisplay;
                tableBodyEl.append(elements);
                renderedDDs.push(fieldDD);
                renderedViewers.push(fieldViewer);
                numAttributesDisplayed += 1;
            }
        });

        this._constructTableElements(tableBodyEl, renderedDDs);
        this.registerResizeableGrid(tableBodyEl[0], renderedViewers);
        return numAttributesDisplayed;
    }

    /**
     * Generates the html to display a features' details using containers information
     * @param  {Object} containers The containers information (field groups) of the feature to display
     *
     * @override
     */
    renderFieldGroups(container, fieldGroups) {
        const fieldGroupsCopy = fieldGroups.map(fieldGroup => {
            const fields = _.clone(fieldGroup.fields);
            return { ...fieldGroup, fields };
        });
        const geometryFieldsChanged = this.feature
            .getGeometryFieldNamesInWorld('geo')
            .filter(geomFieldName => this._isChangedField(geomFieldName));

        geometryFieldsChanged.forEach(geometryField => {
            const geometryFieldDD = this.feature.getFieldDD(geometryField);
            this.fieldViewerMapping[geometryFieldDD.type] = GeometryFieldViewer;
            fieldGroupsCopy[0].fields.push({
                field_name: geometryField,
                position: fieldGroupsCopy[0].fields.length + 1
            });
        });

        //After having added the geometry fields, we'll call renderFieldGroups on the prototype.
        super.renderFieldGroups(container, fieldGroupsCopy);
    }

    /**
     * Creates a row element with the label and value of a field
     * @param  {Feature}        feature
     * @param  {fieldDD}            fieldDD
     * @param  {fieldViewerOptions} options     Options to use by the field viewer that will render the attribute
     * @return {undefined|object}   With .fieldViewer and .elements
     *
     * @override
     */
    createFieldDisplay(feature, fieldDD, options) {
        const fieldDisplay = super.createFieldDisplay(feature, fieldDD, options);

        if (fieldDisplay) {
            const valueElement = fieldDisplay.fieldViewer.$el;
            const internal_name = fieldDD.internal_name;
            const isChangedField = this._isChangedField(internal_name);

            if (isChangedField) {
                if (!valueElement.text()) valueElement.text(this.msg('null'));
                fieldDisplay.elements.forEach(element => {
                    this._setTooltip(element, fieldDD, options);
                    this._setRowElementColor(element, fieldDD.internal_name);

                    if (fieldDisplay.fieldViewer.geometry) {
                        element.data('fieldDD', fieldDD);
                        element.mouseover(this.showOriginalGeometry.bind(this));
                        element.mouseout(this.hideOriginalGeometry.bind(this));
                    }
                });
            }
        }

        return fieldDisplay;
    }

    /**
     * Set tooltip on valueElement to value of field in master
     */
    _setTooltip(rowElement, fieldDD, options) {
        const baseValue = this._getTooltipValueFor(this.feature.base, fieldDD, options);

        //Set it on rowElement
        const tooltip = this.msg('base_value', { baseValue });
        rowElement.attr('title', tooltip);
    }

    /**
     * Get value of field for feature
     */
    _getTooltipValueFor(feature, fieldDD, options) {
        const fieldType = fieldDD.type.split('(')[0];

        //Return internal value for feature ENH: Return external value
        //See the core referenceFieldViewer convertValue method
        if (fieldType == 'reference' || fieldType == 'foreign_key') {
            return feature.properties[fieldDD.internal_name];
        }

        //Photo field: return type of image
        if (fieldType.includes('image')) {
            return fieldDD.type;
        }

        //Create original value string
        const featureFieldViewer = this.getFieldViewer(feature, fieldDD, options);
        let value = featureFieldViewer.convertValue(feature.properties[fieldDD.internal_name]);
        value = value?.replace(/\&nbsp;/g, ' ');
        if (!value) value = this.msg('null');

        //Long string: truncate
        if (value.length > 50) {
            value = value.substring(0, 50);
            value += '...';
        }
        return value;
    }

    /**
     * Show geometry of original feature (taking into account secondary geoms)
     */
    showOriginalGeometry(e) {
        const fieldDD = $(e.currentTarget).data('fieldDD');
        const geomFieldName = fieldDD.internal_name;
        const geometry = this.feature.base.getGeometry(geomFieldName);

        //Create detched feature and set its primary geometry to geom relating to fieldDD (to workaround core limitation of only showing primary geoms in createFeatureRep)
        const newFeature = this.feature.datasource.createDetachedFrom(this.feature.base);
        newFeature.geometry = geometry;
        newFeature.getUrn = this.feature.base.getUrn;
        newFeature.getCurrentFeatureStyleDef = this.feature.base.getCurrentFeatureStyleDef;

        this.app.map.createFeatureRep(newFeature);
    }

    hideOriginalGeometry() {
        this.app.map.removeFeatureReps([this.feature.base]);
    }

    _isChangedField(fieldInternalName) {
        return this.feature.changedFields?.includes(fieldInternalName);
    }

    _setRowElementColor(rowElement) {
        const labelColor = myw.config['mywcom.conflictStyles'].change.color;
        rowElement.css('color', labelColor);
    }

    /**
     * Sets color of field group header
     * Overridden in featureConflictFieldViewer
     * @returns
     */
    _setFieldGroupsHeaderColor(header, fieldGroup) {
        const labelChangeColor = myw.config['mywcom.conflictStyles'].change.color;

        const containsChangedFields = fieldGroup.fields.filter(field =>
            this.feature.changedFields?.includes(field.field_name)
        );
        if (containsChangedFields.length) header.css('color', labelChangeColor);
    }
}

myw.FeatureChangeViewer = featureChangeViewer;
export default featureChangeViewer;
