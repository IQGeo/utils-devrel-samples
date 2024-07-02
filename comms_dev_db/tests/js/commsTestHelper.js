// Copyright: Ubisense Limited 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
import _ from 'underscore';
import $ from 'jquery';
import { MywClass } from 'myWorld-base';
import 'modules/comms_dev_db/js/main.mywcom_devdb';
import MapBrowserEvent from 'ol/MapBrowserEvent.js';

// Ensure we get the same instance of myw as platform helper
const myw = global.myw;

import th from 'modules/dev_tools/testHelper';

// Helpers for rounding values to specific precision
const roundFloat = function (val, dp) {
    if (val == null) return null;
    return Number.parseFloat(val.toPrecision(dp));
};
const roundCoord = function (val, dp) {
    return [roundFloat(val[0], dp), roundFloat(val[1], dp)];
};

const coordsToFixed = function (type, coordinates, digitsPastDecimalPoint) {
    if (type === 'Point') {
        return ptCoordsToFixed(coordinates, digitsPastDecimalPoint);
    }
    return coordinates.map(pt => {
        return ptCoordsToFixed(pt, digitsPastDecimalPoint);
    });
};

const ptCoordsToFixed = function (point, digitsPastDecimalPoint) {
    return point.map(val => {
        return Number.parseFloat(val.toFixed(digitsPastDecimalPoint));
    });
};

/**
 * Helper for defining and running Comms tests
 */
class CommsTestHelper extends MywClass {
    static {
        this.prototype.roundFloat = roundFloat;
        this.prototype.roundCoord = roundCoord;
        this.prototype.coordsToFixed = coordsToFixed;

        // Name of a existing design that has no delta changes
        this.prototype.cleanDelta = 'design/NB217';

        this.prototype.internalErrors = [
            'conduit_contains_cable',
            'conduit_has_cable',
            'route_has_cable',
            'cable_has_circuit',
            'conduit_is_continuous',
            'equipment_has_circuit',
            'structure_has_circuit',
            'cable_has_connection'
        ];

        // Start ID for new objects (must match DB build)
        this.prototype.shardMin = 100000;
    }

    // Init self with MywTestHelper 'th'
    constructor(th) {
        super();
        this.th = th;
    }

    // -------------------------------------------------------------------------
    //                            TEST WRAPPERS
    // -------------------------------------------------------------------------

    declareTest(name, f, modifiesDb = true, setupGlobalsFunc, requiresApp = true) {
        jo.test(name, async () => {
            if (modifiesDb) {
                console.log('  Running test:', name);
            } else {
                console.log('  Running readonly test:', name);
            }

            this.ds = await this.openDatasource();
            this.setDelta(this.ds, '', true);

            let app;
            if (requiresApp) {
                if (myw.isNativeApp) {
                    // This works around a timing problem where the SyncDownloadPlugin is still running
                    // whilst the database is being closed and saved. This gives rise to SQL_MISUSE error.
                    delete myw.applicationDefinition.plugins.syncDownload;
                }

                app = await this.th.getApp({
                    applicationName: 'mywcom',
                    layoutName: 'desktop'
                });
            }

            setupGlobalsFunc(this.ds, app);

            if (modifiesDb) {
                await this.setupWritable(this.ds);
            }

            // Run the test, which most likely adds a number of subtests that the
            // test framework runs after this test function completes
            await f(name, app);
            if (app) {
                app.remove();
            }
        });
    }

    declareSubTest(name, f) {
        jo.subTest(name, async () => {
            console.log('    Running subtest:', name);
            this.setDelta(this.ds, '', true);

            try {
                await f(name);
            } catch (e) {
                console.trace(e);
            }
        });
    }

    declareLastSubTest(name, ds, f) {
        jo.subTest(name, async () => {
            console.log('    Running subtest:', name);

            try {
                await f(name);
            } catch (e) {
                console.trace(e);
            } finally {
                await this.tearDownWritable(ds);
            }
        });
    }

    // Workaround for Native App trashing original shard (see Core issue 19592)
    async setupWritable(dsOrSystem) {
        console.log(`    Comms Setup Writable: NativeApp=${myw.isNativeApp}`);
        await this.saveDB(this.ds, true);
        await this.th.setupWritable(this.ds);

        if (myw.isNativeApp) {
            await this.setShard(this.ds);
        }
    }

