// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import IntegrityError from 'modules/comms/js/validation/integrityError';
import FeatureChange from 'modules/comms/js/validation/featureChange';
import Conflict from 'modules/comms/js/validation/conflict';
import './commsRestServerExtension';
import GeometryType from '../base/geometryType';
import TaskMonitor from './taskMonitor';

/*eslint-disable no-await-in-loop*/
class CommsDsApi extends myw.DsExtension {
    static {
        /**
         * Warppers to Comms REST services
         *
         * Handles construction of URLs and unpicking of results (conversion to features etc)
         */

        this.prototype.messageGroup = 'CommsDsApi';
    }

    // -------------------------------------------------------------------------
    //                                CABLES
    // -------------------------------------------------------------------------

    /**
     * Returns all cables inside 'feature' (a route or conduit)
     * @return {Promise<featureCollection>} List of cables
     */
    // ENH: Better on a manager?
    // ENH: Use root_housing
    async cablesIn(feature) {
        let cables = await this.cablesOf(feature);

        if (feature.featureDD.fields.conduits) {
            const conduits = await feature.followRelationship('conduits');

            const innerCables = conduits.map(conduit => this.cablesIn(conduit));
            await Promise.all(innerCables);
            cables = cables.concat(innerCables);
        }

        return _.uniq(_.flatten(cables), 'id');
    }

    /**
     * Returns cables directly inside 'feature' (a route or conduit)
     * @return {Promise<featureCollection>} List of cables
     */
    // ENH: Better on a manager?
    // ENH: Provide a service
    async cablesOf(feature) {
        const segments = await feature.followRelationship('cable_segments');

        const promises = segments.map(segment => segment.followRelationship('cable'));
        const cablesPerSegment = await Promise.all(promises);
        return _.uniq(_.flatten(cablesPerSegment), 'id');
    }

    /**
     * Returns cables directly connected to 'equip'
     * @return {Promise<featureCollection>} List of cables
     */
    async cablesConnectedTo(equip) {
        const id = encodeURIComponent(equip.getId());
        const featureType = encodeURIComponent(equip.getType());
        const cables = await this.ds.moduleGet(`modules/comms/equip/${featureType}/${id}/cables`, {
            delta: this.ds.getDelta()
        });

        return this.ds.asFeatures(cables);
    }

    /**
     * Finds path through routes network linking given structures
     * Traces between each structure pair and returns the routes that can be used to route cable or conduit
     * @return {Promise<routeInfo[]>} Route info is an object with properties route and direction
     */
    async findPath(cable, structs) {
        const structUrns = structs.map(struct => struct.getUrn());

        const data = {
            structures: JSON.stringify(structUrns), // ENH: Pass comma separated list?
            feature_type: cable.getType(), // ENH: Pass type in URL
            delta: this.ds.getDelta()
        };
        const url = 'modules/comms/cable/path';

        // As post to prevent URL overflow
        const response = await this.ds.modulePost(url, data);
        await this.ensureAllDDInfo(); // ENH: Just get the ones we need

        return response.routes.map(routeInfo => {
            const featureData = routeInfo[0];
            const type = featureData.myw.feature_type;
            return {
                route: this.ds._asFeature(featureData, type, { simple: true }),
                direction: routeInfo[1]
            };
        });
    }

    /**
     * Use path finder engine to get paths between structures
     * @param {Object} data
     * @returns
     */
    async findPathsSync(data) {
        const delta = this.ds.getDelta();
        data.delta = delta;
        const url = 'modules/comms/fiber_path/find';

        return this.ds.modulePost(url, data).then(this.processFindPathsResult);
    }

    async findPaths(data, statusCallback, completedCallback, errorCallback) {
        const delta = this.ds.getDelta();
        data.delta = delta;
        const url = 'modules/comms/fiber_path/find';
        data.async = true;

        const response = await this.ds.modulePost(url, data);

        const tm = new TaskMonitor(
            this.ds,
            response.task_id,
            this.findPathsStatusCallback.bind(
                this,
                statusCallback,
                completedCallback,
                errorCallback
            ),
            1000
        );

        tm.start();

        myw.taskmonitor = tm;

        return tm;
    }

    /**
     * Single callback that gets dispatched to specific callbacks.
     * @param {*} statusCallback
     * @param {*} successCallback
     * @param {*} errorCallback
     * @param {*} response
     */
    async findPathsStatusCallback(statusCallback, successCallback, errorCallback, response) {
        if (['WORKING', 'WAITING'].includes(response.status)) {
            if (response.log) {
                const lines = response.log.split('\n');
                if (lines.length >= 2) response.log = lines[lines.length - 2];
            }
            statusCallback(response);
        } else if (response.status == 'SUCCESS') {
            await this.processFindPathsResult(response.data).then(successCallback);
        } else if (response.status == 'CANCEL') {
            statusCallback(response);
        } else {
            errorCallback(response);
        }
    }

    async processFindPathsResult(response) {
        // Raw result is needed for sending back to server
        // when creating circuit
        const paths = await this._asyncMap(response.paths, async path => {
            path.properties.distance = this._convertPathLength(path);
            return {
                properties: path.properties,
                result: await this.ds.asTraceResult(path.result),
                raw_result: path
            };
        });

        return paths;
    }

    /**
     * Convert path length to display unit
     * @param {Object} path
     * @returns {String} Display length with unit
     */
    _convertPathLength(path) {
        const pathlengthUnits = path.result.metadata_unit_scales.dist.unit;
        const lengthDisplayUnit = myw.applicationDefinition.displayUnits.length;

        if (pathlengthUnits == lengthDisplayUnit)
            return `${path.properties.distance} ${lengthDisplayUnit}`;

        const lengthConfig = myw.config['core.units'].length;
        const lengthUnitScale = new myw.UnitScale(lengthConfig);
        const displayDistance = lengthUnitScale.convert(
            path.properties.distance,
            pathlengthUnits,
            lengthDisplayUnit
        );
        return `${displayDistance.toFixed(2)} ${lengthDisplayUnit}`;
    }

