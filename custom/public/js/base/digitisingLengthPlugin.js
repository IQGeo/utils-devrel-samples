// Copyright: IQGeo Limited 2010-2023
import _ from 'underscore';
import myw from 'myWorld-client';

export default class DigitisingLengthPlugin extends myw.Plugin {
    constructor(owner, options) {
        super(owner, options);

        _.bindAll(this, 'start', 'stop', 'followMouse');

        this.defaultUnit = myw.applicationDefinition.displayUnits.length;
        const lengthScaleDef = this.app.system.settings['core.units'].length;
        this.unitScale = new myw.UnitScale(lengthScaleDef);

        const map = (this.map = this.app.map);
        map.on('editable:enable', this.start);
        map.on('editable:drawing:commit editable:disable', this.stop);
    }

    start() {
        /*eslint-disable no-undef*/
        const map = this.map;
        if (!this.marker) {
            this.marker = L.marker(map.getCenter(), {
                icon: L.divIcon({
                    html: '',
                    className: 'length-preview',
                    iconAnchor: L.point(-10, 0),
                    iconSize: L.point(100, 100)
                }),
                zIndexOffset: 1000
            });
        }
        /*eslint-enable no-undef*/
        this.marker.addTo(map);
        //context/this is the map
        map.on('mousemove', this.followMouse);
    }

    stop() {
        this.marker.remove();
        this.map.off('mousemove', this.followMouse);
    }

    followMouse(e) {
        this.marker.setLatLng(e.latlng);
        const intMode = this.app.map.currentInteractionMode();
        let latLngs = intMode.getLatLngs();
        if (!latLngs.concat) return;

        latLngs = latLngs.concat(e.latlng);
        if (latLngs.length <= 1) return;

        const geom = myw.geometry.lineString(latLngs);
        const length = geom.length();
        const value = this.unitScale.value(length, 'm');
        this.marker._icon.innerHTML = value.toString(this.defaultUnit);
    }
}
