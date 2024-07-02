// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import PinRange from 'modules/comms/js/api/pinRange';
import DisplayManagerPlugin from '../../../../comms/public/js/connectivity_ui/displayManagerPlugin';
import ConnectionManagerPlugin from '../../../../comms/public/js/api/connectionManagerPlugin';
import CableManagerPlugin from '../../../../comms/public/js/api/cableManagerPlugin';
import LOCManagerPlugin from '../../../../comms/public/js/line_of_count/locManagerPlugin';
import FeatureModelLoaderPlugin from '../../../../comms/public/js/models/featureModelLoaderPlugin';
import StructureManagerPlugin from '../../../../comms/public/js/api/structureManagerPlugin';

/**
 * Exercise loc manager plugin (client side functionality)
 */

if (!myw.isNativeApp) {
    // eslint-disable-next-line no-undef
    suite('Line Of Count Plugin', function () {
        let ds, app;

        // Segment of WH-FC-022 leaving WH
        // Various combinations of unassigned, assigned and physical only
        const cfg = [
            // Undesignated
            {
                name: '',
                low: 1,
                high: 10,
                status: '',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // DEAD
            {
                name: '',
                low: 11,
                high: 20,
                status: 'Dead',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // WH-3 [1-90]
            {
                name: 'WH-3',
                low: 1,
                high: 90,
                status: 'Active',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // WH-4 [50-100]
            {
                name: 'WH-4',
                low: 50,
                high: 100,
                status: 'Active',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // Spare
            {
                name: '',
                low: 162,
                high: 200,
                status: 'Spare',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // Unassigned
            {
                name: '',
                low: 201,
                high: 210,
                status: '',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // Some more dead
            {
                name: '',
                low: 211,
                high: 220,
                status: 'Dead',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // This shouldn't appear in the final config
            {
                name: '',
                low: 221,
                high: 230,
                status: '',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            }
        ];

        const cfg_invalid = [
            // Undesignated
            {
                name: '',
                low: 1,
                high: 10,
                status: '',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // DEAD
            {
                name: '',
                low: 11,
                high: 20,
                status: 'Dead',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // WH-3 [1-90]
            {
                name: 'WH-3',
                low: 1,
                high: 90,
                status: 'Active',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            },
            // WH-3 [50-100]
            {
                name: 'WH-3',
                low: 50,
                high: 100,
                status: 'Active',
                ref: '',
                origin: 'mywcom_fiber_segment/184'
            }
        ];

        // -------------------------------------------------------------------------
        //                                HELPERS
        // -------------------------------------------------------------------------

        const setupGlobals = (datasource, application) => {
            ds = datasource;
            app = application;

            if (myw.isNativeApp) setupPlugins(app);

            const locManager = app.plugins.locManager;

            // Hack as it seems comms messages are not being loaded although localisation is initialised and
            // loadModuleLocale called in the test
            locManager.__proto__.msg = function (msg, options) {
                if (msg == 'line_of_count_assigned_range')
                    return `${options.loc_name} [${options.loc_low} - ${options.loc_high}] ${options.loc_status}"`;
            };
        };

        /**
         * Workaround for problem where mywcom application is not being instantaiated correctly in native test environment.
         * Instead we instantiate the plugins we need to run these tests.
         * @param {*} app
         */
        const setupPlugins = app => {
            app.plugins['displayManager'] = new DisplayManagerPlugin(app, { showLoc: true });
            app.plugins['cableManager'] = new CableManagerPlugin(app);
            app.plugins['connectionManager'] = new ConnectionManagerPlugin(app);
            app.plugins['locManager'] = new LOCManagerPlugin(app);
            app.plugins['featureModelLoader'] = new FeatureModelLoaderPlugin(app);
            app.plugins['structureManager'] = new StructureManagerPlugin(app);
        };

        const test = (name, f, modifiesDb = true) => {
            th.declareTest(name, f, modifiesDb, setupGlobals, true);
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

        test('Get', function (testName) {
            const delta = th.cleanDelta;
            const locManager = app.plugins.locManager;

            lastSubTest('GET MANY', async function (subTestName) {
                await myw.localisation.loadModuleLocale('comms');

                th.setDelta(ds, delta);

                const features = await ds.getFeaturesByUrn([
                    'mywcom_copper_segment/1',
                    'mywcom_copper_segment/2',
                    'mywcom_copper_segment/9',
                    'mywcom_copper_segment/13',
                    'copper_shelf/1'
                ]);

                await locManager.getFeaturesLOCDetails(features);

                th.output('LOC CONFIGS');
                features.map(feature => {
                    th.output(feature.getUrn());
                    const side = feature.getUrn() == 'copper_shelf/1' ? 'out' : undefined;
                    const str = locManager.formattedLoc(feature, side);
                    th.output(str);
                });
            });
        });

        /**
         * Exercise line of count editing (without ripple)
         */
        test('Edit', function (testName) {
            const delta = th.cleanDelta;
            const locManager = app.plugins.locManager;

            lastSubTest('ADD MULTIPLE', async function (subTestName) {
                await myw.localisation.loadModuleLocale('comms');

                th.setDelta(ds, delta);

                const feature = await ds.getFeature('mywcom_fiber_segment', 184); // WH-FCB-022 leaving WH

                th.output('VALIDATE LOC CFG PASS');
                const valResult1 = await locManager.validate(cfg, feature);
                th.output(valResult1);

                th.output('VALIDATE LOC CFG FAIL');
                const valResult2 = await locManager.validate(cfg_invalid, feature);
                th.output(valResult2);

                th.output('UPDATE LOC CFG');
                await locManager.updateFeatureLOC(feature, cfg, true);

                th.output('FETCH BACK LOC CFG');
                const result = await locManager.getFeaturesLOCDetails([feature]);
                th.output(result);

                th.output('CHECK EDITABLE');
                const editable = await locManager.isLocEditable(feature);
                th.output(editable);

                const str = locManager.formattedLoc(feature);
                th.output('FORMATTED LOC');
                th.output(str);

                await th.showDatabaseChanges(ds, subTestName);
            });
        });

        /**
         */
        test('Ripple', function (testName) {
            const delta = th.cleanDelta;
            const locManager = app.plugins.locManager;

            lastSubTest('RIPPLE MULTIPLE', async function (subTestName) {
                th.setDelta(ds, delta);

                const feature = await ds.getFeature('mywcom_fiber_segment', 184); // WH-FCB-022 leaving WH

                const updatedFeatures = await locManager.ripple(feature, undefined, cfg);

                await th.showDatabaseChanges(ds, subTestName + 'AFTER RIPPLE BEFORE UPDATE');

                await locManager.rippleUpdate(updatedFeatures, feature, undefined, cfg);

                // Display some LOC designations on the network
                await displayLOCFor(
                    locManager,
                    'mywcom_fiber_segment',
                    183,
                    'FORMATTED LOC AFTER RIPPLE ON WH-FCB-021 (between WH-M-123 and WH-M-124)'
                );

                await th.showDatabaseChanges(ds, subTestName + 'AFTER RIPPLE AFTER UPDATE');
            });
        });

        /**
         */
        test('Connections', function (testName) {
            const delta = th.cleanDelta;
            const locManager = app.plugins.locManager;
            const connectionManager = app.plugins.connectionManager;

            lastSubTest('DISCONNECT AND CONNECT', async function (subTestName) {
                th.setDelta(ds, delta);

                // ENH: Seems to be needed due to way plugins are setup for native tests. Needs to be improved.
                if (myw.isNativeApp) connectionManager.ds.delta = delta;

                // Disconnect pair 1-4 of WH-CC-002 from WH-CC-003 at WH-M-11
                const segFeature = await ds.getFeature('mywcom_copper_segment', 6);
                await connectionManager.disconnect(
                    'copper',
                    segFeature,
                    new PinRange('out', 1, 4),
                    true
                );

                await th.showDatabaseChanges(ds, 'DISCONNECT');

                // Get LOC for downstream cable WH-CC-003
                await displayLOCFor(
                    locManager,
                    'mywcom_copper_segment',
                    9,
                    'LOC ON WH-C-003 AFTER DISCONNECT'
                );

                // Connect pair 1-2 to pair 3-4
                const toFeature = await ds.getFeature('mywcom_copper_segment', 9);
                const housing = await ds.getFeature('copper_splice_closure', 2);
                await connectionManager.connect(
                    'copper',
                    segFeature,
                    new PinRange('out', 1, 2),
                    toFeature,
                    new PinRange('in', 3, 4),
                    housing,
                    true
                );

                await th.showDatabaseChanges(ds, 'RECONNECT');

                // Get LOC for downstream cable WH-CC-003
                await displayLOCFor(
                    locManager,
                    'mywcom_copper_segment',
                    9,
                    'LOC ON WH-C-003 AFTER RECONNECT'
                );
            });
        });

        // Some of these are and could be covered in Equipment and Cable tests but having these here makes
        // it easier to test LOC specific functionality.
        test('Maintain', function (testName) {
            const delta = th.cleanDelta;
            const locManager = app.plugins.locManager;

            subTest('DELETE ORIGIN CABLE', async function (subTestName) {
                th.setDelta(ds, delta);

                const cfg = [
                    {
                        name: 'DSL',
                        low: 1,
                        high: 10,
                        status: 'Active',
                        ref: '',
                        origin: 'mywcom_fiber_segment/600'
                    }
                ];

                await setAndRipple(locManager, 'mywcom_fiber_segment', 600, cfg);
                await th.showDatabaseChanges(ds, 'DELETE ORIGIN AFTER RIPPLE');
                await th.testDeleteFeature(subTestName, ds, 'fiber_cable/223');
            });

            lastSubTest('DELETE ORIGIN EQUIPMENT', async function (subTestName) {
                th.setDelta(ds, delta);

                await th.testDeleteFeature(subTestName, ds, 'copper_shelf/1');
            });
        });

        test('Conflicts', function (testName) {
            const delta = th.cleanDelta;
            const locManager = app.plugins.locManager;

            const outputMergeResults = results => {
                results.forEach(feature => {
                    th.outputFeature(feature);
                    output(feature.changeType);
                    output(feature.changedFields);
                });
            };

            lastSubTest('SPLIT', async function (subTestName) {
                /*
                In design split LOC at WH-1
                In master assign LOC to second range of fibers and ripple
                In design check conflicts and auto-resolve            
            */

                th.setDelta(ds, delta);
                const loc_data_split = [
                    {
                        name: 'WH-1',
                        status: 'Active',
                        loc_section_ref: 'mywcom_line_of_count_section/1',
                        loc_ref: 'mywcom_line_of_count/1',
                        low: 1,
                        high: 50,
                        origin: 'copper_shelf/1',
                        forward: true
                    },
                    {
                        name: 'WH-2',
                        low: 1,
                        high: 50,
                        status: 'Active',
                        ref: '',
                        origin: 'copper_shelf/1'
                    }
                ];

                await setAndRipple(locManager, 'copper_shelf', 1, loc_data_split, 'out');

                th.setDelta(ds, '');
                const loc_data_master = [
                    {
                        name: 'WH-42',
                        status: 'Active',
                        loc_section_ref: 'mywcom_line_of_count_section/1',
                        loc_ref: 'mywcom_line_of_count/1',
                        low: 1,
                        high: 100,
                        origin: 'copper_shelf/1',
                        forward: true
                    }
                ];
                await setAndRipple(locManager, 'copper_shelf', 1, loc_data_master, 'out');

                th.setDelta(ds, delta);
                const result_before = await ds.comms.conflicts(delta);
                th.output(`BEFORE MERGE CONFLICT COUNT ${result_before.length}`);
                await th.showDatabaseChanges(ds, 'BEFORE MERGE');

                // Set up workflow plugin.
                // ENH: Make this more like how client will do it.
                const deltaFeature = await ds.getFeature('design', 'NB217');
                app.plugins.workflow.currentDeltaOwner = deltaFeature;
                app.plugins.workflow.datasource = ds;

                // This will invoke custom conflict resolution for line of count
                await app.plugins.workflow.merge();

                const result_after = await ds.comms.conflicts(delta);
                th.output(`AFTER MERGE CONFLICT COUNT ${result_after.length}`);
                await th.showDatabaseChanges(ds, 'AFTER MERGE');
            });
        });

        const displayLOCFor = async function (
            locManager,
            feature_type,
            id,
            title,
            side = undefined
        ) {
            th.output(title);
            const featureDownstream = await ds.getFeature(feature_type, id);
            const result = await locManager.getFeaturesLOCDetails([featureDownstream], side);
            th.output(result);

            const str = locManager.formattedLoc(featureDownstream);

            th.output(str);
        };

        const setAndRipple = async function (
            locManager,
            feature_type,
            feature_id,
            cfg,
            side = undefined
        ) {
            const feature = await ds.getFeature(feature_type, feature_id);
            let features = await locManager.ripple(feature, side, cfg);
            await locManager.rippleUpdate(features, feature, side, cfg);
        };
    });
}