    /**
     * Use path finder engine to create circuit across a path
     * @param {Object} data
     * @returns
     */
    async createCircuitFromPath(data) {
        const delta = this.ds.getDelta();
        data.delta = delta;
        const url = 'modules/comms/fiber_path/create_circuit';

        const circuit = await this.ds.modulePost(url, data);
        return circuit;
    }

    /**
     * Utility for calling an async function on each element of an array
     * @param {*} array
     * @param {*} asyncCallback
     * @returns
     */
    async _asyncMap(array, asyncCallback) {
        const promises = array.map(asyncCallback);
        return Promise.all(promises);
    }

    /**
     * Routes a cable along path linking given structures
     * Traces between strutures and creates the appropriate route segments, sets relationships
     * and updates the cables geometry
     */
    async routeCable(cable, structs) {
        const id = encodeURIComponent(cable.getId());
        const type = encodeURIComponent(cable.getType());
        const structUrns = structs.map(struct => struct.getUrn());

        const url = `modules/comms/cable/${type}/${id}/route`;
        const data = {
            structures: JSON.stringify(structUrns),
            delta: this.ds.getDelta()
        };

        const updatedCableData = await this.ds.modulePost(url, data).catch(
            error => {
                throw new Error(this.msg('no_path_found'));
            } // ENH: Return error type from service
        );

        const updatedCable = updatedCableData.cable;

        cable.geometry = updatedCable.geometry;
        cable.secondary_geometries = updatedCable.secondary_geometries;
    }

    /**
     * Finds changes to make to re-route 'cable' through 'structs'
     */
    async findReroutePath(cable, structs) {
        return this.rerouteCable(cable, structs, true);
    }

    /**
     * Routes a cable along path linking given structures
     * Traces between structures and modifies/deletes route segments, cable geometry and connections
     * based on comparison of new and existing route
     */
    async rerouteCable(cable, structs, dryRun = false) {
        const id = encodeURIComponent(cable.getId());
        const type = encodeURIComponent(cable.getType());
        const structUrns = structs.map(struct => struct.getUrn());

        const data = {
            structures: JSON.stringify(structUrns),
            dry_run: dryRun,
            delta: this.ds.getDelta()
        };
        const url = `modules/comms/cable/${type}/${id}/reroute`;

        const result = await this.ds.modulePost(url, data).catch(
            error => {
                throw new Error(this.msg('no_path_found'));
            } // ENH: Return error type from service
        );

        // Convert routes to feature objects
        await this.ensureAllDDInfo(); // ENH: Just get the ones we need

        const addRoutes = [];
        _.each(result.add_routes, r =>
            addRoutes.push(this.ds._asFeature(r, r.myw.feature_type, { simple: true }))
        );
        result.add_routes = addRoutes;

        const removeRoutes = [];
        _.each(result.remove_routes, r =>
            removeRoutes.push(this.ds._asFeature(r, r.myw.feature_type, { simple: true }))
        );
        result.remove_routes = removeRoutes;

        const sameRoutes = [];
        _.each(result.same_routes, r =>
            sameRoutes.push(this.ds._asFeature(r, r.myw.feature_type, { simple: true }))
        );
        result.same_routes = sameRoutes;

        // Convert structures to feature objects
        _.each(result.affected_structures, structInfo => {
            const featureData = structInfo.feature;
            if (featureData) {
                const type = featureData.myw.feature_type;
                structInfo.feature = this.ds._asFeature(featureData, type, {
                    simple: true
                });
            }
        });

        if (!dryRun) {
            cable.geometry = result.cable.geometry;
            cable.secondary_geometries = result.cable.secondary_geometries;
        }

        return result;
    }

    /**
     * Cuts cable owned by SEGMENT at STRUCT.
     * @param {*} struct
     * @param {*} segment
     * @param {*} forward
     * @param {*} spliceHousing
     */
    async cutCableAt(struct, segment, forward, spliceHousing) {
        const cable_urn = segment.properties.cable;

        const data = {
            delta: this.ds.getDelta(),
            ...(spliceHousing && { splice_housing: spliceHousing.getUrn() })
        };

        const url = `modules/comms/cable/${cable_urn}/split/${segment.getId()}/${forward}`;

        const result = await this.ds.modulePost(url, data).catch(
            error => {
                throw new Error(this.msg('cut_cable_error'));
            } // ENH: Return error type from service
        );
        return result;
    }

    // -------------------------------------------------------------------------
    //                               EQUIPMENT
    // -------------------------------------------------------------------------

    /**
     * Returns all equipment of 'equipType' inside 'feature' (recursive)
     */
    // ENH: Provide a service
    async equipsIn(feature, equipType) {
        let equips = [];
        if (feature.getType() == equipType) equips.push(feature);

        // Add from contained features (recurse)
        if (!feature.featureDD.fields.equipment) return equips;

        const ftrEquips = await feature.followRelationship('equipment');
        for (let i = 0; i < ftrEquips.length; i++) {
            const equip = ftrEquips[i];
            const equipEquips = await this.equipsIn(equip, equipType);
            equips = equips.concat(equipEquips);
        }

        return equips;
    }

    /**
     * Moves 'equip' and its sub-equipment to 'housing'
     */
    async moveAssembly(equip, housing) {
        const equipType = encodeURIComponent(equip.getType());
        const equipId = encodeURIComponent(equip.getId());

        const housingType = encodeURIComponent(housing.getType());
        const housingId = encodeURIComponent(housing.getId());

        const url = `modules/comms/equip/${equipType}/${equipId}/move_to/${housingType}/${housingId}`;

        return this.ds.modulePost(url, { delta: this.ds.getDelta() });
    }

    /**
     * Copy 'equip' and its sub-equipment to 'housing'
     */
    async copyAssembly(equip, housing) {
        const equipType = encodeURIComponent(equip.getType());
        const equipId = encodeURIComponent(equip.getId());

        const housingType = encodeURIComponent(housing.getType());

        const housingId = encodeURIComponent(housing.getId());

        const url = `modules/comms/equip/${equipType}/${equipId}/copy_to/${housingType}/${housingId}`;

        return this.ds.modulePost(url, { delta: this.ds.getDelta() });
    }

