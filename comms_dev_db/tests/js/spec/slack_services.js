// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
import th from '../commsTestHelper';
import _ from 'underscore';

suite('Slack Services', function () {
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

    test('Add', function (testname) {
        // Delta to run tests in
        const delta = th.cleanDelta;
        th.setDelta(ds, delta);

        subTest('ADD SLACK ON IN SIDE OF STRUCT, BEFORE CONNECTIONS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            const struct = await ds.getFeature('manhole', 24);
            const internalSeg = await ds.getFeature('mywcom_fiber_segment', 63); // has circuits + connections
            const cable = await ds.getFeature('fiber_cable', 6);

            const detSlack = await ds.createDetachedFeature('mywcom_fiber_slack');
            detSlack.properties.housing = struct.getUrn();
            detSlack.properties.cable = cable.getUrn();
            detSlack.properties.root_housing = struct.getUrn();
            detSlack.geometry = struct.geometry;
            detSlack.length = 7.010400000000001;

            await ds.comms.addSlack(
                detSlack.getType(),
                detSlack.asGeoJson(),
                internalSeg.getUrn(),
                'in'
            );
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ADD SLACK ON OUT SIDE OF STRUCT, AFTER CONNECTIONS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            const struct = await ds.getFeature('manhole', 24);
            const internalSeg = await ds.getFeature('mywcom_fiber_segment', 64); // has circuits
            const cable = await ds.getFeature('fiber_cable', 6);

            const detSlack = await ds.createDetachedFeature('mywcom_fiber_slack');
            detSlack.properties.housing = struct.getUrn();
            detSlack.properties.cable = cable.getUrn();
            detSlack.properties.root_housing = struct.getUrn();
            detSlack.geometry = struct.geometry;
            detSlack.length = 7.010400000000001;

            await ds.comms.addSlack(
                detSlack.getType(),
                detSlack.asGeoJson(),
                internalSeg.getUrn(),
                'out'
            );
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ADD SLACK AT START', async function (subTestName) {
            th.setDelta(ds, delta, true);

            const struct = await ds.getFeature('manhole', 43);
            const internalSeg = await ds.getFeature('mywcom_fiber_segment', 336);
            const cable = await ds.getFeature('fiber_cable', 166);

            const detSlack = await ds.createDetachedFeature('mywcom_fiber_slack');
            detSlack.properties.housing = struct.getUrn();
            detSlack.properties.cable = cable.getUrn();
            detSlack.properties.root_housing = struct.getUrn();
            detSlack.geometry = struct.geometry;
            detSlack.length = 7.010400000000001;

            await ds.comms.addSlack(
                detSlack.getType(),
                detSlack.asGeoJson(),
                internalSeg.getUrn(),
                'out'
            );
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ADD SLACK AT PASSTHROUGH', async function (subTestName) {
            th.setDelta(ds, delta, true);

            const struct = await ds.getFeature('manhole', 1);
            const internalSeg = await ds.getFeature('mywcom_fiber_segment', 42);
            const cable = await ds.getFeature('fiber_cable', 3);

            const detSlack = await ds.createDetachedFeature('mywcom_fiber_slack');
            detSlack.properties.housing = struct.getUrn();
            detSlack.properties.cable = cable.getUrn();
            detSlack.properties.root_housing = struct.getUrn();
            detSlack.geometry = struct.geometry;
            detSlack.length = 7.010400000000001;

            await ds.comms.addSlack(
                detSlack.getType(),
                detSlack.asGeoJson(),
                internalSeg.getUrn(),
                'out'
            );
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ADD SLACK AT END', async function (subTestName) {
            th.setDelta(ds, delta, true);

            const struct = await ds.getFeature('manhole', 29);
            const internalSeg = await ds.getFeature('mywcom_fiber_segment', 73);
            const cable = await ds.getFeature('fiber_cable', 7);

            const detSlack = await ds.createDetachedFeature('mywcom_fiber_slack');
            detSlack.properties.housing = struct.getUrn();
            detSlack.properties.cable = cable.getUrn();
            detSlack.properties.root_housing = struct.getUrn();
            detSlack.geometry = struct.geometry;
            detSlack.length = 7.010400000000001;

            await ds.comms.addSlack(
                detSlack.getType(),
                detSlack.asGeoJson(),
                internalSeg.getUrn(),
                'in'
            );
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        subTest('ADD SLACK ON IN SIDE OF INTERNAL SEG', async function (subTestName) {
            th.setDelta(ds, delta, true);

            const struct = await ds.getFeature('mdu', 2); // Alice Bell
            const internalSeg = await ds.getFeature('mywcom_fiber_segment', 562);
            const cable = await ds.getFeature('fiber_cable', 204); // WH-INT-06

            const detSlack = await ds.createDetachedFeature('mywcom_fiber_slack');
            detSlack.properties.housing = struct.getUrn();
            detSlack.properties.cable = cable.getUrn();
            detSlack.properties.root_housing = struct.getUrn();
            detSlack.geometry = struct.geometry;
            detSlack.length = 7.010400000000001;

            await ds.comms.addSlack(
                detSlack.getType(),
                detSlack.asGeoJson(),
                internalSeg.getUrn(),
                'in'
            );
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });

        lastSubTest('ADD SLACK ON OUT SIDE OF INTERNAL SEG', async function (subTestName) {
            th.setDelta(ds, delta, true);

            const struct = await ds.getFeature('mdu', 2); // Alice Bell
            const internalSeg = await ds.getFeature('mywcom_fiber_segment', 563);
            const cable = await ds.getFeature('fiber_cable', 205); // WH-INT-07

            const detSlack = await ds.createDetachedFeature('mywcom_fiber_slack');
            detSlack.properties.housing = struct.getUrn();
            detSlack.properties.cable = cable.getUrn();
            detSlack.properties.root_housing = struct.getUrn();
            detSlack.geometry = struct.geometry;
            detSlack.length = 7.010400000000001;

            await ds.comms.addSlack(
                detSlack.getType(),
                detSlack.asGeoJson(),
                internalSeg.getUrn(),
                'out'
            );
            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    test('Delete', function (testname) {
        // Delta to run tests in
        const delta = 'design/NB046';
        th.setDelta(ds, delta);

        subTest('DELETE SLACK', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'mywcom_fiber_slack/5'); // cabinet 3, cable 3
        });

        subTest('DELETE SLACK WITH CIRCUITS', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'mywcom_fiber_slack/9'); // manhole 252, cable 21
        });

        subTest('DELETE SLACK WITH UPSTREAM CONNECTION', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'mywcom_fiber_slack/12'); // manhole 26 cable 6
        });

        lastSubTest('DELETE SLACK WITH DOWNSTREAM CONNECTION', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await th.testDeleteFeature(subTestName, ds, 'mywcom_fiber_slack/7'); // manhole 28 cable 17
        });
    });

    test('Update', function (testname) {
        // Delta to run tests in
        const delta = th.cleanDelta;
        th.setDelta(ds, delta);

        lastSubTest('SPLIT SLACK IN HALF', async function (subTestName) {
            th.setDelta(ds, delta, true);
            await ds.comms.splitSlack('mywcom_fiber_slack', '1', 15); // manhole 12, cable 1

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });
});
