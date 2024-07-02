// Copyright: IQGeo Limited 2010-2023

import featuresChangeEditorsPanel from './featureChangeEditorsPanel';

export default class IntegrityEditorsPanel extends featuresChangeEditorsPanel {
    /**
     * Creates a string from base geometry
     */
    _createGeometryTooltip(feature, fieldName) {
        const refFeature = this.app.currentFeature.refFeatures
            ? this.app.currentFeature.refFeatures[fieldName]
            : null;
        if (!refFeature) return;
        const originalGeom = refFeature.getGeometry(fieldName);

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
     * Always return true to get every changed field to display red
     */
    _isConflictingField() {
        return true;
    }

    /**
     * Get display value for FIELDNAME from original feature
     */
    _getUpdatedFromDisplayValue(fieldEditor, fieldName) {
        const refFeature = this.app.currentFeature.refFeatures
            ? this.app.currentFeature.refFeatures[fieldName]
            : null;
        if (!refFeature) return;
        const originalValue = refFeature.properties[fieldName];
        return fieldEditor.convertValueForDisplay(originalValue);
    }

    /**
     * Get display value for FIELDNAME (a geom field) from original feature
     */
    _getUpdatedFromGeomStr(fieldName) {
        const refFeature = this.app.currentFeature.refFeatures
            ? this.app.currentFeature.refFeatures[fieldName]
            : null;
        if (!refFeature) return;
        const originalGeom = refFeature.getGeometry(fieldName);

        return originalGeom
            ? `${originalGeom.getType()}(${originalGeom.flatCoordinates().length})`
            : this.msg('null');
    }

    /**
     * Sets selected field to base, taking into account geometries
     */
    updateField(key, target) {
        const fieldName = target.$trigger.data('fieldName');
        const refFeature = this.app.currentFeature.refFeatures
            ? this.app.currentFeature.refFeatures[fieldName]
            : null;
        if (!refFeature) return;

        const isGeomField = this.app.currentFeature
            .getGeometryFieldNamesInWorld('geo')
            .includes(fieldName);

        if (isGeomField) {
            //Change all geoms to base as may be using secondary geom in models
            this.owner.feature.geometry = refFeature.geometry;
            this.owner.feature.secondary_geometries = refFeature.secondary_geometries;
            if (this.app.map.isGeomDrawMode()) {
                this.owner.endGeomDrawMode();
                this.owner.activateGeomDrawMode(this.owner.feature);
            }
            return;
        }
        const newValue = refFeature.properties[fieldName];
        this.owner.setValue(fieldName, newValue);
    }
}