    /**
     * Create slack at side of structure
     * @param {string} featureType
     * @param {geoJSON Feature} detSlack
     * @param {string} segUrn
     * @param {boolean} before
     */
    async addSlack(featureType, detSlack, segUrn, side) {
        const delta = this.ds.getDelta();

        const data = await this.ds._prepareValues(featureType, true, detSlack);

        data.delta = delta;
        data.seg_urn = segUrn;
        data.side = side;
        data.feature = JSON.stringify(detSlack);

        const url = `modules/comms/slack/${featureType}/add`;

        const newSlack = await this.ds.modulePost(url, data);

        return newSlack.id;
    }

    /**
     * Splits slack feature at length
     *
     * @param {string} featureType
     * @param {string} id
     * @param {float} length
     */
    async splitSlack(featureType, id, length) {
        const data = {
            delta: this.ds.getDelta(),
            length
        };

        const url = `modules/comms/slack/${featureType}/split/${id}`;
        const result = await this.ds.modulePost(url, data);

        return result;
    }

    // -------------------------------------------------------------------------
    //                                STRUCTURES
    // -------------------------------------------------------------------------

    /**
     * Get objects contained within structure
     *
     * @returns
     */
    async structContent(feature, includeProposed = false) {
        const id = encodeURIComponent(feature.getId());
        const featureType = encodeURIComponent(feature.getType());

        // Get data
        const response = await this.ds.moduleGet(
            `modules/comms/structure/${featureType}/${id}/contents`,
            { delta: this.ds.getDelta(), include_proposed: includeProposed }
        );

        // Convert JSON to feature models
        const requests = [
            this.ds.asFeatures(response.conduits),
            this.ds.asFeatures(response.conduit_runs),
            this.ds.asFeatures(response.cable_segs),
            this.ds.asFeatures(response.cables),
            this.ds.asFeatures(response.conns),
            this.ds.asFeatures(response.equip)
        ];

        const [conduits, conduit_runs, cable_segs, cables, conns, equip] = await Promise.all([
            ...requests
        ]);
        const result = { conduits, conduit_runs, cable_segs, cables, conns, equip };

        result.seg_circuits = response.seg_circuits;
        result.port_circuits = response.port_circuits;

        return result;
    }

    /**
     * Get objects contained within route
     *
     * @returns
     */
    async routeContent(feature, includeProposed = false) {
        const id = encodeURIComponent(feature.getId());
        const featureType = encodeURIComponent(feature.getType());

        const data = {
            include_proposed: includeProposed,
            delta: this.ds.getDelta()
        };

        const response = await this.ds.moduleGet(
            `modules/comms/route/${featureType}/${id}/contents`,
            data
        );

        const requests = [
            this.ds.asFeatures(response.conduits),
            this.ds.asFeatures(response.conduit_runs),
            this.ds.asFeatures(response.cable_segs),
            this.ds.asFeatures(response.cables)
        ];
        const [conduits, conduit_runs, cable_segs, cables] = await Promise.all([...requests]);
        const result = { conduits, conduit_runs, cable_segs, cables };

        result.circuits = response.circuits;

        return result;
    }

    async splitRoute(featureType, id, includeProposed = false) {
        const data = {
            include_proposed: includeProposed,
            delta: this.ds.getDelta()
        };

        const routes = await this.ds.modulePost(
            `modules/comms/route/${featureType}/${id}/split`,
            data
        );

        return this.ds.asFeatures(routes);
    }

    // -------------------------------------------------------------------------
    //                                 PINS
    // -------------------------------------------------------------------------

    /**
     * Get paths for pins of network object 'feature'
     * If optional 'full' is true, include path coordinates
     * Returns a list of path objects, keyed by pin number
     */
    async pinPaths(tech, feature, pins, full = false) {
        const id = encodeURIComponent(feature.getId());
        const featureType = encodeURIComponent(feature.getType());

        const data = {
            pins: pins.spec,
            full,
            delta: this.ds.getDelta()
        };

        const response = await this.ds.moduleGet(
            `modules/comms/${tech}/paths/${featureType}/${id}`,
            data
        );

        return response;
    }

    /**
     * Connect two objects
     */
    // ENH: For default housing, check type is equipment
    async connect(tech, fromFeature, fromPins, toFeature, toPins, housing = fromFeature) {
        const data = {
            from: fromFeature.getUrn() + '?pins=' + fromPins.spec,
            to: toFeature.getUrn() + '?pins=' + toPins.spec,
            housing: housing.getUrn(),
            delta: this.ds.getDelta()
        };

        const featureData = await this.ds.modulePost(`modules/comms/${tech}/connect`, data);

        const type = featureData.myw.feature_type;
        await this.ds._ensureDDInfoFor([type]);
        const conn = this.ds._asFeature(featureData, type);

        return conn;
    }

    /**
     * Disconnect pins of 'feature' (an equip, segment or connection record)
     */
    disconnect(tech, feature, pins) {
        const data = {
            pins: feature.getUrn() + '?pins=' + pins.spec,
            delta: this.ds.getDelta()
        };
        return this.ds.modulePost(`modules/comms/${tech}/disconnect`, data);
    }

    /**
     * Connection records for cable
     * @param {MywFeature} cable
     * @param {bool} splice
     * @param {bool} sorted
     * @return [{MywFeature}]  List of connection records
     */
    async connectionsForCable(cable, splice = undefined, sorted = false) {
        const cableType = encodeURIComponent(cable.getType());
        const cableId = encodeURIComponent(cable.getId());

        let url = `modules/comms/cable/${cableType}/${cableId}/connections`;

        const data = { sort: sorted, delta: this.ds.getDelta() };
        if (!_.isUndefined(splice)) data.splice = splice;

        const conns = await this.ds.moduleGet(url, data);

        return this.ds.asFeatures(conns);
    }

    /**
     * Connection low/high information for cable
     * @param {MywFeature} cable
     * @return {object}  low / high
     */
    async cableHighestUsedPin(cable) {
        const cableType = encodeURIComponent(cable.getType());
        const cableId = encodeURIComponent(cable.getId());

        const url = `modules/comms/cable/${cableType}/${cableId}/highest_connected`;

        const res = await this.ds.moduleGet(url, { delta: this.ds.getDelta() });

        return res['high'];
    }

