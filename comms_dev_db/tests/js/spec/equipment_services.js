// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';

suite('Equipment Services', function () {
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

    readonlyTest('Cables', function (testName) {
        // Exercise equipment-related calls

        subTest('GET CABLES', async function (subTestName) {
            const urns = ['fiber_patch_panel/1', 'fiber_patch_panel/2'];

            for (const urn of urns) {
                output();
                output('Cables for: ', urn);
                const feature = await ds.getFeatureByUrn(urn);
                let cables = await ds.comms.cablesConnectedTo(feature);

                cables = th.summariseObjects(cables);

                cables = cables.sort();

                output(cables);
            }
        });
    });

    /**
     * Exercise equipment delete trigger
     **/
    test('Delete', function (testName) {
        const delta = th.cleanDelta;
        th.setDelta(ds, delta);

        subTest('DELETE SLOT WITH OLTS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'slot/16');
        });

        subTest('DELETE SPLICE CLOSURE WITH CABLE SEGMENTS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'splice_closure/1');
        });

        subTest('ATTEMPT DELETE PATCH PANEL WITH CIRCUITS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'fiber_patch_panel/1');
        });

        subTest('ATTEMPT DELETE SHELF WITH CHILDREN WITH CIRCUITS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'fiber_shelf/9');
        });

        subTest('ATTEMPT DELETE SPLICE CLOSURE WITH CIRCUITS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'splice_closure/35');
        });

        subTest('DELETE LOAD COIL WITH LOC', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'copper_load_coil/2');
        });

        lastSubTest('DELETE COPPER SHELF WITH LOC', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'copper_shelf/1');
        });
    });

    test('Assemblies', function (testName) {
        // Use this delta (matches server equivalent test)
        const delta = 'design/NB046';

        subTest('MOVE', async function (subTestName) {
            // Move assembly containing equipment and connections

            th.setDelta(ds, delta); // Run in design

            const equip = await ds.getFeature('rack', 4);
            const manhole = await ds.getFeature('manhole', 42);

            const result = await ds.comms.moveAssembly(equip, manhole);

            await th.showDatabaseChanges(ds, subTestName);

            // Validate data changes
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('COPY', async function (subTestName) {
            // Copy splice closure with multiplexer child

            th.setDelta(ds, delta); // Run in design

            const equip = await ds.getFeature('splice_closure', 1);
            const manhole = await ds.getFeature('manhole', 33);

            const result = await ds.comms.copyAssembly(equip, manhole);

            await th.showDatabaseChanges(ds, subTestName);

            // Validate data changes
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('ATTEMPT MOVE', async function (subTestName) {
            // Attempt move assembly with circiuts

            th.setDelta(ds, delta); // Run in design

            const equip = await ds.getFeature('fiber_olt', 25);
            const manhole = await ds.getFeature('fiber_shelf', 15);

            const result = await ds.comms
                .moveAssembly(equip, manhole)
                .catch(error => th.showError(error));

            await th.showDatabaseChanges(ds, subTestName);

            // Validate data changes
            await th.showValidationErrors(ds, subTestName);
        });
    });

    test('Coax', function (testname) {
        subTest('CREATE NON-COAX EQUIPMENT', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const tr = ds.transaction();

            let coaxAmplifier = await ds.createDetachedFeature('copper_capacitor');

            coaxAmplifier.properties = {
                housing: 'manhole/9',
                root_housing: 'manhole/9'
            };

            coaxAmplifier.setGeometry('Point', [0.1342975348234, 52.2228256218243]);

            tr.addInsert(coaxAmplifier);
            const result = await ds.comms.runTransaction(tr);
            const equipment = await ds.getFeature('copper_capacitor', result.ids[0]);

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('CREATE COAX AMPLIFIER', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const tr = ds.transaction();

            let coaxAmplifier = await ds.createDetachedFeature('coax_amplifier');

            coaxAmplifier.properties = {
                housing: 'manhole/9',
                root_housing: 'manhole/9'
            };

            coaxAmplifier.setGeometry('Point', [0.1342975348234, 52.2228256218243]);

            tr.addInsert(coaxAmplifier);
            const result = await ds.comms.runTransaction(tr);
            const equipment = await ds.getFeature('coax_amplifier', result.ids[0]);

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('CREATE TWO COAX AMPLIFIERs', async function (subTestName) {
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            const properties = {
                housing: 'manhole/9',
                root_housing: 'manhole/9'
            };
            const geometry = [0.1342975348234, 52.2228256218243];

            const tr = ds.transaction();

            let coaxAmplifier = await ds.createDetachedFeature('coax_amplifier');
            coaxAmplifier.properties = properties;
            coaxAmplifier.setGeometry('Point', geometry);
            tr.addInsert(coaxAmplifier);
            await ds.comms.runTransaction(tr);

            let coaxAmplifier2 = await ds.createDetachedFeature('coax_amplifier');
            coaxAmplifier2.properties = properties;
            coaxAmplifier2.setGeometry('Point', geometry);
            tr.addInsert(coaxAmplifier2);
            const result = await ds.comms.runTransaction(tr);

            const equipment = await ds.getFeature('coax_amplifier', result.ids[0]);

            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });
});
