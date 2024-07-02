// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import LaborCostsFieldViewer from './laborCostsFieldViewer';
import GeometryType from '../base/geometryType';
import CommsEquipRefFieldEditor from './commsEquipRefFieldEditor';

class NetworkFeature extends myw.MyWorldFeature {
    /**
     * @class Provides superclass for all comms network features
     *
     * @extends {MyWorldFeature}
     */

    /**
     * Manager access
     */
    structureManager(app) {
        return app.plugins.structureManager;
    }

    equipmentManager(app) {
        return app.plugins.equipmentManager;
    }

    cableManager(app) {
        return app.plugins.cableManager;
    }

    circuitManager(app) {
        return app.plugins.circuitManager;
    }

    conduitManager(app) {
        return app.plugins.conduitManager;
    }

    nameManager(app) {
        return app.plugins.nameManager;
    }

    /**
     * Fields that cannot be changed in editor
     */
    // Overwritten in sub-classes
    readonlyFields() {
        return [];
    }

    /**
     * Overridden to support labor cost field viewer
     * Returns a field viewer for a given field if one is specified
     * Returns undefined if no custom viewer is defined
     * @param  {fieldDD} fieldDD
     * @return {FieldViewer}
     */
    getCustomFieldViewerFor(fieldDD) {
        // Get labor costs field viewer if required
        const laborCostFieldName = myw.app.plugins.laborCostsManager.getLaborCostsFieldNameFor(
            this.getType()
        );
        if (laborCostFieldName == fieldDD.internal_name) return LaborCostsFieldViewer;

        return fieldDD.viewer_class
            ? myw.Util.evalAccessors(fieldDD.viewer_class)
            : this.fieldViewers[fieldDD.internal_name];
    }

    /**
     * Returns value for fieldName formatted according to its units/display units/precision
     *
     * Can optionally specify a display unit to override DD and overide field value
     */
    // Cut-and-paste from numericFieldViewer
    // ENH: Remove once there is a way in core to do this outside of a control (see Aha #MWI-I-201)
    formattedFieldValue(fieldName, displayUnit = null, length = null) {
        let val = length || this.properties[fieldName];

        if (_.isNull(val) || _.isUndefined(val)) return '';

        if (!_.isNumber(val)) return val;

        // Get the field DD information
        const fd = this.featureDD.fields[fieldName];

        // What units should the return string be formatted in
        displayUnit = displayUnit || fd.display_unit;

        let scaleConfig;
        const unitScale = fd.unit_scale;

        if (unitScale) {
            const unitScales = myw.config['core.units'];
            scaleConfig = unitScales[unitScale];
        } else if (fd.unit) {
            scaleConfig = { units: {}, base_unit: fd.unit };
            scaleConfig.units[fd.unit] = 1.0;
        }

        if (scaleConfig) {
            const unitScale = new myw.UnitScale(scaleConfig);
            val = unitScale.convert(val, fd.unit, displayUnit);
        }

        const requiresNumericFormatting = fd.display_format && !isNaN(val);

        if (requiresNumericFormatting) {
            const formatData = fd.display_format.split(':');
            const format = { precision: formatData[0] };

            if (format.precision) val = Number(val).toFixed(format.precision);
        }

        let str;
        str = _.escape(val);

        if (displayUnit) str = `${str} ${displayUnit}`;

        return str;
    }

    /**
     * Returns the configured 'function' of self
     */
    definedFunction() {
        const cfg = myw.config['mywcom.equipment'] || {};

        const func = cfg[this.type] && cfg[this.type].function;

        return func || null;
    }

    /**
     * returns true if feature is proposed
     */
    isProposed() {
        return this.getDelta() && this.getDelta() != this.datasource.getDelta();
    }

    async posInsert(featureJson, app) {
        if (app.plugins.designChangeTracker) {
            app.plugins.designChangeTracker.trackInsertChange(this, featureJson);
        }
    }

    async posUpdate(preUpdateGeoJson, app) {
        if (app.plugins.designChangeTracker) {
            await app.plugins.designChangeTracker.trackUpdateChange(this, preUpdateGeoJson);
        }
        if (app.plugins.softTriggerManager) {
            await app.plugins.softTriggerManager.posUpdate(this, preUpdateGeoJson, app);
        }
    }

    async posDelete(app) {
        if (app.plugins.designChangeTracker) {
            app.plugins.designChangeTracker.trackDeleteChange(this);
        }
    }

    /**
     * Creates a new detached feature with properties and geometry copied from self
     *
     * ENH: Overidden to properly clone the coordinates. Needs to be handled in the platform.
     *
     * Here is link to the Jira item created for platform to fix.
     * https://iqgeo.atlassian.net/browse/PLAT-7463
     *
     * @override
     * @param {object} [options] See copyValuesFrom for details on options
     * @return {Feature}    New (detached) feature
     */
    clone(options = {}) {
        const clonedFeature = super.clone(options);

        if (clonedFeature.getGeometry()) {
            clonedFeature.getGeometry().coordinates = clonedFeature
                .getGeometry()
                .coordinates.slice();

            if (GeometryType.POINT !== clonedFeature.getGeometry().type) {
                clonedFeature.getGeometry().coordinates = clonedFeature
                    .getGeometry()
                    .coordinates.map(coordinates => coordinates.slice());
            }
        }

        return clonedFeature;
    }

    /**
     * Determines if feature can house connections
     */
    hasSplices(feature) {
        const fields = this.featureDD.fields;
        return 'fiber_splices' in fields || 'copper_splices' in fields || 'coax_splices' in fields;
    }
}

export default NetworkFeature;
