// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';

suite('Cable Services', function () {
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

    readonlyTest('Path', function (testname) {
        subTest('FIND PATH', async function (subTestName) {
            th.setDelta(ds);

            const structs = await th.findStructs(ds, ['WH-M-27', 'WH-M-35', 'WH-M-12', 'WH-C-07']);
            const cable = await ds.createDetachedFeature('fiber_cable');
            const result = await ds.comms.findPath(cable, structs);
            th.outputCableRouting(result);
        });

        subTest('FIND PATH (DELTA)', async function (subTestName) {
            // Delta to run test in
            const delta = 'design/NB120';
            th.setDelta(ds, delta);

            const structs = await th.findStructs(ds, ['WH-M-D20:1', 'WH-M-D20:2']);
            const cable = await ds.createDetachedFeature('fiber_cable');
            const result = await ds.comms.findPath(cable, structs);
            th.outputCableRouting(result);
        });
    });

    test('Routing', function (testname) {
        subTest('ROUTE DROP CABLE', async function (subTestName) {
            // Forces routing (rather than re-routing) on existing cable which wouldn't be a normal flow but possible with API

            // Delta to run test in
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const cable = await ds.getFeature('fiber_cable', 3);

            const structs = await th.findStructs(ds, ['WH-0002', 'WH-P-006']);

            await ds.comms.routeCable(cable, structs); // this also modifies cable instance directly
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ROUTE UNDERGROUND CABLE WITH VIA POINTS', async function (subTestName) {
            // Forces routing (rather than re-routing) on existing cable which wouldn't be a normal flow but possible with API

            // Delta to run test in
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const cable = await ds.getFeature('fiber_cable', 3);
            const structs = await th.findStructs(ds, ['WH-M-27', 'WH-M-35', 'WH-M-12', 'WH-C-07']);
            await ds.comms.routeCable(cable, structs); // this also modifies cable instance directly

            await th.outputCableAndSegs(cable);
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ROUTE CABLE VIA TRIGGERS', async function (subTestName) {
            // Forces routing on new cable with triggers

            // Delta to run test in
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const cable = await ds.getFeature('fiber_cable', 3);
            cable.id = cable.properties.id = undefined;
            cable.geometry = {
                type: 'LineString',
                coordinates: [
                    [0.1354820653796, 52.224957288012],
                    [0.1370203122497, 52.2244953911896]
                ]
            };
            cable.id = await ds.comms.insertFeature(cable);
            const updatedCable = await ds.getFeature('fiber_cable', cable.id);
            await th.outputCableAndSegs(updatedCable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('CREATE INTERNAL CABLE', async subTestName => {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const tr = ds.transaction();

            let fiberCable = await ds.createDetachedFeature('fiber_cable');

            fiberCable.properties = {
                type: 'Internal',
                specification: 'D-096-LA-8W-F12NS',
                fiber_count: 96,
                diameter: 6,
                directed: 'true'
            };

            fiberCable.setGeometry('LineString', [
                [0.1366049051285, 52.2240164428564],
                [0.1366049051285, 52.2240164428564]
            ]);

            tr.addInsert(fiberCable);
            const result = await ds.comms.runTransaction(tr);
            const cable = await ds.getFeature('fiber_cable', result.ids[0]);
            await th.outputCableAndSegs(cable);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    test('Rerouting', function (testname) {
        // Delta to run all subtests in
        const delta = th.cleanDelta;

        subTest('NULL UPDATE', async function (subTestName) {
            th.setDelta(ds, delta);
            const structs = await th.findStructs(ds, ['WH-M-12', 'WH-M-03', 'WH-C-04', 'WH-M-22']);
            const cable = await ds.getFeature('fiber_cable', 2);
            const result = await ds.comms.rerouteCable(cable, structs, false);

            th.outputCableRerouting(result);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('RE-ROUTE DRY RUN', async function (subTestName) {
            th.setDelta(ds, delta);
            const structs = await th.findStructs(ds, ['WH-C-01', 'WH-M-02', 'WH-M-28', 'WH-M-29']);
            const cable = await ds.getFeature('fiber_cable', 5);
            const result = await ds.comms.findReroutePath(cable, structs);

            th.outputCableRerouting(result);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('RE-ROUTE', async function (subTestName) {
            th.setDelta(ds, delta);
            const structs = await th.findStructs(ds, ['WH-C-01', 'WH-M-02', 'WH-M-28', 'WH-M-29']);
            const cable = await ds.getFeature('fiber_cable', 5);
            const result = await ds.comms.rerouteCable(cable, structs, false);

            th.outputCableRerouting(result);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('EXTEND', async function (subTestName) {
            th.setDelta(ds, delta);
            const structs = await th.findStructs(ds, ['WH-M-60', 'WH-M-61', 'WH-M-81', 'WH-M-246']);
            const cable = await ds.getFeature('fiber_cable', 17);
            const result = await ds.comms.rerouteCable(cable, structs, false);

            th.outputCableRerouting(result);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('SHRINK END', async function (subTestName) {
            th.setDelta(ds, delta);
            const structs = await th.findStructs(ds, ['Woodhead Hub', 'mywcom_route_junction/37']);
            const cable = await ds.getFeature('fiber_cable', 24);
            const result = await ds.comms.rerouteCable(cable, structs, false);

            th.outputCableRerouting(result);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('SHRINK START', async function (subTestName) {
            th.setDelta(ds, delta);
            const structs = await th.findStructs(ds, ['mywcom_route_junction/37', 'WH-C-01']);
            const cable = await ds.getFeature('fiber_cable', 24);
            const result = await ds.comms.rerouteCable(cable, structs, false);

            th.outputCableRerouting(result);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('REVERSE', async function (subTestName) {
            th.setDelta(ds, delta);
            const structs = await th.findStructs(ds, [
                'WH-M-249',
                'WH-M-90',
                'WH-M-89',
                'WH-M-87',
                'WH-M-91'
            ]);
            const cable = await ds.getFeature('fiber_cable', 183);
            const result = await ds.comms.rerouteCable(cable, structs, false);

            th.outputCableRerouting(result);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('REROUTE VIA TRIGGERS', async function (subTestName) {
            th.setDelta(ds, delta);

            const geometry = {
                type: 'LineString',
                coordinates: [
                    [0.1438370086014, 52.2265861085789],
                    [0.1431488245726, 52.2274408509326],
                    [0.141064748168, 52.2280733743244]
                ]
            };
            const cable = await ds.getFeature('fiber_cable', 18);
            cable.secondary_geometries.placement_path = geometry;
            await ds.comms.updateFeature(cable);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        /*
           Add new route directly from two manholes and reroute cable so that it passes through it
        */
        lastSubTest('RE-ROUTE SHORTCUT', async function (subTestName) {
            th.setDelta(ds, delta);

            await th.testInsertFeature(subTestName, ds, 'ug_route', {}, 'LineString', [
                [0.1353989169002, 52.2249192931235],
                [0.1345939189196, 52.2249287405042]
            ]);

            const structs = await th.findStructs(ds, ['WH-C-02', 'WH-M-35', 'WH-M-42', 'WH-M-47']);
            const cable = await ds.getFeature('fiber_cable', 4);
            const result = await ds.comms.rerouteCable(cable, structs, false);

            th.outputCableRerouting(result);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    /**
     * Cable delete tests
     **/
    test('Delete', function (testName) {
        // Delta to run tests in
        const delta = th.cleanDelta;
        th.setDelta(ds, delta);

        subTest('DELETE CABLE', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'fiber_cable/8');
        });

        subTest('DELETE CABLE WITH SLACK', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'fiber_cable/3');
        });

        subTest('DELETE CABLE WITH CONNECTIONS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'fiber_cable/183');
        });

        subTest('ATTEMPT DELETE CABLE WITH WITH CIRCUITS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'fiber_cable/6');
        });

        subTest('DELETE CABLE WITH LOC', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'copper_cable/2');
        });

        lastSubTest('DELETE CABLE WITH BRANCH LOC', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'copper_cable/3');
        });
    });

    test('Cutting', function (testname) {
        subTest('CUT CABLE', async function (subTestName) {
            // Delta to run test in
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const cable = await ds.getFeature('fiber_cable', 6);
            const segment = await ds.getFeature('mywcom_fiber_segment', 70);

            const struct = await th.findStructs(ds, ['WH-M-59']);

            await th.outputCableAndSegs(cable);
            await ds.comms.cutCableAt(struct, segment, true, undefined);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('CUT CABLE BACKWARDS', async function (subTestName) {
            // Delta to run test in
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const cable = await ds.getFeature('fiber_cable', 17);
            const segment = await ds.getFeature('mywcom_fiber_segment', 127);

            const struct = await th.findStructs(ds, ['WH-M-82']);

            await th.outputCableAndSegs(cable);
            await ds.comms.cutCableAt(struct, segment, false, undefined);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('CUT CABLE AND CONNECT', async function (subTestName) {
            // Delta to run test in
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const cable = await ds.getFeature('fiber_cable', 6);
            const segment = await ds.getFeature('mywcom_fiber_segment', 63);
            const splice = await ds.getFeature('splice_closure', 35);

            const struct = await th.findStructs(ds, ['WH-M-24']);

            await th.outputCableAndSegs(cable);
            await ds.comms.cutCableAt(struct, segment, true, splice);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    test('Cutting Copper', function (testname) {
        lastSubTest('CUT COPPER CABLE AND CONNECT', async function (subTestName) {
            // Delta to run test in
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const cable = await ds.getFeature('copper_cable', 2);
            const segment = await ds.getFeature('mywcom_copper_segment', 6);
            const splice = await ds.getFeature('copper_splice_closure', 2);

            const struct = await th.findStructs(ds, ['WH-M-11']);

            await th.outputCableAndSegs(cable);
            await ds.comms.cutCableAt(struct, segment, true, splice);
            await th.outputCableAndSegs(cable);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    readonlyTest('Trace', function (testName) {
        subTest('TRACE OUT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            // Short trace from cabinet to manhole
            // Anything more complex gives different ordering of tree between
            // connected and native.
            const from_rec = await ds.getFeature('cabinet', 45);
            const to_rec = await ds.getFeature('manhole', 181);
            const to_urn = to_rec.getUrn();

            const result = await from_rec.datasource.shortestPath(
                'mywcom_cable_segments',
                from_rec,
                to_urn,
                {
                    resultType: 'tree'
                }
            );

            th.outputTraceResult(result);
        });
    });
});
