// Copyright: IQGeo 2010-2023
import { suite, output } from 'just-output';
const myw = global.myw;
import th from '../commsTestHelper';
import { pointToLineDistance, point, lineString } from '@turf/turf';

suite('Delta Services', function () {
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

    readonlyTest('Validation', async function (testName) {
        const delta = 'design/NB301';

        subTest('ALL ERRORS', async function (subTestName) {
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta);
            th.outputIntegrityErrors(result);
        });

        subTest('SUBSET OF ERRORS', async function (subTestName) {
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta, undefined, [], 2);
            th.outputIntegrityErrors(result);
        });

        subTest('WITH BOUNDS AND CATEGORIES', async function (subTestName) {
            th.setDelta(ds, delta);
            const bounds = new myw.LatLngBounds([0.1326835, 52.2232582], [0.1339281, 52.2239351]);
            const categories = ['routes', 'equipment'];
            const result = await ds.comms.validateDelta(delta, bounds, categories, 2);
            th.outputIntegrityErrors(result);
        });

        subTest('WITH CATEGORIES', async function (subTestName) {
            th.setDelta(ds, delta);
            const categories = ['equipment'];
            const result = await ds.comms.validateDelta(delta, undefined, categories, 2);
            th.outputIntegrityErrors(result);
        });

        subTest('SYSTEST DELTA', async function (subTestName) {
            const delta = 'systest/conflicts1';
            th.setDelta(ds, delta);
            const result = await ds.comms.validateDelta(delta);
            th.outputIntegrityErrors(result);
        });
    });

    test('Changes', async function (testName) {
        const delta = 'design/NU23';
        const bb = new myw.LatLngBounds(
            [0.13831252143085146, 52.22434724872329],
            [0.13621369287669802, 52.22366127252312]
        );

        // Get all changes
        subTest('ALL CHANGES', async function (subTestName) {
            th.setDelta(ds, delta);
            const result = await ds.comms.deltaChanges(delta);
            th.outputFeatureChanges(result);
        });

        // Get subset of changes by change type
        subTest('INSERTS AND UPDATES', async function (subTestName) {
            th.setDelta(ds, delta);
            const result = await ds.comms.deltaChanges(delta, ['insert', 'update']);
            th.outputFeatureChanges(result);
        });

        // Get subset of changes in bounds
        subTest('IN BOUNDS', async function (subTestName) {
            th.setDelta(ds, delta);
            const result = await ds.comms.deltaChanges(delta, null, bb);
            th.outputFeatureChanges(result);
        });

        // Get subset of changes by change type + bounds
        subTest('INSERTS IN BOUNDS', async function (subTestName) {
            th.setDelta(ds, delta);
            const result = await ds.comms.deltaChanges(delta, ['insert'], bb);
            th.outputFeatureChanges(result);
        });

        // Get subset of changes by change type + feature types
        lastSubTest('INSERTS AND UPDATES FOR FEATURE_TYPES', async function (subTestName) {
            th.setDelta(ds, delta);
            const result = await ds.comms.deltaChanges(delta, ['insert', 'Update'], null, [
                'fiber_shelf',
                'mywcom_fiber_connection'
            ]);
            th.outputFeatureChanges(result);
        });
    });

    test('Revert', async function () {
        const delta = 'design/NB335';
        subTest('REVERT DELETED FEATURE', async subTestName => {
            th.setDelta(ds, delta);

            const result = await ds.comms.revertFeature(delta, 'manhole', 55);
            await th.showDatabaseChanges(ds, subTestName);
            output(result);
        });

        subTest('REVERT INSERTED FEATURE', async subTestName => {
            th.setDelta(ds, delta);

            const result = await ds.comms.revertFeature(delta, 'mywcom_route_junction', 5200);
            await th.showDatabaseChanges(ds, subTestName);
            output(result);
        });

        subTest('REVERT INSERTED FEATURE TWICE', async subTestName => {
            th.setDelta(ds, delta);

            const result = await ds.comms.revertFeature(delta, 'mywcom_route_junction', 5200);
            output(result);
            await th.showDatabaseChanges(ds, subTestName);
        });

        lastSubTest('REVERT UPDATED FEATURE', async subTestName => {
            th.setDelta(ds, delta);

            const result = await ds.comms.revertFeature(delta, 'manhole', 54);
            await th.showDatabaseChanges(ds, subTestName);
            output(result);
        });
    });

    test('Conflicts', async function () {
        let delta = 'design/NB120';

        subTest('ALL', async function (subTestName) {
            const result = await ds.comms.conflicts(delta);
            th.outputConflicts(result);
            await th.showDatabaseChanges(ds, subTestName);
        });

        subTest('WITH BOUNDS', async function (subTestName) {
            const bounds = new myw.LatLngBounds([0.1373769, 52.2233664], [0.1383533, 52.2236843]);
            const result = await ds.comms.conflicts(delta, bounds);
            th.outputConflicts(result);
            await th.showDatabaseChanges(ds, subTestName);
        });

        subTest('WITH CATEGORIES', async function (subTestName) {
            const categories = ['segments', 'conduits'];
            const result = await ds.comms.conflicts(delta, null, categories);
            th.outputConflicts(result);
            await th.showDatabaseChanges(ds, subTestName);
        });

        subTest('WITH OTHER CATEGORY', async function (subTestName) {
            const categories = ['other'];
            const result = await ds.comms.conflicts('design/NB301', null, categories);
            th.outputConflicts(result);
            await th.showDatabaseChanges(ds, subTestName);
        });

        lastSubTest('WITH BOUNDS AND CATEGORIES', async function (subTestName) {
            const bounds = new myw.LatLngBounds([0.137251, 52.2236096], [0.1383004, 52.2239687]);
            const categories = ['routes'];
            const result = await ds.comms.conflicts(delta, bounds, categories);
            th.outputConflicts(result);
            await th.showDatabaseChanges(ds, subTestName);
        });
    });

    readonlyTest('Bounds', async function () {
        const delta = 'design/CC4827';

        // Note: these coordinates are the output of delta bounds in connected
        // In mobile, turf calculates a similar, but not identical, polygon. Check the maximum distance of every new point to original boundary
        const expectedBoundCoords = JSON.parse(
            '[[0.136716003602598,52.223957958551867],[0.138116117474913,52.22496103180264],[0.138134174056223,52.224977274111029],[0.138145573472833,52.224990418250708],[0.138156230628404,52.22500613853313],[0.138161867666358,52.22502281115384],[0.138169243874562,52.225063886595538],[0.138169779206984,52.22507991724805],[0.138165666992601,52.225095751151318],[0.138157038141774,52.225110884222079],[0.13812485173433,52.22515442419401],[0.138110991420492,52.22516924277213],[0.138092813732124,52.22518218208031],[0.138059286113136,52.22520189829144],[0.138056824609031,52.22520331278349],[0.13752574705981,52.22550151941784],[0.137524777669996,52.22550205887051],[0.137121105070001,52.22572468566069],[0.137118880885843,52.22572588754128],[0.136891563568284,52.22584623698614],[0.136887558776511,52.2258482820898],[0.13678496421782,52.22589880411657],[0.136760787858738,52.22590847105121],[0.136733993006684,52.22591503738352],[0.13670562110849,52.22591824789696],[0.136676774907758,52.22591797780712],[0.136648575583298,52.225914237611799],[0.13662211917097,52.225907172682969],[0.136598433962876,52.2258970576165],[0.136487122249179,52.22583873136974],[0.13648145249682,52.22583560008448],[0.136458119743609,52.22582202217424],[0.136439615001945,52.22580895510425],[0.136425535213553,52.22579395099979],[0.136416403226163,52.225777567037827],[0.136412558149838,52.225760411635587],[0.136309496965936,52.22418991211871],[0.136312082053171,52.22416909847899],[0.136322416659437,52.224149212627128],[0.136424676199418,52.22401058018396],[0.136436008145569,52.22399800339244],[0.136450460298442,52.22398669705341],[0.136497398964053,52.223955479036998],[0.13651778547988,52.22394424160505],[0.136541225311678,52.223935534647157],[0.136566896953462,52.223929663319378],[0.136593900681409,52.223926833396308],[0.136621290086361,52.22392714405934],[0.1366481052424,52.22393058442063],[0.136673406349095,52.22393703390471],[0.136696306668501,52.22394626647423],[0.136716003602598,52.223957958551867]]'
        );
        const expectedLine = lineString(expectedBoundCoords);
        const maxAllowable = 0.05;

        subTest('BOUNDS', async function (subTestName) {
            th.setDelta(ds, delta);
            const result = await ds.comms.deltaBounds(delta);

            let maxDist = 0;
            for (const coord of result.geometry.coordinates[0]) {
                const dist = pointToLineDistance(point(coord), expectedLine, { units: 'meters' });
                if (dist > maxDist) maxDist = dist;
            }

            output(
                `Max Distance of new Delta bounds is less than ${maxAllowable} meters:`,
                maxDist < maxAllowable
            );

            await th.showDatabaseChanges(ds, subTestName);
        });
    });
});
