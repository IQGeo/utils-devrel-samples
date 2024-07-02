// Utilities for Geodetic computations
// TODO: Duplicated from streetview plugin
// ENH: Use Turf instead?
import myw from 'myWorld-client';

const distance = function (p1, p2) {
    // Returns 'true' distance between two points in m (assuming earth spherical)
    var R = 6378137; // earth's mean radius in m
    var dLat = myw.Util.toRadians(p2[1] - p1[1]);
    var dLong = myw.Util.toRadians(p2[0] - p1[0]);

    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(myw.Util.toRadians(p1[1])) *
            Math.cos(myw.Util.toRadians(p2[1])) *
            Math.sin(dLong / 2) *
            Math.sin(dLong / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c;

    return d.toFixed(3);
};

const bearing = function (p1, p2) {
    // Returns 'true' bearing from p1 to p2, in degrees clockwise from north
    var p3 = [0, 0];
    var x = distance(p1, p3);
    var y = distance(p2, p3);
    if (p1[0] > p2[0]) {
        x = -x;
    }
    if (p1[1] > p2[1]) {
        y = -y;
    }

    var bearingRad = Math.atan2(x, y);
    return myw.Util.toDegrees(bearingRad);
};

export default bearing;
