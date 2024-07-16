// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import { Fill, RegularShape, Stroke, Style } from 'ol/style';
import Point from 'ol/geom/Point';
import LineString from 'ol/geom/LineString';
import MultiPoint from 'ol/geom/MultiPoint';
// Utilities for geometry manipulation
// TBR: Extend Core geometry API and remove these

/**
 * Vertex number of 'coord' within 'coords' (-1 if not present)
 *
 * If multiple matches, returns first
 */
function indexOfCoord(coord, coords) {
    for (const i in coords) {
        if (coordsEqual(coord, coords[i])) {
            return parseInt(i);
        }
    }

    return -1;
}
/**
 * Portion of 'linestring' between startDist and StopDist
 */
function sliceAlong(lineString, startDist, stopDist, units) {
    // Handle proportion unit
    if (units == '%') {
        const fac = lineString.length() / 100.0;
        startDist *= fac;
        stopDist *= fac;
        units = undefined;
    }

    return lineString.sliceAlong(startDist, stopDist, units);
}

/**
 * Coordinate at 'distance' along 'lineString'
 *
 * If optional 'offset' is provided, offset rightwards by that distance
 */
function coordAtDistance(lineString, distance, units = undefined, offset = 0, offsetUnits = units) {
    let len;

    // Handle proportion unit
    if (units == '%') {
        len = lineString.length();
        distance *= len / 100;
        units = undefined;
    }

    if (offsetUnits == '%') {
        if (!len) len = lineString.length();
        offset *= len / 100;
        offsetUnits = undefined;
    }

    // Get point along line
    const coord = lineString.pointAtDistance(distance, units).coordinates;
    if (offset == 0) return coord;

    // Apply offset
    // ENH: Support multi-point linestring
    if (!len) len = lineString.length();
    let vec = Vec(lineString.lastCoord(), lineString.firstCoord());
    vec = vecDiv(vec, len);
    vec = vecRot90(vec);
    vec = vecMult(vec, offset);

    return vecAdd(coord, vec);
}

/*eslint-disable no-unused-vars*/
// Returns unit vector c1 -> v2
function UnitVec(c1, c2) {
    const vec = Vec(c1, c2);
    return vecDiv(vec, vecLen(vec));
}
/*eslint-enable no-unused-vars*/

// Returns vector c1 -> v2
function Vec(c1, c2) {
    return [c1[0] - c2[0], c1[1] - c2[1]];
}

// Returns vec1 + vec2
function vecAdd(vec1, vec2) {
    return [vec1[0] + vec2[0], vec1[1] + vec2[1]];
}

// Returns vec / fac
function vecDiv(vec, fac) {
    return vecMult(vec, 1.0 / fac);
}

// Returns vec * fac
function vecMult(vec, fac) {
    return [vec[0] * fac, vec[1] * fac];
}

// Returns lenght of 'vec'
function vecLen(vec) {
    return Math.sqrt(vec[0] ** 2 + vec[1] ** 2);
}

// Returns vec rotated by 90 degress
function vecRot90(vec) {
    return [vec[1], -vec[0]];
}

// True if coordinates C1 and C2 are equal
function coordsEqual(c1, c2) {
    return c1[0] === c2[0] && c1[1] === c2[1];
}

function allCoordsEqual(coords1, coords2) {
    return _.isEqual(coords1, coords2);
}

/**
 * Split line into two parts at COORD or very close to it if COORD does not lie exactly on the line
 * @param {LineString} line
 * @param {coordinate} coord
 * @returns {LineString}
 */