    // Modify shard to make Native App IDs match master DB
    // ENH: Modify Core fake registration and remove this
    async setShard() {
        console.log('       Setting DB Shard to', this.shardMin);
        const db = this.th.getServer()._db;
        await db.runSql('delete from myw_sqlite$shard_range');
        await db.runSql(
            `insert into myw_sqlite$shard_range values (1,${this.shardMin},${this.shardMin + 1000})`
        );
    }

    // Workaround for Native App trashing original shard (see Core issue 19592)
    async tearDownWritable(dsOrSystem) {
        console.log('    Comms Teardown Writable');

        try {
            await this.restoreDB(dsOrSystem);
        } catch (cond) {
            console.log('***ERROR*** Database restore failed:', cond);
            throw cond;
        }

        myw.currentUser = null;

        console.log('       Clearing Feature Models');
        this.deleteCommsFeatureModels();
    }

    /**
     * Remove any models loaded by featureModelLoaderPlugin.js (which can cause changes to presentation of test results)
     */
    deleteCommsFeatureModels() {
        delete myw.featureModels['mywcom_conduit_run'];
        delete myw.featureModels['mywcom_line_of_count'];

        const networkTypes = myw.config['mywcom.network_types'];
        Object.values(networkTypes).map(network => {
            delete myw.featureModels[network.segment_type];
            delete myw.featureModels[network.connection_type];
            delete myw.featureModels[network.slack_type];
        });
    }

    /**
     * Output JS error
     */
    showError(err) {
        output(err.toString());
        output();
    }

    // -------------------------------------------------------------------------
    //                            RECORD CREATION TESTS
    // -------------------------------------------------------------------------

    /**
     * Insert feature and show database changes and run validation
     */
    // ENH: Support validating within bounds if no delta (like server tests)
    async testInsertFeature(testName, ds, featureType, properties, geomType, coords) {
        const result = await this.insertFeature(ds, featureType, properties, geomType, coords);
        await this.showDatabaseChanges(ds, testName);
        await this.showValidationErrors(ds, testName);
        return result;
    }

    /**
     * Update feature and show database changes and run validation
     */
    async testUpdateFeature(testName, ds, urn, properties, coords) {
        const result = await this.updateFeature(ds, urn, properties, coords);
        await this.showDatabaseChanges(ds, testName);
        await this.showValidationErrors(ds, testName);
        return result;
    }

    /**
     * Exercise feature delete service
     */
    async testDeleteFeature(testName, ds, urn, coords = undefined) {
        const result = await this.deleteFeature(ds, urn, coords);
        await this.showDatabaseChanges(ds, testName);
        await this.showValidationErrors(ds, testName);
        return result;
    }

    // -------------------------------------------------------------------------
    //                            RECORD CREATION HELPERS
    // -------------------------------------------------------------------------

    /**
     * Insert a feature
     */
    async insertFeature(ds, featureType, properties, geomType, coords) {
        const detFeature = await ds.createDetachedFeature(featureType);
        detFeature.properties = properties;
        detFeature.setGeometry(geomType, coords);

        const result = await this.ds.comms
            .insertFeature(featureType, detFeature.asGeoJson())
            .catch(error => {
                if (!this.internalErrors.includes(error.message)) console.trace(error);
                this.showError(error);
            });

        return result;
    }

    /**
     * Update a feature
     */
    async updateFeature(ds, urn, properties, coords) {
        const feature = await ds.getFeatureByUrn(urn);

        const updateData = {
            type: 'Feature',
            properties: properties,
            geometry: { type: feature.geometry.type, coordinates: coords }
        };

        const result = await ds.comms
            .updateFeature(feature.getType(), feature.id, updateData)
            .catch(error => {
                if (!this.internalErrors.includes(error.message)) console.trace(error);
                this.showError(error);
            });

        return result;
    }

    /**
     * Delete a feature
     */
    async deleteFeature(ds, urn, coords = undefined) {
        const [featureType, id] = urn.split('/');
        const result = await ds.comms.deleteFeature(featureType, id).catch(error => {
            if (!this.internalErrors.includes(error.message)) console.trace(error);
            this.showError(error);
        });

        return result;
    }

