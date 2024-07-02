//###############################################################################
// A network pin range
//###############################################################################
// Copyright: IQGeo Limited 2010-2023

import myw, { MywError } from 'myWorld-native-services';
import { MywClass } from 'myWorld-base';

/**
 * A contiguous set of connection pins on a given side of a feature
 *
 * Provides facilities for parsing from strings, computing range, ..
 */
class PinRange extends MywClass {
    static parse(spec) {
        // Split into components
        // ENH: Use a regex
        const parts = spec.split(':');

        const n_parts = parts.length;
        if (n_parts < 2 || n_parts > 3) {
            throw MywError('Bad pin spec:', spec);
        }

        // Extract properties
        const side = parts[0];
        const low_str = parts[1];
        const high_str = n_parts > 2 ? parts[2] : low_str;

        if (!['in', 'out'].includes(side)) {
            throw MywError('Bad pin spec:', spec);
        }

        // Create
        return new PinRange(side, parseInt(low_str), parseInt(high_str));
    }

    /**
     * Init slots of self
     */
    constructor(side, low, high = low) {
        super();
        this.side = side;
        this.low = low;
        this.high = high;
    }

    /**
     * Identifying string for progress messages
     */
    toString() {
        return `PinRange(${this.spec})`;
    }

    /**
     * Self as a dict
     */
    definition() {
        const defn = {};
        defn['side'] = this.side;
        defn['low'] = this.low;
        defn['high'] = this.high;

        return defn;
    }

    //@property
    /**
     * Full string representation of self
     */
    _spec() {
        return `${this.side}:${this.rangeSpec()}`;
    }

    /**
     * String representation of self's pin range
     */
    rangeSpec() {
        if (this.high == this.low) {
            return `${this.low}`;
        } else {
            return `${this.low}:${this.high}`;
        }
    }

    /**
     * 'in' operator
     *
     * OTHER is a PinRange or int
     */
    contains(other) {
        if (other instanceof PinRange) {
            return this.contains(other.low) && this.contains(other.high);
        }
        return this.low <= other && other <= this.high;
    }

    /**
     * Iteration range
     */
    // ENH: Make class an iterator
    /**
     * Iteration range
     */
    range() {
        const values = [];
        for (let i = this.low; i <= this.high; i++) {
            values.push(i);
        }
        return values;
    }

    /**
     * The pins of self that match OTHER (if any)
     *
     * Returns a PinRange (or None)
     */
    intersect(other) {
        if (this.low > other.high) return undefined;
        if (this.high < other.low) return undefined;

        return new PinRange(
            this.side,
            Math.max(this.low, other.low),
            Math.min(this.high, other.high)
        );
    }

    /**
     * The pins of self that are not in OTHER
     *
     * Returns a list of PinRanges
     */
    subtract(other) {
        const pin_ranges = [];

        if (this.low < other.low) {
            const pin_range = new PinRange(this.side, this.low, Math.min(other.low - 1, this.high));
            pin_ranges.push(pin_range);
        }

        if (this.high > other.high) {
            const pin_range = new PinRange(
                this.side,
                Math.max(this.low, other.high + 1),
                this.high
            );
            pin_ranges.push(pin_range);
        }

        return pin_ranges;
    }

    //@property
    /**
     * Size of self's range
     */
    _size() {
        return 1 + (this.high - this.low);
    }

    /**
     * The other side from self
     */
    otherSide() {
        if (this.side == 'in') return 'out';
        if (this.side == 'out') return 'in';
        throw MywError('Bad side:', this.side);
    }
}

Object.defineProperty(PinRange.prototype, 'spec', {
    get() {
        return this._spec();
    }
});

Object.defineProperty(PinRange.prototype, 'size', {
    get() {
        return this._size();
    }
});

export default PinRange;
