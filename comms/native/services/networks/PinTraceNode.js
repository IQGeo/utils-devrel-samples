// Copyright: IQGeo Limited 2010-2023

//import {MywError} from 'myWorld-native-services'
import ProgressHandler from '../base/ProgressHandler';
import { TraceNode } from 'myWorld-native-services';
import TracePin from './TracePin';
import geomUtils from '../base/GeomUtils';
import myw from 'myWorld-base';

/*eslint-disable no-await-in-loop*/
class PinTraceNode extends TraceNode {
    static {
        /**
         * Superclass for nodes in a pin-level network trace result
         *
         * Provides methods for trace consolidation
         */

        // User-level properties (for all subclasses)
        this.prototype.metadata = [
            'ports',
            'fibers',
            'from_',
            'to_',
            'length',
            'direction',
            'individualLoss',
            'cumulativeLoss',
            'loc',
            ...TraceNode.prototype.metadata
        ];

        this.prototype.metadata_unit_scales = {
            ...TraceNode.prototype.metadata_unit_scales,
            length: { scale: 'length', unit: 'm' },
            individualLoss: { scale: 'fiber_loss', unit: 'dB' },
            cumulativeLoss: { scale: 'fiber_loss', unit: 'dB' }
        };

        // Backstop values for user-level properties
        this.prototype.ports = undefined;

        this.prototype.fibers = undefined;
        this.prototype.from_ = undefined;
        this.prototype.to_ = undefined;
        this.prototype.loc = undefined;

        // For debugging
        this.prototype.progress = ProgressHandler.newFor('comms.tracing', 0);
    }

    /**
     * Init slots of self
     *
     * PINS in a PinRange. DIRECTION is trace direction ('upstream', 'downstream' or 'both')
     */
    constructor(feature, tech, pins, direction, dist, parent = undefined) {
        super(feature, dist, /*parent:*/ parent);
        this.pins = pins;
        this.direction = direction;
        this.tech = tech;
    }

    //@property
    /**
     * Length of self's leg, in metres (if appropriate)
     */
    _length() {
        let length;
        if (this.parent) {
            length = this.dist - this.parent.dist;
        } else {
            length = this.dist;
        }

        if (!length) {
            return undefined;
        }

        return length.toFixed(2);
    }

    /**
     * Individual Loss in dB.
     */
    get individualLoss() {
        const featureFunction = this._functionOf();
        if (!featureFunction) return 0.0;

        const lossConfig = myw.config['mywcom.loss'];
        const lossByTech = lossConfig[this.tech];
        if (!lossByTech) return 0.0;

        let loss = lossByTech[featureFunction];
        if (!loss) return 0.0;

        if (this.tech === 'copper' && featureFunction === 'cable') {
            loss = loss[String(parseInt(this.feature.properties.gauge))] || 0.0;
        }

        return this.length ? this.length * (loss / 1000) : loss;
    }

    /**
     * @property
     * Cumulative Fiber Loss in dB (iterative)
     * @returns  {float}
     */
    get cumulativeLoss() {
        if (this.cumulative_loss) {
            return this.cumulative_loss;
        }

        let node = this;
        let cumulative_loss = 0.0;

        while (node) {
            if (node.parent) {
                // prevent adding duplicative loss to cumulative loss
                if (node.feature.getUrn() !== node.parent.feature.getUrn()) {
                    cumulative_loss += node.individualLoss;
                }
            } else {
                cumulative_loss += node.individualLoss;
            }
            node = node.parent;
        }

        this.cumulative_loss = cumulative_loss;

        return this.cumulative_loss;
    }

    /**
     * The coordinates for path from this' root node to this (iterative)
     * @returns {Array} coords
     */
    coordsFromRoot() {
        const coords = [];

        // add this
        this._addCoords(this, coords);

        let currentNode = this;
        while (currentNode.parent) {
            this._addCoords(currentNode.parent, coords);
            currentNode = currentNode.parent;
        }

        return coords.reverse();
    }

