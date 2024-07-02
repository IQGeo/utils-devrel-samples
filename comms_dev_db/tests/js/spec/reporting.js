// Copyright: IQGeo Limited 2010-2023

/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';

const myw = global.myw;
import th from '../commsTestHelper';
import _ from 'underscore';
import HtmlReportStream from 'modules/comms/js/reporting/streams/htmlReportStream';
import CsvReportStream from 'modules/comms/js/reporting/streams/csvReportStream';
import PdfReportStream from 'modules/comms/js/reporting/streams/pdfReportStream';
import XlsxReportStream from 'modules/comms/js/reporting/streams/xlsxReportStream';

import ConnectivityReport from 'modules/comms/js/reporting/connectivityReport';
import EquipmentReport from 'modules/comms/js/reporting/equipmentReport';
import FiberReport from 'modules/comms/js/reporting/fiberReport';
import CircuitReport from 'modules/comms/js/reporting/circuitReport';
import EquipCircuitReport from 'modules/comms/js/reporting/equipmentCircuitReport';
import SpecReport from 'modules/comms/js/reporting/specReport';
import LaborCostsReport from 'modules/comms/js/reporting/laborCostsReport';

import ValidationReport from 'modules/comms/js/reporting/validationReport';
import FeatureChangeReport from 'modules/comms/js/reporting/featureChangeReport';
import FeatureSetReport from 'modules/comms/js/reporting/featureSetReport';
import TraceReport from 'modules/comms/js/reporting/traceReport';
import FiberTraceReport from 'modules/comms/js/reporting/fiberTraceReport';
import BOMReport from 'modules/comms/js/reporting/bomReport';

import TestReport from 'modules/comms_dev_db/js/dev_tools/testReport';

import PinRange from 'modules/comms/js/api/pinRange';

