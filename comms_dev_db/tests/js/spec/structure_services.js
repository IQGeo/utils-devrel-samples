// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';

suite('Structure Services', function () {
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

    readonlyTest('Contents', function () {
        th.setDelta(ds); // Run in master

        const testStructContents = async (featureName, id, includeProposed = false) => {
            const structure = await ds.getFeature(featureName, id);
            const contents = await ds.comms.structContent(structure, includeProposed);
            th.output('\n\nCONTENTS OF ' + structure.getUrn());
            th.outputStructContents(contents);
        };

        subTest('STRUCTURE CONTENTS NO PROPOSED', async () => {
            await testStructContents('cabinet', 1);
            await testStructContents('cabinet', 2);
            await testStructContents('manhole', 39);
            await testStructContents('cabinet', 11);
        });

        subTest('STRUCTURE CONTENTS WITH PROPOSED', async () => {
            await testStructContents('cabinet', 1, true);
            await testStructContents('cabinet', 2, true);
            await testStructContents('cabinet', 39, true);
            await testStructContents('cabinet', 11, true);
            await testStructContents('building', 2, true); //Exercises include_delta hook
        });
    });

    test('Add', function () {
        subTest('SPLIT ROUTE 301', async function (subTestName) {
            // Split route with reversed segment

            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            // Has reversed segment
            await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {},
                'Point',
                [0.1373186027688656, 52.22466601215945]
            ); // TODO: server test equivalent runs in master

            const route = await ds.getFeatureByUrn('ug_route/301');
            th.outputFeature(route);
        });

        subTest('SPLIT ROUTE 6 AT VERTEX', async function (subTestName) {
            // Split route at vertex

            const delta = th.cleanDelta;
            th.setDelta(ds, delta, true);

            // Has conduits, connected cables (directed and non), circuits
            await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {},
                'Point',
                [0.1366344, 52.2240861]
            ); // TODO: server test equivalent runs in master

            const route = await ds.getFeatureByUrn('ug_route/6');
            route.properties.length = th.roundFloat(route.properties.length, 5);
            th.outputFeature(route);
            const conduit = await ds.getFeatureByUrn('conduit/146');
            conduit.properties.length = th.roundFloat(conduit.properties.length, 5);
            th.outputFeature(conduit);
        });

        subTest('SPLIT ROUTE 4 IN DELTA', async function (subTestName) {
            // Split route in segment

            const delta = 'design/NB046';
            th.setDelta(ds, delta);

            // Has conduits, connected cables (directed and non), circuits
            await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {},
                'Point',
                [0.1376818, 52.2237026]
            ); // Matches delta equiv server test runs in
        });

        subTest('SPLIT ROUTE 8', async function (subTestName) {
            // Split route with cable segments with explicit containment

            const delta = '';
            th.setDelta(ds, delta);

            // Has cables with explicit containment
            await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {},
                'Point',
                [0.136516, 52.2241529]
            );
        });

        subTest('CONNECT TO ROUTE START', async function (subTestName) {
            const delta = '';
            th.setDelta(ds, delta);

            // Add manhole at start of route
            await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {},
                'Point',
                [0.1410256, 52.2235484]
            );
        });

        subTest('CONNECT TO ROUTE END', async function (subTestName) {
            const delta = '';
            th.setDelta(ds, delta);

            // Add manhole at end of route
            await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {},
                'Point',
                [0.1428326, 52.2237627]
            );
        });

        subTest('SPLIT ROUTE WITH LOC', async function (subTestName) {
            const delta = '';
            th.setDelta(ds, delta);

            await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {},
                'Point',
                [0.13480949456849176, 52.22335343158559]
            );
        });

        // Test for splitting a route containing a continuous conduit inside a conduit
        lastSubTest('SPLIT CONDUIT CONTAINING BF TUBE', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            // Move bf tube into conduit
            let tubeRecord = await ds.getFeature('blown_fiber_tube', 195);
            const conduitRec = await ds.getFeature('conduit', 70);
            await ds.comms.moveInto(tubeRecord, conduitRec);

            //  Move cable into bf tube
            tubeRecord = await ds.getFeature('blown_fiber_tube', 195);
            const cableRec = await ds.getFeature('mywcom_fiber_segment', 75);
            await ds.comms.moveInto(cableRec, tubeRecord);

            // Split conduit containing bf tube
            await th.testInsertFeature(
                subTestName,
                ds,
                'manhole',
                {},
                'Point',
                [0.1351218830682835, 52.2251880899918]
            );
        });
    });

    /**
     * Structure update tests
     **/
    test('Update', function (testName) {
        const delta = th.cleanDelta;

        subTest('MOVE MANHOLE', async function (subTestName) {
            // Has conduits, cables and reversed circuits

            th.setDelta(ds, delta);
            await th.testUpdateFeature(subTestName, ds, 'manhole/35', {}, [0.1364312, 52.224202]); // TODO: server test equivalent runs in master
        });

        subTest('MOVE POLE IN DELTA', async function (subTestName) {
            // Has nested equipment, connections and circuit ports
            th.setDelta(ds, delta);
            await th.testUpdateFeature(subTestName, ds, 'manhole/5', {}, [0.1410567, 52.2249688]);
        });

        subTest('SPLIT ROUTE 4 IN DELTA', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has conduits, connected cables (directed and non), circuits
            await th.testUpdateFeature(subTestName, ds, 'manhole/253', {}, [0.137647, 52.2253325]);
        });

        lastSubTest('MOVE MH WITH LOC', async function (subTestName) {
            // Has line of count passing through
            th.setDelta(ds, delta);
            await th.testUpdateFeature(
                subTestName,
                ds,
                'manhole/11',
                {},
                [0.13459390617868017, 52.22339438209784]
            );
        });
    });

    test('Replace', async function (testName) {
        const delta = 'design/NB046';

        const detMh = await ds.createDetachedFeature('manhole');
        detMh.properties.installation_date = '2022-09-14';
        detMh.properties.specification = 'FPM-CCANN-MCX';
        detMh.properties.labor_costs = 'hole_dig';

        const feature = detMh.asGeoJson();

        lastSubTest('REPLACE STRUCTURE', async function (subTestName) {
            th.setDelta(ds, delta);
            await ds.comms.replaceStructure(feature, 'cabinet', 1, 'manhole');
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });
    /**
     * Structure delete tests
     **/
    test('Delete', function (testName) {
        // Delta to run tests in
        const delta = th.cleanDelta;

        subTest('DELETE MANHOLE WITH SPLICES', async function (subTestName) {
            th.setDelta(ds, delta);

            await th.testDeleteFeature(subTestName, ds, 'manhole/23');
        });

        subTest('DELETE CABINET WITH SLACK', async function (subTestName) {
            th.setDelta(ds, delta);

            await th.testDeleteFeature(subTestName, ds, 'cabinet/3');
        });

        subTest('ATTEMPT DELETE HUB WITH CIRCUITS', async function (subTestName) {
            th.setDelta(ds, delta);

            await th.testDeleteFeature(subTestName, ds, 'building/1');
        });

        subTest('DELETE WALL BOX WITH PROPOSED CIRCUIT', async function (subTestName) {
            th.setDelta(ds, '');
            await th.testDeleteFeature(subTestName, ds, 'wall_box/147');
        });

        subTest('ATTEMPT DELETE MANHOLE WITH WITH CIRCUITS', async function (subTestName) {
            th.setDelta(ds, delta);

            await th.testDeleteFeature(subTestName, ds, 'manhole/24');
        });

        lastSubTest('DELETE MDU WITH INTERNAL CABLE', async function (subTestName) {
            th.setDelta(ds, delta);

            await th.testDeleteFeature(subTestName, ds, 'mdu/5');
        });
    });
});
