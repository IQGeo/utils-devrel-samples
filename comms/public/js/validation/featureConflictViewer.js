import myw from 'myWorld-client';
import $ from 'jquery';

/**
 * Extend featureChangeViewer to:
 * Show conflicting fields in conflict color
 * Show changed fields in change color
 * Show tooltip with base and master data
 * Show field group headers in color if they have changed/conflicting fields within
 */
class featureConflictViewer extends myw.FeatureChangeViewer {
    static {
        this.prototype.messageGroup = 'FeatureConflictViewer';
    }

    /**
     * Set tooltip on rowElement to value of field in master
     */
    _setTooltip(rowElement, fieldDD, options) {
        //Create delta value string
        let masterFieldValue;
        let baseFieldValue;
        const masterFeature = this.feature.master;
        if (masterFeature) {
            masterFieldValue = this._getTooltipValueFor(masterFeature, fieldDD, options);
        }

        const baseFeature = this.feature.base;
        if (baseFeature) {
            baseFieldValue = this._getTooltipValueFor(baseFeature, fieldDD, options);
        }
        //Set it on rowElement
        let tooltip = this.msg('base_value', { baseValue: baseFieldValue });
        tooltip += '\n';
        tooltip += this.msg('master_value', { masterValue: masterFieldValue });
        rowElement.attr('title', tooltip);
    }

    /**
     * Show geometry of original feature (taking into account secondary geoms)
     */
    showOriginalGeometry(e) {
        const fieldDD = $(e.currentTarget).data('fieldDD');
        const geomFieldName = fieldDD.internal_name;
        const geometry = this.feature.master.getGeometry(geomFieldName);

        //Create detched feature and set its primary geometry to geom relating to fieldDD (to workaround core limitation of only showing primary geoms in createFeatureRep)
        const newFeature = this.feature.datasource.createDetachedFrom(this.feature.master);
        newFeature.geometry = geometry;
        newFeature.getUrn = this.feature.master.getUrn;
        newFeature.getCurrentFeatureStyleDef = this.feature.master.getCurrentFeatureStyleDef;

        this.app.map.createFeatureRep(newFeature);
    }

    hideOriginalGeometry() {
        this.app.map.removeFeatureReps([this.feature.master]);
    }

    _isChangedField(internal_name) {
        if (this.feature.deltaFields?.includes(internal_name)) return true;
        return false;
    }

    _isConflictingField(fieldName) {
        if (this.feature.conflictFields?.includes(fieldName)) return true;
        return false;
    }

    /**
     * Sets conflicting fields label to labelConflictColor and changed fields to labelChangeColor
     */
    _setRowElementColor(rowElement, fieldName) {
        const labelChangeColor = myw.config['mywcom.conflictStyles'].change.color;
        const labelConflictColor = myw.config['mywcom.conflictStyles'].conflict.color;

        //Conflicting field
        if (this.feature.conflictFields.includes(fieldName))
            rowElement.css('color', labelConflictColor);
        else if (this.feature.deltaFields.includes(fieldName)) {
            //Changed field in delta
            rowElement.css('color', labelChangeColor);
        }
    }

    /**
     * Sets color of field group header
     */
    _setFieldGroupsHeaderColor(header, fieldGroup) {
        const labelChangeColor = myw.config['mywcom.conflictStyles'].change.color;
        const labelConflictColor = myw.config['mywcom.conflictStyles'].conflict.color;

        let containsConflictFields = false;
        let containsChangedFields = false;
        fieldGroup.fields.forEach(field => {
            if (this._isConflictingField(field.field_name)) containsConflictFields = true;
            if (this._isChangedField(field.field_name)) containsChangedFields = true;
        });

        if (containsConflictFields) header.css('color', labelConflictColor);
        else if (containsChangedFields) header.css('color', labelChangeColor);
    }
}

myw.FeatureConflictViewer = featureConflictViewer;
export default featureConflictViewer;
