// Copyright: IQGeo Limited 2010-2023

import { TraceNode } from 'myWorld-native-services';
import geomUtils from '../base/GeomUtils';
import { geometry } from 'myWorld-client';

class AStarTraceNode extends TraceNode {
    /**
     * Trace node for use with A* algorithm
     */

    /**
     * Comparison operator (used in heap operations)
     */
    // Subclassed to support ordering by distance to stop nodes (part of the A* algorithm implementation)
    cmp(other) {
        if (this.minPossibleDist !== undefined) {
            return this.minPossibleDist - other.minPossibleDist;
        }

        return this.dist - other.dist;
    }

    /**
     * Distance from self to nearest vertex on GEOMS, in m (0.0 if not known)
     *
     * GEOMS is a set of shapely geometries
     */
    minDistanceTo(geoms) {
        const self_coord = this._stop_coord();

        if (!self_coord) {
            return 0.0;
        }

        const p1 = geometry.point(self_coord);

        let min_dist = undefined;
        for (const geom of geoms) {
            const dist = p1.distanceTo(geom);

            if (min_dist == undefined || min_dist > dist) {
                min_dist = dist;
            }
        }

        return min_dist;
    }

    /**
     * Position on self's feature at which self ends
     */
    _stop_coord() {
        if (!this.parent)
            // ENH: Do better if root node
            return undefined;

        const geom = this.feature.geometry;
        if (geom.type == 'Point') {
            return geom.coordinates;
        }

        // Find position of stop point along feature (as proportion of total length)
        // Remember: dist may have been computed from a stored length value
        let pos;
        if (this.partial) {
            pos = (this.dist - this.parent.dist) / (this.full_dist - this.parent.dist);
        } else {
            pos = 1.0;
        }

        if (!this.isForward(geom)) {
            pos = 1.0 - pos;
        }

        return geomUtils.coordAtPos(geom, pos);
    }
}

export default AStarTraceNode;