    /**
     * Adds coordinate pairs to coords from currentNode
     * @param {Object} currentNode
     * @param {Array} coords list of coordinates to add to
     */
    _addCoords(currentNode, coords) {
        const nodeCoords = currentNode.coords();

        // case: linestring so reverse it's coords
        if (nodeCoords.length > 1) {
            nodeCoords.reverse();
        }

        for (let coord of nodeCoords) {
            if (!coords.length || !geomUtils.coordEqual(coord, coords[coords.length - 1])) {
                coords.push(coord);
            }
        }
    }

    /**
     * The coordinates of self's path
     *
     * Returns a list of coords
     */
    coords() {
        return this.feature.geometry.flatCoordinates();
    }

    /**
     * Consolidate consecutive links in self's sub-tree
     *
     * Returns self
     */
    async tidy() {
        // Convert cable segs -> cables
        await this.mutateCableSegments();

        // Consolidate nodes (to simplify result)
        const nodes = [this];
        while (nodes.length) {
            const node = nodes.pop();
            node.consolidate();
            for (const child of node.children) {
                nodes.push(child);
            }
        }

        return this;
    }

    /**
     * Convert cable segment nodes of self's subtree to cable nodes
     *
     * Returns self
     */
    // Uses pseudo-recursion to avoid stack overflow
    async mutateCableSegments() {
        const nodes = [this];

        while (nodes.length) {
            const node = nodes.shift();

            if (node.type == 'segment') {
                await node.convertToCable();
            }

            for (const child of node.children) {
                nodes.push(child);
            }
        }

        return this;
    }

    /**
     * Merge self's 'obvious' children into self (to simplify trace)
     */
    // Subclassed in MywcomSegmentTraceNode
    consolidate() {
        // If child is single connection .. skip it
        if (this.children.length == 1) {
            const child = this.children[0];

            if (child.type == 'connection' && child.children.length == 1 && !child.conn.is_splice) {
                this.children = child.children;
            }
        }
    }

    /**
     * The leaf nodes of self's sub-tree (iterative)
     * ENH: move to super
     * @returns {Array}
     */
    leafNodes() {
        const leafNodes = [];
        const stack = [this];

        while (stack.length > 0) {
            const currentNode = stack.pop();

            if (!currentNode.children || currentNode.children.length === 0) {
                leafNodes.push(currentNode);
            } else {
                stack.push(...currentNode.children);
            }
        }

        return leafNodes;
    }

    /**
     * The trace pin at which each of self's pins terminates (recursive)
     *
     * Returns a list of MywcomTracePins, keyed by pin number
     */
    terminations() {
        // ENH: handle multiple terminations (splitting etc)

        const trace_pins = {};

        // Add leaf pins from children
        for (const child_node of this.children) {
            const child_trace_pins = child_node.terminations();

            for (const child_pin in child_trace_pins) {
                const pin = this.pinFor(child_node, child_pin);
                if (!trace_pins[pin]) {
                    trace_pins[pin] = child_trace_pins[child_pin];
                    this.progress(5, this, 'Mapped pin', pin, '->', child_node, child_pin);
                }
            }
        }

        // Add self's leaf pins
        for (const pin of this.pins.range()) {
            if (!trace_pins[pin]) {
                trace_pins[pin] = new TracePin(this, pin);
            }
        }

        return trace_pins;
    }

    /**
     *
     * @returns
     */
    _functionOf() {
        let functionDef = (this.equipment = myw.config['mywcom.equipment'][this.feature.getType()]);

        if (!functionDef && myw.config['mywcom.cables'][this.feature.getType()])
            functionDef = {
                function: 'cable'
            };

        if (
            !functionDef &&
            (this.feature.getType() === 'mywcom_fiber_connection' ||
                this.feature.getType() === 'mywcom_copper_connection') &&
            this.feature.properties.splice
        )
            functionDef = {
                function: 'splice'
            };

        return functionDef?.function;
    }
}

Object.defineProperty(PinTraceNode.prototype, 'length', {
    get() {
        return this._length();
    }
});

export default PinTraceNode;
