// Copyright: IQGeo Limited 2010-2023

//import {MywError} from 'myWorld-native-services'
//import {MywProgressHandler} from 'myWorld-native-services'

import Conn from './Conn';
import ConnSet from './ConnSet';
import Manager from './Manager';
import PinRange from './PinRange';
import { FilterParser } from 'myWorld-base';

/**
 * Engine for managing pin-level connectivity
 */
/*eslint-disable no-await-in-loop*/
class ConnectionManager extends Manager {
    // -----------------------------------------------------------------------
    //                             CONNECT/ DISCONNECT
    // -----------------------------------------------------------------------

    /**
     * Add a connection between features FTR1 and FTR2
     *
     * PINS1 and PINS2 are PinRanges. HOUSING is the
     * feature in which the connection sits.
     */
    async connect(tech, housing, ftr1, pins1, ftr2, pins2) {
        this.progress(4, 'Connecting', ftr1, 'to', ftr2, 'in', housing);
        this.progress(6, '  IN ', ftr1, pins1);
        this.progress(6, '  OUT', ftr2, pins2);

        const network = this.nw_view.networks[tech];
        const table = await this.connTableFor(tech);

        // Create record
        const rec = { properties: {} };

        rec.properties.root_housing = this.rootHousingUrn(housing);
        rec.properties.housing = housing.getUrn();
        rec.properties.in_object = ftr1.getUrn();
        rec.properties.in_side = pins1.side;
        rec.properties.in_low = pins1.low;
        rec.properties.in_high = pins1.high;
        rec.properties.out_object = ftr2.getUrn();
        rec.properties.out_side = pins2.side;
        rec.properties.out_low = pins2.low;
        rec.properties.out_high = pins2.high;
        rec.properties.splice = network.isSegment(ftr1) && network.isSegment(ftr2);

        // Set geometry
        rec.geometry = housing.geometry;

        const id = await table.insert(rec);

        // TODO: Indicate that we have sync uploads
        //if (table.isTrackingChanges()) {
        //    nativeServer.fire('trackedFeatureChanged');
        //}

        return table.get(id, {});
    }

    /**
     * Disconnect PINS of FTR
     *
     * PINS is a PinRange
     */
    async disconnect(tech, ftr, pins) {
        const network = this.nw_view.networks[tech];

        // Prevent corruption of circuit paths
        if (await this.nw_view.circuit_mgr.pinsHaveCircuits(ftr, pins)) {
            throw new Error('pins_have_circuit', /*feature=*/ ftr, /*pins=*/ pins);
        }

        // Do disconnect
        if (ftr.getType() == network.connection_type) {
            const conn = new Conn(ftr, pins.side == 'out');
            await this._disconnect(conn, pins);
        } else {
            const conns = new ConnSet(ftr, tech, pins.side);
            await conns.complete();

            for (const conn of conns.conns) {
                if (conn.from_pins.intersect(pins)) {
                    await this._disconnect(conn, pins);
                }
            }
        }
    }

    /**
     * Disconnect PINS of connection CONN
     */
    async _disconnect(conn, pins) {
        // Add new connection records
        const tab = await conn.db_view.table(conn.conn_rec.getType());
        for (const from_pins of conn.from_pins.subtract(pins)) {
            const to_pins = conn.toPinsFor(from_pins);

            const rec = { ...conn.conn_rec };
            rec.id = rec.properties.id = undefined;

            if (conn.forward) {
                rec.properties.in_low = from_pins.low;
                rec.properties.in_high = from_pins.high;
                rec.properties.out_low = to_pins.low;
                rec.properties.out_high = to_pins.high;
            } else {
                rec.properties.in_low = to_pins.low;
                rec.properties.in_high = to_pins.high;
                rec.properties.out_low = from_pins.low;
                rec.properties.out_high = from_pins.high;
            }

            await tab.insert(rec);
        }

        // Delete old one
        await tab.delete(conn.conn_rec.id);
    }

    // -----------------------------------------------------------------------
    //                            CONNECTION MAINTENANCE
    // -----------------------------------------------------------------------

    /**
     * Update location of all fiber connections contained within given structure
     */
    async updateConnGeoms(struct) {
        const point = struct.geometry;

        for (const tech of Object.keys(this.nw_view.networks)) {
            const conn_tab = await this.connTableFor(tech);

            const filter = `[root_housing] = '${struct.getUrn()}'`;
            const pred = new FilterParser(filter).parse();
            const conns = await conn_tab.query().filter([pred]).all();

            for (const conn of conns) {
                conn.geometry = point;
                await conn_tab.update(conn.id, conn);
            }
        }
    }

    /**
     * Delete connections of equip and all contained equipment
     */
    async deleteConnections(equip) {
        this.progress(3, 'Deleting connections of', equip);

        for (const rec of await this.connectionsOfAll(equip)) {
            await this.deleteRecord(rec);
        }
    }

    /**
     * Replaces references to FEATURE on SIDE of connections with NEW_FEATURE
     */
    async transferConnections(old_feature, old_side, new_feature, new_side) {
        //ENH: query for conns directly
        for (const conn of await this.connectionsOfAll(old_feature))
            await this.transferConnection(conn, old_feature, old_side, new_feature, new_side);
    }

