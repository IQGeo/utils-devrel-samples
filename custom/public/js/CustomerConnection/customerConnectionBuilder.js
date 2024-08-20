// Copyright: Ubisense Limited 2010-2023
import myw from 'myWorld-client';
import { result } from 'underscore';

// Engine to create features that make up a customer connection
//
// Given a structure and location, creates wall box, route, drop cable etc and connects them
/*eslint-disable no-await-in-loop*/
class CustomerConnectionBuilder extends myw.MywClass {
    static {
        this.prototype.messageGroup = 'CustomerConnectionBuilder';
    }

    // Init slots
    constructor(database) {
        super();
        this.app = myw.app;
        this.database = database;
        this.datasource = database.getDatasource('myworld');
        this.connectionManager = this.app.plugins.connectionManager;
    }

    async findSpliceClosure(struct) {
        return this.datasource.comms.equipsIn(struct, 'splice_closure');
    }

    async buildSpliceClosure(struct) {
        const spliceClosure = await this._addSpliceClosure(struct);
        return spliceClosure;
    }

    async _addSpliceClosure(struct) {
        const name = (struct.properties.name || struct.getType()) + '-SPLCLS';

        const spec = 'CS-FOSC-400B4-S24-4-NNN';
        const root_housing = struct.properties.root_housing || struct.getUrn();

        const props = {
            name: name,
            specification: spec,
            n_fiber_out_ports: 4,
            housing: struct.getUrn(),
            root_housing: root_housing
        };

        const geom = struct.geometry;
        return this.insertFeature('splice_closure', props, geom);
    }

    // Find splitters in struct
    async findSplitters(struct) {
        return this.datasource.comms.equipsIn(struct, 'fiber_splitter');
    }

    // Add a splitter in struct and connect input to feederFiber
    async buildSplitter(struct, feederFiber, splitterNo, closure) {
        const splitter = await this.addSplitter(struct, splitterNo, closure); // ENH: Should be in a splice closure really
        this.connectFeederToSplitter(struct, splitter, feederFiber);
        return { splitter: splitter, port: 1 };
    }

    // Create connection from struct to coord (creating splitter if necessary)
    //
    // Returns objects created / used
    // ENH: Pass in splitter, feeder cable etc
    async buildConnection(struct, coord, equipmentProps, connPoint) {
        const connInfo = {};
        const latLng = {
            lat: coord[1],
            lng: coord[0]
        };
        const existingWallBox = await this.datasource.getFeaturesAround(
            ['wall_box', 'fiber_ont'],
            latLng,
            0
        );
        if (existingWallBox.length > 0) {
            const wallBox = existingWallBox.find(box => box.getType() === 'wall_box');
            if (wallBox) {
                wallBox.followRelationship('equipment').then(result => {
                    console.log(result);
                });
                connInfo.wallbox = wallBox;
            }
            const ont = existingWallBox.find(box => box.getType() === 'fiber_ont');
            if (ont) {
                connInfo.ont = ont;
            }
        } else {
            connInfo.wallbox = await this.addWallBox(coord, equipmentProps.wallBox);
            connInfo.ont = await this.addTerminal(connInfo.wallbox);
        }
        connInfo.route = await this.addRoute(struct, connInfo.wallbox);
        connInfo.drop = await this.addDropCable(
            connInfo.route,
            struct,
            connInfo.wallbox,
            equipmentProps.dropCable
        );

        // Connect drop cable
        const cableSegs = await connInfo.drop.followRelationship('cable_segments');
        await this.connectDropToSplitter(connPoint.splitter, connPoint.port, cableSegs[0]);
        await this.connectDropToTerminal(cableSegs[0], connInfo.ont);

        return connInfo;
    }

    // Create wallbox at 'coord'
    async addWallBox(coord, props = {}) {
        const geom = { type: 'Point', coordinates: coord };
        return this.insertFeature('wall_box', props, geom);
    }

    // Add fiber terminal in wallbox
    async addTerminal(wallbox) {
        const props = {
            n_fiber_in_ports: 16, // TODO: Set name?
            housing: wallbox.getUrn(),
            root_housing: wallbox.getUrn()
        }; // root housing is also wallbox
        const geom = wallbox.geometry;
        return this.insertFeature('fiber_ont', props, geom);
    }

    // Find first free out port in 'splitters' (if there is one)
    async findConnectionPoint(splitters) {
        for (let i = 0; i < splitters.length; i++) {
            let splitter = splitters[i];
            const pins = await this.connectionManager.freePinsOn(splitter, 'fiber', 'out');
            if (pins.length) return { splitter: splitter, port: pins.pop() };
        }
    }

    // Add a splitter in struct
    async addSplitter(struct, splitterNo, closure) {
        const name = (struct.properties.name || struct.getType()) + '-SPL' + splitterNo;

        const root_housing = struct.properties.root_housing || struct.getUrn();

        const props = {
            name: name,
            n_fiber_out_ports: 4,
            housing: closure.getUrn(),
            root_housing: root_housing
        };

        const geom = struct.geometry;
        return this.insertFeature('fiber_splitter', props, geom);
    }

    // Create route from struct to box
    async addRoute(struct, box) {
        const props = { in_structure: struct.getUrn(), out_structure: box.getUrn() };
        const geom = {
            type: 'LineString',
            coordinates: [struct.geometry.coordinates, box.geometry.coordinates]
        };
        return this.insertFeature('oh_route', props, geom);
    }

    // Add drop cable along route
    async addDropCable(route, struct, wallbox, props) {
        const geom = route.geometry;
        const cable = await this.insertFeature('fiber_cable', props, geom);
        await this.datasource.comms.routeCable(cable, [struct, wallbox]);
        return cable;
    }

    // Connect input port of 'splitter' to feeder cable
    async connectFeederToSplitter(struct, splitter, feederFiber) {
        const feederSegs = await struct.followRelationship('in_fiber_segments');
        if (!feederSegs.length) return;
        const feaderSeg = feederSegs[0];
        await this.connectionManager.connect(
            'fiber',
            feaderSeg,
            ['out', feederFiber],
            splitter,
            ['in', 1],
            splitter
        );
    }

    // Connect drop cable to splitter
    async connectDropToSplitter(splitter, splitterPort, cableSeg) {
        await this.connectionManager.connect(
            'fiber',
            splitter,
            ['out', splitterPort],
            cableSeg,
            ['in', 1],
            splitter
        );
    }

    // Connect drop cable to fiber terminal
    async connectDropToTerminal(cableSeg, ont) {
        await this.connectionManager.connect('fiber', cableSeg, ['out', 1], ont, ['in', 1], ont);
    }

    // Helper to create a feature (and update display)
    async insertFeature(featureType, properties, geometry) {
        const ftrData = { type: 'Feature', properties: properties, geometry: geometry };

        const id = await this.database.insertFeature(featureType, ftrData);

        const ftr = await this.database.getFeature(featureType, id);
        this.app.fire('featureCollection-modified', {
            featureType: featureType,
            changeType: 'insert',
            feature: ftr
        });
        return ftr;
    }

    // Helper to construct the next name after 'name'.
    nextName(name) {
        const matches = name.match(/\d+$/);
        if (!matches) return name;

        const numStr = matches[0];
        const num = parseInt(numStr, 10);
        const base = name.substring(0, name.length - numStr.length);

        const pad = numStr.length;
        const nextNumStr = (num + 1).toString().padStart(pad, '0');

        return base + nextNumStr;
    }
}

export default CustomerConnectionBuilder;