    // -------------------------------------------------------------------------
    //                            RECORD FIND HELPERS
    // -------------------------------------------------------------------------

    async findStructs(ds, names) {
        const structs = [];

        for (const name of names) {
            const struct = await this.findStruct(ds, name);
            if (struct) structs.push(struct);
        }

        return structs;
    }

    async findStruct(ds, name) {
        if (name.indexOf('/') != -1) {
            // Try by URN
            const feature = await ds.getFeatureByUrn(name);

            if (feature) return feature;
        }

        // Try by name
        const structureTypes = ['building', 'manhole', 'cabinet', 'pole', 'wall_box'];

        return this.findRecord(ds, name, structureTypes);
    }

    async findEquip(ds, tech, name) {
        if (name.indexOf('/') != -1) {
            // Try by URN
            const feature = await ds.getFeatureByUrn(name);

            if (feature) return feature;
        }

        // Try by tech and name
        const allEquipTypes = {
            fiber: [
                'fiber_patch_panel',
                'fiber_olt',
                'fiber_mux',
                'fiber_splitter',
                'fiber_tap',
                'fiber_ont',
                'fiber_splice_tray',
                'splice_closure',
                'rack',
                'fiber_shelf',
                'slot'
            ],
            coax: [
                'coax_amplifier',
                'coax_tap',
                'coax_terminator',
                'directional_coupler',
                'inline_equalizer',
                'internal_directional_coupler',
                'internal_splitter',
                'optical_node_closure',
                'optical_node',
                'power_block',
                'power_inserter',
                'power_supply',
                'three_way_splitter',
                'two_way_splitter',
                'wifi_unit'
            ],
            copper: [
                'copper_bridge_tap',
                'copper_build_out',
                'copper_capacitor',
                'copper_dslam',
                'copper_load_coil',
                'copper_pair_gain',
                'copper_repeater',
                'copper_shelf',
                'copper_splice_closure',
                'copper_terminal'
            ]
        };

        const techEquipTypes = allEquipTypes[tech];
        return this.findRecord(ds, name, techEquipTypes);
    }

    /**
     *
     */
    async findRecord(ds, name, featureTypes, additionalFilter = '') {
        let filter = `[name] = '${name}'`;

        if (additionalFilter) filter += `& ${additionalFilter}`;

        for (const ft of featureTypes) {
            const recs = await ds.getFeatures(ft, { filter });

            if (recs.length) {
                if (recs.length > 1) output('TOO MANY ', name, featureTypes, additionalFilter);
                return recs[0];
            }
        }
    }

    /**
     * Finds route record at selection point
     * @param {Array} coord
     * @returns
     */
    async getRouteAt(ds, coord) {
        const selection = await ds.select({ lng: coord[0], lat: coord[1] }, 20, 8, ['mywcom_st']);
        return selection.find(feature => feature.getType() == 'ug_route');
    }

    // -------------------------------------------------------------------------
    //                            DATABASE HELPERS
    // -------------------------------------------------------------------------

    /**
     * Set the current delta on the datasource
     **/
    setDelta(ds, delta = '', silent = false) {
        if (!silent) output('Set delta to:', delta || '*** master ***');
        ds.delta = delta;
    }

    /**
     * Returns bounding box instance
     * [float] [lat, lng,  lat, lng] - corners of bounds
     */
    coordsToBounds(coords) {
        return new myw.latLngBounds(
            myw.latLng(coords[1], coords[0]),
            myw.latLng(coords[3], coords[2])
        );
    }

    /**
     * Validate changes in delta
     * [bounds] [lat, lng,  lat, lng] - corners of bounds
     */
    async showValidationErrors(ds, testName, bounds = undefined) {
        let integrityErrors;

        const delta = ds.delta;

        if (bounds) {
            // Validate the area, not just the changes in the delta

            const latLngBB = this.coordsToBounds(bounds);

            integrityErrors = await ds.comms.validateArea(latLngBB);

            output(`VALIDATION ERRORS (in bounds): ${testName}`);
        } else {
            if (!delta) {
                output('ERROR: NEED DELTA TO RUN VALIDATION'); // ENH: Throw an error!
                return;
            }

            integrityErrors = await ds.comms.validateDelta(delta);

            output(`VALIDATION ERRORS: ${testName}`);
        }

        this.outputIntegrityErrors(integrityErrors);
    }

