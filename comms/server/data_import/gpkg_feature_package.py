import os, io, base64
from fnmatch import fnmatch
from sqlalchemy import create_engine, MetaData, Table, Column
from sqlalchemy import types as sqa_types
from sqlalchemy.engine import reflection
from sqlalchemy.sql import select
from geoalchemy2 import Geometry

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_geometry import MywGeometry
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor
from myworldapp.core.server.dd.myw_field_descriptor import MywFieldDescriptor

from .feature_package import FeaturePackage
from .gpkg_database import GpkgDatabase


class GpkgFeaturePackage(FeaturePackage):
    ##
    ## A feature package consisting of a geo-package database
    ##

    def __init__(
        self, file_name, file_specs=None, canonical=True, progress=MywProgressHandler()
    ):
        ##
        ## Init slots of self
        ##
        ## FILE_NAME is the path to sqlite file
        ##
        ## If optional CANONICALISE is false, suppress maping of field names to lowercase

        self.file_name = file_name
        self.progress = progress

        # Open database
        self.db = GpkgDatabase(
            file_name, "r", canonical=canonical, progress=self.progress
        )

        self.metadata = {"coord_system": self.db.coord_sys.srid}

    def __ident__(self):
        ##
        ## String for progress messages etc
        ##

        return "{}({})".format(self.__class__.__name__, self.file_name)

    def featureTypes(self, name_spec="*"):
        ##
        ## The feature types in self
        ##

        feature_types = set()

        for tab_name in self.db.tables:
            if fnmatch(tab_name, name_spec):
                feature_types.add(tab_name)

        self.progress(8, "Found", feature_types)
        return sorted(feature_types)

    def featureDesc(self, feature_type):
        ##
        ## Properties of FEATURE_TYPE (a MywFeatureDescriptor)
        ##

        return self.db.table(feature_type).descriptor()

    def features(self, feature_type):
        ##
        ## Yield the features of type FEATURE_TYPE
        ##

        tab = self.db.table(feature_type)
        geom_fld = tab.descriptor().primary_geom_field.name

        n_recs = 0
        for rec in tab.getRecs():

            # ENH: Change feature packages to yield geoms
            if rec[geom_fld]:
                rec[geom_fld] = rec[geom_fld].wkt

            yield rec
            n_recs += 1

        self.progress(4, "Read", n_recs, "records", recs=n_recs)
