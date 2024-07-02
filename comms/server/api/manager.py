# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler

from myworldapp.modules.comms.server.base.geom_utils import GeomUtils


class Manager:
    """
    Superclass for NM managers

    Provides helpers for geometic operations and feature manipulation
    """

    @classmethod
    def registerTriggers(self, NetworkView):
        """
        Register self's trigger methods on NETWORKVIEW
        """
        # Backstop implementation

        pass

    # -----------------------------------------------------------------------
    #                                 INITIALISATION
    # -----------------------------------------------------------------------

    def __init__(self, nw_view, progress=MywProgressHandler()):
        """
        Init slots of self

        NW_VIEW is a NetworkView"""

        self.nw_view = nw_view
        self.db_view = nw_view.db_view
        self.db = nw_view.db_view.db
        self._progress = progress

    def progress(self, level, *args, **kwargs):
        """
        Report progress (with tag)
        """

        # ENH: Find a cleaner way
        self._progress(level, self.__class__.__name__, ":", *args, **kwargs)

    # -----------------------------------------------------------------------
    #                           SPECS AND CONTAINMENT
    # -----------------------------------------------------------------------

    def setHousing(self, rec, housing):
        """
        Set the housing of REC to HOUSING
        """

        self.progress(2, "Setting", rec, "housing to", housing)

        rec.housing = housing._urn()
        rec.root_housing = self.rootHousingUrn(housing)

        # Get from housing, taking direction into accound
        geom = self.derivedGeomFor(rec, housing)

        # Set it
        rec._primary_geom_field.set(geom)
        self.update(rec)

    def rootHousingUrn(self, housing):
        """
        The URN of the root housing of HOUSING (an equip, route, struct, etc)
        """

        if "root_housing" in housing._descriptor.fields:
            return housing.root_housing

        return housing._urn()

    def rootHousing(self, housing):
        """
        Returns the top level container of HOUSING (which may be HOUSING itself)
        """

        if "root_housing" in housing._descriptor.fields:
            return housing._field("root_housing").rec()

        return housing

    def derivedGeomFor(self, rec, housing):
        """
        Returns geometry REC, derived from HOUSING

        REC is a conduuit, cable segment or circuit segment.
        HOUSING is a route, conduit or structure"""

        housing_geom = housing._primary_geom_field.geom()

        if self.isForward(rec) == self.isForward(housing):
            return housing_geom
        else:
            return GeomUtils.reverse(housing_geom)

    def derivedPropsFor(self, rec, housing):
        """
        Returns in/out structures for REC, derived from HOUSING

        REC is a conduuit, cable segment or circuit segment.
        HOUSING is a route or conduit"""

        derived_props = {}

        if self.isForward(rec) == self.isForward(housing):
            derived_props["in_structure"] = housing.in_structure
            derived_props["out_structure"] = housing.out_structure
        else:
            derived_props["in_structure"] = housing.out_structure
            derived_props["out_structure"] = housing.in_structure

        return derived_props

    def isForward(self, rec):
        """
        True if REC runs in the same direction as its root housing

        REC is a conduit, cable segment, circuit segment, route, etc"""

        if "forward" in rec._descriptor.fields:
            return rec.forward

        return True

    # -----------------------------------------------------------------------
    #                               FEATURE HELPERS
    # -----------------------------------------------------------------------

    def featuresAt(self, coord, feature_types, limit=None, tolerance=None):
        """
        The features of type FEATURE_TYPES at COORD
        """

        if tolerance == None:
            tolerance = 0.00001  # in metres TBR: (workaround for Core bug 15606)

        # Find features
        geom = MywPoint(coord)
        recs = []
        for feature_type in feature_types:

            tab = self.db_view.table(feature_type)
            pred = tab.field(tab.descriptor.primary_geom_name).geomWithinDist(geom, tolerance)

            for rec in tab.filter(pred):
                recs.append(rec)
                if limit and len(recs) > limit:
                    break

        return recs

    def insertCopy(self, rec, triggers=False, **props):
        """
        Insert a copy of REC, overriding property PROPs
        """

        tab = self.db_view.table(rec.feature_type)

        new_rec = tab._new_detached()

        # Do not copy name and circuit properties
        skip_fields = ["name", "circuits"]

        for fld, fld_desc in rec._descriptor.storedFields().items():
            if not fld_desc.key and fld not in skip_fields:
                new_rec[fld] = rec[fld]

        for prop, val in props.items():
            new_rec[prop] = val

        new_rec = self.insertRecord(new_rec, triggers=triggers)

        return new_rec

    def insertRecord(self, rec, triggers=False):
        """
        Insert record

        If triggers then will run pre and post insert triggers"""

        self.progress(8, "Inserting feature", rec)

        table = self.db_view.table(rec.feature_type)

        if triggers:
            self.nw_view.runPreInsertTriggers(rec)

        rec = table.insert(rec)
        self.db_view.session.flush()  # Find errors early

        if triggers:
            self.nw_view.runPosInsertTriggers(rec)

        return rec

    def update(self, rec):
        """
        Update feature record REC in database
        """
        # ENH: Provide core protocol rec.update()

        self.progress(8, "Updating feature", rec)

        # ENH: Fix use of detached records in circuit manager and use rec._view here
        return self.db_view.table(rec.feature_type).update(rec)

    def deleteRecord(self, rec):
        """
        Delete REC
        """

        self.progress(8, "Deleting feature", rec)

        rec._view.table(rec.feature_type).delete(rec)

    # -----------------------------------------------------------------------
    #                                  MISC
    # -----------------------------------------------------------------------

    def functionOf(self, equip):
        """
        Returns the configured function of EQUIP
        """
        # ENH: Move to nw_view

        return self.nw_view.equips.get(equip.feature_type, {}).get("function")

    def fixupLineStringCoords(self, coords):
        """
        Update COORDS to a form suitable for creating a database linestring from

        Returns a list of coords or None"""
        # Prevents creation of GeometryCollection geoms in database .. which server then won't read

        # ENH: Move to geom utils
        # ENH: Take a linestring, not coords

        if not coords:
            return None

        # Linestring coords should have at least length of 2 - so duplicate coord
        if len(coords) == 1:
            coords = [coords[0], coords[0]]

        return coords
