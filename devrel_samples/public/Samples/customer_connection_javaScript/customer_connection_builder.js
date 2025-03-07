import myw from 'myWorld-client';

class CustomerConnectionBuilder extends myw.MywClass {
    constructor(database) {
        super();
        this.app = myw.app;
        this.database = database;
        this.datasource = database.getDatasource('myworld');
        this.connectionManager = this.app.plugins.connectionManager;
    }

    async _insertFeature(featureType, properties, geometry) {
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

    async findEquipmentIn(struct, type) {
        return this.datasource.comms.equipsIn(struct, type);
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
            housing: struct.getUrn(),
            root_housing: root_housing
        };

        const geom = struct.geometry;
        return this._insertFeature('splice_closure', props, geom);
    }

    async findConnectionPoint(splitters) {
        for (let i = 0; i < splitters.length; i++) {
            let splitter = splitters[i];
            const pins = await this.connectionManager.freePinsOn(splitter, 'fiber', 'out');
            if (pins.length) return { splitter: splitter, port: pins[0] };
        }
    }

    async buildSplitter(struct, splitterNo, closure) {
        const splitter = await this._addSplitter(struct, splitterNo, closure);
        return { splitter: splitter, port: 1 };
    }

    async _addSplitter(struct, splitterNo, closure) {
        const name = (struct.properties.name || struct.getType()) + '-SPL' + splitterNo;

        const root_housing = struct.properties.root_housing || struct.getUrn();

        const props = {
            name: name,
            n_fiber_out_ports: 4,
            housing: closure.getUrn(),
            root_housing: root_housing
        };

        const geom = struct.geometry;
        return this._insertFeature('fiber_splitter', props, geom);
    }

    async findWallBox(coord) {
        const latLng = {
            lat: coord[1],
            lng: coord[0]
        };
        const existingWallBox = await this.datasource.getFeaturesAround(['wall_box'], latLng, 0);

        if (existingWallBox.length > 0) {
            return existingWallBox[0];
        } else {
            return this._buildWallBox(coord, { name: 'Wall Box' });
        }
    }

    // Create wallbox at 'coord'
    async _buildWallBox(coord, props = {}) {
        const geom = { type: 'Point', coordinates: coord };
        return this._insertFeature('wall_box', props, geom);
    }

    async findOnt(coord, wallbox) {
        const latLng = {
            lat: coord[1],
            lng: coord[0]
        };

        const existingOnt = await this.datasource.getFeaturesAround(['fiber_ont'], latLng, 0);
        if (existingOnt.length > 0) {
            return existingOnt[0];
        } else {
            return this._buildOnt(coord, wallbox);
        }
    }

    async _buildOnt(coord, wallbox) {
        const props = {
            name: 'ONT',
            n_fiber_in_ports: 16, // TODO: Set name?
            housing: wallbox.getUrn(),
            root_housing: wallbox.getUrn() // root housing is also wallbox
        };
        const geom = wallbox.geometry;
        return this._insertFeature('fiber_ont', props, geom);
    }

    async buildRoute(struct, box) {
        const props = { in_structure: struct.getUrn(), out_structure: box.getUrn() };
        const geom = {
            type: 'LineString',
            coordinates: [struct.geometry.coordinates, box.geometry.coordinates]
        };
        return this._insertFeature('oh_route', props, geom);
    }

    async buildDropCable(route, struct, wallbox, cableName) {
        const props = {
            name: cableName,
            fiber_count: 16,
            directed: true
        };

        const geom = route.geometry;
        const cable = await this._insertFeature('fiber_cable', props, geom);
        await this.datasource.comms.routeCable(cable, [struct, wallbox]);
        return cable;
    }

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
    async connectDropToTerminal(cableSeg, ont) {
        await this.connectionManager.connect('fiber', cableSeg, ['out', 1], ont, ['in', 1], ont);
    }

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
