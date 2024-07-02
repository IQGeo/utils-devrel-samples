// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';

if (!myw.isNativeApp) {
    suite('Delta Online Services', function () {
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

        test('Merge', async function (testName) {
            const outputMergeResults = results => {
                results.forEach(feature => {
                    th.outputFeature(feature);
                    output(feature.changeType);
                    output(feature.changedFields);
                });
            };
            // Data correction conflict, structures and cables only, design has inserts only
            subTest('design/NB301', async function (subTestName) {
                const results = await ds.comms.mergeDelta(subTestName);
                outputMergeResults(results);
                await th.showDatabaseChanges(ds, subTestName);
            });

            // Data correction conflict, structures and cables only, design has inserts only
            subTest('design/NB335', async function (subTestName) {
                const results = await ds.comms.mergeDelta(subTestName);
                outputMergeResults(results);
                await th.showDatabaseChanges(ds, subTestName);
            });

            // Data correction conflict, includes conduits and circuits, design has split route
            subTest('design/NB120', async function (subTestName) {
                const results = await ds.comms.mergeDelta(subTestName);
                outputMergeResults(results);
                await th.showDatabaseChanges(ds, subTestName);
            });

            // Data correction conflict (circuit re-route)
            subTest('design/NU23', async function (subTestName) {
                const results = await ds.comms.mergeDelta(subTestName);
                outputMergeResults(results);
                await th.showDatabaseChanges(ds, subTestName);
            });

            // Data correction conflict + real conflict (ports)
            lastSubTest('design/CC5462', async function (subTestName) {
                const results = await ds.comms.mergeDelta(subTestName);
                outputMergeResults(results);
                await th.showDatabaseChanges(ds, subTestName);
            });
        });

        test('Merge Feature', async function () {
            const delta = 'design/NB335';
            subTest('MERGE DELETED FEATURE', async subTestName => {
                const result = await ds.comms.mergeFeature(delta, 'manhole', 55);
                await th.showDatabaseChanges(ds, subTestName);
                output(result);
            });

            subTest('MERGE UPDATED FEATURE WITH REAL CONFLICTS', async subTestName => {
                const result = await ds.comms.mergeFeature(delta, 'manhole', 54);
                await th.showDatabaseChanges(ds, subTestName);
                output(result);
            });

            subTest('MERGE UPDATED FEATURE WITHOUT REAL CONFLICTS', async subTestName => {
                const result = await ds.comms.mergeFeature('design/NB301', 'ug_route', 88);
                await th.showDatabaseChanges(ds, subTestName);
                output(result);
            });

            lastSubTest('MERGE UPDATED FEATURE WITHOUT REAL CONFLICTS AGAIN', async subTestName => {
                const result = await ds.comms.mergeFeature('design/NB301', 'ug_route', 88);
                await th.showDatabaseChanges(ds, subTestName);
                output(result);
            });
        });
    });
}
