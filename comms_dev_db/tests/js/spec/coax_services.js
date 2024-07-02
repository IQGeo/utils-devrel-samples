// Copyright: IQGeo 2010-2023
import { suite, output } from 'just-output';
import th from '../commsTestHelper';
import PinRange from 'modules/comms/js/api/pinRange';

suite('Coax Services', function () {
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
     * Exercise coax trace on directed cables
     * NB the server equivalent for this test is found in comms_engine_test_suite.py
     */
    readonlyTest('Trace Directed', function (testname) {
        subTest('TRACE DOWNSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'coax', 'WH-ON-001'); // optical_node
            const pins = new PinRange('out', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_coax', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'coax', 'WH-CTAP-013'); //coax_tap
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_coax', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BOTH', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'coax', 'WH-2WSPL-001'); //two_way_splitter
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_coax', urn, {
                resultType: 'tree',
                direction: 'both'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_coax_segment', 11);
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_coax', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM FROM SEG OUT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_coax_segment', 11);
            const pins = new PinRange('out', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_coax', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE DOWNSTREAM FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_coax_segment', 11);
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_coax', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE DOWNTSTREAM FROM SEG OUT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_coax_segment', 11);
            const pins = new PinRange('out', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_coax', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BOTH FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_coax_segment', 11);
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_coax', urn, {
                resultType: 'tree',
                direction: 'both'
            });

            th.outputTraceResult(result);
        });
    });
});
