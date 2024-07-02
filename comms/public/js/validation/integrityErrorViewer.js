import myw from 'myWorld-client';
import $ from 'jquery';
import FeatureChangeViewer from './featureChangeViewer';

export default class IntegrityErrorViewer extends FeatureChangeViewer {
    /**
     * Set tooltip on valueElement show error title
     */
    _setTooltip(valueElement, fieldDD, options) {
        const fieldName = fieldDD.internal_name;
        const error = this.feature.errorItems[fieldName];
        const tooltipText = this.feature._getErrorTitle(error, fieldName);
        valueElement.attr('title', tooltipText);
    }

    /**
     * Show geometry of original feature (taking into account secondary geoms)
     */
    showOriginalGeometry(e) {
        const fieldDD = $(e.currentTarget).data('fieldDD');
        const geomFieldName = fieldDD.internal_name;
        const refFeature = this.feature.refFeatures
            ? this.feature.refFeatures[fieldDD.internal_name]
            : null;
        if (!refFeature) return;
        const geometry = refFeature.getGeometry(geomFieldName);

        //Create detched feature and set its primary geometry to geom relating to fieldDD (to workaround core limitation of only showing primary geoms in createFeatureRep)
        const newFeature = this.feature.datasource.createDetachedFrom(refFeature);
        newFeature.geometry = geometry;
        newFeature.getUrn = refFeature.getUrn;
        newFeature.getCurrentFeatureStyleDef = refFeature.getCurrentFeatureStyleDef;

        this.app.map.createFeatureRep(newFeature);
    }

    hideOriginalGeometry(e) {
        const fieldDD = $(e.currentTarget).data('fieldDD');
        const geomFieldName = fieldDD.internal_name;
        const refFeature = this.feature.refFeatures
            ? this.feature.refFeatures[geomFieldName]
            : null;
        if (!refFeature) return;

        this.app.map.removeFeatureReps([refFeature]);
    }

    /**
     * Sets conflicting fields label to labelConflictColor and changed fields to labelChangeColor
     */
    _setRowElementColor(rowElement, fieldName) {
        const labelColor = myw.config['mywcom.conflictStyles'].conflict.color;
        rowElement.css('color', labelColor);
    }
}