    /**
     * Show database changes
     */
    async showDatabaseChanges(ds, resultId, saveDB = true, schemaFilter = 'd*') {
        const response = await ds.moduleGet(`modules/dev_tools/database/changes`, {
            schema: schemaFilter
        });

        if (myw.isNativeApp) {
            response.changes = this._fixupDatabaseChanges(response.changes);
        }

        output(`DATABASE CHANGES: ${resultId}`);
        for (const change of response.changes.sort()) {
            output(`    ${change}`);
        }
        output();

        if (saveDB) await this.saveDB(ds);
    }

    /**
     * Fix up result of native changes services to match server result
     */
    _fixupDatabaseChanges(changes) {
        const fixedChanges = [];

        for (let change of changes) {
            // Suppress system and base changes // WORKAROUND for core issue 19569
            if (change.startsWith('insert myw.')) continue;
            if (change.startsWith('update myw.')) continue;
            if (change.startsWith('delete myw.')) continue;
            if (change.startsWith('insert base.')) continue;
            if (change.startsWith('update base.')) continue;
            if (change.startsWith('delete base.')) continue;
            fixedChanges.push(change);
        }

        return fixedChanges;
    }

    async openDatasource() {
        // Open and login to ds
        this.db = await this.th.getDatabase('admin', 'mywcom');
        const ds = this.db.getDatasource('myworld');
        await ds.initialized;

        // await ds.initialized.call('ensureLoggedIn').catch(function(reason) {
        //     console.log('Failed to obtain System. Reason:', reason);
        // });

        this.th.setApplication('mywcom', this.db); //, mywcomTest.plugins);

        // Switch off usage tracking tick as can cause 404s due to DB being restored and losing
        // usage sessions
        const intervalId = ds.system && ds.system.usageMonitor && ds.system.usageMonitor.sendTimer;
        if (intervalId) {
            clearInterval(intervalId);
        }

        return ds;
    }

    saveDB(ds, master = false) {
        if (master) console.log('       Saving DB state');
        return ds.moduleGet(`modules/dev_tools/database/save`);
    }

    restoreDB(ds) {
        console.log('       Restoring DB');
        return ds.moduleGet(`modules/dev_tools/database/restore`);
    }

    // -------------------------------------------------------------------------
    //                            COMMS-SPECIFIC OUTPUT
    // -------------------------------------------------------------------------

    outputCableRouting(result) {
        // Output features as summarized, no special sorting needed
        output(this.summariseObjects(result));
    }

    outputCableRerouting(result) {
        // Summarize all features
        result.cable = {
            geometry: result.cable.geometry,
            properties: result.cable.properties,
            secondary_geometries: result.cable.secondary_geometries,
            id: result.cable.id,
            myw: result.cable.myw
        };

        result = this.summariseObjects(result);

        // Sort subresults
        Object.keys(result).forEach(k => {
            let value = result[k];
            if (Array.isArray(value)) value = value.sort();
            result[k] = value;
        });

        output(result);
    }

    async outputCableAndSegs(cable) {
        this.outputFeature(cable, true, true, true);
        const segs = await cable.followRelationship('cable_segments');
        segs.sort((a, b) => {
            return a.id - b.id;
        });
        this.outputFeatures(segs, true, true, true);
    }

    outputRouteCableTree(result) {
        // Summarize all features
        result = this.summariseObjects(result);

        // Order children by feature/connections
        result = this.sortObjects(result, ['children', 'conns', 'circuits']);

        output(result);
    }

    outputRouteContents(result) {
        // Summarize all features
        result = this.summariseObjects(result);

        // Sort subresults
        Object.keys(result).forEach(k => {
            let value = result[k];
            if (Array.isArray(value)) value = value.sort();
            result[k] = value;
        });

        // Order circuits by circuit URN
        result = this.sortObjects(result, ['circuits']);

        output(result);
    }

