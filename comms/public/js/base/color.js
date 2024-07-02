// Copyright: IQGeo Limited 2010-2023

import { MywClass } from 'myWorld-client';

/**
 * @class A color
 *
 * Stores r,g,b values as intensities in range 0:255. Provides helper functions for converting format etc
 */
// ENH: Replace by Open Layers color? Or make this a subclass?
class Color extends MywClass {
    static fromHex(str) {
        str = +('0x' + str.slice(1).replace(str.length < 5 && /./g, '$&$&'));
        const r = str >> 16;
        const g = (str >> 8) & 255;
        const b = str & 255;
        return new Color(r, g, b);
    }

    static fromRgba(str) {
        const m = this.str.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)$/);
        this.r = m[1];
        this.g = m[2];
        this.b = m[3];
        return new Color(this.r, this.g, this.b);
    }

    /**
     * Init from color intensities (ints in range 0:255)
     */
    constructor(r, g, b) {
        super();
        this.r = r;
        this.g = g;
        this.b = b;
    }

    /*
     * True if self is the same color as 'other'
     */
    equals(other) {
        return this.r == other.r && this.b == other.b && this.g == other.g;
    }

    /*
     * True if self is full white
     */
    isWhite(other) {
        return this.r == 255 && this.b == 255 && this.g == 255;
    }

    /*
     * True if self is on the lighter side.
     * Useful in situations when you want to determine what this.str text to use on a background this.str.
     */
    isLight() {
        // See from http://alienryderflex.com/hsp.html
        // We use HSP squared for speed (avoids sqrt())
        const hsp2 =
            0.299 * (this.r * this.r) + 0.587 * (this.g * this.g) + 0.114 * (this.b * this.b);

        return hsp2 > 127.5 ** 2;
    }

    /**
     * Returns self alpha-blended with 'other'
     */
    blend(other, prop) {
        const selfFac = prop / 100.0;
        const otherFac = 1.0 - selfFac;
        return new Color(
            Math.round(selfFac * this.r + otherFac * other.r),
            Math.round(selfFac * this.g + otherFac * other.g),
            Math.round(selfFac * this.b + otherFac * other.b)
        );
    }

    /**
     * Returns this as an hex string with 'opacity'
     */
    hexStr() {
        // ENH: Cache this
        let str = '#';
        for (const val of [this.r, this.g, this.b]) {
            str += val.toString(16).padStart(2, '0');
        }
        return str;
    }

    /**
     * Returns this as an rgba string with 'opacity' (a percentage)
     */
    rgbaStr(opacity) {
        const opacityFac = opacity / 100.0;
        return `rgba(${this.r},${this.g},${this.b},${opacityFac})`;
    }
}

// Constants
Color.prototype.black = new Color(0, 0, 0);
Color.prototype.white = new Color(255, 255, 255);

export default Color;
