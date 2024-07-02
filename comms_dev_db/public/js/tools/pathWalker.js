// Copyright: Ubisense Limited 2010-2023
import myw from 'myWorld-client';
import bearing from './geoGeomUtils';

// Engine for finding streetview locations along a specified route
//
// Maintains a current location and heading. Provides 'next()' and 'prev()' functions.
class PathWalker extends myw.MywClass {
    static {
        this.prototype.nominalStepLength = 3;
        this.prototype.maxTurn = 30; // Distance between viewpoints, in metres
    }

    // Create on path 'geom'
    constructor(geom) {
        super();
        myw.geometry.init(); //ENH: Wait for this
        this.geom = geom;

        // Compute total length and number of positions
        this.length = geom.length();
        this.nPos = Math.ceil(this.length / this.nominalStepLength);
        this.stepLength = this.length / this.nPos; // Ensures fits to path

        // Set initial state
        this.heading = 0;
        this.setPos(0);
    } // Maxium angle to turn between views, in degrees

    // Properties
    atStart() {
        return this.pos == 0;
    }

    atEnd() {
        return this.pos == this.nPos;
    }

    // Move to next view on path. Returns false if no more views
    next() {
        if (this.atEnd()) return false;
        this.moveTowards(this.pos + 1);
        return true;
    }

    // Move to previous view on path. Returns false if no more views
    prev() {
        if (this.atStart()) return false;
        this.moveTowards(this.pos - 1);
        return true;
    }

    // Move toward viewpoint 'pos' on path (avoiding oss of context on sharp turns)
    moveTowards(pos) {
        const newHeading = this.headingAt(pos);
        const headingChange = this.wrap(newHeading - this.heading, -180, 180);

        if (Math.abs(headingChange) > this.maxTurn) {
            this.heading += Math.sign(headingChange) * this.maxTurn;
        } else {
            this.setPos(pos);
        }
    }

    // Move to viewpoint 'pos' on path
    setPos(pos) {
        this.pos = pos;
        this.coord = this.coordFor(pos);
        this.geoLocation = { lng: this.coord[0], lat: this.coord[1] }; // ENH: Use myw.LatLng ?
        this.heading = this.headingAt(pos);
    }

    // Heading at viewpoint 'pos'
    headingAt(pos) {
        if (pos >= this.nPos) return this.heading;
        let heading = bearing(this.coordFor(pos), this.coordFor(pos + 1));
        return this.wrap(heading, 0, 360);
    }

    // Coordinate for viewpoint 'pos'
    coordFor(pos) {
        return this.geom.pointAtDistance(pos * this.stepLength).coordinates;
    }

    // Wrap angle into range min <= angle <= max
    wrap(angle, min, max) {
        const rangeSize = max - min;
        while (angle < min) angle += rangeSize;
        while (angle > max) angle -= rangeSize;
        return angle;
    }
}

export default PathWalker;