    // -------------------------------------------------------------------------
    //                                CONDUITS
    // -------------------------------------------------------------------------

    /**
     * Continuous chain of conduits
     * @param {MywFeature} conduit
     * @return [{MywFeature}]  List of conduits
     */
    async continuousConduits(conduit) {
        const conduitType = encodeURIComponent(conduit.getType());
        const conduitId = encodeURIComponent(conduit.getId());

        const url = `modules/comms/conduit/${conduitType}/${conduitId}/chain`;

        const conduits = await this.ds.moduleGet(url, {
            delta: this.ds.getDelta()
        });

        return this.ds.asFeatures(conduits);
    }

    /**
     * Finds path through routes network linking given structures
     * Traces between each structure pair and returns the routes that can be used to route conduit
     * Similar to cable routing but does not include direction info or duplicate routes
     *
     * @return [{MywFeature}] Ordered list of routes
     */
    async findConduitPath(conduit, structs) {
        const structUrns = structs.map(struct => struct.getUrn());

        const data = {
            structures: JSON.stringify(structUrns),
            feature_type: conduit.getType(),
            delta: this.ds.getDelta()
        }; // ENH: Pass type in URL
        const url = `modules/comms/conduit/path`;

        // As post to prevent URL overflow
        const routes = await this.ds.modulePost(url, data).catch(
            error => {
                throw new Error(this.msg('no_path_found'));
            } // ENH: Return error type from service
        );

        return this.ds.asFeatures(routes);
    }

    /**
     *
     *
     * @return [{MywFeature}] List of new conduits
     */
    async routeConduit(featureType, conduitJson, structs, numPaths) {
        const conduitType = encodeURIComponent(featureType);

        const structUrns = structs.map(struct => struct.getUrn());

        const data = {
            structures: JSON.stringify(structUrns),
            feature: JSON.stringify(conduitJson),
            num_paths: numPaths,
            delta: this.ds.getDelta()
        };
        const url = `modules/comms/conduit/${conduitType}/route`;

        // As post to prevent URL overflow
        const conduits = await this.ds.modulePost(url, data).catch(
            error => {
                throw new Error(this.msg('no_path_found'));
            } // ENH: Return error type from service
        );

        return this.ds.asFeatures(conduits);
    }

    /**
     * Move cable segment or conduit 'feature' to a new housing in same route
     * @param {MywFeature} housing
     * @param {MywFeature} contained feature
     */
    async moveInto(feature, housing) {
        const featureType = encodeURIComponent(feature.getType());
        const featureId = encodeURIComponent(feature.getId());

        const housingType = encodeURIComponent(housing.getType());
        const housingId = encodeURIComponent(housing.getId());

        const url = `modules/comms/conduit/${featureType}/${featureId}/move_to/${housingType}/${housingId}`;

        const response = await this.ds.modulePost(url, { delta: this.ds.getDelta() }).catch(e => {
            if (e.name == 'ObjectNotFoundError') {
                throw new Error('conduit_missing');
            } else throw e;
        });

        return response;
    }

    /**
     * Disconnect conduit at structure
     */
    disconnectConduit(conduit, struct) {
        const conduitId = encodeURIComponent(conduit.getId());
        const conduitType = encodeURIComponent(conduit.getType());

        const structId = encodeURIComponent(struct.getId());
        const structType = encodeURIComponent(struct.getType());

        return this.ds.modulePost(
            `modules/comms/conduit/${conduitType}/${conduitId}/disconnect_at/${structType}/${structId}`,
            { delta: this.ds.getDelta() }
        );
    }

    /**
     * Connect conduits at structure
     */
    async connectConduits(struct, conduit1, conduit2) {
        const structId = encodeURIComponent(struct.getId());
        const structType = encodeURIComponent(struct.getType());

        const conduit1Id = encodeURIComponent(conduit1.getId());
        const conduit1Type = encodeURIComponent(conduit1.getType());

        const conduit2Id = encodeURIComponent(conduit2.getId());
        const conduit2Type = encodeURIComponent(conduit2.getType());

        return this.ds.modulePost(
            `modules/comms/conduit/${conduit1Type}/${conduit1Id}/connect/${conduit2Type}/${conduit2Id}/at/${structType}/${structId}`,
            { delta: this.ds.getDelta() }
        );
    }

    // -------------------------------------------------------------------------
    //                                CIRCUITS
    // -------------------------------------------------------------------------

    /**
     * Route a circuit from its termination port info
     */
    async routeCircuit(circuit) {
        const id = encodeURIComponent(circuit.getId());
        const type = encodeURIComponent(circuit.getType());
        const url = `modules/comms/circuit/${type}/${id}/route`;
        const data = { delta: this.ds.getDelta() };

        return this.ds.modulePost(url, data);
    }

    /**
     * Unroute a circuit by removing its segments whilst retaining in_port and out_port info
     */
    async unrouteCircuit(circuit) {
        const id = encodeURIComponent(circuit.getId());
        const type = encodeURIComponent(circuit.getType());
        const url = `modules/comms/circuit/${type}/${id}/unroute`;
        const data = { delta: this.ds.getDelta() };

        return this.ds.modulePost(url, data);
    }

    /**
     * Returns connections on 'side' of 'feature'
     */
    async connectionsOn(feature, tech, side) {
        const id = encodeURIComponent(feature.getId());
        const featureType = encodeURIComponent(feature.getType());

        const response = await this.ds.moduleGet(
            `modules/comms/${tech}/connections/${featureType}/${id}/${side}`,
            { delta: this.ds.getDelta() }
        );

        return response.conns;
    }

    /**
     * returns list of circuits for pins on feature (segment or equipment)
     * @param {MywFeature} feature
     * @param {PinRange} pins
     * @param {Boolean} includeProposed
     */
    async pinCircuits(tech, feature, pins, includeProposed = true) {
        const id = encodeURIComponent(feature.getId());
        const featureType = encodeURIComponent(feature.getType());

        const data = {
            pins: pins.spec,
            include_proposed: includeProposed,
            delta: this.ds.getDelta()
        };

        const response = await this.ds.moduleGet(
            `modules/comms/${tech}/${featureType}/${id}/circuits`,
            data
        );

        return response.circuits;
    }

