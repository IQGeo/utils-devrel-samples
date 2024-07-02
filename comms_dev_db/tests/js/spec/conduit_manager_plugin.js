// Copyright: IQGeo 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import _ from 'underscore';
import th from '../commsTestHelper';

if (!myw.isNativeApp) {
    /**
     * Exercise conduit manager plugin (client side functionality)
     */
    // eslint-disable-next-line no-undef
    suite('Conduit Manager Plugin', function () {
        let ds, conduitManager;

        // -------------------------------------------------------------------------
        //                                HELPERS
        // -------------------------------------------------------------------------

        const setupGlobals = (datasource, app) => {
            ds = datasource;
            conduitManager = app.plugins.conduitManager;
        };

        const test = (name, f, modifiesDb = true) => {
            th.declareTest(name, f, modifiesDb, setupGlobals);
        };

        const lastSubTest = (name, f) => {
            th.declareLastSubTest(name, ds, f);
        };

        const sortFeaturesAsc = features => {
            return _.sortBy(features, feature => {
                return `${feature.properties.housing}_${feature.properties.installation_date}`;
            });
        };

        const loadChildren = async feature => {
            const featureData = {
                type: 'Feature',
                feature_type: feature.getType(),
                properties: { ...feature.properties }
            };

            Object.values(feature.featureDD.fields).forEach(fieldDD => {
                if (fieldDD.value) delete featureData.properties[fieldDD.internal_name];
            });

            //We don't want name to be passed down for testing
            delete delete featureData.properties.name;

            if (feature.featureDD.fields.conduits) {
                const conduits = await feature.followRelationship('conduits');

                //We need these sorted to keep output consistent in tests.
                const sortedConduitsAsc = sortFeaturesAsc(conduits);
                featureData['conduits'] = await Promise.all(
                    sortedConduitsAsc.map(async conduit => {
                        return await loadChildren(conduit);
                    })
                );
            }

            if (feature.featureDD.fields.cables) {
                const cables = await feature.followRelationship('cables');
                const sortedCablesAsc = sortFeaturesAsc(cables);
                featureData['cables'] = await Promise.all(
                    sortedCablesAsc.map(async cable => {
                        return await loadChildren(cable);
                    })
                );
            }
            return featureData;
        };

        // -------------------------------------------------------------------------
        //                                TESTS
        // -------------------------------------------------------------------------

        test('Route Nested Conduits', async function () {
            // Delta to run tests in
            const delta = th.cleanDelta;
            th.setDelta(ds, delta);

            let featureData;

            // Create the conduit assembly
            const conduit = await ds.getFeature('conduit', 32);
            featureData = await loadChildren(conduit);

            lastSubTest('ROUTE CONDUIT ASSEMBLY', async function (subTestName) {
                // Load structures for routing conduit. Path must be present.
                const structures = await Promise.all([
                    await ds.getFeature('manhole', 24),
                    await ds.getFeature('manhole', 36)
                ]);

                const conduits = await conduitManager.routeNestedConduits(
                    [featureData],
                    structures
                );

                //We'll sort the array to ensure consistency.
                //ENH: Removing id and name but should be moved to th.outputFeautre. Didn't want to break other tests.
                const sortedConduitsAsc = sortFeaturesAsc(conduits).map(conduit => {
                    // Removing any property with ids for conduits created in this test.
                    delete conduit.properties.id;
                    delete conduit.properties.name;
                    delete conduit.properties.housing;
                    return conduit;
                });

                sortedConduitsAsc.forEach(conduit => th.outputFeature(conduit, false, false));
            });
        });
    });
}
