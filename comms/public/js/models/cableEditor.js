// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import $ from 'jquery';
import commsFeatureEditor from './commsFeatureEditor';
import { formatLengthStr } from '../base/strUtils';
import Overlay from 'ol/Overlay';
import { fromLonLat } from 'ol/proj';
import { Style, Icon, Text, Fill } from 'ol/style';
import { allCoordsEqual } from '../base/geomUtils';

/*eslint-disable no-await-in-loop*/
// TODO: remove this if core provides a better way to modify geomdDrawMode
// Fogbugz case 19259
// subclassed to call commsEnableGeomDrawMode
/*eslint-disable no-unused-vars*/
const commsEnableGeomDrawModeFor = function (feature, placementCoords) {
    if (!feature.isEditableInWorld(this.worldId)) return;
    return this.commsEnableGeomDrawMode(feature, placementCoords);
};
export default class CableEditor extends commsFeatureEditor {
    static {
        this.prototype.messageGroup = 'CableEditor';

        this.prototype.events = Object.assign(
            {
                'click .preview-route': 'previewPath'
            },
            commsFeatureEditor.prototype.events
        );
    }

    constructor(owner, options) {
        super(owner, options);
        this.structureManager = this.app.plugins['structureManager'];
        this.cableManager = this.app.plugins['cableManager'];
        this.previewStyles = myw.config['mywcom.previewCableStyles'];

        this._initPreviewLayers();
    }

    _initPreviewLayers() {
        const map = this.map;
        this.insertPreviewStyle = new myw.LineStyle(this.previewStyles.insert);
        this.unchangePreviewStyle = new myw.LineStyle(this.previewStyles.keep);
        this.removePreviewStyle = new myw.LineStyle(this.previewStyles.delete);

        const icon = new Icon({
            src: myw.Util.convertUrl(this.previewStyles.affected_structure.icon.iconUrl),
            anchor: this.previewStyles.affected_structure.icon.iconAnchor,
            anchorXUnits: 'pixels',
            anchorYUnits: 'pixels'
        });

        this.affectedStructureStyle = new Style({ image: icon });

        this.insertPreviewLayer = new myw.GeoJSONVectorLayer({
            map: map
        });
        this.keepPreviewLayer = new myw.GeoJSONVectorLayer({
            map: map
        });
        this.deletePreviewLayer = new myw.GeoJSONVectorLayer({
            map: map
        });
        this.affectedStructurePreviewLayer = new myw.GeoJSONVectorLayer({
            map: map
        });

        this.previewLayers = [
            this.insertPreviewLayer,
            this.keepPreviewLayer,
            this.deletePreviewLayer,
            this.affectedStructurePreviewLayer
        ];
    }

    async render() {
        await super.render();
        if (!this.$('.preview-route').length) {
            const previewDiv = $('<div>', {
                class: 'content-centered',
                id: 'preview-route-button-div'
            });
            const preview = $('<button>', { class: 'button preview-route' }).button();
            previewDiv.html(preview);
            preview.html(this.msg('preview_path'));

            let beforeClass = '.feature-edit-actions';
            if (this.popup) beforeClass = '.popup-feature-edit-actions';

            previewDiv.insertBefore(this.$(beforeClass));

            this.adjustContainerHeight();
        }

        // disable geomDrawMode if cable feature is internal
        // geom is set from structure
        if (await this._isInternal()) this.endGeomDrawMode();
    }

    // Subclassed to clear preview on close
    close() {
        this.clearPath();
        super.close();
    }

    // Remove preview features from map
    clearPath() {
        if (this.previewLayers) {
            this.previewLayers.forEach(previewLayer => {
                previewLayer.clear();
            });
        }

        if (this.vertexLabels) {
            this.vertexLabels.forEach(overlay => {
                this.map.removeOverlay(overlay[0]);
                const id = `#${overlay[1]}`;
                $(id).remove();
            });
        }
    }

    // -----------------------------------------------------------------------
    //                              CALLBACKS
    // -----------------------------------------------------------------------

    // Show path that will be used to route cable when saved
    async previewPath() {
        const action = this.feature.isNew ? this.previewInsert() : this.previewUpdate();
        await action.catch(error => {
            this.displayMessage(error.message, 'error');
            throw error; // so we get traceback
        });
    }

    // Route cable and save
    async save() {
        const action = this.feature.isNew ? this.saveInsert() : this.saveUpdate();
        await action.catch(error => {
            this.displayMessage(error.message, 'error', true, () => {
                this.clearPath();
            });
            throw error; // so we get traceback
        });
    }

