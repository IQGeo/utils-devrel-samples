import geomUtils from '../base/GeomUtils';
import PinTraceNode from './PinTraceNode';

class SegmentTraceNode extends PinTraceNode {
    static {
        /**
         * A cable segment node in a fiber network trace result
         *
         * Also used to model a list of connected segments (see mutation code)
         */

        this.prototype.type = 'segment';
    }

    /**
     * Init slots of self
     */
    constructor(
        feature,
        tech,
        pins,
        direction,
        dist,
        ewlDist,
        parent = undefined,
        loc = undefined
    ) {
        super(feature, tech, pins, direction, dist, /*parent=*/ parent);

        // Determine if this is a continuation node
        this.leaving =
            parent && parent.type == 'segment' && parent.feature.getUrn() == feature.getUrn();

        // Set trace direction relative to geom (if meaningful)
        this.seg_forward = true; // ENH: Remove need for this
        if (this.leaving) {
            this.seg_forward = pins.side == 'out';
        }

        // Init list of consolidated segments (see mutation)
        this.segments = undefined;

        this.node_id += `-${pins.spec}`; // Used for detecting 'already visited'
        this._loc = loc;
        this._ewlDist = ewlDist;
    }

    //@property
    /**
     * True if this is first node on segment
     */
    _entering() {
        return !this.leaving;
    }

    //@property
    /**
     * For display in trace result
     */
    _fibers() {
        return `${this.pins.rangeSpec()}`;
    }

    //@property
    /**
     * Position on self's feature at which self starts (if partial link)
     */
    _start_coord() {
        if (!this.segments) {
            return undefined;
        }

        const geom = this.segments[0].geometry;

        if (this.seg_forward) {
            return geom.firstCoord();
        } else {
            return geom.lastCoord();
        }
    }

    //@property
    /**
     * Position on self's feature at which self ends (if partial link)
     */
    _stop_coord() {
        // Case: Root node of trace from segment
        if (this.dist == 0.0) {
            return this.start_coord;
        }

        // Case: Unconsolidated segment
        if (!this.segments) {
            return undefined;
        }

        const geom = this.segments[this.segments.length - 1].geometry;

        // Case: Full link
        if (!this.partial) {
            if (this.seg_forward) {
                return geom.lastCoord();
            } else {
                return geom.firstCoord();
            }
        }

        // Case: Zero length segment (prevents problems later)
        if (geom.length() == 0.0) {
            return geom.firstCoord();
        }

        // Find position of stop point along last segment (as proportion of total length)
        // Remember: dist may have been computed from a stored length value
        let pos = (this.dist - this.prev_seg_dist) / (this.full_dist - this.prev_seg_dist);
        if (!this.seg_forward) {
            pos = 1.0 - pos;
        }

        // Compute coordinate at that position
        return geomUtils.coordAtPos(geom, pos);
    }

    /**
     * The coordinates of self's path
     *
     * Returns a list of coords
     */
    coords() {
        // Assumes self is unconsolidated

        if (this.leaving) {
            return [];
        }

        const geom = this.feature.geometry;
        let coords = geom.coordinates;

        if (this.seg_forward) {
            coords = [...coords].reverse();
        }

        return coords;
    }

    /**
     * Convert self to a cable node
     *
     * Returns self
     */
    async convertToCable() {
        if (this.segments === undefined) {
            this.segments = [this.feature];
            this.feature = await this.feature.followRef('cable');
        }

        return this;
    }

    /**
     * Merge self's 'obvious' children into self (to simplify trace)
     */
    consolidate() {
        // Set start distance
        if (this.parent) {
            this.prev_seg_dist = this.parent.dist;
        } else {
            this.prev_seg_dist = 0;
        }

        // While child node relates to same cable .. consolidate it into self
        while (
            this.children.length == 1 &&
            this.children[0].feature.getUrn() == this.feature.getUrn()
        ) {
            const child_node = this.children[0];

            if (child_node.leaving) {
                this.prev_seg_dist = this.dist;
                this.pins.side = child_node.pins.side;
                this.seg_forward = child_node.seg_forward;
                this.dist = child_node.dist;
                this.partial = child_node.partial;
                this.full_dist = child_node.full_dist;
                this.segments = [...this.segments, ...child_node.segments];
            }
            this.children = child_node.children;
        }

        // Consolidate connections
        super.consolidate();

        return this;
    }

    /**
     * The pin on self's feature that is connected to CHILD_PIN of CHILD_NODE
     */
    pinFor(child_node, child_pin) {
        return child_pin;
    }
}

Object.defineProperty(SegmentTraceNode.prototype, 'entering', {
    get() {
        return this._entering();
    }
});

Object.defineProperty(SegmentTraceNode.prototype, 'fibers', {
    get() {
        return this._fibers();
    }
});

Object.defineProperty(SegmentTraceNode.prototype, 'start_coord', {
    get() {
        return this._start_coord();
    }
});

Object.defineProperty(SegmentTraceNode.prototype, 'stop_coord', {
    get() {
        return this._stop_coord();
    }
});

Object.defineProperty(SegmentTraceNode.prototype, 'loc', {
    get() {
        return this._loc;
    }
});

Object.defineProperty(SegmentTraceNode.prototype, 'ewlDist', {
    get() {
        return this._ewlDist;
    }
});

export default SegmentTraceNode;
