// Copyright: IQGeo 2010-2023
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';
import PinRange from 'modules/comms/js/api/pinRange';

suite('Copper Services', function () {
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

    /*
     * Exercise trace on directed cables
     * NB the server equivalent for this test is found in comms_engine_test_suite.py
     */
    readonlyTest('Trace Directed', function (testname) {
        subTest('TRACE DOWNSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'copper', 'S-1'); // 'copper_shelf', 1
            const url = feature.getUrn() + '?pins=' + 'out:2';
            const result = await feature.datasource.traceOut('mywcom_copper', url, {
                resultType: 'tree',
                direction: 'downstream'
            });
            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'copper', 'WH-T-1'); // 'copper_terminal', 1
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BOTH', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'copper', 'WH-LC-2'); // 'copper_load_coil', 2
            const pins = new PinRange('out', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'both'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 11);
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM FROM SEG OUT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 11);
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE DOWNSTREAM FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 11);
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE DOWNSTREAM FROM SEG OUT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 11);
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BOTH FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 11);
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'both'
            });

            th.outputTraceResult(result);
        });

        subTest('COPPER TRACE TO EWL DIST SIMPLE', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 4);
            const pins = new PinRange('out', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 25
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE TO DIST MULTISEG', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 4);
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 65
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE TO DIST BRANCHING', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'copper', 'S-1'); //'copper_shelf', 1
            const pins = new PinRange('out', 25, 30);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 255
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE TO DIST REVERSED', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 4);
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'upstream',
                maxDist: 20
            });

            th.outputTraceResult(result);
        });
    });

    /*
     * Exercise bulk fiber network tracing
     * NB the server equivalent for this test is found in comms_engine_test_suite.py
     */
    readonlyTest('Trace Bulk', function (testname) {
        subTest('TRACE DOWNSTREAM FROM PORTS', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'copper', 'S-1');
            const pins = new PinRange('out', 25, 30);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE MESH DOWNSTREAM FROM SEGMENT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_copper_segment', 4);
            const pins = new PinRange('out', 1, 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });
    });
});
