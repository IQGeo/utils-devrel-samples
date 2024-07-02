// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';

if (!myw.isNativeApp) {
    suite('Path Finder Services', function () {
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

        const pathTest = async data => {
            const paths = await ds.comms.findPaths(data);

            // Remove result property as it is not JSONable
            const raw_paths = paths.map(path => {
                return {
                    properties: path.properties,
                    path: path.raw_result
                };
            });

            output('Paths');
            output(JSON.stringify(raw_paths, null, 3));
        };

        // -------------------------------------------------------------------------
        //                                TESTS
        // -------------------------------------------------------------------------

        /**
         * Exercise basic path finder
         */
        readonlyTest('Path', function (testName) {
            subTest('BASIC', async function (subTestName) {
                output('Science Park Ring 1');

                const data = {
                    from_urn: 'fiber_shelf/18?pins=out:1',
                    to_urn: 'cabinet/46',
                    application: 'mywcom',
                    max_paths: 2
                };

                await pathTest(data);
            });

            // Just do one of the AVOID/INCLUDE tests. Server tests
            // have a more inclusive list.
            subTest('AVOID', async function (subTestName) {
                output('Avoid Test');
                const data = {
                    from_urn: 'fiber_shelf/18?pins=out:1',
                    to_urn: 'cabinet/46',
                    application: 'mywcom',
                    avoid_urns: 'ug_route/218',
                    max_paths: 2
                };
                await pathTest(data);
            });
        });
    });
}