if (!myw.isNativeApp) {
    /**
     * Exercise report generation
     */

    suite('Reporting', function () {
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
        //                                STREAM TESTS
        // -------------------------------------------------------------------------

        readonlyTest('html stream', async function (testName) {
            const rep = new TestReport(app);
            await rep.build();

            const strm = new HtmlReportStream();
            const doc = rep.generate(strm);

            th.output('TEST REPORT: ');
            th.outputReportDoc('html', doc);
        });

        readonlyTest('csv stream', async function (testName) {
            const rep = new TestReport(app);
            await rep.build();

            const strm = new CsvReportStream();
            const doc = rep.generate(strm);

            th.output('TEST REPORT: ');
            th.outputReportDoc('csv', doc);
        });

        readonlyTest('pdf stream', async function (testName) {
            const rep = new TestReport(app);
            await rep.build();

            const strm = new PdfReportStream();
            let doc = rep.generate(strm);

            th.output('TEST REPORT: ');
            th.outputReportDoc('pdf', doc);
        });

        readonlyTest('xlsx stream', async function (testName) {
            const rep = new TestReport(app);
            await rep.build();

            const strm = new XlsxReportStream();
            const doc = rep.generate(strm);

            th.output('TEST REPORT: ');
            th.outputReportDoc('xlsx', doc);
        });

        // -------------------------------------------------------------------------
        //                                REPORT TESTS
        // -------------------------------------------------------------------------

        readonlyTest('Connectivity Report', async function (testName) {
            const delta = 'design/CC3562';

            const testConnectivityReport = async function (ftr, format = 'csv') {
                const rep = new ConnectivityReport(app, ftr);
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\nSPLICE REPORT: ${format} : ${ftr.getUrn()} : ${ftr.getTitle()}`);
                th.outputReportDoc(format, doc);
            };

            subTest('Formats', async function (subTestName) {
                // Splice with stripes
                // Exercises format-specific code
                th.setDelta(ds);
                const ftr = await th.findEquip(ds, 'fiber', 'WH-SC-047');
                await testConnectivityReport(ftr, 'html');
                await testConnectivityReport(ftr, 'pdf');
                await testConnectivityReport(ftr, 'xlsx');
                await testConnectivityReport(ftr, 'csv');
            });

            subTest('Splice Closure', async function (subTestName) {
                // Complex splice
                th.setDelta(ds);
                const ftr = await th.findEquip(ds, 'fiber', 'WH-SC-039');
                await testConnectivityReport(ftr);
            });

            subTest('Manhole', async function (subTestName) {
                // Splice with multiple circuits
                th.setDelta(ds);
                const ftr = await th.findStruct(ds, 'WH-M-29');
                await testConnectivityReport(ftr);
            });

            subTest('Splitters', async function (subTestName) {
                // Pole with splitters
                th.setDelta(ds);
                const ftr = await th.findStruct(ds, 'WH-P-006');
                await testConnectivityReport(ftr);
            });

            subTest('Rack', async function (subTestName) {
                // Rack with OLTs and multiple circuits
                th.setDelta(ds);
                const ftr = await th.findEquip(ds, 'fiber', 'WH-R-01');
                await testConnectivityReport(ftr);
            });

            subTest('BB Rack', async function (subTestName) {
                // Rack with undirected cables
                th.setDelta(ds);
                const ftr = await th.findEquip(ds, 'fiber', 'WH-BB-01');
                await testConnectivityReport(ftr);
            });

            subTest('MUX Rack', async function (subTestName) {
                // Rack with MUX + undirected cables
                th.setDelta(ds);
                const ftr = await th.findEquip(ds, 'fiber', 'SP-BB-01');
                await testConnectivityReport(ftr);
            });

            subTest('ODF', async function (subTestName) {
                // Patch panel with port -> port connections
                th.setDelta(ds);
                const ftr = await th.findEquip(ds, 'fiber', 'WH-ODF-02');
                await testConnectivityReport(ftr);
            });
        });

        readonlyTest('Equipment Report', async function (testName) {
            const testEquipmentReport = async function (feature, format = 'html') {
                const rep = new EquipmentReport(app, feature);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(
                    `\n\EQUIPMENT REPORT: ${format} : ${feature.getUrn()} : ${feature.getTitle()}`
                );
                th.outputReportDoc(format, doc);
            };

            subTest('building/1', async function (subTestName) {
                const feature = await ds.getFeatureByUrn('building/1');

                await testEquipmentReport(feature, 'csv');
                await testEquipmentReport(feature, 'html');
                await testEquipmentReport(feature, 'pdf');
                await testEquipmentReport(feature, 'xlsx');
            });
        });

        readonlyTest('Validation Report', async function (testName) {
            const testValidationReport = async function (features, format = 'html', delta = '') {
                const rep = new ValidationReport(app, features);
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\VALIDATION REPORT: ${format} : ${delta ? delta.getTitle() : ''}`);
                th.outputReportDoc(format, doc);
            };

            subTest('systest/conflicts1', async function (subTestName) {
                // Has lots of data integrity errors
                const design = 'systest/conflicts1';
                th.setDelta(ds, design);

                const delta = await ds.getFeatureByUrn(design);
                const conflicts = await ds.comms.conflicts(design);
                const integrityErrors = await ds.comms.validateDelta(design);
                //ENH: Add design rules

                const validationFeatures = [...conflicts, ...integrityErrors];

                await testValidationReport(validationFeatures, 'csv');
                await testValidationReport(validationFeatures);
                await testValidationReport(validationFeatures, 'pdf', delta);
            });

            subTest('NB335', async function (subTestName) {
                // Has real conflicts
                // Also test formats
                const design = 'design/NB335';
                th.setDelta(ds, design);

                const delta = await ds.getFeatureByUrn(design);
                const conflicts = await ds.comms.conflicts(design);
                const integrityErrors = await ds.comms.validateDelta(design);
                //ENH: Add design rules

                const validationFeatures = [...conflicts, ...integrityErrors];

                await testValidationReport(validationFeatures, 'csv', delta);
                await testValidationReport(validationFeatures, 'html', delta);
                await testValidationReport(validationFeatures, 'pdf', delta);
                await testValidationReport(validationFeatures, 'xlsx', delta);
            });
        });

        readonlyTest('Feature Change Report', async function (testName) {
            const testChangesReport = async function (features, delta, format = 'html') {
                const rep = new FeatureChangeReport(app, features);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\FEATURE CHANGE REPORT: ${format} : ${delta.getTitle()}`);
                th.outputReportDoc(format, doc);
            };

            subTest('design/NB335', async function (subTestName) {
                const design = 'design/NB335';
                th.setDelta(ds, design);
                const delta = await ds.getFeatureByUrn(design);

                const changes = await ds.comms.deltaChanges(design);

                await testChangesReport(changes, delta, 'csv');
                await testChangesReport(changes, delta, 'html');
                await testChangesReport(changes, delta, 'pdf');
                await testChangesReport(changes, delta, 'xlsx');
            });
        });

        readonlyTest('Feature Set Report', async function (testName) {
            const testSetReport = async function (features, format = 'html') {
                const rep = new FeatureSetReport(app, features);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\FEATURE SET REPORT: ${format}`);
                th.outputReportDoc(format, doc);
            };

            subTest('splice_trays', async function (subTestName) {
                const features = await await app.database.getFeatures('fiber_splice_tray');

                await testSetReport(features, 'csv');
                await testSetReport(features, 'html');
                await testSetReport(features, 'pdf');
                await testSetReport(features, 'xlsx');
            });
        });

        readonlyTest('Trace Report', async function (testName) {
            const testTraceReport = async function (features, format = 'html') {
                const rep = new TraceReport(app, features);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(
                    `\n\TRACE REPORT: ${format} : ${features.items[0].getUrn()} : ${features.items[0].getTitle()}`
                );
                th.outputReportDoc(format, doc);
            };

            subTest('Patch Panel 1 in:1:7', async function (subTestName) {
                const feature = await ds.getFeatureByUrn('fiber_patch_panel/1');
                const res = await app.plugins.connectionManager.traceOut(
                    'fiber',
                    feature,
                    {
                        spec: 'in:1:7'
                    },
                    'both'
                );

                const features = res;

                await testTraceReport(features, 'csv');
                await testTraceReport(features, 'html');
                await testTraceReport(features, 'pdf');
                await testTraceReport(features, 'xlsx');
            });
        });

        readonlyTest('Fiber Trace Report', async function (testName) {
            const testFiberTraceReport = async function (features, format = 'html') {
                const rep = new FiberTraceReport(app, features);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(
                    `\n\FIBER TRACE REPORT: ${format} : ${features.items[0].getUrn()} : ${features.items[0].getTitle()}`
                );
                th.outputReportDoc(format, doc);
            };

            subTest('Patch Panel 1 in:1:7', async function (subTestName) {
                const feature = await ds.getFeatureByUrn('fiber_patch_panel/1');
                const res = await app.plugins.connectionManager.traceOut(
                    'fiber',
                    feature,
                    {
                        spec: 'in:1:7'
                    },
                    'both'
                );

                const features = res;

                await testFiberTraceReport(features, 'csv');
                await testFiberTraceReport(features, 'html');
                await testFiberTraceReport(features, 'pdf');
                await testFiberTraceReport(features, 'xlsx');
            });

            subTest('Patch Panel 1 downstream', async function (subTestName) {
                const design = 'design/NB335';
                th.setDelta(ds, design); //Set design to test design output in report
                const feature = await ds.getFeatureByUrn('fiber_patch_panel/1');
                const res = await app.plugins.connectionManager.traceOut(
                    'fiber',
                    feature,
                    {
                        spec: 'in:1:14'
                    },
                    'downstream'
                );

                const features = res;

                await testFiberTraceReport(features, 'csv');
            });
        });

        readonlyTest('Bill of Materials Report', async function (testName) {
            const testBOMReport = async function (features, delta, format = 'html') {
                const rep = new BOMReport(app, features);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\BILL OF MATERIALS REPORT: ${format} : ${delta.getTitle()}`);
                th.outputReportDoc(format, doc);
            };

            subTest('design/NB335', async function (subTestName) {
                const design = 'design/NB335';
                th.setDelta(ds, design);

                const delta = await ds.getFeatureByUrn(design);
                const changes = await ds.comms.deltaChanges(design);

                await testBOMReport(changes, delta, 'csv');
                await testBOMReport(changes, delta, 'html');
                await testBOMReport(changes, delta, 'pdf');
                await testBOMReport(changes, delta, 'xlsx');
            });

            subTest('design/NB301', async function (subTestName) {
                const design = 'design/NB301';
                th.setDelta(ds, design);

                const delta = await ds.getFeatureByUrn(design);
                const changes = await ds.comms.deltaChanges(design);

                await testBOMReport(changes, delta, 'csv');
            });
        });

        readonlyTest('Fiber Report', async function (testName) {
            const testFiberReport = async function (feature, format = 'html') {
                const rep = new FiberReport(app, feature);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\FIBER REPORT: ${format}`);
                th.outputReportDoc(format, doc);
            };

            subTest('ug_route/6', async function (subTestName) {
                const route = await ds.getFeatureByUrn('ug_route/6');
                await testFiberReport(route, 'csv');
            });

            subTest('mywcom_fiber_segment/184', async function (subTestName) {
                const route = await ds.getFeatureByUrn('mywcom_fiber_segment/184');
                await testFiberReport(route, 'csv');
            });

            subTest('mywcom_fiber_segment/382', async function (subTestName) {
                const route = await ds.getFeatureByUrn('mywcom_fiber_segment/382');
                await testFiberReport(route, 'csv');
            });
        });

        readonlyTest('Circuit Report', async function (testName) {
            const testCircuitReport = async function (feature, format = 'html') {
                const rep = new CircuitReport(app, feature);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\CIRCUIT REPORT: ${format}`);
                th.outputReportDoc(format, doc);
            };

            subTest('ug_route/6', async function (subTestName) {
                const route = await ds.getFeatureByUrn('ug_route/6');
                await testCircuitReport(route, 'csv');
            });

            subTest('mywcom_fiber_segment/382', async function (subTestName) {
                const route = await ds.getFeatureByUrn('mywcom_fiber_segment/382');
                await testCircuitReport(route, 'csv');
            });
        });

        readonlyTest('Equip Circuit Report', async function (testName) {
            const testEquipCircuitReport = async function (feature, format = 'html') {
                const rep = new EquipCircuitReport(app, feature);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\EQUIP CIRCUIT REPORT: ${format}`);
                th.outputReportDoc(format, doc);
            };

            subTest('building/1', async function (subTestName) {
                const route = await ds.getFeatureByUrn('building/1');
                await testEquipCircuitReport(route, 'csv');
            });

            subTest('fiber_patch_panel/1', async function (subTestName) {
                const route = await ds.getFeatureByUrn('fiber_patch_panel/1');
                await testEquipCircuitReport(route, 'csv');
            });

            subTest('fiber_patch_panel/5', async function (subTestName) {
                const route = await ds.getFeatureByUrn('fiber_patch_panel/1');
                await testEquipCircuitReport(route, 'csv');
            });
        });

        readonlyTest('Spec Report', async function (testName) {
            const testSpecReport = async function (features, format = 'html') {
                const rep = new SpecReport(app, features);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\SPEC REPORT: ${format}`);
                th.outputReportDoc(format, doc);
            };

            subTest('fiber_cable_specs', async function (subTestName) {
                const specs = await app.database.getFeatures('fiber_cable_spec');
                await testSpecReport(specs, 'csv');
            });

            subTest('conduit_specs', async function (subTestName) {
                const specs = await app.database.getFeatures('conduit_spec');
                await testSpecReport(specs, 'csv');
            });

            subTest('all specs', async function (subTestName) {
                const specs = Object.values(app.plugins.specManager.specCache);
                await testSpecReport(specs, 'csv');
            });
        });

        readonlyTest('Labor Costs Report', async function (testName) {
            const testLaborCostsReport = async function (features, format = 'html') {
                const rep = new LaborCostsReport(app, features);
                //ENH: onload never resolved under nodeJs
                rep._loadImage = () => {
                    return '<image>';
                };
                await rep.build();

                rep.date = new Date(2020, 5, 10); // Hack to keep results

                const strm = app.plugins.reportManager.streamFor(format);
                let doc = rep.generate(strm);

                th.output(`\n\LABOR COSTS REPORT: ${format}`);
                th.outputReportDoc(format, doc);
            };

            subTest('all labor costs', async function (subTestName) {
                const LaborCostss = await app.database.getFeatures('mywcom_labor_cost');
                await testLaborCostsReport(LaborCostss, 'csv');
            });

            subTest('linear labor costs', async function (subTestName) {
                const linearLaborCosts = Object.values(
                    app.plugins.laborCostsManager.laborCostsCache.linear_labor_costs
                );

                await testLaborCostsReport(linearLaborCosts, 'csv');
            });
        });
    });
}