function geoSplitAtCoord(linestring, coord) {
    const coords = linestring.coordinates;
    const nearestPnt = linestring.pointNearestTo(myw.geometry.point(coord));

    if (dist(nearestPnt.coordinates, coord) > 0.000001) {
        return [undefined, undefined];
    }
    coord = nearestPnt.coordinates;

    const lastVertex = coords.length - 1;

    // Case: Split at start or end
    let iVertex = indexOfCoord(coord, coords);
    if (iVertex === 0) return [linestring, undefined];
    if (iVertex === lastVertex) return [undefined, linestring];

    // Case: Split at vertex
    if (iVertex !== -1) {
        const linestring1 = myw.geometry.lineString(coords.slice(0, iVertex + 1));
        const linestring2 = myw.geometry.lineString(coords.slice(iVertex, lastVertex + 1));
        return [linestring1, linestring2];
    }

    // Case: Split in segment
    iVertex = nearestPnt.index;
    const coords1 = [...coords.slice(0, iVertex + 1), coord];
    const coords2 = [coord, ...coords.slice(iVertex + 1, lastVertex + 1)];
    const linestring1 = myw.geometry.lineString(coords1);
    const linestring2 = myw.geometry.lineString(coords2);
    return [linestring1, linestring2];
}

/**
 * Gets the distance between two coordinate paris
 * @param {array<number>} one First coordinate pair
 * @param {array<number>} two Second coordinate pair
 * @returns Distance between the two coordinates
 */
function dist(one, two) {
    return Math.sqrt(Math.pow(two[0] - one[0], 2) + Math.pow(two[1] - one[1], 2));
}

/**
 * TBR: Copied over from platform geoUtils. Once made available, we need to remove this.
 * @param {*} geomType
 * @param {*} options
 * @param {*} creating
 * @returns
 */
function getEditStyleFor(geomType, options, creating) {
    if (geomType == 'LineString') return getEditStyleForLineString(options, creating);
    else if (geomType == 'Point') return getEditStyleForPoint(options);
    else if (geomType == 'Polygon') return getEditStyleForPolygon(options);
}

function getEditStyleForLineString(options, creating = true) {
    const vertexSquare = new RegularShape({
        points: 4,
        radius: 6.5,
        fill: new Fill({
            color: '#FFFFFF'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: '#666', width: 1 })
    });
    const vertexEndSquare = new RegularShape({
        points: 4,
        radius: 6.5,
        fill: new Fill({
            color: '#FFFFFF'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: 'rgba(128, 0, 0, 0.6)', width: 4 })
    });
    const midPointSquare = new RegularShape({
        points: 4,
        radius: 6,
        fill: new Fill({
            color: 'rgba(255,255,255,0.7)'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: 'rgba(0,0,0,0.7)', width: 0.5 })
    });
    return function () {
        const image = vertexSquare;
        return [
            //Vertex square
            new Style({
                image: image,
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coordinates = feature.getGeometry().getCoordinates();
                    coordinates.pop();
                    return new MultiPoint(coordinates);
                }
            }),
            //Midpoint square
            new Style({
                image: midPointSquare,
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coordinates = [];
                    feature.getGeometry().forEachSegment((first, last) => {
                        const segmentLineString = new LineString([first, last]);
                        const midPoint = segmentLineString.getCoordinateAt(0.5);
                        coordinates.push(midPoint);
                    });
                    return new MultiPoint(coordinates);
                }
            }),
            //Endpoint square
            new Style({
                image: creating ? vertexSquare : vertexEndSquare, //Only indicate which square is the end square when not creating
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coordinate = feature.getGeometry().getLastCoordinate();
                    return new Point(coordinate);
                }
            }),
            //Line style
            new Style({
                stroke: new Stroke({
                    color: options.editableOptions.lineGuideOptions.color,
                    width: 3
                }),
                fill: new Fill({
                    color: options.editableOptions.lineGuideOptions.color
                }),
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coords = feature.getGeometry().getCoordinates();
                    coords.pop();
                    return new LineString(coords);
                }
            }),
            //Dotted Line style (for final segment when drawing)
            new Style({
                stroke: new Stroke({
                    color: options.create.polyline.color,
                    width: creating ? 2 : 3,
                    lineDash: creating ? [5, 5] : null
                }),
                fill: new Fill({
                    color: options.editableOptions.lineGuideOptions.color
                }),
                geometry: function (feature) {
                    if (feature.getGeometry().getType() !== 'LineString') return;
                    const coords = feature.getGeometry().getCoordinates();
                    const finalSegment = [coords[coords.length - 2], coords[coords.length - 1]];
                    return new LineString(finalSegment);
                }
            })
        ];
    };
}

