// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
import th from '../commsTestHelper';
import _ from 'underscore';

suite('Route Services', function () {
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

        subTest('ROUTE CONTENTS NO PROPOSED', async function (subTestName) {
            const route = await ds.getFeature('ug_route', 8);

            const contents = await ds.comms.routeContent(route);
            th.outputRouteContents(contents);
        });

        subTest('ROUTE CONTENTS WITH PROPOSED', async function (subTestName) {
            // Route NE of WH-DP-005
            const route = await ds.getFeature('ug_route', 356);

            const contents = await ds.comms.routeContent(route, true);
            th.outputRouteContents(contents);
        });
    });

    /**
     * Exercise update of route feature substructure
     **/
    test('Update', function (testName) {
        const delta = th.cleanDelta;

        subTest('NULL UPDATE', async function (subTestName) {
            th.setDelta(ds, delta);

            const route = await ds.getFeature('ug_route', 318);
            await th.updateFeature(
                ds,
                'ug_route/318',
                route.properties,
                route.geometry.coordinates
            );
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('MOVE ROUTE', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has conduits, cables and circuits
            await th.testUpdateFeature(subTestName, ds, 'ug_route/8', {}, [
                [0.1365757361054, 52.2241189283759],
                [0.1365, 52.224118],
                [0.136455707252, 52.2241862934783]
            ]); // TODO: server test equivalent runs in master
        });

        subTest('MOVE ROUTE IN DELTA', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has conduits, cables and reversed circuits
            await th.testUpdateFeature(subTestName, ds, 'ug_route/2', {}, [
                [0.1365757361054, 52.2241189283759],
                [0.1366, 52.22413],
                [0.1366508379579, 52.2241567185678]
            ]);
        });

        subTest('MODIFY ROUTE PATH', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has BF conduits (forward and reverse) and cables. Connects to WH-M-39 at SE side.
            const route = await ds.getFeature('ug_route', 366);

            await th.testUpdateFeature(subTestName, ds, route.getUrn(), {}, [
                [0.1369107211955, 52.2257156788577],
                [0.1368622, 52.2257508],
                [0.1367960125208, 52.2257781750423]
            ]);
        });

        subTest('MODIFY ROUTE PATH WITH LOC', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has line of count
            const route = await ds.getFeature('ug_route', 22);
            await th.testUpdateFeature(subTestName, ds, route.getUrn(), {}, [
                [0.1343880593777, 52.2228490359985],
                [0.13436054965588776, 52.22282363166073],
                [0.1342975348234, 52.2228256218243]
            ]);
        });

        subTest('CONNECT CABLE END TO NEW STRUCTURE', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has conduits, cables, circuit
            // Expected to fail as routes containing cables cannot be disconnected from structures
            await th.testUpdateFeature(subTestName, ds, 'ug_route/58', {}, [
                [0.1354820653796, 52.224957288012],
                [0.1345939189196, 52.2249287405042]
            ]);
        });

        // Expected to fail as cable has connections
        subTest('DISCONNECT CABLE CONNECTIONS', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has conduits, cables, circuit
            // Expected to fail as routes containing cables cannot be disconnected from structures
            const route = await ds.getFeature('ug_route', 385);

            await th.testUpdateFeature(subTestName, ds, route.getUrn(), {}, [
                [0.1365579664707, 52.2240476609155],
                [0.1365589722991, 52.2240903803291]
            ]);
        });

        //Expected to fail as last point will be moved off structure
        subTest('DISCONNECT CABLE FROM STRUCTURE', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has conduits, cables, circuit
            // Expected to fail as routes containing cables cannot be disconnected from structures
            await th.testUpdateFeature(subTestName, ds, 'ug_route/59', {}, [
                [0.1353989169002, 52.2249192931235],
                [0.13464538380507593, 52.2249324373048]
            ]);

            // Has cable only
            await th.testUpdateFeature(subTestName, ds, 'ug_route/46', {}, [
                [0.1379653233735, 52.2233384715684],
                [0.134842, 52.2213888]
            ]);
        });

        lastSubTest('DISCONNECT FROM STRUCTURE', async function (subTestName) {
            th.setDelta(ds, delta);

            // Has conduits, cables, circuit
            // Expected to fail as routes containing cables cannot be disconnected from structures
            await th.testUpdateFeature(subTestName, ds, 'ug_route/8', {}, [
                [0.13572575232452225, 52.225660862990395],
                [0.1359339, 52.2255569]
            ]);
        });
    });

    /**
     * Exercise update of route feature substructure
     **/
    test('Delete', function (testName) {
        const delta = th.cleanDelta;

        subTest('DELETE FAIL: CONDUIT HAS CABLE', async function (subTestName) {
            th.setDelta(ds, delta);
            await th.testDeleteFeature(subTestName, ds, 'ug_route/3');
        });

        subTest('DELETE ROUTE JUNCTION', async function (subTestName) {
            th.setDelta(ds, delta);
            await th.testDeleteFeature(subTestName, ds, 'manhole/97'); // To create route junction at end of route
            await th.testDeleteFeature(subTestName, ds, 'ug_route/134'); // Check route junction deleted
        });

        lastSubTest('DELETE SUCCESS', async function (subTestName) {
            th.setDelta(ds, delta);
            await th.testDeleteFeature(subTestName, ds, 'ug_route/322');
        });
    });

    /**
     * Exercise update of route feature substructure
     **/
    test('Split', function (testName) {
        const delta = th.cleanDelta;

        subTest('DONT SPLIT', async function (subTestName) {
            th.setDelta(ds, delta);

            const coords = [
                [0.1357392221689, 52.225674666480586],
                [0.1367960125208, 52.22577817504228]
            ];

            const id = await th.insertFeature(ds, 'ug_route', {}, 'LineString', coords);
            const splitResult = await ds.comms.splitRoute('ug_route', id);
            th.outputFeatures(splitResult);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('SPLIT ROUTE ONCE', async function (subTestName) {
            th.setDelta(ds, delta);

            const coords = [
                [0.1357392221689, 52.225674666480586],
                [0.1362562179565, 52.2255937489052],
                [0.1367960125208, 52.22577817504228]
            ];

            const id = await th.insertFeature(ds, 'ug_route', {}, 'LineString', coords);
            const splitResult = await ds.comms.splitRoute('ug_route', id);
            th.outputFeatures(splitResult);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('SPLIT ROUTE FIVE TIMES', async function (subTestName) {
            th.setDelta(ds, delta);

            const coords = [
                [0.1417909562588, 52.223820097192515],
                [0.1419773697853, 52.22383488476231],
                [0.1419988274574, 52.223810238809904],
                [0.1421128213406, 52.22376074148099],
                [0.1423890888691, 52.224034516472216],
                [0.1426237036337231, 52.22404052547691],
                [0.14269209996360285, 52.223957551100426]
            ];

            const id = await th.insertFeature(ds, 'ug_route', {}, 'LineString', coords);
            const splitResult = await ds.comms.splitRoute('ug_route', id);
            th.outputFeatures(splitResult);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });
});