    // -------------------------------------------------------------------------
    //                              FEATURE API
    // -------------------------------------------------------------------------
    // These methods are cut-and-paste from Core Datsource and myWorldDatasoure in order to call different server methods
    // ENH: Avoid need for this

    /**
     * Insert a feature to a datasource. <br/>
     * Receives either a detached feature or a feature type and geojson
     * @param  {Feature|string}   detachedFeatureOrFeatureType
     * @param  {featureData}  [insertData]
     * @param  {boolean}   [update=false] If true, an id is provided and feature already exits, update
     *                                    it instead of throwing an error
     * @return {Promise<integer>}    Promise for the id of the inserted feature
     */
    insertFeature(detachedFeatureOrFeatureType, insertData, update = false) {
        const { type, geojson } = this.ds._parseInsertArgs(
            detachedFeatureOrFeatureType,
            insertData
        );
        return this._insertFeature(type, geojson, update);
    }

    /**
     * Insert a feature into a table (applying Comms server-side triggers)
     * @param  {string}   featureType
     * @param  {featureData}   insertData
     * @param  {boolean}   [update=false] If true, an id is provided and feature already exits, update it
     * @return {Promise<integer>}    Promise for the id of the inserted feature
     */
    _insertFeature(featureType, insertData, update = false) {
        return this.ds
            ._prepareValues(featureType, true, insertData)
            .then(convertedData =>
                this.ds.server.commsInsertFeature(featureType, convertedData, update)
            );
    }

    /**
     * Updates a feature in a datasource. <br/>
     * Receives either an existing feature or a feature type, feature id and geojson with the changes to apply
     * @param  {Feature|string}   featureOrType
     * @param  {string}   [featureId]
     * @param  {featureData}   [updateData]
     * @return {Promise<boolean>}    Promise for the success of the operation
     */
    updateFeature(featureOrType, featureId, updateData) {
        let featureType, feature;
        if (typeof featureOrType == 'string') {
            featureType = featureOrType;
        } else {
            //instance of myw.Feature
            feature = featureOrType;
            featureType = feature.type;
            featureId = feature.getId();
            updateData = feature.asGeoJson();
            // Add secondary geometries ENH: Use updated core API
            const secondary_geometry_keys = Object.keys(feature.secondary_geometries);
            if (secondary_geometry_keys.length) {
                updateData.secondary_geometries = {};
                for (const key of secondary_geometry_keys) {
                    updateData.secondary_geometries[key] = feature.getGeometry(key);
                }
            }
        }
        return this._updateFeature(featureType, featureId, updateData);
    }

    /**
     * Update a feature in a table (applying Comms server-side triggers)
     * @param  {string}   featureType
     * @param  {string}   featureId
     * @param  {featureData}   updateData
     * @return {Promise<boolean>}    Promise for the success of the operation
     */
    _updateFeature(featureType, featureId, updateData) {
        return this.ds
            ._prepareValues(featureType, false, updateData)
            .then(convertedData =>
                this.ds.server.commsUpdateFeature(featureType, featureId, convertedData)
            );
    }

    /**
     * Bulk move features by updating the coordniates based on a delta.
     *
     * @param {Array<myw.Feature>} features
     * @param {delta} delta
     * @returns {Promise}
     */
    async bulkMoveFeatures(app, features, delta) {
        if (!features || features.length === 0) return;

        const allCoordinates = features.flatMap(feature => {
            if (!feature.hasGeometry()) return [];

            return GeometryType.POINT === feature.getGeometry().type
                ? [feature.getGeometry().coordinates]
                : feature.getGeometry().coordinates;
        });

        // Capture the original state of the feature and pair it with the feature before bulk updating.
        const changedFeatures = features.map(feature => {
            return {
                feature,
                origFeature: feature.clone({ keepKey: true })
            };
        });

        allCoordinates.forEach(coordinate => {
            coordinate[0] = coordinate[0] + delta.lng;
            coordinate[1] = coordinate[1] + delta.lat;
        });

        const updateTransaction = this.ds.transaction();
        features.forEach(feature => {
            updateTransaction.addUpdate(feature);
        });

        try {
            const updateRepsonse = await this.runTransaction(updateTransaction);

            // Track the update for all features included in the bulk update.
            await Promise.all(
                changedFeatures.map(async changedFeature => {
                    const preUpdateGeoJson = changedFeature.origFeature.asGeoJson();
                    return changedFeature.feature.posUpdate(preUpdateGeoJson, app);
                })
            );

            return updateRepsonse;
        } catch (error) {
            // When an error occurs, reset changes to coordinates so that selection hightlights appear correct.
            allCoordinates.forEach(coordinate => {
                coordinate[0] = coordinate[0] - delta.lng;
                coordinate[1] = coordinate[1] - delta.lat;
            });
            throw error;
        }
    }

    /**
     * Delete a feature<br/>
     * Receives either an existing feature or a feature type and id
     * @param  {Feature|string}   featureOrType
     * @param  {string}   [featureId]
     * @return {Promise}    Promise which will resolve when the operation has completed
     */
    deleteFeature(featureOrType, featureId) {
        let featureType, feature;
        if (typeof featureOrType == 'string') {
            featureType = featureOrType;
        } else {
            //instance of myw.Feature
            feature = featureOrType;
            featureType = feature.type;
            featureId = feature.getId();
        }
        return this._deleteFeature(featureType, featureId);
    }

    /**
     * Delete a feature by it's id (applying Comms server-side triggers)
     * @param  {string}   featureType
     * @param  {string}   featureId
     * @return {Promise}    Promise which will resolve when the operation has completed
     */
    _deleteFeature(featureType, featureId) {
        return this.ds.server.commsDeleteFeature(featureType, featureId);
    }

