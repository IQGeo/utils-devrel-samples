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

    suite('Design Rules Plugin', function () {
        let ds;
        let designRulesManager;

        // -------------------------------------------------------------------------
        //                                HELPERS
        // -------------------------------------------------------------------------

        const setupGlobals = (datasource, app) => {
            ds = datasource;
            designRulesManager = app.plugins.designRulesManager;
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

        // -------------------------------------------------------------------------
        //                                TESTS
        // -------------------------------------------------------------------------

        readonlyTest('Validation', async function (testName) {
            const outputErrors = errors => {
                errors.forEach(error => {
                    output('Error Type: ', error.type);
                    output('Error display values: ', error.displayValues);
                });
            };
            const delta = 'design/NB301';

            // Run all rules
            const ruleTypes = designRulesManager.ruleTypes;

            // Bounds to validate in
            const coords = [0.1326835, 52.2232582, 0.1339281, 52.2239351];
            const bounds = th.coordsToBounds(coords);

            subTest('MASTER IN WINDOW', async function (subTestName) {
                th.setDelta(ds);

                let engine = await designRulesManager.validationEngine(ruleTypes, {
                    deltaOnly: false,
                    bounds: bounds
                });
                await engine.run();

                const errors = engine.errors;
                outputErrors(errors);
                engine = null;
            });

            subTest('MASTER+DELTA IN WINDOW', async function (subTestName) {
                th.setDelta(ds, delta);

                let engine = await designRulesManager.validationEngine(ruleTypes, {
                    deltaOnly: false,
                    bounds: bounds
                });
                await engine.run();

                const errors = engine.errors;
                outputErrors(errors);
                engine = null;
            });

            subTest('DELTA', async function (subTestName) {
                th.setDelta(ds, delta);

                let engine = await designRulesManager.validationEngine(ruleTypes, {
                    deltaOnly: true
                });
                await engine.run();

                const errors = engine.errors;
                outputErrors(errors);
                engine = null;
            });
        });
    });
}
