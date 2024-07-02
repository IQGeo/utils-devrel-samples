// Copyright: IQGeo Limited 2010-2023

import myw from 'myWorld-client';

// Mirrors mywcom_pin_range.py
class PinRange extends myw.MywClass {
    static {
        this.prototype.messageGroup = 'PinRange';
    }

    /**
     * @class A contiguous set of connection pins on a given side of a feature
     */
    constructor(side, low, high = low) {
        super();
        this.side = side;
        this.low = low;
        this.high = high;
    }

    /**
     * String representation for test results
     */
    __ident__() {
        return `PinRange(${this._spec()})`;
    }

    /**
     * String representation of self's side for GUI
     */
    sideStr() {
        return this.msg(this.side);
    }

    /**
     * Number of pins in range
     */
    //@property
    _size() {
        return this.high - this.low + 1;
    }

    /**
     * String representation of self for inclusion in URN
     */
    //@property
    _spec() {
        return `${this.side}:${this.rangeSpec()}`;
    }

    /**
     * String representation of self for inclusion in URN
     */
    rangeSpec() {
        if (this.high == this.low) {
            return `${this.low}`;
        } else {
            return `${this.low}:${this.high}`;
        }
    }

    /**
     * Returns shallow copy of self
     */
    copy() {
        return new PinRange(this.side, this.low, this.high);
    }

    /**
     * True if self includes 'pin'
     */
    includesPin(pin) {
        return pin >= this.low && pin <= this.high;
    }

    /**
     * True if self and 'other' form a continuous range
     */
    extends(other) {
        if (this.low == other.high + 1) return true;
        if (other.low == this.high + 1) return true;
        return false;
    }

    /**
     * The pins of self that are not in OTHER
     *
     * Returns a list of PinRanges
     */
    subtract(other) {
        const ranges = [];

        if (this.low < other.low) {
            const range = new PinRange(this.side, this.low, Math.min(other.low - 1, this.high));
            ranges.push(range);
        }

        if (this.high > other.high) {
            const range = new PinRange(this.side, Math.max(this.low, other.high + 1), this.high);
            ranges.push(range);
        }

        return ranges;
    }

    /**
     * The other side from self
     */
    otherSide() {
        return { in: 'out', out: 'in' }[this.side];
    }

    /**
     * True if self and 'other' overlap
     */
    overlap(other) {
        if (this.low > other.high) return false;
        if (this.high < other.low) return false;
        return true;
    }
}

// -----------------------------------------------------------------------
//                               PROPERTIES
// -----------------------------------------------------------------------

Object.defineProperty(PinRange.prototype, 'size', {
    get() {
        return this._size();
    }
});

Object.defineProperty(PinRange.prototype, 'spec', {
    /**
     * String representation of self for inclusion in URN
     */
    get() {
        return this._spec();
    }
});

export default PinRange;
