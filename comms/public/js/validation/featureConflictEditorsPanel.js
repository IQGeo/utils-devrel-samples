import featureChangeEditorsPanel from './featureChangeEditorsPanel';

export default class FeatureConflictEditorsPanel extends featureChangeEditorsPanel {
    static {
        this.prototype.messageGroup = 'FeatureConflictEditor';
    }

    /**
     * Get conflict message to display on field tooltip
     * @returns
     */
    _getTooltipMsg(fieldEditor, fieldDD) {
        const currentFeature = this.app.currentFeature;
        const masterFeature = currentFeature.master;

        let masterDisplayValue;
        let baseDisplayValue;

        //Get master string
        if (masterFeature) {
            const masterValue = masterFeature.properties[fieldDD.internal_name];
            masterDisplayValue = fieldEditor.convertValueForDisplay(masterValue);
            if (!masterDisplayValue) masterDisplayValue = this.msg('null');
            if (Array.isArray(masterDisplayValue))
                masterDisplayValue = `${masterDisplayValue.length}`;
        }

        //Get base string
        const baseFeature = currentFeature.base;
        if (baseFeature) {
            const baseValue = baseFeature.properties[fieldDD.internal_name];
            baseDisplayValue = fieldEditor.convertValueForDisplay(baseValue);
            if (!baseDisplayValue) baseDisplayValue = this.msg('null');
            if (Array.isArray(baseDisplayValue)) baseDisplayValue = `${baseDisplayValue.length}`;
        }

        //Compose
        return (
            this.msg('base_value', { baseValue: baseDisplayValue }) +
            '\n' +
            this.msg('master_value', { masterValue: masterDisplayValue })
        );
    }

    /**
     * Creates a string from master and base geometries
     */
    _createGeometryTooltip(feature, fieldName) {
        const masterGeom = this.app.currentFeature.master?.getGeometry(fieldName);
        const baseGeom = this.app.currentFeature.base?.getGeometry(fieldName);

        const baseString = baseGeom
            ? `${baseGeom.getType()}(${baseGeom.flatCoordinates().length})`
            : null;
        const masterString = masterGeom
            ? `${masterGeom.getType()}(${masterGeom.flatCoordinates().length})`
            : null;

        const originalValue = baseString
            ? this.msg('base_value', {
                  baseValue: baseString
              })
            : this.msg('null');

        const masterValue = masterString
            ? this.msg('master_value', {
                  masterValue: masterString
              })
            : this.msg('null');

        const tooltip = originalValue + '\n' + masterValue;
        return tooltip;
    }

    /**
     * Overriden from featureChange as feature change object has 'changedFields'
     * ENH: Get server to return changedFields for conflict object too
     */
    _isChangedField(internal_name) {
        if (this.app.currentFeature.deltaFields?.includes(internal_name)) return true;
        return false;
    }

    _isConflictingField(fieldName) {
        if (this.app.currentFeature.conflictFields.includes(fieldName)) return true;
        return false;
    }

    /**
     * Get display value for FIELDNAME from master feature
     */
    _getUpdatedFromDisplayValue(fieldEditor, fieldName) {
        const originalValue = this.app.currentFeature.master.properties[fieldName];
        return fieldEditor.convertValueForDisplay(originalValue);
    }

    /**
     * Get display value for FIELDNAME (a geom field) from master feature
     */
    _getUpdatedFromGeomStr(fieldName) {
        const masterGeom = this.app.currentFeature.master.getGeometry(fieldName);

        return masterGeom
            ? `${masterGeom.getType()}(${masterGeom.flatCoordinates().length})`
            : this.msg('null');
    }

    /**
     * Updates selected field to master, taking into account geometries
     */
    updateField(key, target) {
        const fieldName = target.$trigger.data('fieldName');

        const isGeomField = this.app.currentFeature
            .getGeometryFieldNamesInWorld('geo')
            .includes(fieldName);
        if (isGeomField) {
            //Change all geoms to master as may be using secondary geom in models
            this.app.currentFeature.geometry = this.app.currentFeature.master.geometry;
            this.app.currentFeature.secondary_geometries =
                this.app.currentFeature.master.secondary_geometries;
            this.owner.endGeomDrawMode();
            this.owner.activateGeomDrawMode(this.app.currentFeature);
            return;
        }
        const newValue = this.app.currentFeature.master.properties[fieldName];
        this.owner.setValue(fieldName, newValue);
    }
}
