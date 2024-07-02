import PinTraceNode from './PinTraceNode';

class PortTraceNode extends PinTraceNode {
    static {
        /**
         * A port node in a fiber network trace result
         */

        this.prototype.type = 'port';
    }

    /**
     * Init slots of self
     */
    constructor(feature, tech, pins, direction, dist, ewlDist, funct, parent = undefined) {
        super(feature, tech, pins, direction, dist, /*parent:*/ parent);

        this.node_id += `-${pins.spec}`; // Used for detecting 'already visited'
        this.funct = funct;
        this._ewlDist = ewlDist;
    }

    //@property
    /**
     * For display in trace result
     */
    _ports() {
        return this.pins.spec;
    }

    /**
     * The pin on self's feature that is connected to CHILD_PIN of CHILD_NODE
     */
    pinFor(child_node, child_pin) {
        // Case: Implicit connection
        if (child_node.type == 'port' && child_node.feature == this.feature) {
            const funct = this.functionOf(this.feature);

            if (funct == 'connector') return child_pin;

            if (funct == 'splitter') {
                if (this.pins.side == 'in') return 1; // Upstream trace
                if (this.pins.side == 'out') return this.pins.low; // Downstream trace (assumes single pin connected)
            }
            if (funct == 'mux') {
                if (this.pins.side == 'in') return this.pins.low; // Upstream trace
                if (this.pins.side == 'out') return 1; // Downstream trace (assumes single pin connected)
            }
            if (funct == 'bridge_tap') {
                const size = this.feature.properties[`n_${this.tech}_in_ports`];
                if (this.pins.side == 'in')
                    return child_node.pins.low <= size ? child_pin : child_pin - size;
                if (this.pins.side == 'out')
                    return child_pin <= size ? child_pin : child_pin - size;
            }
        }
        //Case: Child is connection (which holds self's pin)
        return child_pin;
    }

    functionOf(equip) {
        return this.funct;
    }
}

// -----------------------------------------------------------------------
//                               PROPERTIES
// -----------------------------------------------------------------------

Object.defineProperty(PortTraceNode.prototype, 'ports', {
    get() {
        return this._ports();
    }
});

Object.defineProperty(PortTraceNode.prototype, 'ewlDist', {
    get() {
        return this._ewlDist;
    }
});

export default PortTraceNode;
