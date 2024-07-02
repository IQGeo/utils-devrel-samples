// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import { sliceAlong, coordAtDistance } from '../../base/geomUtils';
import Conn from '../../api/conn';
import SchematicItem from '../schematicItem';

export default class ConnectionLink extends myw.Class {
    static {
        this.prototype.type = 'connection';
    }

    /**
     * Create explicit link node1 -> node2
     */
    constructor(node1, node2, housing) {
        super();
        this.node1 = node1;
        this.node2 = node2;
        this.feature = housing;
        this.conns = [];
    }

    /**
     * Add connection record 'conn_rec' to self
     */
    addConnection(conn_rec, forward = false) {
        const conn = new Conn(conn_rec, forward);
        this.conns.push(conn);
    }

    /**
     * Build a map-displayable representation of self (a SchematicItem)
     */
    item(opts) {
        // Build line style
        const lineStyle = new myw.LineStyle({
            color: '#AAAAAA',
            width: 3,
            lineStyle: 'dot',
            endStyle: 'arrow'
        });

        // Build label text and style
        const textStyle = new myw.TextStyle({
            text: this.labelText(),
            color: '#AAAAAA',
            size: 0.3,
            sizeUnit: 'm',
            vAlign: 'bottom',
            vOffset: 0.02,
            placement: 'line'
        });

        return new SchematicItem(
            this.geometry(opts),
            lineStyle.plus(textStyle),
            this.feature,
            this.tooltip(),
            { highlights: [] }
        );
    }

    /**
     * Build self's geometry
     */
    geometry(opts) {
        // Build line connecting nodes
        let coords = [this.node1.outCoord(opts, this.node2), this.node2.inCoord(opts, this.node1)];
        let geom = myw.geometry.lineString(coords);

        // Determine if link clash likely
        const twoWay = this.node2.linkTo(this.node1, this.type);
        const intraCable =
            this.node1.type == 'cable' &&
            this.node2.type == 'cable' &&
            this.node1.cable.getUrn() == this.node2.cable.getUrn();

        // Offset mid-point (if necessary)
        if (twoWay || intraCable) {
            if (this.node1 == this.node2) {
                // Case: loopback connection
                const colOffset = this.node1.side == 'out' ? -2.5 : 2.5;
                const offsetCoord1 = this.node1.coord(opts, colOffset, +0.5);
                const offsetCoord2 = this.node1.coord(opts, colOffset, -0.5);
                coords = [coords[0], offsetCoord1, offsetCoord2, coords[1]];
            } else {
                const offsetCoord = coordAtDistance(geom, 50, '%', -1.5, 'm');
                coords = [coords[0], offsetCoord, coords[1]];
            }
            geom = myw.geometry.lineString(coords).bezier(2000);
        }

        // Shrink ends
        const gap = 5 / (opts.colScale || 1); // percent
        geom = sliceAlong(geom, gap, 100 - gap, '%');

        return geom;
    }

    /**
     * String to show on link
     */
    // ENH: Sort conns by low + consolidate adjacent ranges
    labelText() {
        let strs = [];

        for (const connInfo of this.connInfos()) {
            let pins = connInfo.fromPins;
            if (this.node1.type == 'equip' && this.node2.type == 'cable') pins = connInfo.toPins;
            strs.push(pins.rangeSpec());
        }
        return strs.join('\n');
    }

    /**
     * String to show on hover
     */
    tooltip() {
        let strs = [];
        for (const connInfo of this.connInfos()) {
            const fromStr = this.connPointStrFor(this.node1, connInfo.fromPins);
            const toStr = this.connPointStrFor(this.node2, connInfo.toPins);
            const str = `${fromStr} -> ${toStr}`;
            strs.push(str);
        }
        return strs.join('<br>');
    }

    /**
     * Self's connection info, consolidated and sorted
     */
    connInfos() {
        // Sort
        const sortProc = function (c1, c2) {
            return c1.from_pins.low < c2.from_pins.low ? -1 : 1;
        };
        const sortedConns = this.conns.sort(sortProc);

        // Consolidate adjacent ranges
        const infos = [];
        let info;
        for (const conn of sortedConns) {
            const consolidate =
                info && conn.from_pins.extends(info.fromPins) && conn.to_pins.extends(info.toPins);

            if (consolidate) {
                info.fromPins.high = conn.from_pins.high;
                info.toPins.high = conn.to_pins.high;
            } else {
                info = {
                    fromPins: conn.from_pins.copy(),
                    toPins: conn.to_pins.copy(),
                    conns: []
                };
                infos.push(info);
            }

            info.conns.push(conn);
        }

        return infos;
    }

    /**
     * String representation of a connection point
     */
    // ENH: Get from manager?
    connPointStrFor(node, pins) {
        if (node.type == 'cable') {
            return pins.rangeSpec();
        } else {
            return `${pins.sideStr()}:${pins.rangeSpec()}`;
        }
    }
}
