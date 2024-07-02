// Copyright: IQGeo Limited 2010-2023
import CommsFeatureEditor from './commsFeatureEditor';
import { GeoJSONVectorLayer } from 'myWorld-client';

/**
 * set whether the geometry can be edited (if offset_geom field exists)
 * Only enable secondary geometry editing after insert. (for now)
 */
const setGeomEditing = function (feature) {
    const featureDD = feature.featureDD;
    const worldFieldNames = featureDD.fieldsByWorldType['geo'] ?? [];

    if (!worldFieldNames.includes('offset_geom') || feature.isNew) {
        return false;
    }
    return true;
};

export default class EquipmentEditor extends CommsFeatureEditor {
    static {
        this.prototype.messageGroup = 'EquipmentEditor';
    }

    constructor(owner, options) {
        options.editGeom = setGeomEditing(options.feature);
        super(owner, options);

        this.connectionManager = this.app.plugins['connectionManager'];
    }

    /**
     * validate port counts prior to saving.
     * @return {[type]} [description]
     */
    async save() {
        let isValid = true;
        if (!this.feature.isNew) {
            isValid = await this.validatePorts(this.feature).catch(error => {
                this.displayMessage(error.message, 'error', true);
                throw error; // so we get traceback
            });
        }

        if (isValid) super.save();
    }

    /**
     * validate port count changes
     * @param  {MywFeature} equipment feature
     * @return {Boolean} whether the port counts are valid on equipment feature
     */
    async validatePorts(feature) {
        const sides = ['in', 'out'];
        const tech = 'fiber';
        const invalidPins = [];
        let validPorts = true;

        // use for ... of to loop w/ async calls
        for (const side of sides) {
            const nPinsFieldName = ['n', tech, side, 'ports'].join('_');
            if (feature.properties[nPinsFieldName]) {
                const oldValue = feature.properties[nPinsFieldName];
                const newValue = this.getChanges(feature).properties[nPinsFieldName];

                if (oldValue !== newValue) {
                    const highPin = await this.connectionManager.highPinUsedOn(feature, tech, side);
                    if (highPin > newValue) {
                        const externalName = this.featureDD.fields[nPinsFieldName].external_name;
                        invalidPins.push(externalName);
                    }
                }
            }
        }

        if (invalidPins.length > 0) {
            const fields = invalidPins.join(' ');
            validPorts = false;
            throw new Error(this.msg('invalid_port_error', { fields }));
        }

        return validPorts;
    }

    /**
     * Subclassed to only enable geom editing of secondary geometry.
     * @override
     */
    activateGeomDrawMode(feature) {
        if (!this.editGeom) return; // to be safe
        const featureDD = feature.featureDD;
        if (!featureDD.geometry_type) return;
        if (!this._otherGeomsLayers) this._otherGeomsLayers = {};

        const maps = this._getGeomDrawMaps();
        const fieldName = 'offset_geom';
        maps.forEach(map => {
            const worldFieldNames = [fieldName];
            const drawFieldName = fieldName;

            this._enableGeomDrawModeFor(map, feature, drawFieldName, worldFieldNames);
        });
    }

    /**
     * Subclassed to remove primary geometry edit button
     * @override
     */
    _enableGeomDrawModeFor(map, feature, drawFieldName, worldFieldNames) {
        const options = { fieldName: drawFieldName };
        map.enableGeomDrawModeFor(feature, options);
        map.on('geomdraw-start', this._handleGeomDrawStart);

        //display other geometries of the feature in this map/world
        if (!this._otherGeomsLayers[map.worldId])
            this._otherGeomsLayers[map.worldId] = new GeoJSONVectorLayer({ zIndex: 150 });
        const layer = this._otherGeomsLayers[map.worldId];
        layer.clear();

        this.$(`.mapObjectLabel.geom_field_${drawFieldName}`).toggleClass('active-geom', true);
        this.$('.mapObjectLabel.geom_field_location').remove();

        map.addLayer(layer);
    }
}