    outputStructContents(result) {
        // Summarize all features
        result = this.summariseObjects(result);

        // Sort subresults
        Object.keys(result).forEach(k => {
            let value = result[k];
            if (Array.isArray(value)) value = value.sort();
            result[k] = value;
        });

        // Order circuits by circuit URN
        this.sortObjectArray(result['seg_circuits'], [
            'delta',
            'circuit_urn',
            'seg_urn',
            'side',
            'low',
            'high'
        ]);
        this.sortObjectArray(result['port_circuits'], [
            'delta',
            'circuit_urn',
            'equip_urn',
            'side',
            'low',
            'high'
        ]);

        output(result);
    }

    outputEquipTree(result) {
        // Summarize all features
        result = this.summariseObjects(result);

        // Sort equipment array
        if (result.equipment) result.equipment = result.equipment.sort();

        // Order children by feature/connections
        result = this.sortObjects(result, [
            'children',
            'conns',
            'splices',
            'circuits',
            'splice_circuits'
        ]);

        output(result);
    }

    outputEquipTraceTrees(result) {
        // Summarize all features
        result = this.summariseObjects(result);
        // Order children by feature/connections
        result = this.sortObjects(result, [
            'children',
            'conns',
            'splices',
            'circuits',
            'splice_circuits'
        ]);
        output(result);
    }

    outputStructCableTree(result) {
        // Summarize all features
        result = this.summariseObjects(result);

        // Order children by feature/connections
        result = this.sortObjects(result, [
            'children',
            'conns',
            'circuits',
            'conduits',
            'conduit_runs',
            'cables',
            'cable_segs'
        ]);

        output(result);
    }

    outputStructConduitTree(result) {
        // Summarize all features
        result = this.summariseObjects(result);

        // Order children by feature/connections
        result = this.sortObjects(result, ['children', 'conns', 'circuits']);

        output(result);
    }

    outputStructCablePins(result) {
        // Summarize all features
        result = this.summariseObjects(result);

        // Order children by feature/connections
        result = this.sortObjects(result, ['in', 'out', 'conns', 'circuits']);

        output(result);
    }

    outputStructConduits(result) {
        // Summarize all features
        result = this.summariseObjects(result);

        result.sort((obj1, obj2) => obj1.conduit.localeCompare(obj2.conduit));

        output(result);
    }

    outputCircuitRouting(result) {
        if (result.circuit) {
            this.outputFeature(result.circuit, true, true, true);
        } else {
            output(result);
        }
    }

    /**
     * Helper to output a trace result
     * Trace result does not have the raw data returned from the REST service call
     */
    outputTraceResult(traceResult) {
        // ENH: Make this method more generic

        const keys = [
            'dist',
            'length',
            'individualLoss',
            'cumulativeLoss',
            'fibers',
            'start_coord',
            'stop_coord',
            'ports',
            'from_',
            'to_'
        ];

        const data = { nodes: [] };

        data.metadata = traceResult.metadata;

        traceResult.items.forEach(node => {
            const cleanedNode = {};

            if (node.feature) cleanedNode.feature = this.featureSummary(node.feature);
            if (node.parent) cleanedNode.parent = this.featureSummary(node.parent);
            if (node.children) cleanedNode.children = node.children.length;

            keys.forEach(key => {
                let val = node[key];

                // Workaround precision problems in Native App
                if (val) {
                    if (key == 'dist') val = roundFloat(val, 8);
                    if (key == 'start_coord') val = roundCoord(val, 8);
                    if (key == 'stop_coord') val = roundCoord(val, 8);
                }

                if (val !== undefined) cleanedNode[key] = val;
            });

            data.nodes.push(cleanedNode);
        });

        output(data);
    }

    outputIntegrityErrors(errs) {
        // Sort by problem feature
        errs = errs.sort((err1, err2) => err1.getUrn().localeCompare(err2.getUrn()));

        errs.forEach(err => {
            this.outputFeature(err);
            output(err.changedFields);
            for (const [key, item] of Object.entries(err.errorItems)) {
                output(item.data);
                output(item.type);
                output(item.field);
                this.outputFeature(item.feature);
                if (item.refFeature) this.outputFeature(item.refFeature);
            }
        });

        output();
    }

