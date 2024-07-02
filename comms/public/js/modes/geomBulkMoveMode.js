// Copyright: IQGeo Limited 2010-2023
import _ from 'underscore';
import myw, { MapInteractionMode, GeoJSONVectorLayer } from 'myWorld-client';
import olBulkDragInteraction from './olBulkDragInteraction';
import { getEditStyleFor } from '../base/geomUtils';
import cancelModeIcon from 'images/inactiveContextMenuItem.png';

export default class BulkGeomMoveMode extends MapInteractionMode {
    static {
        this.mergeOptions({
            buffer: {
                size: 5,
                units: 'meters'
            }
        });
    }

    /**
     * Initialization. Doesn't enable the mode
     *
     * @override
     * @class Provides a MoveHandler to allow a geometries to be moved.
     * @param {Map}     map       Map on which the mode will be enabled
     * @param {object} [options]  *optional* for overwriting default options
     * @constructs
     * @extends {MapInteractionMode}
     */
    constructor(map, options) {
        super(map, options);
        this.map = map;
        this._enabled = false;
        this.features = options.features;
        _.extend(this.options.buffer, options.buffer);

        _.bindAll(this, '_handleDragEnd');
    }

    /**
     * Enables geometry move mode with the currently set options
     * @override
     */
    enable() {
        this._enabled = true;
        this._setContextMenu();

        if (!this._overlay) {
            this._overlay = new GeoJSONVectorLayer({ zIndex: 150 });
            this.source = this._overlay.getSource();

            // this._overlay = new VectorLayer({ source: this.source });
            this.map.addLayer(this._overlay);
        }

        if (this._moving) this.removeMoveFeature();

        this.addMoveFeature();
    }

    /**
     * Disables geometry rotating mode
     * @override
     */
    disable() {
        this._moving = false;
        this._enabled = false;

        this.removeMoveFeature();

        this.map.contextmenu.clear();

        this.map.fire('geomBulkMove-end');
    }

    /**
     * @override
     * @return {boolean} True if this mode is enabled
     */
    isEnabled() {
        return this._enabled;
    }

    addMoveFeature() {
        if (this._moving) this.removeMoveFeature();

        this.features.forEach(feature => {
            const geomFieldName = feature.getGeometryFieldNameForWorld(this.map.worldId);
            const geom = feature.getGeometry(geomFieldName);
            const style = this._getFeatureStyle(geom.getType());
            if (geom) feature.olFeature = this._overlay.addGeoJSON(geom, style);
        });

        const moveFeature = this._createMoveFeature();

        this._overlay.addGeoJSON(moveFeature.geometry);

        this.drag = new olBulkDragInteraction({
            map: this.map,
            source: this.source,
            usePoints: true
        });

        this.map.addInteraction(this.drag);

        this._moving = true;
        this.setEventListeners('on');
    }

    _createMoveFeature() {
        /* eslint-disable no-undef */
        const featureCollection = turf.featureCollection(this.features);
        const featureCollectionBbox = turf.bbox(featureCollection);
        const bufferedFeatureCollection = turf.buffer(
            turf.bboxPolygon(featureCollectionBbox),
            this.options.buffer.size,
            {
                units: this.options.buffer.units
            }
        );
        return turf.bboxPolygon(turf.bbox(bufferedFeatureCollection));
        /* eslint-enable no-undef */
    }

    removeMoveFeature() {
        if (this._movePolygon) {
            this.setEventListeners('un');
        }
        this.map.removeInteraction(this.drag);
        this.drag = null;
        this._overlay.getSource().clear();
        this.map.removeLayer(this._overlay);
        this._moving = false;
    }

    _getFeatureStyle(geomType) {
        return new myw.Style(getEditStyleFor(geomType, myw.GeomDrawMode.prototype.options, false));
    }

    /**
     * Enable or disable map Event listeners
     * @param {string} onOrOff   'on' to enable, 'off' to disable
     */
    setEventListeners(onOrUn) {
        if (this.drag) this.drag[onOrUn]('dragend', this._handleDragEnd);
    }

    /*
     * Ends the current map interaction mode.
     */
    _endMode() {
        this.map.fire('geomBulkMove-end');
    }

    /*
     * Handles drag end event.
     */
    _handleDragEnd(e) {
        this.map.fire('geomBulkMove-dragEnd', { features: this.features, delta: this.drag.delta });
    }

    /*
     * Context menu provides option to end this move mode
     */
    _setContextMenu() {
        const contextmenu = this.map.contextmenu;
        contextmenu.clear();

        const cancelMode = {
            text: myw.msg('BulkGeomMoveMode', 'cancel'),
            icon: cancelModeIcon,
            callback: this._endMode.bind(this)
        };

        contextmenu.extend([cancelMode]);
    }
}
