// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';

suite('Feature Services', function () {
    let ds;
    let app;

    // -------------------------------------------------------------------------
    //                                HELPERS
    // -------------------------------------------------------------------------

    const setupGlobals = (datasource, application) => {
        ds = datasource;
        app = application;
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
    test('Transaction', function (testName) {
        const delta = 'design/NB046';

        lastSubTest('TRANSACTION', async function (subTestName) {
            th.setDelta(ds, delta);

            const tr = ds.transaction();

            // Split UG route 372 and run to new wall box location
            let ugRoute = await ds.createDetachedFeature('ug_route');

            ugRoute.properties = {
                myw_orientation_path: 0,
                cover_type: 'Grass',
                length: null
            };

            ugRoute.setGeometry('LineString', [
                [0.1372422491036751, 52.22553559170557],
                [0.1371239125728608, 52.22545943361946]
            ]);

            tr.addInsert(ugRoute);

            // Add wallbox at end of new route
            const wallBox = await ds.createDetachedFeature('wall_box');

            wallBox.properties = {
                myw_orientation_location: 0,
                name: '',
                installation_date: ''
            };

            wallBox.setGeometry('Point', [0.1371239125728608, 52.22545943361946]);

            tr.addInsert(wallBox);

            // Remove wallbox at end of UG route 315
            tr.addDelete('wall_box', 145);

            // Adjust route 314 geometry, but not ends
            ugRoute = await ds.getFeature('ug_route', 314);
            ugRoute.setGeometry('LineString', [
                [0.137086617252149, 52.22562214654749],
                [0.13706570232953522, 52.225585972632615],
                [0.1370134845002012, 52.22556915200117]
            ]);

            tr.addUpdate(ugRoute);

            // Uses comms method which runs triggers and routing
            const result = await ds.comms.runTransaction(tr);
            output(result);

            await th.showDatabaseChanges(ds, subTestName);
            await th.showValidationErrors(ds, subTestName);
        });
    });

    test('Insert', function (testName) {
        const delta = '';

        // Check for coordinate jitter
        lastSubTest('CLONE', async function (subTestName) {
            th.setDelta(ds, delta);
            const featureType = 'ug_route';

            // Get a feature
            const feature = await ds.getFeature(featureType, 56);

            // Show its initial state (avoiding framework rounding)
            th.output('');
            th.output('Original record');
            for (const i in feature.geometry.coordinates) {
                const c1 = feature.geometry.coordinates[i];
                th.outputFeature(`${i}: ${c1}`);
            }

            // Clone it
            const detFeature = await ds.createDetachedFeature(featureType);
            detFeature.properties = {};
            detFeature.geometry = feature.geometry;
            const id = await ds.comms.insertFeature(detFeature);
            const newFeature = await ds.getFeature(featureType, id);

            // Show new feature (avoiding framework rounding)
            th.output('');
            th.output('Original : Clone : Difference');
            for (const i in newFeature.geometry.coordinates) {
                const c1 = feature.geometry.coordinates[i];
                const c2 = newFeature.geometry.coordinates[i];
                th.outputFeature(`${i}: ${c1} ${c2} ${c2[0] - c1[0]},${c2[1] - c1[1]}`);
            }
        });
    });

    test('Bulk Move', function (testName) {
        const design = 'design/NB046';

        lastSubTest('Bulk Move', async function (subTestName) {
            th.setDelta(ds, design);

            const featureIds = [
                {
                    featureType: 'mywcom_route_junction',
                    id: 26
                },
                {
                    featureType: 'ug_route',
                    id: 239
                },
                {
                    featureType: 'manhole',
                    id: 122
                }
            ];

            const features = await Promise.all(
                featureIds.map(
                    async featureId => await ds.getFeature(featureId.featureType, featureId.id)
                )
            );

            th.output('');
            th.output('Original Coordinates');
            features.forEach(feature => {
                th.outputFeature(`${feature.getUrn()}: ${feature.geometry.coordinates}`);
            });

            const ugRoutePreUpdate = await ds.getFeature('ug_route', 352);
            const ugRoutePreCoords = th.coordsToFixed(
                ugRoutePreUpdate.geometry.type,
                ugRoutePreUpdate.geometry.coordinates,
                11
            );
            th.outputFeature(`${ugRoutePreUpdate.getUrn()}: ${ugRoutePreCoords}`);

            const delta = {
                lng: 0.002,
                lat: 0.0041
            };
            await ds.comms.bulkMoveFeatures(app, features, delta);

            // ENH: In some cases this next block doesn't get run when running all the tests in one go.
            // Running this test on its own it is run.
            th.output('');
            th.output('Updated Coordinates');
            features.forEach(feature => {
                // remove coordinate differences past 11th digit
                const roundedCoords = th.coordsToFixed(
                    feature.geometry.type,
                    feature.geometry.coordinates,
                    11
                );
                th.outputFeature(`${feature.getUrn()}: ${roundedCoords}`);
            });

            const ugRoutePostUpdate = await ds.getFeature('ug_route', 352);
            const ugRoutePostCoords = th.coordsToFixed(
                ugRoutePostUpdate.geometry.type,
                ugRoutePostUpdate.geometry.coordinates,
                11
            );
            th.outputFeature(`${ugRoutePostUpdate.getUrn()}: ${ugRoutePostCoords}`);
        });
    });
});
