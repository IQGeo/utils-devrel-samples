// Copyright: Ubisense Limited 2010-2023
/* globals global */
import { test as joTest, suite, subTest, output } from 'just-output';
import th from '../commsTestHelper';
import _ from 'underscore';

if (!myw.isNativeApp) {
    /**
     * Exercise containment plugin (client side functionality)
     */

    suite('Structure Plugin', function () {
        let ds;
        let structMgr;

        // -------------------------------------------------------------------------
        //                                HELPERS
        // -------------------------------------------------------------------------

        const setupGlobals = (datasource, app) => {
            ds = datasource;
            structMgr = app.plugins.structureManager;
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
        readonlyTest('Route Tree', function (testName) {
            th.setDelta(ds); // Run in master

            subTest('ROUTE CONTENTS NO PROPOSED', async function (subTestName) {
                const route = await ds.getFeature('ug_route', 8);
                const routeContent = await structMgr.routeContent(route);
                const tree = routeContent.cableTree();
                th.outputRouteCableTree(tree);
            });

            subTest('ROUTE CONTENTS WITH PROPOSED', async function (subTestName) {
                const coord = [0.1367362, 52.2255922]; //ug_route 335
                const route = await th.getRouteAt(ds, coord);
                const routeContent = await structMgr.routeContent(route, true);
                const tree = routeContent.cableTree();
                th.outputRouteCableTree(tree);
            });
        });

        readonlyTest('Struct Cable Tree', async function (testName) {
            th.setDelta(ds); // Run in master

            subTest('STRUCT CABLE TREE NO PROPOSED', async function (subTestName) {
                const struct = await ds.getFeature('building', 1);
                const structContent = await structMgr.structContent(struct);
                const tree = structContent.cableTree();
                th.outputStructCableTree(tree);
            });

            subTest('STRUCT CABLE TREE WITH PROPOSED', async function (subTestName) {
                const struct = await ds.getFeature('building', 1);
                const structContent = await structMgr.structContent(struct, true);
                const tree = structContent.cableTree();
                th.outputStructCableTree(tree);
            });
        });

        readonlyTest('Struct Conduit Tree', async function (testName) {
            th.setDelta(ds); // Run in master

            subTest('STRUCT CONDUIT TREE NO PROPOSED', async function (subTestName) {
                const struct = await ds.getFeature('cabinet', 1);
                const structContent = await structMgr.structContent(struct);
                const tree = structContent.conduitTree();

                th.outputStructConduitTree(tree);
            });

            subTest('STRUCT CONDUIT TREE WITH PROPOSED', async function (subTestName) {
                const struct = await ds.getFeature('cabinet', 1);
                const structContent = await structMgr.structContent(struct, true);
                const tree = structContent.conduitTree();

                th.outputStructConduitTree(tree);
            });
        });

        readonlyTest('Struct Cable Pins', async function (subTestName) {
            let struct, result;

            th.setDelta(ds, ''); // Test all in master

            output('Cabinet 1 Cables');
            struct = await ds.getFeature('cabinet', 1);
            result = await structMgr.structContent(struct);
            th.outputStructCablePins(result.segPins());

            output('Cabinet 2 Cables only undirected');
            struct = await ds.getFeature('cabinet', 2);
            result = await structMgr.structContent(struct);
            th.outputStructCablePins(result.segPins(true));

            output('Cabinet 11 Cables and proposed');
            struct = await ds.getFeature('cabinet', 11);
            result = await structMgr.structContent(struct, true);
            th.outputStructCablePins(result.segPins());
        });

        /**
         * Test data access - equipment tree
         */
        readonlyTest('Equipment Tree', function (testName) {
            subTest('Data access - equipment tree', async function (subTestName) {
                th.setDelta(ds); // Run in master

                const structUrns = [
                    'cabinet/2', // Just splices
                    'pole/7', // SC and splitter with conns
                    'building/1' // Exchange
                ];

                for (const structUrn of structUrns) {
                    const struct = await ds.getFeatureByUrn(structUrn, false); // false to exclude lobs
                    const structContent = await structMgr.structContent(struct);
                    const tree = structContent.equipTree();

                    output(`Tree for ${structUrn}`);
                    th.outputEquipTree(tree);
                }
            });

            subTest('EQUIPMENT INCLUDING PRPOSED', async function (subTestName) {
                let struct, structContent, tree;

                output('Building 2 in master');
                th.setDelta(ds, '');
                struct = await ds.getFeature('building', 2);
                structContent = await structMgr.structContent(struct, true);
                tree = structContent.equipTree();
                th.outputEquipTree(tree);

                output('Building 2 in delta');
                th.setDelta(ds, 'design/NU23');
                struct = await ds.getFeature('building', 2);
                structContent = await structMgr.structContent(struct, true);
                tree = structContent.equipTree();
                th.outputEquipTree(tree);

                output('Cabinet 11 in master');
                th.setDelta(ds, '');
                struct = await ds.getFeature('cabinet', 11);
                structContent = await structMgr.structContent(struct, true);
                tree = structContent.equipTree();
                th.outputEquipTree(tree);

                output('Cabinet 11 in delta');
                th.setDelta(ds, 'design/CC5462');
                struct = await ds.getFeature('cabinet', 11);
                structContent = await structMgr.structContent(struct, true);
                tree = structContent.equipTree();
                th.outputEquipTree(tree);
            });
        });

        readonlyTest('Struct Conduits', async function (subTestName) {
            let struct, result;

            th.setDelta(ds); // Run in master

            output('STRUCTURE CONDUITS WITHOUT PROPOSED OBJECTS');
            struct = await ds.getFeature('mywcom_route_junction', 51);
            result = await structMgr.structContent(struct, false);
            th.outputStructConduits(result.conduitInfos());

            output('STRUCTURE CONDUITS WITH PROPOSED OBJECTS');
            struct = await ds.getFeature('mywcom_route_junction', 51);
            result = await structMgr.structContent(struct, true);
            th.outputStructConduits(result.conduitInfos());
        });

        readonlyTest('Trace Trees', async function (subTestName) {
            let struct, structContent, equipTree;

            subTest('POLE/6', async function (subTestName) {
                struct = await ds.getFeature('pole', 6);
                structContent = await structMgr.structContent(struct);
                equipTree = structContent.equipTree();
                th.outputEquipTraceTrees(equipTree.traceTrees());
            });

            subTest('SHELF/13', async function (subTestName) {
                struct = await ds.getFeature('building', 1);
                structContent = await structMgr.structContent(struct);
                equipTree = structContent.equipTree().subtreeFor('fiber_shelf/13');
                th.outputEquipTraceTrees(equipTree.traceTrees());
            });

            subTest('SP HUB', async function (subTestName) {
                struct = await ds.getFeature('building', 2);
                structContent = await structMgr.structContent(struct);
                equipTree = structContent.equipTree().subtreeFor('rack/6');
                th.outputEquipTraceTrees(equipTree.traceTrees());
            });
        });
    });
}
