// Copyright: IQGeo Limited 2010-2023

import Conn from './Conn';
import Network from './Network';
import myw from 'myWorld-native-services';
import { MywClass } from 'myWorld-base';
/**
 * A set of connections from a given side of a feature
 *
 * Provides facilities for mapping from_pin -> to_pin etc
 */
/*eslint-disable no-await-in-loop*/
class ConnSet extends MywClass {
    // ------------------------------------------------------------------------------
    //                                 CONSTRUCTION
    // ------------------------------------------------------------------------------

    /**
     * Init self from connection records on SIDE of FEATURE
     *
     * SIDE is 'in' or 'out'
     */
    constructor(feature, tech, side, field = undefined) {
        super();
        this.feature = feature;
        this.side = side;
        this.conns = [];

        // Get connection records
        if (!field) {
            field = Network.types[tech].connections_field;
        }
        this.field = field;
    }

    /**
     * Complete initialisation
     */
    // Required because initialize() does not support async
    async complete() {
        const conn_recs = await this.feature.followRefSet(this.field);

        // Build connection objects
        const urn = this.feature.getUrn();
        for (const conn_rec of conn_recs) {
            if (conn_rec.properties.in_object == urn && conn_rec.properties.in_side == this.side)
                this.conns.push(new Conn(conn_rec, true));
            if (conn_rec.properties.out_object == urn && conn_rec.properties.out_side == this.side)
                this.conns.push(new Conn(conn_rec, false));
        }

        // Sort them
        const sort_proc = function (c1, c2) {
            return c1.low < c2.low ? -1 : 1;
        };
        this.conns.sort(sort_proc);
    }

    /**
     * The connections of self that run from FROM_PINS (a PinRange)
     *
     * Returns a ConnSet
     */
    intersect(from_pins) {
        // Build subset of connections
        const int_conns = [];

        for (const conn of this.conns) {
            const int_conn = conn.intersect(from_pins);

            if (int_conn) {
                int_conns.push(int_conn);
            }
        }

        // Return shallow copy of self
        // ENH: Use contructor instead
        const int_conn_set = new ConnSet(this.feature, this.tech, this.side, this.field);
        int_conn_set.conns = int_conns;

        return int_conn_set;
    }

    /**
     * Add a connection to the set
     */
    add(conn) {
        this.conns.push(conn);
    }

    // ------------------------------------------------------------------------------
    //                                    PROPERTIES
    // ------------------------------------------------------------------------------

    /**
     * Identifying string for progress messages
     */
    __ident__() {
        return `ConnSet(${this.feature.getUrn()},${this.side},${this.conns.length})`;
    }

    /**
     * Yields elements of self
     */
    // __iter__() {
    //     return this.conns.__iter__();
    // },

    /**
     * Number of elements in self
     */
    size() {
        return this.conns.length();
    }

    /**
     * Returns the connection of self that relates to FROM_PIN (if any)
     *
     * Returns a Conn (or None)
     */
    connFor(from_pin) {
        // ENH: Return a new conn that just covers the requested pin?

        for (const conn of this.conns) {
            if (conn.from_pins.contains(from_pin)) {
                return conn;
            }
        }

        return undefined;
    }

    /**
     * Yields the pins that have a connection
     *
     * Yields:
     *  PIN
     *  CONN
     */
    /*eslint-disable no-unused-vars*/
    fromPins() {
        for (const conn of this.conns) {
            for (const pin of conn.from_pins.range()) {
                //yield pin,conn TODO: investigate yield for javascript in order to match python equivelant
            }
        }
    }

    /*eslint-enable no-unused-vars*/

    // ------------------------------------------------------------------------------
    //                                   SERIALISATION
    // ------------------------------------------------------------------------------

    /**
     * Self in JSON-serialisable form
     */
    async definition() {
        const conn_defs = [];
        for (const conn of this.conns) {
            conn_defs.push(await conn.definition());
        }
        return conn_defs;
    }
}

export default ConnSet;
