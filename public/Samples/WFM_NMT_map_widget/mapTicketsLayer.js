import myw, { GeoJSONVectorLayer, LineStyle, FillStyle, SymbolStyle } from 'myWorld-client';

class MapTicketsLayer {
    constructor(app) {
        this.app = myw.app;

        this.layer = new GeoJSONVectorLayer({ zindex: 100 });

        this.lineStyle = new LineStyle({ width: 4, color: '#efa316dd' });

        this.polygonStyle = new FillStyle({
            color: '#ff77ff',
            opacity: 0.35
        });

        this.pointStyle = new SymbolStyle({
            symbol: 'circle',
            size: '20',
            sizeUnit: 'px',
            borderColor: '#ffe91fff',
            color: '#9c66e6ff'
        });
    }

    show() {
        this.layer.setMap(this.app.map);
    }

    hide() {
        this.layer.setMap(null);
        this.layer.clear();
        this.app.map.removeLayer(this.layer);
    }

    clear() {
        this.layer.clear();
    }

    addMywGeoms(mywGeom, tooltipText) {
        const map_feature = this.layer.addGeom(mywGeom, this.pointStyle);
        map_feature.bindTooltip(tooltipText);
    }

    addGeoJSONCollection(geoJSONCollection) {
        this.layer.addGeoJSON(geoJSONCollection, this.polygonStyle);
    }
    removeFeature(feature) {
        this.layer.removeFeature(feature);
    }
}
export default MapTicketsLayer;
