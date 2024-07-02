// Copyright: IQGeo 2010-2023
/* globals global */
/*eslint-disable no-promise-executor-return*/
import { suite, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import PinRange from 'modules/comms/js/api/pinRange';
import { decomposeUrn } from 'modules/comms/js/base/urnUtils';

if (!myw.isNativeApp) {
    /**
     * Exercise cable manager plugin (client side functionality)
     */
    suite('Cable Manager Plugin', function () {
        let ds;
        let cableManager;
        let connectionManager;

        // -------------------------------------------------------------------------
        //                                HELPERS
        // -------------------------------------------------------------------------

        const setupGlobals = (datasource, app) => {
            ds = datasource;
            cableManager = app.plugins.cableManager;
            connectionManager = app.plugins.connectionManager;
        };

        const test = (name, f, modifiesDb = true) => {
            th.declareTest(name, f, modifiesDb, setupGlobals);
        };

        const readonlyTest = (name, f) => test(name, f, false);

        const subTest = (name, f) => {
            th.declareSubTest(name, f);
        };

        const lastSubTest = (name, f) => {
            th.declareLastSubTest(name, ds, f);
        };

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        // -------------------------------------------------------------------------
        //                                TESTS
        // -------------------------------------------------------------------------

        test('Modify Slack', async function () {
            // Delta to run tests in
            const delta = 'design/NB046';

            th.setDelta(ds, delta);

            subTest('ADD SLACK BEFORE SEGMENT', async function (subTestName) {
                th.setDelta(ds, delta, true);

                const struct = await ds.getFeature('manhole', 24);
                const internalSeg = await ds.getFeature('mywcom_fiber_segment', 64);

                const detSlack = await cableManager.createDetSlackAtSide(
                    internalSeg,
                    struct,
                    'out'
                );

                await cableManager.addSlack(
                    detSlack.getType(),
                    detSlack.asGeoJson(),
                    internalSeg.getUrn(),
                    detSlack.slackDetails.side
                );
                await th.showDatabaseChanges(ds, subTestName);
            });

            subTest('ADD SLACK AFTER SEGMENT', async function (subTestName) {
                th.setDelta(ds, delta, true);

                const struct = await ds.getFeature('manhole', 24);
                const internalSeg = await ds.getFeature('mywcom_fiber_segment', 63);

                const detSlack = await cableManager.createDetSlackAtSide(internalSeg, struct, 'in');

                await cableManager.addSlack(
                    detSlack.getType(),
                    detSlack.asGeoJson(),
                    internalSeg.getUrn(),
                    detSlack.slackDetails.side
                );

                await th.showDatabaseChanges(ds, subTestName);
            });

            lastSubTest('SPLIT SLACK', async function (subTestName) {
                th.setDelta(ds, delta, true);

                const slack = await ds.getFeature('mywcom_fiber_slack', 3); // manhole 13
                await cableManager.splitSlack(slack, 41);
                await th.showDatabaseChanges(ds, subTestName);
            });
        });

        test('Set Tick Mark', async function () {
            // Delta to run tests in
            const delta = 'design/NB046';

            th.setDelta(ds, delta);

            const outputTickInfo = async (subTestName, seg) => {
                await th.showDatabaseChanges(ds, subTestName);
                const cable = await seg.followReference('cable');
                let segs = await cable.followRelationship('cable_segments');
                segs = segs.sort((a, b) => {
                    return a.id - b.id;
                });

                const outputProps = ['in_tick', 'out_tick', 'length'];
                for (const seg of segs) {
                    output();
                    output(seg.getUrn());
                    for (const prop of outputProps) {
                        output(prop, ': ', seg.properties[prop]);
                    }
                }
            };

            subTest('ADD IN TICKS TO LAST SEGMENT', async function (subTestName) {
                th.setDelta(ds, delta, true);

                const seg = await ds.getFeature('mywcom_fiber_segment', 75);
                await cableManager.setTickMark(seg, 80, 'in_tick', 1, 'ft');

                await outputTickInfo(subTestName, seg);
            });

            subTest('ADD OUT TICKS TO LAST SEGMENT', async function (subTestName) {
                th.setDelta(ds, delta, true);

                const seg = await ds.getFeature('mywcom_fiber_segment', 75);
                await cableManager.setTickMark(seg, 50, 'out_tick', 1, 'ft');

                await outputTickInfo(subTestName, seg);
            });

            subTest('SET TICK WITH SLACK', async function (subTestName) {
                th.setDelta(ds, delta, true);

                // Slack is on cable BB-FCB-017 in WH-M-32
                const seg = await ds.getFeature('mywcom_fiber_segment', 597);
                await cableManager.setTickMark(seg, 440, 'out_tick', 5, 'm');

                await outputTickInfo(subTestName, seg);
            });

            subTest('SET TICK ON CABLE WITH ROUTE JUNCTIONS', async function (subTestName) {
                th.setDelta(ds, delta, true);

                const seg = await ds.getFeature('mywcom_fiber_segment', 390);
                await cableManager.setTickMark(seg, 45, 'in_tick', 1, 'ft');

                await outputTickInfo(subTestName, seg);
            });

            subTest('SET TICK TO NULL', async function (subTestName) {
                th.setDelta(ds, delta, true);

                const seg = await ds.getFeature('mywcom_fiber_segment', 19);
                await cableManager.setTickMark(seg, null, 'in_tick', 1, 'ft');

                await outputTickInfo(subTestName, seg);
            });

            subTest('SET TICK TO ZERO', async function (subTestName) {
                th.setDelta(ds, delta, true);

                const seg = await ds.getFeature('mywcom_fiber_segment', 429);
                await cableManager.setTickMark(seg, 0, 'in_tick', 1, 'ft');

                await outputTickInfo(subTestName, seg);
            });

            subTest('SET INVALID TICK AT END', async function (subTestName) {
                // Set tick that would overlap previous tick (and so is invalid)
                th.setDelta(ds, delta, true);

                const seg = await ds.getFeature('mywcom_fiber_segment', 32);
                try {
                    await cableManager.setTickMark(seg, 650, 'out_tick', 1, 'ft');
                } catch (e) {
                    th.showError(e);
                }

                await outputTickInfo(subTestName, seg);
            });

            lastSubTest('SET INVALID TICK AT MIDDLE OF CABLE', async function (subTestName) {
                // Set tick that would overlap previous tick (and so is invalid)
                th.setDelta(ds, delta, true);

                const seg = await ds.getFeature('mywcom_fiber_segment', 19);
                try {
                    await cableManager.setTickMark(seg, 2300, 'in_tick', 1, 'ft');
                } catch (e) {
                    th.showError(e);
                }
            });
        });

        test('Connect Coax Offset', async function () {
            // Delta to run tests in
            const delta = 'design/NB046';

            th.setDelta(ds, delta);

            lastSubTest('CHECK CABLE OFFSET AFTER CONNECT', async function (subTestName) {
                th.setDelta(ds, delta);

                const segFeature = await ds.getFeature('mywcom_coax_segment', 5);
                connectionManager.disconnect('coax', segFeature, new PinRange('out', 1, 1), true);

                await th.showDatabaseChanges(ds, 'DISCONNECT');

                const equip = await ds.getFeature('coax_tap', 12);
                await connectionManager.connect(
                    'coax',
                    equip,
                    new PinRange('out', 1, 1),
                    segFeature,
                    new PinRange('in', 1, 1),
                    equip,
                    true
                );

                // wait for the trigger action to execute
                await sleep(500);

                await th.showDatabaseChanges(ds, 'RECONNECT');

                const urn = decomposeUrn(segFeature.properties.cable);
                const cable = await ds.getFeature(urn.typeInDs, urn.id);
                displayCableCoords(cable);
            });

            const displayCableCoords = async function (cable) {
                th.output(cable._myw.title);
                const coords = cable.secondary_geometries.offset_geom.coordinates;
                if (!coords) return;

                coords.forEach(coord => {
                    th.output(coord);
                });
            };
        });
    });
}
