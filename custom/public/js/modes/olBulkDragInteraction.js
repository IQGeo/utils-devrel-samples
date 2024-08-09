import _ from 'underscore';
import { Pointer as PointerInteraction } from 'ol/interaction';

/**
 * A slight variation to olDragInteraction found in core.
 *
 * When dragging a feature, all features in the layer will move with it.
 *
 * @extends {ol/interaction/PointerInteraction}
 * @private
 */
export default class olBulkDragInteraction extends PointerInteraction {
    /**
     * @param {Object} options
     * @param {Map} options.map
     */
    constructor(options) {
        super();

        this.map = options.map;

        /**
         * @type {ol/coordinate/Coordinate}
         * @private
         */
        this.coordinate = null;

        /**
         * @type {string|undefined}
         * @private
         */
        this._cursor = 'pointer';

        /**
         * @type {Feature}
         * @private
         */
        this._feature = null;

        /**
         * @type {string|undefined}
         * @private
         */
        this._previousCursor = undefined;

        /**
         * Vector source
         * @type {ol/Vector}
         */
        this.source = options.source;

        /**
         * Option to enable dragging when modifing a point - used in rotation mode
         */
        this.usePoints = options.usePoints;
    }

    /**
     * Starts dragging if clicked on a feature
     * @param {ol/MapBrowserEvent} evt Map browser event.
     */
    handleDownEvent(evt) {
        const map = evt.map;
        const pixelTolerance = this.map.getSelectTolerance();

        const features = this.source.getFeatures();
        const feature = map.forEachFeatureAtPixel(
            evt.pixel,
            function (feature) {
                if (features.includes(feature)) return feature;
            },
            { hitTolerance: pixelTolerance }
        );
        let shouldDrag = true;
        if (!feature) return false;

        this.coordinate = evt.coordinate;
        this.startLngLat = this.startLngLat || _.clone(evt.lngLat);

        return !!feature && shouldDrag;
    }

    /**
     * Moves feature
     * @param {ol/MapBrowserEvent} evt Map browser event.
     */
    handleDragEvent(evt) {
        if (!this.coordinate) return;

        const relativeDelta = {
            deltaX: evt.coordinate[0] - this.coordinate[0],
            deltaY: evt.coordinate[1] - this.coordinate[1]
        };

        this.delta = {
            lng: evt.lngLat[0] - this.startLngLat[0],
            lat: evt.lngLat[1] - this.startLngLat[1]
        };

        //Move all the features in the layer
        this.source.getFeatures().forEach(feature => {
            //Move feature
            const geometry = feature.getGeometry();
            geometry.translate(relativeDelta.deltaX, relativeDelta.deltaY);
        });

        this.coordinate = _.clone(evt.coordinate);

        this.dispatchEvent('drag');
    }

    /**
     * Dispatches dragend event
     * @return {boolean} `false` to stop the drag sequence.
     */
    handleUpEvent() {
        this.dispatchEvent('dragend');
        this.coordinate = null;
        this.feature = null;
        return false;
    }
}
