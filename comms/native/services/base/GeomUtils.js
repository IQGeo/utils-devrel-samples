import myw from 'myWorld-base';
import _ from 'underscore';

const geomUtils = {
    //@classmethod
    /**
     * Split linestring LINESTRING at COORD (if possible)
     * Returns PARTS (a list of MywLineStrings) (undefined if no split)
     */
    splitAt(linestring, coord) {
        // Split geometry
        const linestrings = this.geoSplitNearCoord(linestring, coord);
        if (linestrings.length <= 1) {
            return undefined;
        }

        // Move coords to exact location
        // ENH: Provide a protocol geoSplitAtCoord()
        const linestring1 = this.setVertex(linestrings[0], -1, coord);
        const linestring2 = this.setVertex(linestrings[1], 0, coord);

        return [linestring1, linestring2];
    },

    /**
     * Split linestring LINESTRING at nearest location to COORD (if possible)
     *
     * Returns list of linestrings
     */
    geoSplitNearCoord(linestring, coord) {
        const coords = linestring.coordinates;
        const nearestPnt = linestring.pointNearestTo(myw.geometry.point(coord));
        coord = nearestPnt.coordinates;

        const lastVertex = coords.length - 1;

        // Case: Split at start or end
        let iVertex = this.indexOfCoord(coord, coords);
        if (iVertex == 0) return [linestring];
        if (iVertex == lastVertex) return [linestring];

        // Case: Split at vertex
        if (iVertex != -1) {
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
    },

    //@classmethod
    /**
     * Vertex number of 'coord' within 'coords' (-1 if not present)
     *
     * If multiple matches, returns first
     */
    indexOfCoord(coord, coords) {
        for (const i in coords) {
            if (this.coordEqual(coord, coords[i])) {
                return parseInt(i);
            }
        }

        return -1;
    },

    //@classmethod
    /**
     * Returns copy of LINESTRING with vertex I_VERTEX set to COORD
     */
    setVertex(linestring, i_vertex, coord) {
        const coords = [...linestring.coordinates];

        if (i_vertex == -1) {
            const coordsLength = linestring.coordinates.length - 1;
            i_vertex = coordsLength;
        }

        coords[i_vertex] = coord;
        return myw.geometry.lineString(coords);
    },

    /**
     * Reverse geometry coordinates
     * @param {geometry} geom
     */
    reverse(geom) {
        const coordinates = [...geom.coordinates];
        coordinates.reverse();
        geom.coordinates = coordinates;
        return { ...geom };
    },

    /**
     * True if geom1 and geom2 are identical (handling null geoms)
     */
    geomCoordsEqual: function (geom1, geom2) {
        if (!geom1 && !geom2) return true;
        if (!geom1 || !geom2) return false;
        if (geom1.type != geom2.type) return false;
        if (geom1.coordinates.length != geom2.coordinates.length) return false;

        for (const i in geom1.coordinates) {
            if (!geomUtils.coordEqual(geom1.coordinates[i], geom2.coordinates[i])) return false;
        }

        return true;
    },

    /**
     * True if coords1 and coords2 are identical else false
     * @param {coordinates} coords1
     * @param {coordinates} coords2
     */
    coordsEqual: function (coords1, coords2) {
        if (coords1.length != coords2.length) return false;

        for (const i in coords1) {
            if (!geomUtils.coordEqual(coords1[i], coords2[i])) return false;
        }

        return true;
    },

    /**
     * True if coord1 and coord2 are identical
     */
    coordEqual: function (coord1, coord2) {
        return coord1[0] == coord2[0] && coord1[1] == coord2[1];
    },

    /**
     * Coordinate on self at position POS
     *
     * POS is position along self (range 0.0 to 1.0)
     */
    coordAtPos: function (line, pos) {
        return line.pointAtDistance(pos * line.length()).coordinates;
    },

    /**
     * Remove duplicate coordinates from array of coordinates
     * @param {array<Coord>} coords An array of coordinate pairs
     * @returns Unique coordinates
     */
    removeDuplicates(coords) {
        let uniqueCoords = [];
        let prev = null;
        coords.forEach(c => {
            if (prev == null || !this.coordEqual(prev, c)) uniqueCoords.push(c);
            prev = c;
        });

        return uniqueCoords;
    },

    /**
     * Gets the distance between two coordinate paris
     * @param {array<number>} one First coordinate pair
     * @param {array<number>} two Second coordinate pair
     * @returns Distance between the two coordinates
     */
    dist: function (one, two) {
        return Math.sqrt(Math.pow(two[0] - one[0], 2) + Math.pow(two[1] - one[1], 2));
    },

    /**
     * Merges a collection of linestrings into a single line string.
     * @param {array<array<coord>>} lines An array of linestring coordinates
     * @returns An array<coord> that represents the merge of the lines
     */
    lineMerge: function (lines) {
        if (!lines || !lines.length) return null;

        let coords = [...lines[0]];
        if (lines.length == 1) return coords;

        // Figure out initial orientation
        // Get the minimum distance from the endpoint of first line to second line
        let min_dist = Math.min(
            this.dist(coords[coords.length - 1], lines[1][0]),
            this.dist(coords[coords.length - 1], lines[1][lines[1].length - 1])
        );

        // If the first point of first line is closer to second line,
        // then we need to reverse the first line
        if (
            this.dist(coords[0], lines[1][0]) < min_dist ||
            this.dist(coords[0], lines[1][lines[1].length - 1]) < min_dist
        ) {
            coords.reverse();
        }

        // For all of the remaining lines, fix orientation and concatenate
        for (let i = 1; i < lines.length; i++) {
            let cur_line = lines[i];
            let dist_start = this.dist(coords[coords.length - 1], cur_line[0]);
            let dist_end = this.dist(coords[coords.length - 1], cur_line[cur_line.length - 1]);

            if (dist_start < dist_end) {
                coords = coords.concat(cur_line);
            } else {
                coords = coords.concat([...cur_line].reverse());
            }
        }

        return coords;
    },

    /**
     *
     * @param {Array<T>} seq
     * @param {Array<T>} old_slice
     * @param {Array<T>} new_slice
     * @returns {Array<T>}
     */
    replaceSlice: function (seq, old_slice, new_slice) {
        const idx = [];
        for (var i = 0; i < seq.length; i++) {
            if (_.isEqual(seq.slice(i, old_slice.length + i), old_slice)) {
                idx.push(i);
            }
        }

        var new_seq = [];
        var prev = 0;
        for (i of idx) {
            new_seq = new_seq.concat(seq.slice(prev, i).concat(new_slice));
            prev = i + old_slice.length;
        }

        new_seq = new_seq.concat(seq.slice(prev, seq.length + prev));

        return new_seq;
    },

    /**
     *  Replace a sequence of coordinates in LINE with those from NEW_PART.
     *  OLD_PART is used to find and orientate the section we want to replace
     *  This version assumes start and end coordinates of subline match those in old_subline and
     *  are present in line. Returns new MywLineString instance.
     * @param {LineString} line
     * @param {Array<coordinate>} old_part
     * @param {Array<coordinate>} new_part
     * @returns {LineString}
     */
    replaceLinestring: function (line, old_part, new_part) {
        const line_coords = line.coordinates;
        const old_coords = [...old_part.coordinates];
        const new_coords = [...new_part.coordinates];

        let new_line_coords = this.replaceSlice(line_coords, old_coords, new_coords);
        old_coords.reverse();
        new_coords.reverse();
        new_line_coords = this.replaceSlice(new_line_coords, old_coords, new_coords);

        return myw.geometry.lineString(new_line_coords);
    },

    /**
     * Split line into two parts at COORD or very close to it if COORD does not lie exactly on the line
     * @param {LineString} line
     * @param {coordinate} coord
     * @returns {LineString}
     */
    geoSplitAtCoord: function (linestring, coord) {
        const coords = linestring.coordinates;
        const nearestPnt = linestring.pointNearestTo(myw.geometry.point(coord));

        if (this.dist(nearestPnt.coordinates, coord) > 0.000001) {
            return [undefined, undefined];
        }
        coord = nearestPnt.coordinates;

        const lastVertex = coords.length - 1;

        // Case: Split at start or end
        let iVertex = this.indexOfCoord(coord, coords);
        if (iVertex == 0) return [linestring, undefined];
        if (iVertex == lastVertex) return [undefined, linestring];

        // Case: Split at vertex
        if (iVertex != -1) {
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
    },

    /**
     * Splits a line at a coordinate and joins the two parts with coordinate or one nearest to it on the line
     * being a coordinate of the line. Handles case where multiple splits are needed.
     * @param {LineString} line
     * @param {coordinate} new_coord
     * @returns {LineString}
     */
    splitLineAt: function (line, new_coord) {
        let coords = line.coordinates;
        const sp = this.geoSplitAtCoord(line, new_coord);
        if (!sp[0] || !sp[1]) {
            return line;
        }
        const coords1 = sp[0].coordinates;
        const coords2 = sp[1].coordinates;

        const coords_middle = [new_coord];
        let coords_left = coords1.length == 0 ? coords1 : coords1.slice(0, coords1.length - 1);
        let coords_right = coords2.length == 0 ? coords2 : coords2.slice(1, coords2.length);

        // To handle case where we split line multiple time
        if (coords_left.length > 1 && coords_left.length < coords.length) {
            let line_left = myw.geometry.lineString(coords_left);
            line_left = this.splitLineAt(line_left, new_coord);
            coords_left = line_left.coordinates;
        }

        if (coords_right.length > 1 && coords_right.length < coords.length) {
            let line_right = myw.geometry.lineString(coords_right);
            line_right = this.splitLineAt(line_right, new_coord);
            coords_right = line_right.coordinates;
        }
        let new_line = myw.geometry.lineString(
            coords_left.concat(coords_middle).concat(coords_right)
        );
        return new_line;
    },

    /**
     * Replace a point on a line or split a line
     * @param {LineString} line
     * @param {coordinate} old_coord
     * @param {coordinate} new_coord
     * @returns {LineString}
     */
    replacePoint: function (line, old_coord, new_coord) {
        let coords = line.coordinates;
        let sp;

        if (!old_coord) {
            return this.splitLineAt(line, new_coord);
        }

        // Simply replace old coordinate with new
        if (this.indexOfCoord(old_coord, coords) != -1) {
            coords = _.map(coords, x => {
                if (this.coordEqual(x, old_coord)) {
                    return new_coord;
                } else {
                    return x;
                }
            });
            return myw.geometry.lineString(coords);
        }

        // This is the slow path
        // We will get here if we are splitting a route for example
        sp = this.geoSplitAtCoord(line, old_coord);

        let coords1, coords2;

        if (!sp[0] && !sp[1]) {
            sp = this.geoSplitAtCoord(line, new_coord);
            // We need to do this for case when spliting route and the sp1/sp2 begin and
            // end not with new_coord but something very close
            coords1 = sp[0] ? sp[0].slice(0, sp[0].length - 1) : [];
            coords2 = sp[1] ? sp[1].slice(1, sp[1].length - 1) : [];
            if (!sp[0] && !sp[1]) return line;
        } else {
            coords1 = sp[0] ? sp[0].coordinates : [];
            coords2 = sp[1] ? sp[1].coordinates : [];
        }

        const coords_middle = [new_coord];
        let coords_left =
            coords1.length == 0 || coords1[-1] != old_coord
                ? coords1
                : coords1.slice(0, coords1.length - 1);
        let coords_right =
            coords2.length == 0 || coords2[0] != old_coord
                ? coords2
                : coords2.slice(1, coords2.length);

        // To handle case where old_coord appears more than once
        if (coords_left.length > 1 && coords_left.length < coords.length) {
            let line_left = myw.geometry.lineString(coords_left);
            line_left = this.replacePoint(line_left, old_coord, new_coord);
            coords_left = line_left.coordinates;
        }

        if (coords_right.length > 1 && coords_right.length < coords.length) {
            let line_right = myw.geometry.lineString(coords_right);
            line_right = this.replacePoint(line_right, old_coord, new_coord);
            coords_right = line_right.coordinates;
        }
        let new_line = myw.geometry.lineString(
            coords_left.concat(coords_middle).concat(coords_right)
        );

        return new_line;
    }
};

export default geomUtils;
