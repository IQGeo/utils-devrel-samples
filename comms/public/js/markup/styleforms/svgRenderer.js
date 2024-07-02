import { symbols } from './symbols';

const svgRenderer = {
    xmlns: 'http://www.w3.org/2000/svg',

    // Symbol definitions (100 x 100, anchor at 50,50)
    symbols,

    render(symbol) {
        const symbolPath = this.symbols[symbol];
        if (!symbolPath) throw 'symbol ' + symbol + ' is not defined';
        const svg = symbol === 'circle' ? this._createCircleSVG() : this._createPath(symbolPath);
        svg.setAttributeNS(null, 'viewBox', '0 0 100 100');
        return svg;
    },

    _createPath(symbolPath) {
        const svg = document.createElementNS(this.xmlns, 'svg');
        const path = document.createElementNS(this.xmlns, 'path');
        const pathString = this.convertPointsToPath(symbolPath);
        path.setAttributeNS(null, 'd', pathString);
        svg.appendChild(path);
        return svg;
    },

    _createCircleSVG() {
        const svg = document.createElementNS(this.xmlns, 'svg');
        const circle = document.createElementNS(this.xmlns, 'circle');
        const pathObj = this.createCirclePath();
        circle.setAttributeNS(null, 'cx', pathObj.cx);
        circle.setAttributeNS(null, 'cy', pathObj.cy);
        circle.setAttributeNS(null, 'r', pathObj.r);
        svg.appendChild(circle);
        return svg;
    },

    createCirclePath() {
        return { cx: '50', cy: '50', r: '45' };
    },

    convertPointsToPath(coords) {
        let path = 'M';
        for (let i = 0; i < coords.length; i++) {
            path += ' ' + coords[i].join(' ');
        }
        return path;
    }
};

export default svgRenderer;
