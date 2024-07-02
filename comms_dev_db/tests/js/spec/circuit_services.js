// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
import th from '../commsTestHelper';
import _ from 'underscore';
import PinRange from 'modules/comms/js/api/pinRange';

suite('Circuit Services', function () {
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

    test('Routing', function (testName) {
        subTest('ROUTE CIRCUIT', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            //Create detached feature
            const circuit = await ds.getFeature('ftth_circuit', 16);
            circuit.properties.out_feature = 'fiber_ont/16';
            circuit.properties.out_pins = 'in:1';
            circuit.id = circuit.properties.id = undefined;

            //Insert feature
            const tr = ds.transaction();
            tr.addInsert(circuit);
            const res = await ds.comms.runTransaction(tr);

            //Route it
            const updatedCircuit = await ds.getFeature('ftth_circuit', res.ids[0]);
            const result = await ds.comms.routeCircuit(updatedCircuit);
            th.outputCircuitRouting(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('RE-ROUTE CIRCUIT', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const circuit = await ds.getFeature('ftth_circuit', 44);
            circuit.properties.out_feature = 'fiber_ont/37';
            circuit.properties.out_pins = 'in:1';
            circuit.secondary_geometries = {};
            await ds.comms.updateFeature(circuit);
            const updatedCircuit = await ds.getFeature('ftth_circuit', 44);

            const result = await ds.comms.routeCircuit(updatedCircuit);
            th.outputCircuitRouting(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('NULL RE-ROUTE CIRCUIT', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const circuit = await ds.getFeature('ftth_circuit', 3);
            const result = await ds.comms.routeCircuit(circuit);
            th.outputCircuitRouting(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('TRY INVALID PATH', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            //Create detached feature
            const circuit = await ds.getFeature('bb_circuit', 4);
            circuit.properties.out_feature = 'fiber_patch_panel/15';
            circuit.properties.out_pins = 'in:1:8';
            circuit.id = circuit.properties.id = undefined;

            //Insert feature
            const tr = ds.transaction();
            tr.addInsert(circuit);
            const res = await ds.comms.runTransaction(tr);

            //Route it
            const updatedCircuit = await ds.getFeature('bb_circuit', res.ids[0]);

            try {
                const result = await ds.comms.routeCircuit(updatedCircuit);
                th.outputCircuitRouting(result);
            } catch (e) {
                th.showError(e);
            }
        });
    });

    test('Unrouting', function (testName) {
        subTest('UNROUTE CIRCUIT', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            //Create detached feature
            const circuit = await ds.getFeature('ftth_circuit', 16);
            circuit.properties.out_feature = 'fiber_ont/16';
            circuit.properties.out_pins = 'in:1';
            circuit.id = circuit.properties.id = undefined;

            //Insert feature
            const tr = ds.transaction();
            tr.addInsert(circuit);
            const res = await ds.comms.runTransaction(tr);

            //Route it
            const updatedCircuit = await ds.getFeature('ftth_circuit', res.ids[0]);
            const result = await ds.comms.unrouteCircuit(updatedCircuit);
            th.outputCircuitRouting(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('RE-UNROUTE CIRCUIT', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const circuit = await ds.getFeature('ftth_circuit', 44);
            circuit.properties.out_feature = 'fiber_ont/37';
            circuit.properties.out_pins = 'in:1';
            circuit.secondary_geometries = {};
            await ds.comms.updateFeature(circuit);
            const updatedCircuit = await ds.getFeature('ftth_circuit', 44);

            const result = await ds.comms.unrouteCircuit(updatedCircuit);
            th.outputCircuitRouting(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('NULL UNROUTE CIRCUIT', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const circuit = await ds.getFeature('ftth_circuit', 3);
            const result = await ds.comms.unrouteCircuit(circuit);
            th.outputCircuitRouting(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });
});
