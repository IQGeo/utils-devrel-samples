// Geometry utilities
// ENH: Replace by sensible implementation in core
import myw from 'myWorld-client';
// Returns union of lineGeoms (or null if not a connected string)
const unionLineStrings = function (lineGeoms) {
    //TODO: destroys lineGeoms!

    // Join coords
    let coords = [];
    while (lineGeoms.length > 0) {
        coords = extendPath(coords, lineGeoms);
        if (!coords) return null;
    }

    // Build geometry
    return myw.geometry.lineString(coords);
};

const extendPath = function (coords, lineGeoms) {
    for (let i = 0; i < lineGeoms.length; i++) {
        const geomCoords = lineGeoms[i].coordinates;
        if (coords.length == 0) {
            lineGeoms.splice(i, 1);
            return joinPath(coords, geomCoords);
        }
        if (coordsEqual(coords[coords.length - 1], geomCoords[0])) {
            lineGeoms.splice(i, 1);
            return joinPath(coords, geomCoords);
        }
        if (coordsEqual(coords[0], geomCoords[geomCoords.length - 1])) {
            lineGeoms.splice(i, 1);
            return joinPath(geomCoords, coords);
        }
        if (coordsEqual(coords[0], geomCoords[0])) {
            lineGeoms.splice(i, 1);
            return joinPath(geomCoords, coords.reverse());
        }
        if (coordsEqual(coords[coords.length - 1], geomCoords[geomCoords.length - 1])) {
            lineGeoms.splice(i, 1);
            return joinPath(coords.reverse(), geomCoords.reverse());
        }
    }
    return null;
};

// Union two paths
// ENH: Implement LineString.append()
const joinPath = function (coords1, coords2) {
    const coords = [];
    coords1.forEach(coord => {
        if (!coords || coord != coords[coords.length]) coords.push(coord);
    });
    coords2.forEach(coord => {
        if (!coords || coord != coords[coords.length]) coords.push(coord);
    });
    return coords;
};

// Compare two coords
const coordsEqual = function (coord1, coord2) {
    return coord1[0] == coord2[0] && coord1[1] == coord2[1];
};

export default unionLineStrings;
