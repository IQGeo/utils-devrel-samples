// Copyright: IQGeo 2010-2023

import { suite, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';

if (!myw.isNativeApp) {
    suite('Coax Offset Services', function () {
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

        const subTest = (name, f) => {
            th.declareSubTest(name, f);
        };

        const lastSubTest = (name, f) => {
            th.declareLastSubTest(name, ds, f);
        };

        // -------------------------------------------------------------------------
        //                                TESTS
        // -------------------------------------------------------------------------

        test('Create', function (testname) {
            subTest('CREATE COAX CABLE', async function (subTestName) {
                const delta = th.cleanDelta;
                th.setDelta(ds, delta);

                const tr = ds.transaction();

                let coaxCable = await ds.createDetachedFeature('coax_cable');

                coaxCable.properties = {
                    coax_count: 1,
                    directed: 'true'
                };

                coaxCable.setGeometry('LineString', [
                    [0.1343874776141138, 52.22084239570779],
                    [0.1362642655618129, 52.220555602979175]
                ]);

                tr.addInsert(coaxCable);
                const result = await ds.comms.runTransaction(tr);
                const cable = await ds.getFeature('coax_cable', result.ids[0]);
                await th.outputCableAndSegs(cable);
                output(result);

                await th.showDatabaseChanges(ds, subTestName);
                await th.showValidationErrors(ds, subTestName);
            });

            lastSubTest('CREATE TWO COAX CABLES ', async function (subTestName) {
                // Create two coax cables using the same start and end points
                const delta = th.cleanDelta;
                th.setDelta(ds, delta);

                const tr = ds.transaction();

                const props = {
                    coax_count: 1,
                    directed: 'true'
                };

                const coords = [
                    [0.1343874776141138, 52.22084239570779],
                    [0.1362642655618129, 52.220555602979175]
                ];

                // 1st cable
                let coaxCable = await ds.createDetachedFeature('coax_cable');
                coaxCable.properties = props;
                coaxCable.setGeometry('LineString', coords);

                tr.addInsert(coaxCable);
                await ds.comms.runTransaction(tr);

                // 2nd cable
                let coaxCable2 = await ds.createDetachedFeature('coax_cable');
                coaxCable2.properties = props;
                coaxCable2.setGeometry('LineString', coords);

                tr.addInsert(coaxCable2);
                const result = await ds.comms.runTransaction(tr);

                const cable2 = await ds.getFeature('coax_cable', result.ids[0]);
                await th.outputCableAndSegs(cable2);
                output(result);

                await th.showDatabaseChanges(ds, subTestName);
                await th.showValidationErrors(ds, subTestName);
            });
        });
    });
}