    /**
     * Run (insert, delete, update) operations on multiple features (applying Comms server-side triggers)
     * @param {Transaction} transaction     Operations to be executed
     * @return {Promise<Integer[]>}  Promise which resolves with ids
     *
     */
    // Cut and paste from myWorldDatasource to override URL
    async runTransaction(transaction) {
        const ops = await transaction.getOperations();
        const opsPromises = ops.map(operation => {
            //adjust operation, converting values as necessary
            let toGenerate = false;
            const op = operation[0];
            const featureType = operation[1];
            const feature = operation[2];
            if (op == 'insert') {
                toGenerate = true;
            }
            if (op == 'delete' || op == 'deleteIfExists') {
                return operation;
            }

            return this.ds._prepareValues(featureType, toGenerate, feature).then(convertedData => {
                convertedData.type = 'Feature';
                return [op, featureType, convertedData];
            });
        });

        const operations = await Promise.all(opsPromises);

        // COMMS: Start
        // Note: Cannot use modulePost with the feature controller
        // return this.server.runTransaction(operations);
        return this.ds.server.commsRunTransaction(operations);
        // COMMS: END
    }

    // -------------------------------------------------------------------------
    //                          INTEGRITY / CONFLICTS
    // -------------------------------------------------------------------------

    /**
     * Find conflicts of network objects in 'delta'
     * Optional bounds (myw.latLngBounds) area to filter results in
     * Optional categories (a list of strings) limits what is checked by category
     * Optional maxErrors (integer) stop returning error records after maxErrors limit is reached
     * @returns {Array<myw.Feature>} List of Conflict pseudo-features
     */
    async conflicts(delta, bounds, categories = [], maxErrors = null) {
        // Get conflicts
        const data = {
            bounds: this.boundsToUrlParam(bounds),
            categories: categories.join(',')
        };
        if (maxErrors) data.max_errors = maxErrors;

        const deltaUrn = this.encodeUrn(delta);

        const response = await this.ds.moduleGet(`modules/comms/delta/${deltaUrn}/conflicts`, data);
        await this.ensureAllDDInfo(); // ENH: Just get the ones we need

        const conflicts = [];
        for (const featureType in response.conflicts) {
            const conflictItems = response.conflicts[featureType];
            for (let featureId in conflictItems) {
                const conflictItem = conflictItems[featureId];
                const conflict = this._conflictFrom(featureType, conflictItem);
                conflicts.push(conflict);
            }
        }
        return conflicts;
    }

    /**
     * Check integrity of network objects in area 'bounds'
     * Optional 'categories' (a list of strings) limits what is checked
     * @returns {Array<myw.Feature>} List of IntegrityError pseudo-features
     */
    async validateArea(bounds, categories = []) {
        const delta = this.ds.getDelta();
        const deltaUrn = this.encodeUrn(delta);
        const data = {
            bounds: this.boundsToUrlParam(bounds),
            categories: categories.join(','),
            delta: deltaUrn
        };

        const response = await this.ds.moduleGet('modules/comms/validate', data);
        await this.ensureAllDDInfo(); // ENH: Just get the ones we need

        //Augment errors to create integrity error features
        const integrityErrors = [];
        Object.keys(response.errors).forEach(featureUrn => {
            const featureErrors = response.errors[featureUrn];
            const integrityError = this._integrityErrorFrom(featureErrors);
            integrityErrors.push(integrityError);
        });

        return integrityErrors;
    }

    /**
     * Check integrity of network objects in 'delta'
     * Optional bounds (myw.latLngBounds) area to filter results in
     * Optional categories (a list of strings) limits what is checked
     * Optional maxErrors (integer) stop returning error records after this limit is reached
     * @returns {Array<myw.Feature>} List of IntegrityError pseudo-features
     */
    async validateDelta(delta, bounds = undefined, categories = [], maxErrors = null) {
        const data = {};
        data.categories = categories.join(',');
        if (bounds) data.bounds = this.boundsToUrlParam(bounds);
        if (maxErrors) data.max_errors = maxErrors;

        const deltaUrn = this.encodeUrn(delta);

        let url = `modules/comms/delta/${deltaUrn}/validate`;
        const response = await this.ds.moduleGet(url, data);

        await this.ensureAllDDInfo(); // ENH: Just get the ones we need

        //Augment errors to create integrity error features
        const integrityErrors = [];
        Object.keys(response.errors).forEach(featureUrn => {
            const featureErrors = response.errors[featureUrn];
            const integrityError = this._integrityErrorFrom(featureErrors);
            integrityErrors.push(integrityError);
        });

        return integrityErrors;
    }

    /**
     * The feature changes made in 'delta'
     *
     * @param {string} delta        The URN of the delta to get changes for
     * @param {Array}  changeTypes  Optional list of change types of interest, defaults to all of them
     * @param {object} bounds       Optional bounds to restrict results, defaults to no restriction
     * @param {Array}  featureTypes Optional list of featureTypes to filter delta records against
     * @param {Number} limit        Optional number to limit size of result set
     * @param {geometry} bounds_poly  Optional polygon within which to restrict results
     * @returns {Array<myw.Feature>} List of FeatureChange pseudo-features
     */
    async deltaChanges(
        delta,
        changeTypes = null,
        bounds = null,
        featureTypes = null,
        limit = null,
        bounds_poly = null
    ) {
        const deltaUrn = this.encodeUrn(delta);

        const url = `modules/comms/delta/${deltaUrn}/changes`;

        const data = {};

        if (changeTypes) {
            data.change_types = changeTypes.join(',');
        }

        if (bounds) {
            data.bounds = this.boundsToUrlParam(bounds);
        }

        if (bounds_poly) {
            data.bounds_poly = this.polygonToUrlParam(bounds_poly);
        }

        if (featureTypes) {
            data.feature_types = featureTypes.join(',');
        }

        if (limit) {
            data.limit = limit;
        }

        // Post as bounds poly could have many points
        const response = await this.ds.modulePost(url, data);

        await this.ensureAllDDInfo(); // ENH: Just get the ones we need

        const changeItemPromises = response.changes.map(async changeItem => {
            const featureType = changeItem.feature.myw.feature_type;
            return this.featureChangeFrom(
                changeItem.change_type,
                changeItem.fields,
                featureType,
                changeItem.feature,
                changeItem.orig_feature
            );
        });
        return Promise.all(changeItemPromises);
    }

