// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';
import PinRange from 'modules/comms/js/api/pinRange';

suite('Fiber Services', function () {
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

    /**
     * Exercise fiber connection points for trace dialog, connection menu and calculated fields
     */
    readonlyTest('Network', function (testName) {
        subTest('NETWORKS', async function (subTestName) {
            output('Splitter networks');
            const splitter = await ds.getFeature('fiber_splitter', 1);
            let networks = await splitter.getNetworks();
            output(networks);

            output('Pole networks');
            const pole = await ds.getFeature('pole', 6);
            networks = await pole.getNetworks();
            output(networks);
        });

        subTest('CONNECTIONS', async function (subTestName) {
            th.setDelta(ds, th.cleanDelta); // ENH: Exercise some connections in delta
            output('Splitter IN connections');
            const splitter = await ds.getFeature('fiber_splitter', 1);
            let pins = await ds.comms.connectionsOn(splitter, 'fiber', 'in');
            output(pins);

            output('Splitter OUT connections');
            pins = await ds.comms.connectionsOn(splitter, 'fiber', 'out');
            output(pins);
        });

        subTest('CABLES', async function (subTestName) {
            let feature, result;

            th.setDelta(ds, ''); // Test in master

            output('Cable 166 connection range');
            feature = await ds.getFeature('fiber_cable', 166);
            result = await ds.comms.cableHighestUsedPin(feature);
            output(result);
        });

        subTest('CABLE CALC FIELDS', async function (subTestName) {
            let feature, result;

            th.setDelta(ds, ''); // Test all in master

            output('Cable 166 sorted connections');
            feature = await ds.getFeature('fiber_cable', 166);
            result = await ds.comms.connectionsForCable(feature, undefined, true);
            result = th.summariseObjects(result);
            output(result);

            output('Cable 166 sorted connections and splice true');
            feature = await ds.getFeature('fiber_cable', 166);
            result = await ds.comms.connectionsForCable(feature, true, true);
            result = th.summariseObjects(result);
            output(result);
        });
    });

    /**
     * Exercise fiber trace consolidation
     */
    readonlyTest('Trace', function (testName) {
        subTest('TRACE OUT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('fiber_patch_panel', 1);
            const url = feature.getUrn() + '?pins=' + 'out:2';
            const result = await feature.datasource.traceOut('mywcom_fiber', url, {
                resultType: 'tree',
                direction: 'downstream'
            });
            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM WITH REVERSE SEG', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-ONT-005');
            const url = feature.getUrn() + '?pins=' + 'in:1';
            const result = await feature.datasource.traceOut('mywcom_fiber', url, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM WITH SPLICES', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('fiber_splitter', 1);
            const url = feature.getUrn() + '?pins=' + 'in:1';
            const result = await feature.datasource.traceOut('mywcom_fiber', url, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM FROM SPLICE', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 51);
            const url = feature.getUrn() + '?pins=' + 'out:25';
            const result = await feature.datasource.traceOut('mywcom_fiber', url, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });
    });

    /*
     * Exercise fiber trace on directed cables
     * NB the server equivalent for this test is found in comms_engine_test_suite.py
     */
    readonlyTest('Trace Directed', function (testname) {
        subTest('TRACE UPSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-ONT-001');
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BOTH', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-SPL-003');
            const pins = new PinRange('out', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'both'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM TO DEAD', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-SPL-005');
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 154);
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE UPSTREAM FROM SEG OUT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 154);
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE DOWNSTREAM FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 154);
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE DOWNTSTREAM FROM SEG OUT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 154);
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BOTH FROM SEG IN', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 154);
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'both'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE TO DIST SIMPLE', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-ODF-01');
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 80
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE TO DIST MULTISEG', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-ODF-01');
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 200
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE TO DIST BRANCHING', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-ODF-01');
            const pins = new PinRange('out', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 255
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE TO DIST REVERSED', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-ODF-02');
            const pins = new PinRange('out', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 412
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE TO DIST SLACK', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-ODF-02');
            const pins = new PinRange('out', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 120
            });

            th.outputTraceResult(result);
        });

        // TODO: create separate test suites for copper and coax tracing
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

        subTest('COPPER TRACE DOWNSTREAM VIA BRIDGE TAP', async function (subTestName) {
            th.setDelta(ds, '');

            const feature = await ds.getFeature('copper_shelf', 1);
            const pins = new PinRange('out', 34, 35);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('COPPER TRACE UPSTREAM VIA BRIDGE TAP FROM END', async function (subTestName) {
            th.setDelta(ds, '');

            const feature = await ds.getFeature('copper_capacitor', 1);
            const pins = new PinRange('in', 34, 35);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('COPPER TRACE UPSTREAM VIA BRIDGE TAP OVERLAP', async function (subTestName) {
            th.setDelta(ds, '');

            const feature = await ds.getFeature('copper_bridge_tap', 1);
            const pins = new PinRange('out', 9, 12);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_copper', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });
    });

    /*
     * Exercise fiber trace on undirected cables
     * NB the server equivalent for this test is found in comms_engine_test_suite.py
     */
    readonlyTest('Trace Undirected', function (testName) {
        subTest('TRACE BB WESTWARDS UPSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-S-013');
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BB WESTWARDS DOWNSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-S-013');
            const pins = new PinRange('out', 3);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BB EASTWARDS UPSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-S-014');
            const pins = new PinRange('in', 1);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BB EASTWARDS DOWNSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-S-014');
            const pins = new PinRange('out', 5);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BB TO DIST DOWNSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-S-013');
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream',
                maxDist: 300
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE BB TO DIST UPSTREAM', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'WH-S-013');
            const pins = new PinRange('in', 2);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'upstream',
                maxDist: 300
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

            const feature = await th.findEquip(ds, 'fiber', 'WH-ODF-01');
            const pins = new PinRange('out', 2, 6);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE MESH UPSTREAM FROM PORTS', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await th.findEquip(ds, 'fiber', 'SP-S-015');
            const pins = new PinRange('in', 10, 16);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'upstream'
            });

            th.outputTraceResult(result);
        });

        subTest('TRACE MESH DOWNSTREAM FROM SEGMENT', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 340);
            const pins = new PinRange('in', 1, 16);
            const urn = feature.getUrn() + '?pins=' + pins.spec;
            const result = await feature.datasource.traceOut('mywcom_fiber', urn, {
                resultType: 'tree',
                direction: 'downstream'
            });

            th.outputTraceResult(result);
        });
    });

    /**
     * Exercise fiber trace to end points
     */
    readonlyTest('Paths', function (testName) {
        subTest('SEGMENT TERMINATIONS', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 154);
            const result = await ds.comms.pinPaths('fiber', feature, { spec: 'out:1:20' }, false);

            output(result);
        });

        subTest('SHELF IN PORT TERMINATIONS', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('fiber_shelf', 13);
            const result = await ds.comms.pinPaths('fiber', feature, { spec: 'out:1:10' }, true);

            output(result);
        });

        subTest('PATCH PANEL PORTS', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('fiber_patch_panel', 1);
            const result = await ds.comms.pinPaths('fiber', feature, { spec: 'out:1:30' }, false);

            output(result);
        });

        subTest('SEGMENT PIN TERMINATIONS', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 154);
            const result = await ds.comms.pinCircuits('fiber', feature, { spec: 'in:1' }, true);

            output(result);
        });

        subTest('SEGMENT PIN TERMINATIONS WITH PIN RANGE', async function (subTestName) {
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 154);
            const result = await ds.comms.pinCircuits('fiber', feature, { spec: 'in:1:20' }, true);

            output(result);
        });

        subTest('SEGMENT PIN TERMINATIONS WITH PROPOSED', async function (subTestName) {
            // ## ENH add a proposed circuit to a pin w/ existing circuits in the dev_db
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('mywcom_fiber_segment', 82);
            const result = await ds.comms.pinCircuits('fiber', feature, { spec: 'in:7' }, true);

            output(result);
        });

        subTest('ONT PORT CIRCUITS', async function (subTestName) {
            // ## ENH add a proposed circuit to a pin w/ existing circuits in the dev_db
            th.setDelta(ds, ''); // run in master

            const feature = await ds.getFeature('fiber_ont', 139);
            const result = await ds.comms.pinCircuits('fiber', feature, { spec: 'in:1' }, true);

            output(result);
        });
    });

    /**
     * Exercise fiber network connection
     * NB the name is lowercase f as a temp workaround to prevent the wrong test from running when clicked.
     */
    test('Connect', function (testName) {
        const delta = th.cleanDelta;

        subTest('CONNECT SPLITTER -> CABLE', async function (subTestName) {
            th.setDelta(ds, delta);

            const fromFeature = await ds.getFeature('fiber_splitter', 4);
            const toFeature = await ds.getFeature('mywcom_fiber_segment', 207); // WH-0005

            const result = await ds.comms.connect(
                'fiber',
                fromFeature,
                { spec: 'out:8' },
                toFeature,
                { spec: 'in:2' }
            );
            th.outputFeature(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('CONNECT CABLE ONE TO ONE', async function (subTestName) {
            const delta = th.cleanDelta;

            th.setDelta(ds, delta); // Run in design

            const fromSeg = await ds.getFeature('mywcom_fiber_segment', 186);
            const fromPins = new PinRange('out', 37);
            const toSeg = await ds.getFeature('mywcom_fiber_segment', 33);
            const toPins = new PinRange('in', 12);
            const housing = await ds.getFeature('cabinet', 1);
            const tech = 'fiber';
            const spliceType = 'fusion';

            output('Connecting ' + fromSeg.getUrn() + ' to ' + toSeg.getUrn() + '...');
            const newConnRec = await ds.comms.connect(
                tech,
                fromSeg,
                fromPins,
                toSeg,
                toPins,
                housing
            );

            output('New fiber connection record: ');
            th.outputFeature(newConnRec);
            output('');

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('SPLICE CABLE -> CABLE', async function (subTestName) {
            th.setDelta(ds, delta);

            const fromFeature = await ds.getFeature('mywcom_fiber_segment', 73); // WH-FCB-007
            const fromPins = new PinRange('out', 5);

            const toFeature = await ds.getFeature('mywcom_fiber_segment', 152); // WH-FCB-021
            const toPins = new PinRange('in', 72);

            const housing = await ds.getFeature('manhole', 29); // WH-M-29

            const result = await ds.comms.connect(
                'fiber',
                fromFeature,
                fromPins,
                toFeature,
                toPins,
                housing
            );
            th.outputFeature(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Check if we are allowed to connect fibers between two cables
        // TODO: Same as above?
        subTest('SPLICE CABLES', async function (subTestName) {
            const delta = 'design/NB046';
            th.setDelta(ds, delta);

            const seg1 = await ds.getFeature('mywcom_fiber_segment', 63);
            const seg2 = await ds.getFeature('mywcom_fiber_segment', 394);
            const closure = await ds.getFeature('splice_closure', 35);
            const seg1Pins = new PinRange('in', 2);
            const seg2Pins = new PinRange('out', 2);

            let result;
            try {
                result = await ds.comms.connect('fiber', seg1, seg1Pins, seg2, seg2Pins, closure);
            } catch (cond) {
                result = cond.message;
            }

            th.fixDbDefault(result);
            output(result);
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        // Try and splice two cables that are in continuous conduits
        subTest(
            'ATTEMPT CONNECT PORT TO CABLE IN CONTINUOUS CONDUIT',
            async function (subTestName) {
                const delta = 'design/NB046';
                th.setDelta(ds, delta);

                const obj1 = await ds.getFeature('fiber_mux', 7);
                const obj2 = await ds.getFeature('mywcom_fiber_segment', 404);
                const obj1Pins = new PinRange('in', 1);
                const obj2Pins = new PinRange('out', 2);

                let result;
                try {
                    result = await ds.comms.connect('fiber', obj1, obj1Pins, obj2, obj2Pins);
                } catch (cond) {
                    result = cond.message;
                }

                output(result);
                await th.showDatabaseChanges(ds, subTestName);
            }
        );

        // Try and splice equipment (splice closure) to cable that is continuous
        lastSubTest('ATTEMPT SPLICE TO CABLE IN CONTINUOUS CONDUIT', async function (subTestName) {
            const delta = 'design/NB046';
            th.setDelta(ds, delta);

            const obj1 = await ds.getFeature('splice_closure', 46);
            const obj2 = await ds.getFeature('mywcom_fiber_segment', 404);
            const obj1Pins = new PinRange('in', 1);
            const obj2Pins = new PinRange('out', 2);

            let result;
            try {
                result = await ds.comms.connect('fiber', obj1, obj1Pins, obj2, obj2Pins);
            } catch (cond) {
                result = cond.message;
            }

            output(result);
            await th.showDatabaseChanges(ds, subTestName);
        });
    });

    /**
     * Exercise fiber network connection
     * NB the name is lowercase f as a temp workaround to prevent the wrong test from running when clicked.
     */
    test('Disconnect', function (testName) {
        const delta = th.cleanDelta;

        subTest('DISCONNECT SPLITTER FROM OUT CABLE', async function (subTestName) {
            th.setDelta(ds, delta);

            const feature = await ds.getFeature('fiber_splitter', 4);
            const result = await ds.comms.disconnect('fiber', feature, {
                spec: 'out:8'
            });
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('DISCONNECT SPLITTER FROM IN CABLE', async function (subTestName) {
            th.setDelta(ds, delta);

            const feature = await ds.getFeature('fiber_splitter', 8);
            const pins = new PinRange('in', 1);

            const result = await ds.comms.disconnect('fiber', feature, pins);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('DISCONNECT PORT -> CABLE (PARTIAL RANGE)', async function (subTestName) {
            th.setDelta(ds, delta);

            const feature = await ds.getFeature('fiber_patch_panel', 1);
            const pins = new PinRange('out', 12, 13);

            const result = await ds.comms.disconnect('fiber', feature, pins);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('DISCONNECT CABLE -> CABLE (PARTIAL RANGE)', async function (subTestName) {
            th.setDelta(ds, delta);

            const feature = await ds.getFeature('mywcom_fiber_segment', 186); // WH-FCB-023 -> WH-FCB-001
            const pins = new PinRange('out', 28, 32);

            const result = await ds.comms.disconnect('fiber', feature, pins);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('DISCONNECT CABLE -> CABLE (FULL RANGE)', async function (subTestName) {
            th.setDelta(ds, delta);

            const feature = await ds.getFeature('mywcom_fiber_segment', 190); // WH-FCB-025 -> WH-FCB-006
            const pins = new PinRange('out', 49, 72);

            const result = await ds.comms.disconnect('fiber', feature, pins);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('DISCONNECT SINGLE CABLE', async function (subTestName) {
            th.setDelta(ds, th.cleanDelta); // Run in design

            const fromSeg = await ds.getFeature('mywcom_fiber_segment', 186);
            const fromPins = new PinRange('out', 36);
            const tech = 'fiber';

            output('disconnecting ' + fromSeg.getUrn());
            output('');
            await ds.comms.disconnect(tech, fromSeg, fromPins);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });
});
