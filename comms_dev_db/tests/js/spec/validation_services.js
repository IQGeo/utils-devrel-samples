// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';
import PinRange from 'modules/comms/js/api/pinRange';

suite('Validation Services', function () {
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

    readonlyTest('Area', async function (testName) {
        const delta = 'design/NB301';
        th.setDelta(ds, delta);

        let result;

        // Bounds to validate in
        const coords = [0.1326835, 52.2232582, 0.1339281, 52.2239351];
        const bounds = th.coordsToBounds(coords);

        // Basic call
        result = await ds.comms.validateArea(bounds);
        output('Basic Call:');
        th.outputIntegrityErrors(result);

        // Exercise categories
        result = await ds.comms.validateArea(bounds, ['routes', 'connections']);
        output('Exercised Categories:');
        th.outputIntegrityErrors(result);
    });

    readonlyTest('Delta Validate', async function (testName) {
        //Test equivalent delta_validate on comms_engine_test_suite

        subTest('DESIGN NB046', async function (subTestName) {
            const delta = 'design/NB046';
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta, undefined);
            th.outputIntegrityErrors(result);
        });

        subTest('DESIGN NB120', async function (subTestName) {
            const delta = 'design/NB120';
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta, undefined);
            th.outputIntegrityErrors(result);
        });

        subTest('DESIGN NB301', async function (subTestName) {
            const delta = 'design/NB301';
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta, undefined);
            th.outputIntegrityErrors(result);
        });

        subTest('DESIGN CC5462', async function (subTestName) {
            const delta = 'design/CC5462';
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta, undefined);
            th.outputIntegrityErrors(result);
        });

        subTest('DESIGN CC4827', async function (subTestName) {
            const delta = 'design/CC4827';
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta, undefined);
            th.outputIntegrityErrors(result);
        });

        subTest('DESIGN NU23', async function (subTestName) {
            const delta = 'design/NU23';
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta, undefined);
            th.outputIntegrityErrors(result);
        });

        subTest('SYSTEST CONFLICTS1', async function (subTestName) {
            const delta = 'systest/conflicts1';
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta, undefined);
            th.outputIntegrityErrors(result);
        });
    });
});