    /**
     * Replaces references to OLD_FEATURE on on OLD_SIDE of CONN with NEW_FEATURE
     */
    async transferConnection(conn, old_feature, old_side, new_feature, new_side) {
        const old_urn = old_feature.getUrn();
        const new_urn = new_feature.getUrn();

        if (conn.properties.in_object == old_urn && conn.properties.in_side == old_side) {
            this.progress(
                3,
                'Replace',
                old_feature,
                'with',
                new_feature,
                'on in side',
                new_side,
                'of',
                conn
            );
            conn.properties.in_object = new_urn;
            conn.properties.in_side = new_side;
            await this.update(conn);
        }

        if (conn.properties.out_object == old_urn && conn.properties.out_side == old_side) {
            this.progress(
                3,
                'Replace',
                old_feature,
                'with',
                new_feature,
                'on out side',
                new_side,
                'of',
                conn
            );
            conn.properties.out_object = new_urn;
            conn.properties.out_side = new_side;
            await this.update(conn);
        }
    }

    /**
     * Returns query yielding connection records relating to FEATURE
     *
     * FIELD is the field used to determine ownership('housing' or 'root_housing')
     * SPLICES can be used to limit records returned
     */
    async connectionsOf(
        feature,
        housing_field = 'housing',
        splices = undefined,
        side = null,
        tech = 'fiber'
    ) {
        const urn = feature.getUrn();

        const conn_tab = await this.connTableFor(tech);

        let filter = '';
        if (side) {
            filter = `([in_object] = '${urn}' & [in_side] = '${side}') | 
             ([out_object] = '${urn}' & [out_side] = '${side}')
            `;
        } else {
            filter = `[in_object] = '${urn}' | [out_object] = '${urn}' `;
        }

        filter += ` | [${housing_field}] = '${urn}'`;

        if (splices) {
            filter += ` | [splice] = '${splices}'`;
        }

        const pred = new FilterParser(filter).parse();
        const all_connections = await this.nw_view.getRecs(conn_tab, pred, false);
        return all_connections;
    }
    /**
     * Returns list of all connections associated to FEATURE
     */
    async connectionsOfAll(
        feature,
        housing_field = 'housing',
        splices = undefined,
        side = undefined
    ) {
        const networks = Object.keys(this.nw_view.networks);
        let conns = [];

        for (const network_name of networks) {
            const conns_of = await this.connectionsOf(
                feature,
                housing_field,
                splices,
                side,
                network_name
            );
            conns.push(...Object.values(conns_of));
        }

        return conns;
    }

    /**
     * Create connections between unconnected fibres in OLD_SEGMENT and NEW_SEGMENT housed inside SPLICE_HOUSING.
     * @param {*} old_segment
     * @param {*} new_segment
     * @param {*} splice_housing
     * @param {*} forward
     * @param {*} fiber_count
     * @returns
     */
    async spliceSegments(old_segment, new_segment, splice_housing, forward, pin_count) {
        const tech = this.nw_view.networkFor(old_segment);
        const old_side = forward ? 'out' : 'in';
        const new_side = forward ? 'in' : 'out';
        const cable_conns = await this.connectionsOf(
            old_segment,
            'housing',
            undefined,
            old_side,
            tech
        );
        const new_cable_conns = await this.connectionsOf(
            new_segment,
            'housing',
            undefined,
            new_side,
            tech
        );

        // Find existing connections
        const connected_ranges = [];
        for (const c of cable_conns) {
            connected_ranges.push(new PinRange('out', c.properties.in_low, c.properties.in_high));
        }
        for (const c of new_cable_conns) {
            connected_ranges.push(new PinRange('out', c.properties.in_low, c.properties.in_high));
        }

        // Subtract them from complete range for cable to find free ranges that we will
        // connected across.
        let ranges = [new PinRange('out', 1, pin_count)];
        for (const c1 of connected_ranges) {
            let new_current = [];
            for (const c2 of ranges) {
                new_current = new_current.concat(c2.subtract(c1));
            }
            ranges = new_current;
        }

        // Now make the connections
        const conns = [];
        for (const in_range of ranges) {
            const out_range = new PinRange('in', in_range.low, in_range.high);
            let new_conn;

            if (forward) {
                new_conn = await this.connect(
                    tech,
                    splice_housing,
                    old_segment,
                    in_range,
                    new_segment,
                    out_range
                );
            } else {
                new_conn = await this.connect(
                    tech,
                    splice_housing,
                    new_segment,
                    in_range,
                    old_segment,
                    out_range
                );
            }

            conns.push(new_conn);
        }

        return conns;
    }

    // -----------------------------------------------------------------------
    //                                CONTENTS
    // -----------------------------------------------------------------------

    /**
     * Returns connections inside STRUCT
     */
    async connectionsIn(struct, include_proposed = false) {
        const struct_urn = struct.getUrn();

        let conns = [];

        for (const feature_type in this.nw_view.connections) {
            const tab = await this.db_view.table(feature_type);
            const filter = `[root_housing] = '${struct_urn}'`;
            const pred = new FilterParser(filter).parse();
            const ft_conns = await this.nw_view.getRecs(tab, pred, include_proposed);

            conns = [...conns, ...ft_conns];
        }

        return conns;
    }

    /**
     * Returns connections relating to FEATURE inside STRUCT
     */

    async connectionsAt(feature, struct, include_proposed = false) {
        const feature_urn = feature.getUrn();
        const struct_urn = struct.getUrn();
        let conns = [];

        let filter = `[in_object] = '${feature_urn}' | [out_object] = '${feature_urn}'`;

        for (const feature_type in this.nw_view.connections) {
            const tab = await this.db_view.table(feature_type);
            filter += ` & [root_housing] = '${struct_urn}'`;
            const pred = new FilterParser(filter).parse();
            const ft_conns = await this.nw_view.getRecs(tab, pred, include_proposed);

            conns = [...conns, ...ft_conns];
        }

        return conns;
    }

    /**
     * Returns connection table for TECH
     */
    async connTableFor(tech) {
        const network = this.nw_view.networks[tech];

        return this.db_view.table(network.connection_type);
    }
}

export default ConnectionManager;
