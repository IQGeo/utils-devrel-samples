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
 * Exercise loc manager backend services for native
 */

// eslint-disable-next-line no-undef
suite('Line Of Count Services', function () {
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

    readonlyTest('Get', function (testName) {
        th.setDelta(ds); // Run in master

        subTest('GET MANY', async function (subTestName) {
            const featureUrns = [
                'mywcom_copper_segment/1',
                'mywcom_copper_segment/2',
                'mywcom_copper_segment/9',
                'mywcom_copper_segment/13',
                'copper_shelf/1'
            ];

            const resp = await ds.comms.getFeaturesLOC(featureUrns, false);
            th.output('LOCS');
            th.output(resp);

            const resp2 = await ds.comms.getFeaturesLOCDetails(featureUrns);
            th.output('LOC DETAILS');
            th.output(resp2);
        });
    });

    test('Edit', function (testName) {
        const delta = th.cleanDelta;
        th.setDelta(ds, delta);

        lastSubTest('ADD MULTIPLE', async function (subTestName) {
            const feature = await ds.getFeature('mywcom_fiber_segment', 184);

            feature._loc_origin = 'mywcom_fiber_segment/184';
            feature._loc_config = cfg;
            await ds.comms.updateFeaturesLOC([feature]);

            await th.showDatabaseChanges(ds, subTestName);
        });
    });

    test('Ripple', function (testName) {
        const delta = th.cleanDelta;
        th.setDelta(ds, delta);

        lastSubTest('RIPPLE MULTIPLE', async function (subTestName) {
            th.setDelta(ds, delta);

            const feature = await ds.getFeature('mywcom_fiber_segment', 184); // WH-FCB-022 leaving WH

            const updatedFeatures = await ds.comms.ripple(feature, undefined, cfg);

            await th.showDatabaseChanges(ds, subTestName + ' AFTER RIPPLE BEFORE UPDATE');

            th.output('UPDATED FEATURES');
            th.output(updatedFeatures);

            //await locManager.rippleUpdate(updatedFeatures, feature, undefined, cfg);

            //await th.showDatabaseChanges(ds, subTestName + 'AFTER RIPPLE AFTER UPDATE');
        });
    });

    /**
     */
    test('Connections', function (testName) {
        const delta = th.cleanDelta;

        lastSubTest('DISCONNECT AND CONNECT', async function (subTestName) {
            th.setDelta(ds, delta);

            // Disconnect
            const segFeature = await ds.getFeature('mywcom_copper_segment', 6);
            await ds.comms.disconnectLOC(segFeature, 'out', true);
            await th.showDatabaseChanges(ds, 'DISCONNECT');

            // Connect
            const toFeature = await ds.getFeature('mywcom_copper_segment', 9);
            const housing = await ds.getFeature('copper_splice_closure', 2);

            const conn = await ds.comms.connect(
                'copper',
                segFeature,
                new PinRange('out', 1, 2),
                toFeature,
                new PinRange('in', 3, 4),
                housing
            );

            await ds.comms.connectLOC(conn, true);
            await th.showDatabaseChanges(ds, 'RECONNECT');
        });
    });

    /**
     */
    test('Maintain', function (testName) {
        const delta = th.cleanDelta;

        lastSubTest('MOVE MDU', async function (subTestName) {
            th.setDelta(ds, delta);

            // Gladeside MDU
            await th.testUpdateFeature(
                subTestName,
                ds,
                'mdu/3',
                {},
                [0.13696755167082114, 52.22559153785505]
            );
        });
    });
});