    outputConflicts(conflicts) {
        conflicts
            .sort((a, b) => {
                const aVal = a.delta.getUrn();
                const bVal = b.delta.getUrn();
                const sortOrderRes = aVal.localeCompare(bVal, undefined, {
                    numeric: true,
                    sensitivity: 'base'
                });
                return sortOrderRes;
            })
            .forEach(conflict => {
                output('');
                output('CONFLICT ON', conflict.getUrn());

                if (conflict.conflictFields) {
                    output('CONFLICT FIELDS', conflict.conflictFields);
                }
                output('');

                output('MASTER:', conflict.masterChange, ': fields:', conflict.masterFields);
                if (conflict.master) this.outputFeature(conflict.master);

                output('DELTA', conflict.deltaChange, ': fields:', conflict.deltaFields);
                if (conflict.delta) this.outputFeature(conflict.delta);

                if (conflict.base) {
                    output('BASE');
                    this.outputFeature(conflict.base);
                }

                output('');
            });
    }

    outputFeatureChanges(result) {
        result = result.sort((a, b) => {
            const aVal = a.getUrn();
            const bVal = b.getUrn();
            const sortOrderRes = aVal.localeCompare(bVal, undefined, {
                numeric: true,
                sensitivity: 'base'
            });
            return sortOrderRes;
        });
        result.forEach(feature => {
            output(feature.changeType, feature.getUrn());
        });
    }

    // -------------------------------------------------------------------------
    //                              FEATURE HELPERS
    // -------------------------------------------------------------------------

    /**
     * Replace features in object (recursively) with a one line urn/title
     */
    summariseObjects(obj, activeObjs = []) {
        if (obj === null || obj == undefined) return obj;

        if (obj instanceof myw.Feature) return this.featureSummary(obj);

        if (obj.__ident__) return obj.__ident__();

        // Avoid infinite recursion
        if (activeObjs.includes(obj)) return '<circular>';
        activeObjs.push(obj);

        // Recurse on elements
        if (Array.isArray(obj)) {
            for (const i in obj) {
                obj[i] = this.summariseObjects(obj[i], activeObjs);
            }
        }

        if (obj.toString() == '[object Object]') {
            for (const k of Object.keys(obj)) {
                obj[k] = this.summariseObjects(obj[k], activeObjs);
            }
        }

        activeObjs.pop();

        return obj;
    }

    sortObjects(obj, sortKeys = [], _reorder = false, activeObjs = []) {
        // Recursively walk from OBJ, re-ordering arrays
        if (obj === null || obj == undefined) return obj;

        // Avoid infinite recursion
        if (activeObjs.includes(obj)) return obj;
        activeObjs.push(obj);

        // Sort arrays and dicts
        if (Array.isArray(obj)) {
            let newArray = [];

            for (const i in obj) {
                obj[i] = this.sortObjects(obj[i], sortKeys, false, activeObjs);
            }

            if (_reorder) {
                // Want to sort this array
                // Assumes each element is an object
                obj = obj.sort((a, b) => {
                    // Feature expected to be a short summary string
                    let aVal = a.feature || '';
                    let bVal = b.feature || '';

                    let result;

                    result = aVal.localeCompare(bVal);

                    if (result == 0) {
                        // Try from/to pairs
                        aVal = `${a.from_feature} ${a.to_feature}`;
                        bVal = `${b.from_feature} ${b.to_feature}`;

                        result = aVal.localeCompare(bVal);
                    }

                    if (result == 0) {
                        // Try URNs or string
                        if (typeof a == 'string' && typeof b == 'string') {
                            aVal = a;
                            bVal = b;
                        } else {
                            aVal = a.urn || a.side || a.cable || '';
                            bVal = b.urn || b.side || b.cable || '';
                        }

                        result = aVal.localeCompare(bVal, undefined, {
                            numeric: true,
                            sensitivity: 'base'
                        });
                    }

                    return result;
                });
            }
        }

        if (obj.toString() == '[object Object]') {
            for (const k of Object.keys(obj)) {
                obj[k] = this.sortObjects(obj[k], sortKeys, sortKeys.indexOf(k) !== -1, activeObjs);
            }
        }

        activeObjs.pop();

        return obj;
    }

    sortObjectArray(arr, keys) {
        arr.sort((a, b) => {
            for (const key of keys) {
                if (a[key] > b[key]) return 1;
                if (a[key] < b[key]) return -1;
            }
            return 0;
        });
    }

