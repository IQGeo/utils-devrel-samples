// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin } from 'myWorld-client';

export default class AddMarkerPlugin extends Plugin {
    /**
     * @class Plugin for adding a graphic
     * Adds an alert graphic at map center. Takes input string and sets to tooltip.
     * Designed to be used with platform functionality &ll=lat,lng&z=zoom_level
     * Added for Fiber monitoring system (FMS) integration, but can be used generally
     * @param  {Application} owner  The application
     * @param  {Object}      options  Options for the plugin configuration
     * @extends {myw.Plugin}
     */
    // @ts-ignore
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
    }

    /**
     * Hook into platform method to grab URL query string with param matching plugin name: 'addMarker'
     */
    setStateFromAppLink(label) {
        this.renderMarker(label);
    }

    /**
     * 1) Create vectorlayer overlay
     * 2) Add graphic at map center
     * 3) Set tooltip to param value
     */
    renderMarker(label) {
        const center = this.app.map.getCenter();
        if (!center) return;

        if (!this._overlay) {
            this._overlay = new myw.GeoJSONVectorLayer({
                map: this.app.map,
                name: 'alerts',
                zIndex: 100
            });
            this._markerStyle = new myw.IconStyle({
                iconUrl: 'modules/comms/images/red.svg',
                iconAnchor: [15, 30]
            });
        }
        // reverse order of coordinates and put in array
        const coords = [center.lng, center.lat];
        const marker = this._overlay.addPoint(coords, this._markerStyle);
        marker.bindTooltip(label);
        return marker;
    }
}
