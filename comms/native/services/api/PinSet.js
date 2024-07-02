//###############################################################################
// A set of network pin ranges
//###############################################################################
// Copyright: IQGeo Limited 2010-2023

import { MywClass } from 'myWorld-base';
import PinRange from './PinRange';

/**
 * A set of non-overlapping PinRanges
 */
class PinSet extends MywClass {
    /**
     * Init slots of self
     */
    constructor(side, low, high) {
        super();
        this.side = side;
        this.ranges = [new PinRange(side, low, high)];
    }

    /**
     * A copy of self with RANGE excludes
     *
     * Returns a PinSet (or None)
     */
    subtract(range) {
        const sub_ranges = [];

        for (const self_range of this.ranges) {
            for (const sub_range of self_range.subtract(range)) {
                sub_ranges.push(sub_range);
            }
        }

        const sub_set = new PinSet(this.side, 0, 0);
        sub_set.ranges = sub_ranges;

        return sub_set;
    }

    /**
     * Identifying string for progress messages
     */
    toString() {
        return `PinSet(${this.spec})`;
    }

    //@property
    /**
     * Full string representation of self
     */
    _spec() {
        const range_specs = [];
        for (const r of this.ranges) range_specs.push(r.rangeSpec());

        return `${this.side}-${range_specs.join(',')}`;
    }
}

// -----------------------------------------------------------------------
//                               PROPERTIES
// -----------------------------------------------------------------------

Object.defineProperty(PinSet.prototype, 'spec', {
    /**
     * String representation of self for inclusion in URN
     */
    get() {
        return `${this._spec()}`;
    }
});

export default PinSet;
