import myw from 'myWorld-client';
import _ from 'underscore';
import { geoSplitAtCoord } from '../../../../base/geomUtils';
// import turf from '@turf/turf';

export const insertFeatures = async (objectRef, geom, features, setState) => {
    setState({ inserting: true });

    const detachedFeatures = await createDetachedFeatures(objectRef, geom, features);
    const transaction = await createTransaction(objectRef);
    addFeaturesToTransaction(detachedFeatures, transaction);

    const ids = await getIds(objectRef, transaction, setState);
    const ops = await transaction.getOperations();
    const urns = getUrns(ops, ids);

    runPostInsertTriggersFor(objectRef, urns);
    insertAssembly(objectRef, geom);

    const routes = getRoutes(ops, ids);
    for (const route of routes) {
        if (route.geometry.coordinates.length > 2) {
            // eslint-disable-next-line no-await-in-loop
            const createdRoutes = await objectRef.datasource.comms.splitRoute(
                route.featureType,
                route.id
            );
        }
    }

    // notifyLayers(objectRef);
    setState({ inserting: false });
};

const createDetachedFeatures = async (objectRef, geom, features) => {
    return createFeaturesFrom(objectRef, geom, features);
};

const createTransaction = async objectRef => {
    return objectRef.datasource.transaction();
};

const addFeaturesToTransaction = (detachedFeatures, transaction) => {
    detachedFeatures.forEach(feature => {
        transaction.addInsert(feature);
    });
};

const getIds = async (objectRef, transaction, setState) => {
    return objectRef.datasource.comms.runTransaction(transaction).catch(error => {
        setState({ inserting: false, insertError: error });
        throw new Error('Insert failed ' + error, 'error');
    });
};

const getUrns = (ops, ids) => {
    // get newly inserted features to run posInsert triggers on (for design change)
    return ops.map((op, index) => op[1] + '/' + ids.ids[index]);
};

const getRoutes = (ops, ids) => {
    const feature_data = ops.map((op, index) => {
        return {
            featureType: op[1],
            id: ids.ids[index],
            geometry: op[2].geometry
        };
    });

    const routeFeatureTypes = Object.keys(myw.config['mywcom.routes']);
    const routes = feature_data.filter(item => routeFeatureTypes.includes(item.featureType));
    return routes;
};

const insertAssembly = async (objectRef, geom) => {
    if (
        !objectRef.state.chosenAssembly ||
        !objectRef.state.fieldData.routeSpecUseLinearAssembly?.value
    ) {
        return;
    }
    let nestedResults = [];
    const assemblyDef = objectRef.state.assemblies.find(
        ({ name }) => name === objectRef.state.chosenAssembly
    );
    nestedResults = await saveNestedFeatures(objectRef, assemblyDef, [
        geom.coordinates[0],
        geom.coordinates[geom.coordinates.length - 1]
    ]);

    // run posInsert triggers on (for design change)
    if (nestedResults.length > 0) runPosInsertTriggersOn(objectRef, nestedResults);
};

/**
 * create detached features from geometry
 * @param {*} geom
 * @returns {Array}
 */
const createFeaturesFrom = async (objectRef, geom, features) => {
    const structs = await createStructsFrom(objectRef, geom, features);
    const routes = await createRoutesFrom(objectRef, geom);
    return [].concat(structs, routes);
};

/**
 * Create detached structure features
 * @param {*} geom
 * @returns {Array}
 */
const createStructsFrom = async (objectRef, geom, features) => {
    const featureType = getFeatureType(objectRef, 'struct');
    const detachedStructs = [];

    for (const coord of Object.values(features)) {
        // eslint-disable-next-line no-await-in-loop
        const existingStructs = await objectRef.app.plugins.structureManager.getStructuresAt(
            coord,
            null,
            0.5
        );
        // structure already at coord, don't place another
        if (existingStructs.length > 0) continue;

        //eslint-disable-next-line no-await-in-loop
        const detachedStructFeature = await objectRef.datasource.createDetachedFeature(featureType);
        const props = detachedStructFeature.properties;
        const featureProps = getPropsFor(objectRef, featureType);
        detachedStructFeature.properties = { ...props, ...featureProps };
        detachedStructFeature.setGeometry('Point', coord);
        detachedStructs.push(detachedStructFeature);
    }

    return detachedStructs;
};

/**
 * Create detached route features
 * @param {*} geom
 * @returns {Array}
 */
const createRoutesFrom = async (objectRef, geom) => {
    const detachedRoutes = [];
    const featureType = getFeatureType(objectRef, 'route');
    const multiLineSegs = getRouteSegments(objectRef, geom);

    for (const linestring of multiLineSegs) {
        // eslint-disable-next-line no-await-in-loop
        const detachedRouteFeature = await objectRef.datasource.createDetachedFeature(featureType);
        const props = detachedRouteFeature.properties;
        const featureProps = getPropsFor(objectRef, featureType);
        detachedRouteFeature.properties = { ...props, ...featureProps };
        detachedRouteFeature.setGeometry(geom.type, linestring.coordinates);
        detachedRoutes.push(detachedRouteFeature);
    }

    return detachedRoutes;
};