function getEditStyleForPoint(options) {
    const pointOptions = options.create.point;
    const strokeColor = hexToRGBA(pointOptions.color, pointOptions.opacity);
    const width = pointOptions.strokeWidth ?? 4;

    return new Style({
        image: new RegularShape({
            fill: null,
            stroke: new Stroke({ color: strokeColor, width }),
            points: 4,
            radius: 8,
            rotation: Math.PI / 4,
            angle: 0
        })
    });
}

function getEditStyleForPolygon(options) {
    const fillColor = hexToRGBA(options.create.polygon.color, options.create.polygon.fillOpacity);
    const lineColor = hexToRGBA(options.create.polygon.color, options.create.polygon.lineOpacity);
    const vertexSquare = new RegularShape({
        points: 4,
        radius: 6.5,
        fill: new Fill({
            color: '#FFFFFF'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: '#666', width: 1 })
    });
    const midPointSquare = new RegularShape({
        points: 4,
        radius: 6,
        fill: new Fill({
            color: 'rgba(255,255,255,0.7)'
        }),
        angle: Math.PI / 4,
        stroke: new Stroke({ color: 'rgba(0,0,0,0.7)', width: 0.5 })
    });

    return [
        new Style({
            image: vertexSquare,
            geometry: function (feature) {
                if (feature.getGeometry().getType() !== 'Polygon') return;
                const rings = feature.getGeometry().getLinearRings();
                const vertexCoordinates = [];
                rings.forEach(ring => {
                    vertexCoordinates.push(...ring.getCoordinates());
                });
                return new MultiPoint(vertexCoordinates);
            }
        }),
        new Style({
            image: midPointSquare,
            geometry: function (feature) {
                const geom = feature.getGeometry();
                if (!geom || !geom.getLinearRing) return;
                const rings = geom.getLinearRings();
                const midPointCoordinates = [];

                rings.forEach(ring => {
                    const ringCoordinates = ring.getCoordinates();
                    ringCoordinates.forEach((coordinate, index) => {
                        if (index == ringCoordinates.length - 1) return;
                        const segmentLineString = new LineString([
                            coordinate,
                            ringCoordinates[index + 1]
                        ]);
                        const midPoint = segmentLineString.getCoordinateAt(0.5);
                        midPointCoordinates.push(midPoint);
                    });
                });

                return new MultiPoint(midPointCoordinates);
            }
        }),
        new Style({
            stroke: new Stroke({ color: lineColor, width: 3 }),
            fill: new Fill({ color: fillColor })
        })
    ];
}

const isValidHex = hex => /^#([A-Fa-f0-9]{3,4}){1,2}$/.test(hex);

const getChunksFromString = (st, chunkSize) => st.match(new RegExp(`.{${chunkSize}}`, 'g'));

const convertHexUnitTo256 = hexStr => parseInt(hexStr.repeat(2 / hexStr.length), 16);

const getAlphafloat = (a, alpha) => {
    if (typeof a !== 'undefined') {
        return a / 256;
    }
    if (typeof alpha !== 'undefined') {
        if (1 < alpha && alpha <= 100) {
            return alpha / 100;
        }
        if (0 <= alpha && alpha <= 1) {
            return alpha;
        }
    }
    return 1;
};

function hexToRGBA(hex, alpha) {
    if (hex.charAt(0) == 'r') return hex; //given rgba value: dont modify
    if (!isValidHex(hex)) {
        throw new Error('Invalid HEX');
    }
    const chunkSize = Math.floor((hex.length - 1) / 3);
    const hexArr = getChunksFromString(hex.slice(1), chunkSize);
    const [r, g, b, a] = hexArr.map(convertHexUnitTo256);
    return `rgba(${r}, ${g}, ${b}, ${getAlphafloat(a, alpha)})`;
}

export {
    sliceAlong,
    coordAtDistance,
    coordsEqual,
    allCoordsEqual,
    geoSplitAtCoord,
    getEditStyleFor
};
