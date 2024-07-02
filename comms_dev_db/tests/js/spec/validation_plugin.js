// Copyright: IQGeo Limited 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';

if (!myw.isNativeApp) {
    /**
     * Exercise design rules plugin (client side functionality)
     */

    suite('Validation Plugin', function () {
        let ds;

        // -------------------------------------------------------------------------
        //                                HELPERS
        // -------------------------------------------------------------------------

        const setupGlobals = (datasource, app) => {
            ds = datasource;
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

        const categories = [
            'structures',
            'routes',
            'conduits',
            'conduit_runs',
            'equips',
            'cables',
            'segments',
            'connections',
            'circuits',
            'line_of_counts',
            'other'
        ];

        /**
         * Tests conflict feature messages
         */
        readonlyTest('Conflict Display', async function (testName, app) {
            const outputDisplayProps = features => {
                // Conflict helpers
                const conflictFeatures = features.filter(
                    feature =>
                        feature.constructor.name != 'IntegrityError' &&
                        feature.constructor.name != 'DesignRuleError'
                );

                conflictFeatures.sort((a, b) => {
                    const aVal = a.getUrn();
                    const bVal = b.getUrn();
                    return aVal.localeCompare(bVal);
                });

                conflictFeatures.forEach(feature => {
                    output('Short description: ', feature.getShortDescription());
                    output('Hover text: ', feature?.getResultsHoverText());
                    output('\n');
                });

                // Integrity error helpers
                const integrityErrors = features.filter(
                    feature => feature.constructor.name == 'IntegrityError'
                );

                integrityErrors.sort((a, b) => {
                    const aVal = a.feature.getUrn();
                    const bVal = b.feature.getUrn();
                    return aVal.localeCompare(bVal);
                });

                integrityErrors.forEach(feature => {
                    output('Short description: ', feature.getShortDescription());
                    output('Hover text: ', feature.getResultsHoverText());
                    output('\n');
                });
            };

            const filterDuplicateFeatureErrors = errors => {
                const filteredErrorItems = {};
                errors.forEach(errorItem => {
                    // Duplicate - check new error is conflict before inserting
                    if (errorItem.getUrn() in filteredErrorItems) {
                        if (errorItem.validationFeatureType == 'conflictFeature') {
                            filteredErrorItems[errorItem.getUrn()] = errorItem;
                            return;
                        }
                    } else {
                        filteredErrorItems[errorItem.getUrn()] = errorItem;
                    }
                });

                return Object.values(filteredErrorItems);
            };

            subTest('check design/CC5462', async function () {
                th.setDelta(ds, 'design/CC5462');

                const conflicts = await ds.comms.conflicts('design/CC5462', null, categories, null);
                const integrityErrors = await ds.comms.validateDelta(
                    'design/CC5462',
                    null,
                    categories,
                    null
                );

                let categoryErrorItems = conflicts.concat(integrityErrors);

                // Cannot return two features with the same URN as causes problems with feature reps.
                // Conflicts are more important so remove matching integrity errors
                // ENH: Core to fix problem with displaying duplicate reps or combine integrity and conflict
                const filteredErrorItems = filterDuplicateFeatureErrors(categoryErrorItems);
                outputDisplayProps(filteredErrorItems);
            });

            subTest('check design/NB335', async function () {
                th.setDelta(ds, 'design/NB335');

                const conflicts = await ds.comms.conflicts('design/NB335', null, categories, null);
                const integrityErrors = await ds.comms.validateDelta(
                    'design/NB335',
                    null,
                    categories,
                    null
                );

                let categoryErrorItems = conflicts.concat(integrityErrors);

                // Cannot return two features with the same URN as causes problems with feature reps.
                // Conflicts are more important so remove matching integrity errors
                // ENH: Core to fix problem with displaying duplicate reps or combine integrity and conflict
                const filteredErrorItems = filterDuplicateFeatureErrors(categoryErrorItems);
                outputDisplayProps(filteredErrorItems);
            });

            lastSubTest('check systest/conflicts1', async function () {
                th.setDelta(ds, 'systest/conflicts1');

                const conflicts = await ds.comms.conflicts(
                    'systest/conflicts1',
                    null,
                    categories,
                    null
                );

                const integrityErrors = await ds.comms.validateDelta(
                    'systest/conflicts1',
                    null,
                    categories,
                    null
                );

                let categoryErrorItems = conflicts.concat(integrityErrors);

                // Cannot return two features with the same URN as causes problems with feature reps.
                // Conflicts are more important so remove matching integrity errors
                // ENH: Core to fix problem with displaying duplicate reps or combine integrity and conflict
                const filteredErrorItems = filterDuplicateFeatureErrors(categoryErrorItems);
                outputDisplayProps(filteredErrorItems);
            });
        });
    });
}