/**
 * Builds array of linestring coordinate arrays, splits origLineString at coord(s) that will have a structure
 * @param {object} objectRef reference to app
 * @param {object} geom linestring geometry
 * @returns {array}
 */
const getRouteSegments = (objectRef, geom) => {
    const coords = [...geom.coordinates];
    const origLineString = myw.geometry.lineString(coords);
    const lineStrings = [origLineString];
    coords.forEach(coord => {
        const structAtCoord = _structAtCoord(objectRef, coord);

        if (structAtCoord) {
            // lineStrings is never empty
            const lastIndex = lineStrings.length - 1;
            const lastLineString = lineStrings[lastIndex];
            const newLineStrings = geoSplitAtCoord(lastLineString, coord).filter(
                newLineString => newLineString !== undefined
            );
            lineStrings.splice(lastIndex, 1, ...newLineStrings);
        }
    });

    return lineStrings;
};

/**
 * Returns true if a structure is to be added to coord
 * @param {object} objectRef reference to app
 * @param {array} coord coordinate
 * @returns {boolean}
 */
const _structAtCoord = (objectRef, coord) => {
    const structCoords = Object.values(objectRef.structuresAddedThisSession);
    return structCoords.some(c => c[0] === coord[0] && c[1] === coord[1]);
};

/**
 * returns underground or overhead
 * @returns {String}
 */
const getEnvironment = objectRef => {
    return objectRef.state.tabId.split('-')[0];
};

/**
 *
 * @param {String} type
 * @returns
 */
const getFeatureType = (objectRef, type) => {
    if (type === 'struct') return getStructFeatureType(objectRef);
    if (type === 'route') return getRouteFeatureType(objectRef);
};

/**
 * returns current structure feature type from form
 * @returns {String}
 */
const getStructFeatureType = objectRef => {
    const env = getEnvironment(objectRef);

    if (env === 'overhead') return objectRef.state.overheadFeature;
    if (env === 'underground') return objectRef.state.undergroundFeature;
    return undefined;
};

/**
 * returns current route feature type from form
 * @returns {String}
 */
const getRouteFeatureType = objectRef => {
    const env = getEnvironment(objectRef);
    if (env === 'overhead') return objectRef.state.overheadRoute;
    if (env === 'underground') return objectRef.state.undergroundRoute;
    return undefined;
};

/**
 * Gets properties for featureType from form
 * @param {String} featureType
 * @returns {Object}
 */
const getPropsFor = (objectRef, featureType) => {
    const fields = objectRef.state.fieldData;
    const featureProps = {};

    Object.keys(fields).forEach(field => {
        if (field.split('_')[0] === featureType) {
            featureProps[fields[field].name] = fields[field].value;
        }
    });
    return featureProps;
};

/**
 * Inserts features housed in route (from linear assembly)
 * @param {Object} featureJson
 * @param {Array} structureCoords
 * @returns {Array}
 */
const saveNestedFeatures = async (objectRef, featureJson, structureCoords) => {
    const structManager = objectRef.app.plugins['structureManager'];
    const structFeatureType = getStructFeatureType(objectRef);

    // get newly inserted structures from database
    const structs = await Promise.all(
        structureCoords.map(async structure => {
            return structManager.getStructureAt(structure, [structFeatureType]);
        })
    );
    const nestedConduits = await saveNestedConduits(objectRef, featureJson, structs);
    const nestedCables = await saveNestedCables(objectRef, featureJson, structs);
    return [...nestedConduits, ...nestedCables];
};

/**
 * If there are conduits that are part of this routes assembly, then add them.
 *
 * @param {*} featureJson
 * @returns New Conduits
 */
const saveNestedConduits = async (objectRef, featureJson, structures) => {
    if (_.isEmpty(featureJson.conduits)) return [];

    const conduitManager = objectRef.app.plugins['conduitManager'];

    const createdConduits = await conduitManager.routeNestedConduits(
        featureJson.conduits,
        structures
    );
    return createdConduits;
};

/**
 *
 * @param {*} featureJson
 * @returns
 */
const saveNestedCables = async (objectRef, featureJson, structures) => {
    if (_.isEmpty(featureJson.cables)) return [];

    const cableManager = objectRef.app.plugins['cableManager'];
    // const structures = this.structures;
    const createdCables = await cableManager.routeCables(featureJson.cables, structures);
    return createdCables;
};

/**
 * Get inserted features and run posInsert trigger
 * @param {Array} urns
 */
const runPostInsertTriggersFor = async (objectRef, urns) => {
    const ftrRequests = urns.map(item => {
        return objectRef.database.getFeatureByUrn(item);
    });
    const newFeatures = await Promise.all(ftrRequests);
    runPosInsertTriggersOn(objectRef, newFeatures);
};

/**
 * Run posInsert triggers on features
 * @param {Array} features
 */
const runPosInsertTriggersOn = (objectRef, features) => {
    features.map(feature => feature.posInsert(feature, objectRef.app));
};

/**
 * Fire events so layers will refresh
 */
const notifyLayers = objectRef => {
    const featureTypes = [getRouteFeatureType(objectRef), getStructFeatureType(objectRef)];

    featureTypes.forEach(featureType => {
        objectRef.app.fire('featureCollection-modified', { featureType });
    });
};