    // -----------------------------------------------------------------------
    //                              INSERT
    // -----------------------------------------------------------------------

    // Show path that will be used to route cable when saved
    async previewInsert() {
        this.clearPath();

        if (await this._isInternal()) {
            this.displayMessage(this.msg('internal_cable'), 'alert', true, () => {
                this.clearPath();
            });
            return;
        }

        try {
            // Find path
            const result = await this.findPath();

            // Get deatils of path
            const details = await this._routePreviewDetails(result);

            // Show path on map
            const routes = _.map(result, 'route');
            await this.showPath(routes, [], [], [], 0);

            // Display message (leaving path on map until done)
            if (routes && routes.length > 0)
                this.displayMessage(
                    this.msg('found_path', {
                        len: details.length,
                        struct: details.structs
                    }),
                    'alert',
                    true,
                    () => {
                        this.clearPath();
                    }
                );
            else this.displayMessage(this.msg('no_path'), 'alert', true);
        } catch (cond) {
            this.displayMessage(this.msg('no_path'), 'error');
        }
    }

    async calcLinestringLength(geoJson) {
        await myw.geometry.init();
        const linestring = myw.geometry(geoJson);
        return parseFloat(linestring.length().toFixed(2));
    }

    /**
     * Gets the length and number of structures that the whole path passes through
     * @param {Array} routes
     * @returns
     */
    async _routePreviewDetails(routes) {
        let length = 0;
        const structs = [];

        for (const route of routes) {
            const prop = this.feature.isNew ? route.route.properties : route.properties;

            if (prop.length === null) {
                const geom = this.feature.isNew ? route.route.geometry : route.geometry;
                const routeLength = await this.calcLinestringLength(geom);
                length += routeLength;
            } else {
                length += prop.length;
            }
            structs.push(prop.in_structure);
            structs.push(prop.out_structure);
        }

        // filter out mywcom_route_junctions
        const filteredStructs = structs.filter(function (struct) {
            if (!struct.includes('mywcom_route_junction')) return struct;
        });

        // remove duplicate structures
        const numStructures = _.uniq(filteredStructs).length;

        const lengthFeet = formatLengthStr(length);
        return { length: lengthFeet, structs: numStructures };
    }

    // Find routing for current geom (showing progress)
    async findPath() {
        // ENH: Check for no geometry
        this.displayMessage(this.msg('finding_path'), 'alert');
        const structs = await this.findStructures();

        const result = await this.datasource.comms.findPath(this.feature, structs);
        this.displayMessage(this.msg('found_path'), 'alert');
        return result;
    }

    // Route new cable and save
    async saveInsert() {
        if (await this._isInternal()) return super.save();

        // Assert we have vertexes on structures (which will visually indicate missing structures on the map)
        await this.findStructures();

        // Create and route cable (which will raise errors if no path found between structures)
        return super.save();
    }

    // -----------------------------------------------------------------------
    //                              UPDATE
    // -----------------------------------------------------------------------

    // Show path changes that would occur when the route cable updated
    async previewUpdate() {
        this.clearPath();

        // If updating secondary geom do not search for new path
        if (this.app.map.geomDrawFieldName === 'offset_geom') return;

        if (await this._isInternal()) {
            this.displayMessage(this.msg('internal_cable'), 'alert', true, () => {
                this.clearPath();
            });
            return;
        }

        // Find path
        const result = await this.findUpdatePath();

        // Get deatils of path
        const routes = [].concat(result.same_routes, result.add_routes);
        const details = await this._routePreviewDetails(routes);

        // Show new path
        await this.showPath(
            result.add_routes,
            result.remove_routes,
            result.same_routes,
            result.affected_structures,
            result.total_disconnects
        );

        // If disconnections .. warn user
        if (result.total_disconnects > 0) {
            this.displayMessage(
                this.msg('total_disconnects', { n: result.total_disconnects }),
                'alert',
                true,
                () => {
                    this.clearPath();
                }
            );
        } else {
            // Display message with close handler
            this.displayMessage(
                this.msg('found_path', {
                    len: details.length,
                    struct: details.structs
                }),
                'alert',
                true,
                () => {
                    this.clearPath();
                }
            );
        }
    }

