// Copyright: IQGeo Limited 2010-2023
import _ from 'underscore';
import myw from 'myWorld-client';
import TextBoxViewer from './textBoxViewer';

export default class TextBoxFeatureRep extends myw.FeatureRepresentation {
    static {
        this.prototype.defaults = {
            borderColor: '#4387fd',
            borderWidth: 2,
            fontSize: 12,
            backgroundColor: 'no-fill'
        };

        this.prototype.textOptions = {
            textEditable: false,
            fontSize: 10
        };

        this.prototype.style = {};
    }

    constructor(feature, options) {
        super(feature, options);
        this.options = options;
        this.feature = feature;
        this._setOverlay();

        myw.app.on('featureCollection-modified', this._handleFeatureChange.bind(this));
    }

    /**
     * Feature has changed. Update representation including text editor if open.
     * @param {} ev
     */
    _handleFeatureChange(ev) {
        if (ev.feature != this.feature) return;

        this.feature = ev.feature;

        //easiest to just delete old rep and make new one with edit mode enabled?
        this._removeFromMap(this.map);
        this._overlay = null;
        this._setOverlay();
        this.addToMap(this.map);
    }

    /**
     * Adds self to a map
     * @param {MapControl} map The map on which to visualize self
     * Subclassed as we don't use olFeature but instead create an instance of
     * TextBoxViewer
     */
    addToMap(map) {
        this.map = map;
        if (this._overlay && this._overlay.layer?.isVisible && this.feature.id)
            map.addOverlay(this._overlay);
    }

    _removeFromMap(map) {
        if (this._overlay.editOverlay) this._overlay.editOverlay.removeFrom(map);
        if (this._overlay) map.removeOverlay(this._overlay);
    }

    /**
     * Remove self from its current map
     */
    removeFromMap() {
        const map = this.map;
        this.map = null;
        if (map) this._removeFromMap(map);
    }

    _setOverlay() {
        var geom = this.getGeometry(),
            worldMap = this.options.worldMap;

        if (!geom) return;

        if (!this._overlay) {
            this.textOptions.worldMap = worldMap;
            this.options.map = worldMap;
            this.options.source = this.options.vectorSource;

            const coords = geom.coordinates,
                geomOverlay = new TextBoxViewer(this.feature, this.options, coords);

            this._bounds = null;
            this._overlay = geomOverlay;
        }
    }

    /**
     *
     * @param {MywFeature} feature
     * @returns
     */
    update(feature) {
        //use format to convert geometry coordinates
        const propertiesUnchanged =
            feature && _.isEqual(feature.properties, this.feature.properties);
        //ENH: check only the geometry being represented
        const primaryGeomUnchanged = feature && _.isEqual(feature.geometry, this.feature.geometry);
        const secondaryGeomsUnchanged =
            feature && _.isEqual(feature.secondary_geometries, this.feature.secondary_geometries);

        if (propertiesUnchanged && primaryGeomUnchanged && secondaryGeomsUnchanged) return; //no changes that require rebuilding the overlay

        if (feature) this.feature = feature;
    }

    ensureEditor() {
        if (this._overlay) this._overlay.ensureEditor();
    }
}