    outputFeatures(features, includeId, includeGeom, truncate = false) {
        if (!Array.isArray(features)) return output(features, includeId, includeGeom, truncate);

        features.forEach(feature => this.outputFeature(feature, includeId, includeGeom, truncate));
    }

    outputFeature(feature, includeId, includeGeom, truncate = false) {
        // If it doesn't appear to be a feature, output in its entirity
        if (!feature.id) return output(feature);

        includeId = includeId !== false;
        includeGeom = includeGeom !== false;
        if (includeId) output('id:', feature.id);
        output('type:', feature.type);
        if (feature._myw && includeId) output('myw:', feature._myw); //title may include id and will have delta information
        if (includeGeom) {
            let geometry = feature.geometry;
            if (truncate && geometry) {
                geometry.coordinates = coordsToFixed(geometry.type, geometry.coordinates, 11);
            }
            output('geom:', feature.geometry);

            if (feature.secondary_geometries) {
                if (truncate) {
                    for (const name in feature.secondary_geometries) {
                        if (!feature.secondary_geometries[name]) continue;
                        feature.secondary_geometries[name].coordinates = coordsToFixed(
                            feature.secondary_geometries[name].type,
                            feature.secondary_geometries[name].coordinates,
                            11
                        );
                    }
                }
                output('secondary geom:', feature.secondary_geometries);
            }
        }

        var featureDD = feature.featureDD;
        if (featureDD && featureDD.fields) {
            Object.entries(feature.properties).forEach(([propName, value]) => {
                var fieldDD = featureDD.fields[propName];
                if (fieldDD && fieldDD.type == 'timestamp' && value && value.indexOf('.') > 0) {
                    //reduce precision of timestamp values as the nativeApp (sqlite) will only
                    //have information up to the second
                    feature.properties[propName] = value.substr(0, value.indexOf('.'));
                }

                if (propName === 'length') {
                    feature.properties[propName] = roundFloat(feature.properties[propName], 6);
                }
            });
        }

        this.fixDbDefault(feature);

        output('properties:', feature.properties);

        if (feature.displayValues) output('displayValues:', feature.displayValues);
        output();
    }

    fixDbDefault(feature) {
        // postgres handles default values differently than sqlite and will set comsof_auto=null on new features
        // eslint-disable-next-line no-prototype-builtins
        if (feature.properties.hasOwnProperty('comsof_auto')) {
            if (feature.properties['comsof_auto'] === null) {
                feature.properties['comsof_auto'] = false;
            }
        }
    }

    featureSummary(feature) {
        let urn, title, delta, deltaTitle;

        if (feature.getTitle) {
            // Looks like a feature instance
            urn = feature.getUrn();
            title = feature.getTitle();
            delta = feature.getDelta() || '';
            deltaTitle = feature.getDeltaDescription() || '';
        } else if (feature.myw) {
            // Looks like feature geoJSON
            urn = `${feature.myw.feature_type}/${feature.id}`;
            title = feature.myw.title || '';
            delta = feature.myw.delta || '';
            deltaTitle = feature.myw.delta_owner_title || '';
        } else {
            return feature;
        }

        return `${urn}: ${title} ${delta} ${deltaTitle}`.trim();
    }

    // Output report doc
    outputReportDoc(format, doc) {
        switch (format) {
            case 'html':
                this.outputHtml(doc);
                break;
            case 'xlsx':
                this.outputExcelDoc(doc);
                break;
            case 'pdf':
                this.outputPdfDoc(doc);
                break;
            default:
                output(doc);
        }
    }

    // Output HTML string
    outputHtml(text) {
        text = text.replace(/\>/g, '>\n');
        output(text);
    }

    // Output a ExcelJS document
    outputExcelDoc(doc) {
        doc.eachSheet(sheet => {
            sheet.eachRow(row => {
                row.eachCell(cell => {
                    output(cell.value); // ENH: Include cell address
                });
            });
        });
    }

    // Output jsPDF document
    outputPdfDoc(doc) {
        doc = doc.output();
        doc = doc.replace(/CreationDate \(D:.*\)/, 'CreationDate <date>');
        doc = doc.replace(/ID \[ \<.*\> \]/, 'ID <id>');
        output(doc);
    }

    output(...items) {
        output(...items);
    }
}

// Create global instance
const commsTh = new CommsTestHelper(th);

export default commsTh;