    // Re-route existing cable and save
    async saveUpdate() {
        // If changing count, check it doesn't break connections
        // ENH: Get Core to make validateChanges() async and do there
        const ok = await this._validateCountChange();
        if (!ok) return;

        // if internal, geom won't be changed
        const isInternal = await this._isInternal();
        if (isInternal) return super.save();

        // Gather new and original placement coordinates
        const newCoords = this.app.map.geomDrawMode.getGeometry().coordinates;
        const origCoords = this._getPlacementCoords(this.feature);

        // Determine if geometry has changed
        const geomChanged = !allCoordsEqual(newCoords, origCoords);

        // Don't perform routing if geom the same
        if (!geomChanged) return super.save();

        // If updating secondary geom do not search for new path
        if (this.app.map.geomDrawFieldName === 'offset_geom') return super.save();
        // Assert path exists
        const result = await this.findUpdatePath();

        // If disconnections .. get confirmation
        // ENH: Avoid duplicated call to save()
        const affectedStructuresCount = _.size(result.affected_structures);
        if (affectedStructuresCount > 0) {
            myw.confirmationDialog({
                title: this.msg('confirm_save_title'),
                msg: this.msg('confirm_save', { n: affectedStructuresCount }),
                confirmCallback: () => {
                    commsFeatureEditor.prototype.save.call(this);
                }
            });
            return;
        }

        super.save();
    }

    // Find routing for current geom (showing progress)
    async findUpdatePath() {
        // ENH: Check for no geometry
        this.displayMessage(this.msg('finding_path'), 'alert');
        const structs = await this.findStructures();
        const result = await this.datasource.comms.findReroutePath(this.feature, structs);
        this.displayMessage(this.msg('found_path'), 'alert');
        return result;
    }

    /**
     * Checks if proposed change to count field would break connections
     * @param {MywFeature} cable
     * @return {boolean}
     */
    async _validateCountChange() {
        // Check for no change
        const countField = this.feature.countField();
        const oldCount = this.feature.pinCount();
        const newCount = this.getChanges(this.feature).properties[countField];
        if (oldCount == newCount) return true;

        // Check for broken connections
        const highPin = await this.cableManager.highestUsedPinOn(this.feature);
        if (newCount >= highPin) return true;

        // Show error
        // ENH: Show highPin
        const editor = this.getFieldEditor(countField);
        const validationResult = this.msg('invalid_fiber_count_error', { key: editor.getValue() });
        editor.$el.siblings('.inlineValidation').html(validationResult);
        this.displayMessage(this.msg('invalid_data'), 'error');

        return false;
    }

    // -----------------------------------------------------------------------
    //                              PATH FINDING
    // -----------------------------------------------------------------------

    // Find structures at vertices of current geometry
    async findStructures() {
        const coords = this.app.map.geomDrawMode.getGeometry()?.coordinates;

        // Find structures
        const structs = await this.structureManager.getStructuresAtCoords(coords);

        // If some bad .. highlight them
        const missing = [];
        _.each(structs, (s, i) => {
            if (!s) missing.push({ coord: coords[i], msg: (i + 1).toString() });
        });

        if (missing.length) {
            this.showVertices(missing); // No await is deliberate
            const msg = this.msg('no_structure', { indexes: _.map(missing, 'msg').join(', ') });
            throw new Error(msg);
        }

        return structs;
    }

    // Briefly show new path on map
    async showPath(
        insert_routes,
        remove_routes,
        unchanged_routes,
        affected_structures,
        total_disconnects
    ) {
        this.clearPath();

        // Add features to map to highlight route changes
        _.each(insert_routes, feature => {
            this.insertPreviewLayer.addLine(feature.geometry.coordinates, this.insertPreviewStyle);
        });

        _.each(unchanged_routes, feature => {
            this.keepPreviewLayer.addLine(feature.geometry.coordinates, this.unchangePreviewStyle);
        });

        _.each(remove_routes, feature => {
            this.deletePreviewLayer.addLine(feature.geometry.coordinates, this.removePreviewStyle);
        });

        // Add markers to map indicated structures with changes
        _.each(affected_structures, structInfo => {
            const f = structInfo.feature;

            const style = this.affectedStructureStyle;
            const text = new Text({
                font: '18px sans-serif',
                text: structInfo.disconnects.toString(),
                placement: 'point',
                offsetX: 14,
                backgroundFill: new Fill({ color: 'white' })
            });
            style.setText(text);

            this.affectedStructurePreviewLayer.addPoint(f.geometry.coordinates, style);
        });

        // If editor is cancelled before preview is complete remove preview layer(s)
        if (!this.map.isGeomDrawMode()) this.clearPath();
    }

