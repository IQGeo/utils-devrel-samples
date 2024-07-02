import PinTraceNode from './PinTraceNode';

class ConnectionTraceNode extends PinTraceNode {
    static {
        /**
         * A connection node in a fiber network trace result
         */

        this.prototype.type = 'connection';
    }

    /**
     * Init slots of self
     *
     * CONN is a Connection
     */
    constructor(conn, tech, direction, dist, ewlDist, parent = undefined) {
        super(conn.conn_rec, tech, conn.from_pins, direction, dist, /*parent:*/ parent);
        this.conn = conn;

        const id_pins = conn.forward ? conn.from_pins : conn.to_pins;
        this.node_id += `-${id_pins.rangeSpec()}`; // Used for detecting 'already visited'
        this._ewlDist = ewlDist;
    }

    //@property
    /**
     * For display in trace result
     */
    _from_() {
        return this._strFor(this.conn.from_pins, this.conn.is_from_cable);
    }

    //@property
    /**
     * For display in trace result
     */
    _to_() {
        return this._strFor(this.conn.to_pins, this.conn.is_to_cable);
    }

    /**
     * Text to show for PINs in trace result
     */
    _strFor(pins, cable) {
        if (this.conn.is_splice) {
            return pins.rangeSpec();
        }

        if (cable) {
            return 'Fibers: ' + pins.rangeSpec();
        } else {
            return 'Ports: ' + pins.spec;
        }
    }

    /**
     * The pin on self's feature that is connected to CHILD_PIN of CHILD_NODE
     */
    pinFor(child_node, child_pin) {
        return this.conn.fromPinFor(child_pin);
    }
}

Object.defineProperty(ConnectionTraceNode.prototype, 'from_', {
    get() {
        return this._from_();
    }
});

Object.defineProperty(ConnectionTraceNode.prototype, 'to_', {
    get() {
        return this._to_();
    }
});

Object.defineProperty(ConnectionTraceNode.prototype, 'ewlDist', {
    get() {
        return this._ewlDist;
    }
});

export default ConnectionTraceNode;
