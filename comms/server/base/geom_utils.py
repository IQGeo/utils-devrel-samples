import math
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_vector import MywVector


class GeomUtils:
    """
    Singleton providing geometry helpers
    """

    # ENH: Replace these by methods on MywLineString

    # Used to detect 'nearly' coincident points
    tolerance = 0.000001

    @classmethod
    def splitAt(self, linestring, coord):
        """
        Split linestring LINESTRING at COORD (if possible)
        """

        # Split geometry
        linestrings = linestring.geoSplitNearCoord(coord)
        if len(linestrings) < 1:
            return None

        # remove coincident or nearly coincident coords from linestrings
        linestrings = list(map(lambda ls: ls.simplify(self.tolerance), linestrings))

        # Move coords to exact location
        # ENH: Provide a protocol geoSplitAtCoord()
        linestring1 = self.setVertex(linestrings[0], -1, coord)
        linestring2 = self.setVertex(linestrings[1], 0, coord)

        return (linestring1, linestring2)

    @classmethod
    def setVertex(self, linestring, i_vertex, coord):
        """
        Returns copy of LINESTRING with vertex I_VERTEX set to COORD
        """

        coords = list(linestring.coords)
        coords[i_vertex] = coord
        return MywLineString(coords)

    @classmethod
    def reverse(self, linestring):
        """
        Returns a copy of linestring LINESTRING with direction reversed
        """
        # ENH: Implement MywGeomUtils.reversed()

        return MywLineString(linestring.coords[::-1])

    @classmethod
    def coordsEqual(self, linestring1, linestring2):
        """
        True if the coordinates of LINESTRING1 and LINESTRING2 are identical
        """

        if linestring1 is None or linestring2 is None:
            return False

        coords1 = list(linestring1.coords)
        coords2 = list(linestring2.coords)

        return coords1 == coords2

    @classmethod
    def removeDuplicates(self, coords):
        """
        Remove duplicate coordinates from coordinates of linestring
        """

        coords = list(coords)
        uniqueCoords = []
        prev = None

        for c in coords:
            if not prev or c != prev:
                uniqueCoords.append(c)

            prev = c

        return uniqueCoords

    @classmethod
    def dist(self, one, two):
        """Returns cartesian distance between two coords"""
        return math.sqrt(math.pow((two[0] - one[0]), 2) + math.pow((two[1] - one[1]), 2))

    @classmethod
    def lineMerge(self, lines):
        """Takes a list of array<coords> and glues the lines together"""
        if not lines or not len(lines):
            return None

        coords = lines[0].copy()

        if len(lines) == 1:
            return coords

        # Figure out initial orientation
        # Get the minimum distance from the endpoint of first line to second line
        min_dist = min(self.dist(coords[-1], lines[1][0]), self.dist(coords[-1], lines[1][-1]))

        # If the first point of first line is closer to second line,
        # then we need to reverse the first line
        if (
            self.dist(coords[0], lines[1][0]) < min_dist
            or self.dist(coords[0], lines[1][-1]) < min_dist
        ):
            coords.reverse()

        # For all of the remaining lines, fix orientation and concatenate
        for i in range(1, len(lines)):
            cur_line = lines[i]
            if self.dist(coords[-1], cur_line[0]) < self.dist(coords[-1], cur_line[-1]):
                coords += cur_line
            else:
                coords += list(reversed(cur_line))

        return coords

    @classmethod
    def replaceSlice(self, seq, old, new):
        """
        Replace in a list SEQ the subsequence OLD with NEW
        """

        i1 = [x for x in range(len(seq)) if seq[x : x + len(old)] == old]

        new_seq = []
        prev = 0
        for i in i1:
            new_seq += seq[prev:i] + new
            prev = i + len(old)
        new_seq += seq[prev:]

        return new_seq

    @classmethod
    def replaceLinestring(self, line, old_part, new_part):
        """
        Replace a sequence of coordinates in LINE with those from NEW_PART.
        OLD_PART is used to find and orientate the section we want to replace
        This version assumes start and end coordinates of subline match those in old_subline and
        are present in line. Returns new MywLineString instance.
        """

        line_coords = list(line.coords)
        new_coords = list(new_part.coords)
        old_coords = list(old_part.coords)

        new_line_coords = self.replaceSlice(line_coords, old_coords, new_coords)
        new_line_coords = self.replaceSlice(
            new_line_coords, list(reversed(old_coords)), list(reversed(new_coords))
        )

        return MywLineString(new_line_coords)

    @classmethod
    def geoSplitAtCoord(self, line, coord):
        """
        Splits line string at coord where coord is on or very close to line.
        Returns (None,None) if coord is too far from line.
        """

        if coord == line.start_point.coord:
            return (None, line)
        elif coord == line.end_point.coord:
            return (line, None)
        else:
            loc = line.geoLocNear(coord)
            dist = MywVector.between(loc.coord, coord).length()

            if dist > self.tolerance:
                return (None, None)
            else:
                ret = line.geoSplitAtLoc(loc)
                if ret:
                    return ret
                else:
                    return (None, None)

    @classmethod
    def replacePoint(self, line, old_coord, new_coord):
        """
        Update LINE to pass through NEW_COORD. Handles a number of cases:
            1. OLD_COORD is set and is one of the points in the coords of the line. Replace OLD_COORD occurences with NEW_COORD
            2. OLD_COORD is set and falls on the line. Split the line and join with NEW_COORD between.
            3. OLD_COORD is set and is not on the line. Can occur when moving a struct onto the line. Split the route with NEW_COORD
            4. OLD_COORD is not set. Can occur when splitting route with new struct. Split the route with NEW_COORD

            For last 3 cases we need to recurse on left and right sides of the split.
        """

        # NOTE: The below doesn't follow exactly the cases given above as there is some
        # overlap in code.

        coords = list(line.coords)

        # Case 1. Simply replace old coordinate with new
        if old_coord and old_coord in coords:
            coords = [x if x != old_coord else new_coord for x in coords]
            new_line = MywLineString(coords)
            return new_line

        # Case 4. If old_coord is not specified, we split the line string with new coordinate to get a value for old.
        # We don't use the two halfs as the final line as the split might not be precise.
        if not old_coord:
            (sp1, sp2) = self.geoSplitAtCoord(line, new_coord)
            # ENH Not sure if this will ever happen.
            if not sp1 and not sp2:
                return line
            old_coord = sp1.end_point.coord if sp1 else sp2.start_point.coord
        else:
            # This is the slow path.
            # old_coord might still be on the line, but not one of its coords,
            # or we are moving a struct onto the line
            (sp1, sp2) = self.geoSplitAtCoord(line, old_coord)

        # Case 3 - old_coord wasn't on line so we are splitting the route with new_coord
        if sp1 == None and sp2 == None:
            (sp1, sp2) = self.geoSplitAtCoord(line, new_coord)
            coords1 = sp1.coords[:-1] if sp1 else []
            coords2 = sp2.coords[1:] if sp2 else []
            if sp1 == None and sp2 == None:
                return line
        else:
            # Case 2 - old_coord on the line
            coords1 = list(sp1.coords) if sp1 else []
            coords2 = list(sp2.coords) if sp2 else []

        # Cases 2-4 Recurse on the two parts and join them together
        coords_middle = [new_coord]
        coords_left = coords1 if len(coords1) == 0 or coords1[-1] != old_coord else coords1[:-1]
        coords_right = coords2 if len(coords2) == 0 or coords2[0] != old_coord else coords2[1:]

        # To handle case where old_coord appears more than once, we need
        # to replace point in left and right parts
        if len(coords_left) > 1 and len(coords_left) < len(coords):
            line_left = MywLineString(coords_left)
            line_left = self.replacePoint(line_left, old_coord, new_coord)
            coords_left = list(line_left.coords)

        if len(coords_right) > 1 and len(coords_right) < len(coords):
            line_right = MywLineString(coords_right)
            line_right = self.replacePoint(line_right, old_coord, new_coord)
            coords_right = list(line_right.coords)

        new_line = MywLineString(coords_left + coords_middle + coords_right)

        return new_line