    // Briefly show a vertex labels on map
    // Itmes is a list of objects with properties .coord and .msg
    async showVertices(items) {
        this.clearPath();
        this.vertexLabels = [];

        items.forEach(item => {
            // use ol/Overlay
            // create element
            const elId = `vertex-label-${item.msg}`;
            const element = document.createElement('span');
            element.id = elId;
            element.className = 'vertex-label';
            element.textContent = item.msg;

            // get position
            const position = item.coord;
            const overlay = new Overlay({ element, position });

            // add to map
            this.map.addOverlay(overlay);

            this.vertexLabels.push([overlay, elId]);
        });
    }

    // -----------------------------------------------------------------------
    //                          ROUTING GEOM
    // -----------------------------------------------------------------------

    getTemplateValues(feature) {
        const templateValues = super.getTemplateValues(feature);

        // Handling to allow MultiLineString cables to be edited
        if (templateValues.geom_not_editable && this._getPlacementCoords(feature)) {
            templateValues.geom_not_editable = false;
            templateValues.geomType = this.featureDD.geometry_type;
        }
        return templateValues;
    }

    activateGeomDrawMode(feature, fieldName = 'placement_path') {
        const featureDD = feature.featureDD;
        if (!featureDD.geometry_type) return;
        if (!this._otherGeomsLayers) this._otherGeomsLayers = {};

        const maps = this._getGeomDrawMaps();
        const placementCoords = this._getPlacementCoords(feature);
        const editableGeomFieldDDs = this._getEditableGeomFieldDDs();
        const editableGeomFieldNames = editableGeomFieldDDs.map(fieldDD => fieldDD.internal_name);
        editableGeomFieldNames.forEach((item, i) => {
            if (item == 'path') editableGeomFieldNames[i] = 'placement_path';
        });

        if (feature.isNew) {
            maps.forEach(map => {
                map.enableGeomDrawModeFor(feature, { coordinates: placementCoords });
            });
        } else {
            maps.forEach(map => {
                const worldFieldNames = ['placement_path', 'offset_geom'];
                const drawFieldName = fieldName == 'path' ? 'placement_path' : fieldName;

                this._enableGeomDrawModeFor(
                    map,
                    feature,
                    drawFieldName,
                    worldFieldNames,
                    editableGeomFieldNames
                );
            });
        }
    }

    /**
     * Returns coordinates that were used for placement for use for editing geometry
     */
    _getPlacementCoords(feature) {
        const primaryGeom = feature.getGeometry();
        const placementGeom = feature.getGeometry('placement_path');

        let coords;

        if (placementGeom) {
            // This was the original route placed between structures to create the geom
            coords = placementGeom.coordinates;
        } else if (primaryGeom) {
            // Default to using first and last coord off the primary geom, which won't be correct
            // if cable had been placed with multiple points
            if (primaryGeom.type == 'MultiLineString') {
                coords = [primaryGeom.coordinates[0][0], _.last(_.last(primaryGeom.coordinates))];
            } else {
                coords = [primaryGeom.firstCoord(), primaryGeom.lastCoord()];
            }
        }

        return coords;
    }

    _getEditOverlay(map, feature, geomType) {
        super._getEditOverlay(map, feature, geomType);

        // Replace edit coordinates with the placement coords
        const coords = this._getPlacementCoords(feature);
        if (coords) {
            const editOverlay = this._editOverlay;

            editOverlay.origLatLngs = editOverlay.getLatLngs(); // Store original coords so can restore later
            editOverlay.setLatLngs(coords);
        }

        return this._editOverlay;
    }

    /**
     * Disables the geom editing mode, going back to previous mode
     * Subclassed to restore the overlay back to the cable primary geometry
     * rather than the placement geometry
     */
    endGeomDrawMode() {
        const editOverlay = this._editOverlay;
        const inGeomDrawMode = this.geomDrawMode && true;

        super.endGeomDrawMode();

        if (inGeomDrawMode && editOverlay && editOverlay.origLatLngs) {
            // Restore original coordinates on overlay as we may have overridden with placement geometry coordinates
            const origLatLngs = editOverlay.origLatLngs;
            editOverlay.setLatLngs(origLatLngs);
        }
    }

    /**
     * returns true if cable feature is internal (new or existing)
     */
    async _isInternal() {
        return this.feature.isInternal || this.cableManager.isInternal(this.feature);
    }
}
