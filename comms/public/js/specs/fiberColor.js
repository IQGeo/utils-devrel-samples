// Copyright: IQGeo Limited 2010-2023
import { MywClass } from 'myWorld-client';
import Color from '../base/color';

export default class FiberColor extends MywClass {
    // Create from a list of BundleDefDefs
    constructor(bundles = []) {
        super();
        this.bundles = bundles;
    }

    /**
     * Render self. on ReportStream 'strm'
     * If 'draw' is false, just compute dimensions
     * @returns dimensions (chars)
     */
    reportOn(strm, item, draw = true) {
        switch (strm.type) {
            case 'pdf': {
                const origX = strm._pos.x;

                // For each bundle ..
                for (const bundleDef of this.bundles) {
                    // Add symbol (inc stripe) or get dims
                    if (draw) {
                        this._pdfRenderBundleSymbol(strm, bundleDef.color, bundleDef.abbr);
                    } else {
                        strm._pos.x += strm.doc.getTextDimensions(bundleDef.abbr).w;
                    }

                    // Leave gap before next symbol
                    strm._pos.x += 3;
                }

                // Return size
                const ftSize = strm.doc.getFontSize();
                const width = (strm._pos.x - origX) / ftSize;
                const height = 1;
                if (!draw) strm._pos.x = origX; //Set pos back to original // ENH: Don't modify pos

                return { w: width, h: height };
            }

            case 'html': {
                // For each bundle ..
                let str = '';
                for (const bundleDef of this.bundles) {
                    // Add symbol (inc stripe)
                    if (draw) this._htmlRenderBundleSymbol(strm, bundleDef.color, bundleDef.abbr);
                    str += bundleDef.abbr;
                }

                // Return size
                return { w: str.length, h: 1 };
            }

            case 'xlsx': {
                let str = '';
                for (const bundleDef of this.bundles) {
                    const bundleStr = '[' + bundleDef.abbr + '] ';

                    if (draw) {
                        // Build colour (ensuring visible)
                        const grey = new Color(128, 128, 128); // ENH: As shared const
                        let color = bundleDef.color;
                        if (color.isWhite()) color = Color.prototype.black;
                        color = color.blend(grey, 65);
                        const style = { color: color.hexStr(), bold: true };

                        // Write text
                        strm._drawItem({ value: bundleStr, style: style });
                    }

                    str += bundleStr;
                }

                // Return size
                return { w: str.length, h: 1 };
            }

            default: {
                let str = '';
                for (const bundleDef of this.bundles) {
                    str += '[' + bundleDef.abbr + ']';
                }

                if (draw) strm.doc += str;

                // Return size
                return { w: str.length, h: 1 };
            }
        }
    }

    /**
     * Render an fiber color symbol on PDF document 'doc'
     */
    _pdfRenderBundleSymbol(strm, color, abbr) {
        const bgColor = color.blend(color.white, 50).hexStr();
        const textColor = color.isLight() ? '#000000' : '#ffffff';

        const bundleItem = {
            value: abbr,
            color: textColor,
            backgroundColor: bgColor
        };

        strm._writeItems([bundleItem]);
    }

    /**
     * Render an fiber color symbol on HTML table in doc
     */
    _htmlRenderBundleSymbol(strm, color, abbr) {
        const bgColor = color.blend(color.white, 50).hexStr();
        const textColor = color.isLight() ? '#000000' : '#ffffff';

        //Build style (so it doesnt depend on product css)
        const style = {
            color: textColor,
            'background-color': bgColor,
            'min-width': '14px',
            padding: '0 4px',
            height: '18px',
            'line-height': '18px',
            display: 'inline-block',
            'text-align': 'center',
            'font-size': '10px'
        };

        // Draw border around white it's differentiable
        if (color.isWhite()) {
            style.border = '1px solid #ccc';
            style.height = '16px';
            style['line-height'] = '16px';
        }

        strm._startEl('span', style);
        strm.doc += abbr;
        strm._endEl();
    }
}
