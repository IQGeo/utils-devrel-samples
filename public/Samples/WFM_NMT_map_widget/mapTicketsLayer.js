import myw, { GeoJSONVectorLayer, LineStyle, FillStyle, SymbolStyle } from 'myWorld-client';

class MapTicketsLayer {
    constructor(app) {
        this.app = myw.app;

        this.layer = new GeoJSONVectorLayer({ zindex: 1000 });

        this.polygonStyle = new FillStyle({
            color: '#ff77ff',
            opacity: 0.45
        });
        this.pointStyles = {
            Open: new SymbolStyle({
                symbol: 'circle',
                size: '20',
                sizeUnit: 'px',
                borderColor: '#0c6404ff',
                color: '#7ada96ff'
            }),
            Closed: new SymbolStyle({
                symbol: 'circle',
                size: '20',
                sizeUnit: 'px',
                borderColor: '#121212ff',
                color: '#abaaaeff'
            }),
            DEFAULT: new SymbolStyle({
                symbol: 'circle',
                size: '20',
                sizeUnit: 'px',
                borderColor: '#ffe91fff',
                color: '#8633f4ff'
            })
        };
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

    addMywGeoms(mywGeom, ticket_id, ticket_status) {
        // assign point style based on ticket status
        const currentPointStyle = this.pointStyles[ticket_status] || this.pointStyles['DEFAULT'];
        const tooltipText = ticket_id + '<br>' + ticket_status;

        const map_feature = this.layer.addGeom(mywGeom, currentPointStyle);
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