    /**
     * Convex hull of all changes in 'delta'
     *
     * @param {string} delta        The URN of the delta to get bounds for
     * @returns {Object} Convex hull of all changes in delta
     */
    async deltaBounds(delta) {
        const deltaUrn = this.encodeUrn(delta);
        const url = `modules/comms/delta/${deltaUrn}/bounds`;
        const response = await this.ds.moduleGet(url, {});
        return response;
    }

    /**
     * Fix broken geometries in 'delta'
     */
    async mergeDelta(delta) {
        //ENH: Allow bounds and categories as the server
        const deltaUrn = this.encodeUrn(delta);
        const response = await this.ds.modulePost(`modules/comms/delta/${deltaUrn}/merge`, {});

        await this.ensureAllDDInfo(); // ENH: Just get the ones we need
        const changeItemPromises = response.changes.map(async changeItem => {
            const featureType = changeItem.feature.myw.feature_type;
            return this.featureChangeFrom(
                changeItem.change_type,
                changeItem.fields,
                featureType,
                changeItem.feature,
                changeItem.orig_feature,
                delta
            );
        });
        return Promise.all(changeItemPromises);
    }

    /**
     * Undo all changes in delta for feature
     * @param {string} deltaUrn
     * @param {MyworldFeature} feature
     */
    async revertFeature(delta, featureType, id) {
        const deltaUrn = this.encodeUrn(delta);
        return this.ds.modulePost(
            `modules/comms/delta/${deltaUrn}/revert/${featureType}/${id}`,
            {}
        );
    }

    /**
     * Rebase delta feature
     * @param {string} deltaUrn
     * @param {MyworldFeature} feature
     */
    async rebaseFeature(delta, featureType, id) {
        const deltaUrn = this.encodeUrn(delta);
        return this.ds.modulePost(
            `modules/comms/delta/${deltaUrn}/rebase/${featureType}/${id}`,
            {}
        );
    }

    /**
     * Auto-resolve conflicting fields on FEATURETYPE/ID
     * @param {string} deltaUrn
     * @param {MyworldFeature} feature
     */
    async mergeFeature(delta, featureType, id) {
        const deltaUrn = this.encodeUrn(delta);
        return this.ds.modulePost(`modules/comms/delta/${deltaUrn}/merge/${featureType}/${id}`, {});
    }

    async replaceStructure(feature, feature_type, id, new_feature_type) {
        const data = {
            feature: JSON.stringify(feature),
            delta: this.ds.getDelta()
        };
        const url = `modules/comms/structure/${feature_type}/${id}/replace/${new_feature_type}`;
        const value = await this.ds.modulePost(url, data);
        return value;
    }

    // -------------------------------------------------------------------------
    //                                 DATA IMPORT
    // -------------------------------------------------------------------------

    /**
     * Get definitions of configured import formats
     *
     * Returns a set of importConfigs objects, keyed by internal name. Properties are:
     *   name           Display name
     *   engine         Engine to use
     *   options        Options to engine
     *   mappings       Feature type mappings
     */
    async dataImportConfigs() {
        return this.ds.moduleGet('modules/comms/import/config');
    }

    /**
     * Upload a data package and unzip it
     *
     * 'data' is a base64-encoded zip file.
     *
     * Returns upload ID
     */
    async uploadData(filename, filedata, taskId = 0) {
        const res = await this.ds.modulePost('modules/comms/upload', {
            filedata: filedata,
            filename: filename,
            taskId: taskId
        });
        return res.id;
    }

    /**
     * Get preview features for data package 'uploadId'
     *
     * 'engine' is the internal name of a data import engine
     */
    async getUploadPreview(
        fileName,
        uploadId,
        engine,
        engineOpts = {},
        mappings = {},
        coordSys = 0,
        taskId = 0
    ) {
        const url = `modules/comms/upload/${uploadId}/preview`;

        const args = {
            engine: engine,
            delta: this.ds.delta
        };

        if (engineOpts) args.options = JSON.stringify(engineOpts);
        if (mappings) args.mappings = JSON.stringify(mappings);
        if (coordSys) args.coord_system = coordSys;
        if (taskId) args.task_id = taskId;
        if (fileName) args.filename = fileName;

        const res = await this.ds.moduleGet(url, args);

        return this.ds.asFeatures(res);
    }

    /**
     * Import uploaded data package 'uploadId'
     *
     * 'engine' is the internal name of a data import engine
     */
    async importUpload(
        fileName,
        uploadId,
        engine,
        engineOpts = {},
        mappings = {},
        coordSys = 0,
        taskId = 0
    ) {
        const url = `modules/comms/upload/${uploadId}/import`;

        const args = {
            engine: engine,
            delta: this.ds.delta
        };

        if (engineOpts) args.options = JSON.stringify(engineOpts);
        if (mappings) args.mappings = JSON.stringify(mappings);
        if (coordSys) args.coord_system = coordSys;
        if (taskId) args.task_id = taskId;
        if (fileName) args.filename = fileName;

        return this.ds.modulePost(url, args);
    }

    /**
     * Get progress with task 'taskId'
     */
    async taskStatus(taskId = 0) {
        const res = await this.ds.server.getJSON(`config/task/${taskId}`); // ENH: get core to move this routingx
        if (res.query) return res.query.status;
    }

    // -------------------------------------------------------------------------
    //                                 HELPERS
    // -------------------------------------------------------------------------

    _conflictFrom(featureType, conflictItem) {
        const deltaFeature = conflictItem.delta;
        const deltaFeatureChange = this.featureChangeFrom(
            deltaFeature.myw.change_type,
            deltaFeature.fields,
            featureType,
            deltaFeature
        );
        const masterFeatureChange = this.featureChangeFrom(
            conflictItem.master_change,
            conflictItem.master_fields,
            featureType,
            conflictItem.master,
            null,
            ''
        );

        const baseFeature = conflictItem.base
            ? this.ds._asFeature(conflictItem.base, featureType)
            : null;

        const conflict = new Conflict(
            deltaFeatureChange,
            masterFeatureChange,
            baseFeature,
            conflictItem.master_change,
            conflictItem.master_fields,
            conflictItem.delta_fields,
            conflictItem.conflict_fields
        );
        return conflict.augmentFeature(conflict.feature);
    }

