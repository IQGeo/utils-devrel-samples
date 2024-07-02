// Copyright: IQGeo Limited 2010-2023

// TBR: Won't need this subclass when platform supports setting icon src directly
import { IconStyle as MywIconStyle } from 'myWorld-client';
import { Icon, Style } from 'ol/style';

/**
 * A point style based on an image or SVG
 *
 * Supports rotation, offsetting, world size units, etc. Provides functions for
 * serialise/de-serialise from style string  building OpenLayers style
 * @extends IconStyle
 */
// Override/subclass of IconStyle allows the svg to be set directly on the style
export class DataBlockStyle extends MywIconStyle {
    constructor(options) {
        super(options);
        // icon bytes are loaded externally and set here
        this.iconBase64 = options.iconBase64;
        this.crossOrigin = options.crossOrigin;
    }

    _getOlStyle(view) {
        const { iconBase64, size, sizeUnit, orientationProp, anchorXUnit, anchorYUnit } = this;
        const { opacity, rotateWithView, crossOrigin } = this;
        if (!iconBase64) return new Style();

        const anchorX = anchorXUnit == '%' ? this.anchorX / 100 : this.anchorX;
        const anchorY = anchorYUnit == '%' ? this.anchorY / 100 : this.anchorY;

        const iconOptions = {
            rotateWithView,
            anchor: [anchorX, anchorY],
            anchorXUnits: anchorXUnit == '%' ? 'fraction' : 'pixels',
            anchorYUnits: anchorYUnit == '%' ? 'fraction' : 'pixels',
            src: iconBase64,
            scale: 1,
            opacity,
            crossOrigin
        };
        if (this.color) iconOptions.color = this.color;

        const icon = new Icon(iconOptions);
        const style = new Style({ image: icon });

        if (!this.isDynamic) return style;

        //size is defined so a scale needs to be calculated. Icon size is necessary, which we'll only know once image is loaded
        //return function that adjusts scale
        return (feature, resolution) => {
            if (orientationProp) {
                const orientation = orientationProp && feature.getProperties()[orientationProp]; //degrees
                const rotation = (Math.PI / 180) * (orientation || 0); //in radians
                style.getImage().setRotation(rotation);
            }
            if (!size) return style;
            const imgSize = icon.getSize();
            if (!imgSize) return style;

            const imgWidth = imgSize[0];
            //calculate scale from specified width
            const adjResolution = this._getPointResolutionFor(feature, resolution, view);
            let scale;
            if (sizeUnit == '%') scale = size / 100;
            else if (sizeUnit == 'm') scale = this._metersToPixels(size, adjResolution) / imgWidth;
            else scale = size / imgWidth; //size is in pixels

            style.getImage().setScale(scale);
            return style;
        };
    }
}

/**
 * style sub-type
 */
DataBlockStyle.prototype.type = 'datablock';

export default DataBlockStyle;
