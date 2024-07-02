// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';

suite('Conduit Services', function () {
    let ds;

    // -------------------------------------------------------------------------
    //                                HELPERS
    // -------------------------------------------------------------------------

    const setupGlobals = (datasource, app) => {
        ds = datasource;
    };

    const test = (name, f, modifiesDb = true) => {
        th.declareTest(name, f, modifiesDb, setupGlobals, false);
    };

    const readonlyTest = (name, f) => test(name, f, false, false);

    const subTest = (name, f) => {
        th.declareSubTest(name, f);
    };

    const lastSubTest = (name, f) => {
        th.declareLastSubTest(name, ds, f);
    };

    // -------------------------------------------------------------------------
    //                                TESTS
    // -------------------------------------------------------------------------

    /**
     * Insert equipment on conduit then move equipment on conduit
     */
    test('Update', function (testname) {
        const delta = 'design/NB046';

        // Helper to split tubes and move tubes in complex area
        subTest('SPLIT ROUTE WITH STRUCTURE', async function (subTestName) {
            th.setDelta(ds, delta);

            // Split UG route 376 (has multiple tubes, cables, tubes going different directions)
            const result = await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {
                    myw_orientation_location: 0,
                    specification: '',
                    size_x: null,
                    size_y: null,
                    size_z: null,
                    lockable: null,
                    powered: null,
                    installation_date: ''
                },
                'Point',
                [0.1368060708046, 52.2256463248086]
            );
        });

        lastSubTest('MOVE STRUCTURE', async function (subTestName) {
            th.setDelta(ds, delta);

            // Drag route junction at end of tubes, segments just split
            const result = await th.testUpdateFeature(
                subTestName,
                ds,
                'mywcom_route_junction/53', // Has blown fiber tubes, bf bundles, cables
                {},
                [0.1365794, 52.225625]
            );
        });
    });

    /**
     * Test feature delete. Delete a conduit with cables inside (should fail to be deleted). Then delete a conduit without cables
     */
    test('Delete', function (testName) {
        const delta = 'design/NB046';

        subTest('DELETE FAIL', async function (subTestName) {
            th.setDelta(ds, delta);
            await th.testDeleteFeature(subTestName, ds, 'blown_fiber_tube/44');
        });

        lastSubTest('DELETE SUCCESS', async function (subTestName) {
            th.setDelta(ds, delta);
            await th.testDeleteFeature(subTestName, ds, 'blown_fiber_tube/105');
        });
    });

    /**
     * Exercise conduit path service
     */
    test('Path', function (testName) {
        const delta = 'design/NB046';
        subTest('FIND PATH', async function (subTestName) {
            th.setDelta(ds, delta);

            const structs = await th.findStructs(ds, ['WH-M-35', 'WH-M-24', 'WH-M-36']);
            const conduit = await ds.createDetachedFeature('conduit');
            let result = await ds.comms.findConduitPath(conduit, structs);

            result = th.summariseObjects(result);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('BLOWN FIBER FIND PATH', async function (subTestName) {
            th.setDelta(ds, delta);

            const structs = await th.findStructs(ds, ['WH-M-35', 'WH-M-24', 'WH-M-36']);
            const conduit = await ds.createDetachedFeature('blown_fiber_tube');
            let result = await ds.comms.findConduitPath(conduit, structs);

            result = th.summariseObjects(result);
            output(result);

            // Confirm no database changes
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    /**
     * Exercise conduit route service
     */
    test('Routing', function (testName) {
        const delta = 'design/NB046';

        subTest('ROUTE SINGLE PATH', async function (subTestName) {
            th.setDelta(ds, delta);

            const structs = await th.findStructs(ds, ['WH-M-35', 'WH-M-24', 'WH-M-36']);
            const conduitJson = {
                type: 'Feature',
                properties: { bundle_size: 1 },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [0.136455707252, 52.2241862934783],
                        [0.1374568417668, 52.2247063157682],
                        [0.1380164176226, 52.2250326615595]
                    ],
                    world_name: 'geo'
                }
            };

            let result = await ds.comms.routeConduit('conduit', conduitJson, structs, 1);
            result = th.summariseObjects(result);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ROUTE MULTIPLE PATHS', async function (subTestName) {
            th.setDelta(ds, delta);

            const structs = await th.findStructs(ds, ['WH-M-35', 'WH-M-24', 'WH-M-36']);
            const conduitJson = {
                type: 'Feature',
                properties: { bundle_size: 6 },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [0.136455707252, 52.2241862934783],
                        [0.1374568417668, 52.2247063157682],
                        [0.1380164176226, 52.2250326615595]
                    ],
                    world_name: 'geo'
                }
            };

            let result = await ds.comms.routeConduit('conduit', conduitJson, structs, 6);
            result = th.summariseObjects(result);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ROUTE SINGLE TUBE', async function (subTestName) {
            th.setDelta(ds, delta);

            const structs = await th.findStructs(ds, ['WH-M-35', 'WH-M-24', 'WH-M-36']);
            const conduitJson = {
                type: 'Feature',
                properties: { bundle_size: 1 },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [0.136455707252, 52.2241862934783],
                        [0.1374568417668, 52.2247063157682],
                        [0.1380164176226, 52.2250326615595]
                    ],
                    world_name: 'geo'
                }
            };

            let result = await ds.comms.routeConduit('blown_fiber_tube', conduitJson, structs, 1);
            result = th.summariseObjects(result);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ROUTE MULTIPLE BLOWN FIBER TUBES', async function (subTestName) {
            th.setDelta(ds, delta);

            const structs = await th.findStructs(ds, ['WH-M-35', 'WH-M-24', 'WH-M-36']);
            const conduitJson = {
                type: 'Feature',
                properties: { bundle_size: 12 },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [0.136455707252, 52.2241862934783],
                        [0.1374568417668, 52.2247063157682],
                        [0.1380164176226, 52.2250326615595]
                    ],
                    world_name: 'geo'
                }
            };

            let result = await ds.comms.routeConduit('blown_fiber_tube', conduitJson, structs, 12);
            result = th.summariseObjects(result);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Route a single tube from a customer wallbox to manhole
        lastSubTest('ROUTE WALLBOX TUBE', async function (subTestName) {
            th.setDelta(ds, delta);

            const structs = await th.findStructs(ds, ['WH-0150', 'WH-M-24']);
            const conduitJson = {
                type: 'Feature',
                properties: { bundle_size: 1, name: 'WB BF' },
                geometry: {
                    type: 'LineString',
                    coordinates: [
                        [0.137292891740799, 52.224682697194275],
                        [0.1374568417668, 52.2247063157682]
                    ],
                    world_name: 'geo'
                }
            };

            let result = await ds.comms.routeConduit('blown_fiber_tube', conduitJson, structs, 1);
            result = th.summariseObjects(result);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    /**
     * Exercize conduit move_to service
     */
    test('Move To', function (testName) {
        const delta = 'design/NB046';

        subTest('MOVE TO HOUSING', async function (subTestName) {
            th.setDelta(ds, delta);

            const conduit1 = await ds.getFeature('conduit', 79);
            const conduit2 = await ds.getFeature('conduit', 80);

            let result = await ds.comms.moveInto(conduit1, conduit2);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Attempt to move cable into tube - expected to fail
        subTest('CABLE INTO TUBE NOT IN CONDUIT', async function (subTestName) {
            th.setDelta(ds, delta);

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 100);
            const segRecord = await ds.getFeature('mywcom_fiber_segment', 395);

            let result;
            try {
                result = await ds.comms.moveInto(segRecord, tubeRecord);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Attempt to move cable into tube - expected to fail
        subTest('CABLE INTO CONTINUOUS CONDUIT', async function (subTestName) {
            th.setDelta(ds, delta);

            //WH-BF-145:7 in ug_route 341
            const tubeRecord = await ds.getFeature('blown_fiber_tube', 149);
            const segRecord = await ds.getFeature('mywcom_fiber_segment', 417);

            let result;
            try {
                result = await ds.comms.moveInto(segRecord, tubeRecord);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Will fail (moving a cable into a proposed conduit is not supported)
        subTest('CABLE INTO PROPOSED CONDUIT', async function (subTestName) {
            th.setDelta(ds, '');

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 5204, null, 'design/NB335');
            const segRecord = await ds.getFeature('fiber_cable', 12);

            let result;
            try {
                result = await ds.comms.moveInto(segRecord, tubeRecord);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
        });

        // Move a cable with slack into conduit (will fail)
        subTest('CABLE WITH SLACK INTO TUBE', async function (subTestName) {
            th.setDelta(ds, delta);

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 106);
            const cableRecord = await ds.getFeature('mywcom_fiber_segment', 89);

            let result;
            try {
                result = await ds.comms.moveInto(cableRecord, tubeRecord);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Move cable into tube
        subTest('CABLE INTO TUBE SUCCESS', async function (subTestName) {
            th.setDelta(ds, delta);

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 45);
            const cableRecord = await ds.getFeature('mywcom_fiber_segment', 98);

            let result;
            try {
                result = await ds.comms.moveInto(cableRecord, tubeRecord);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Move conduit out of bundle (to test updating of other conduits within run)
        subTest('CONDUIT OUT OF BUNDLE', async function (subTestName) {
            th.setDelta(ds, delta);

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 186); // WH-BF-185:3 in ug route 365
            const routeRecord = await ds.getFeature('ug_route', 365);

            let result;
            try {
                result = await ds.comms.moveInto(tubeRecord, routeRecord);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Move conduit into bundle (to test updating of other conduits within run)
        subTest('CONDUIT INTO BUNDLE', async function (subTestName) {
            th.setDelta(ds, delta);

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 184);
            const blownFiberBundleRec = await ds.getFeature('blown_fiber_bundle', 50000);

            let result;
            try {
                result = await ds.comms.moveInto(tubeRecord, blownFiberBundleRec);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Test moving backfeed cable into conduit (case 21012)
        subTest('BACKFEED CABLE INTO CONDUIT', async function (subTestName) {
            th.setDelta(ds, delta);

            //BF tube 77:2 in ug_route 79 (between wh-m-39 and rj 54)
            const segRec = await ds.getFeature('mywcom_fiber_segment', 85);
            const tubeRecord = await ds.getFeature('blown_fiber_tube', 78);

            let result;
            try {
                result = await ds.comms.moveInto(segRec, tubeRecord);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Test moving backfeed cable into conduit
        subTest('BACKFEED CABLE INTO CONDUIT REVERSED GEOM', async function (subTestName) {
            th.setDelta(ds, delta);

            //BF tube 77:2 in ug_route 79 (between wh-m-39 and rj 54)
            const segRec = await ds.getFeature('mywcom_fiber_segment', 83);
            const tubeRecord = await ds.getFeature('blown_fiber_tube', 73);

            let result;
            try {
                result = await ds.comms.moveInto(segRec, tubeRecord);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('CONTINUOUS CONDUIT INTO CONDUIT', async function (subTestName) {
            th.setDelta(ds, delta);

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 195);
            const conduitRec = await ds.getFeature('conduit', 70);

            let result;
            try {
                result = await ds.comms.moveInto(tubeRecord, conduitRec);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('CABLE OUT OF CONTINUOUS CONDUIT', async function (subTestName) {
            th.setDelta(ds, delta);

            const segRec = await ds.getFeature('mywcom_fiber_segment', 435);
            const routeRec = await ds.getFeature('ug_route', 330);

            let result;
            try {
                result = await ds.comms.moveInto(segRec, routeRec);
            } catch (cond) {
                result = cond.message;
            }

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    /**
     * Exercise conduit chain service
     */
    test('Chain', function (testName) {
        const delta = 'design/NB046';

        // Show the path for one tube
        subTest('SHOW TUBE PATH', async function (subTestName) {
            th.setDelta(ds, delta);
            const tubeRecord = await ds.getFeature('blown_fiber_tube', 100);
            const result = await ds.comms.continuousConduits(tubeRecord);

            th.outputFeatures(result);
        });

        // Show the path for all tubes in bundle
        subTest('SHOW BUNDLE PATH', async function (subTestName) {
            th.setDelta(ds, delta);
            const bundleRec = await ds.getFeature('blown_fiber_bundle', 17);
            const result = await ds.comms.continuousConduits(bundleRec);

            th.outputFeatures(result);
        });
    });

    /**
     * Exercise conduit connect service
     */
    test('Connect', function (testName) {
        const delta = 'design/NB046';
        // Connect two blown fiber tubes
        //ENH: Test failure conditions
        lastSubTest('CONNECT TUBES', async function (subTestName) {
            th.setDelta(ds, delta);
            const manhole = await ds.getFeature('manhole', 253);

            const tubeRecord1 = await ds.getFeature('blown_fiber_tube', 35);
            const tubeRecord2 = await ds.getFeature('blown_fiber_tube', 28);
            const result = await ds.comms.connectConduits(manhole, tubeRecord1, tubeRecord2);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    /**
     * Exercise conduit disconnect_at service
     */
    test('Disconnect', function (testName) {
        const delta = 'design/NB046';
        subTest('CUT TUBE', async function (subTestName) {
            th.setDelta(ds, delta);

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 114);
            const manhole = await ds.getFeature('manhole', 253);

            const result = await ds.comms.disconnectConduit(tubeRecord, manhole);

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('CUT TUBE CONTAINING CABLE', async function (subTestName) {
            th.setDelta(ds, delta);

            const tubeRecord = await ds.getFeature('blown_fiber_tube', 107);
            const manhole = await ds.getFeature('drop_point', 2);

            const result = await ds.comms.disconnectConduit(tubeRecord, manhole);

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });
});