    /**
     * Build validation error pseudo-feature from its serialised form
     */
    _integrityErrorFrom(errorItems) {
        const feature = errorItems[Object.keys(errorItems)[0]].feature; //all errorItems will refer to the same feature
        const featureType = feature.myw.feature_type;

        // Get feature instance
        const featureRec = this.ds._asFeature(feature, featureType);

        let refFeatures = {};
        for (const fieldName in errorItems) {
            const error = errorItems[fieldName];
            if (error.ref_feature) {
                const refFeature = this.ds._asFeature(
                    error.ref_feature,
                    error.ref_feature.myw.feature_type
                );
                refFeatures[fieldName] = refFeature;
            }
        }

        const integrityError = new IntegrityError(
            featureRec,
            refFeatures,
            'integrity_error',
            errorItems
        );
        return integrityError.augmentFeature(featureRec);
    }

    /**
     * Creates augmented feature with featureChange methods from geojson feature
     * @param {geoJson} changeItem
     * @param {String} featureType
     */
    featureChangeFrom(changeType, changedFields, featureType, featureData, origFeature, delta) {
        if (!featureData) return null;
        let feature;
        feature = this.ds._asFeature(featureData, featureType);

        if (!feature) return null;
        if (origFeature) {
            origFeature = this.ds._asFeature(origFeature, featureType);
        }
        const featureChange = new FeatureChange(feature, origFeature, changeType, changedFields);
        return featureChange.augmentFeature(feature);
    }

    /**
     * Ensure DD info loaded for all feature types
     */
    ensureAllDDInfo() {
        return this.ds.getDDInfoFor(Object.keys(this.ds.featuresDD));
    }

    /**
     * Returns polygon as a string suitable for URL param value
     */
    polygonToUrlParam(polygon) {
        let coords = _.flatten(polygon.coordinates[0]);
        return coords.join(',');
    }

    /**
     * Returns bounds as a string suitable for URL param value
     */
    boundsToUrlParam(bounds) {
        if (!bounds) return '';
        const { _southWest, _northEast } = bounds;

        const xMin = _southWest.lng.toFixed(7);
        const yMin = _southWest.lat.toFixed(7);
        const xMax = _northEast.lng.toFixed(7);
        const yMax = _northEast.lat.toFixed(7);

        const boundsParam = [xMin, yMin, xMax, yMax].join(',');

        return boundsParam;
    }

    /**Encode URN
     * @param {string} urn
     * ENH: move to utils class
     */
    encodeUrn(urn) {
        let [featureType, featureKey] = urn.split('/');

        featureKey = encodeURIComponent(featureKey);

        return `${featureType}/${featureKey}`;
    }

    /**
     * Update LOC information for multiple features
     *
     * @param {Object} data
     * @returns
     */
    async updateFeaturesLOC(features, markStale = false) {
        const feature_loc = features.map(feature => {
            const side = feature._loc_side;
            const origin = feature._loc_origin;
            const cfg = feature._loc_config;
            const qurn = side ? `${feature.getUrn()}?side=${side}` : feature.getUrn();
            return [qurn, { loc_cfg: cfg, origin: origin }];
        });

        const data = {
            delta: this.ds.getDelta(),
            feature_loc: JSON.stringify(Object.fromEntries(feature_loc)),
            mark_stale: markStale
        };

        const url = 'modules/comms/loc/update';

        const resp = await this.ds.modulePost(url, data);

        return resp;
    }

    /**
     * Fetch LOC information for features suitable for editing.
     * @param {Object} data
     * @returns
     */
    async getFeaturesLOC(featureUrns) {
        const url = `modules/comms/loc/get`;

        let delta = this.ds.getDelta();

        const data = {
            delta: delta,
            urns: JSON.stringify(featureUrns)
        };

        const resp = await this.ds.modulePost(url, data);

        return resp;
    }

    /**
     * Fetch LOC information for a list of features suitable
     * for display in cable trees etc.
     * @param {Array<String>} featureUrns
     * @returns
     */
    async getFeaturesLOCDetails(featureUrns, include_proposed = false) {
        const url = `modules/comms/loc/get_details`;

        let delta = this.ds.getDelta();

        const data = {
            delta: delta,
            urns: JSON.stringify(featureUrns),
            include_proposed: include_proposed
        };

        const resp = await this.ds.modulePost(url, data);

        return resp;
    }

    /**
     * Send ripple request to backend
     *
     * @param {MywFeature} feature - Container to ripple from
     * @param {String} side - Side of container to ripple from
     * @returns
     */
    async ripple(feature, side, config) {
        // Do deletions first

        const data = { delta: this.ds.getDelta() };

        if (side) data['side'] = side;
        if (config) data['config'] = JSON.stringify(config);

        await this.ds.modulePost(
            `modules/comms/loc/${feature.type}/${feature.id}/ripple_deletions`,
            data
        );

        // And then actual ripple trace
        const result = await this.ds.moduleGet(
            `modules/comms/loc/${feature.type}/${feature.id}/ripple_trace`,
            data
        );
        return result;
    }

    /**
     * Handle impact of disconnection on line of count information passing
     * through connection
     *
     * @param {MywFeature} feature - where disconnection ocurred
     * @param {String} side - side of feature where disconnection ocurred
     * @param {boolean} ripple - whether to ripple loc changes
     * @returns
     */
    async disconnectLOC(feature, side, ripple) {
        const req_data = { delta: this.ds.getDelta(), ripple: ripple };

        if (side) {
            req_data['side'] = side;
        }
        return this.ds.modulePost(
            `modules/comms/loc/${feature.type}/${feature.id}/disconnect_loc`,
            req_data
        );
    }

    /**
     * Handle impact of connection on line of count information passing
     * through connection
     *
     * @param {MywFeature} conn - connection
     * @param {boolean} ripple - whether to ripple loc changes
     * @returns
     */
    async connectLOC(conn, ripple) {
        const req_data = {
            delta: this.ds.getDelta(),
            side: conn.properties.in_side,
            ripple: ripple
        };

        return this.ds.modulePost(
            `modules/comms/loc/${conn.getType()}/${conn.id}/connect_loc`,
            req_data
        );
    }
}

// Make accessible
myw.MyWorldDatasource.extensions.comms = CommsDsApi;

export default CommsDsApi;
