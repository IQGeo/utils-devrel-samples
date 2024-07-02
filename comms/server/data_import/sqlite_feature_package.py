import os, sys
from fnmatch import fnmatch
from sqlalchemy import create_engine, MetaData, Table, Column, event
from sqlalchemy.engine import reflection
from sqlalchemy.sql import select
from geoalchemy2 import Geometry

from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_geometry import MywGeometry
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor
from myworldapp.core.server.dd.myw_field_descriptor import MywFieldDescriptor

from myworldapp.modules.comms.server.data_import.feature_package import FeaturePackage


class SqliteFeaturePackage(FeaturePackage):
    """
    A feature package consisting of a Spatialite database.
       1. Geometry field types must be explicit ie POINT,LINESTRING or POLYGON rather than GEOMETRY.
       2. Any table that isn't a metadata table will be read and imported.
    """

    # Tables containing metadata
    spatialite_tables = [
        "ElementaryGeometries",
        "SpatialIndex",
        "geometry_columns",
        "spatial_ref_sys",
        "geometry_columns_auth",
        "geometry_columns_field_infos",
        "geometry_columns_statistics",
        "geometry_columns_time",
        "spatial_ref_sys_aux",
        "spatialite_history",
        "sql_statements_log",
        "sqlite_sequence",
        "views_geometry_columns",
        "views_geometry_columns_auth",
        "views_geometry_columns_field_infos",
        "views_geometry_columns_statistics",
        "virts_geometry_columns",
        "virts_geometry_columns_auth",
        "virts_geometry_columns_field_infos",
        "virts_geometry_columns_statistics",
    ]

    def __init__(self, data_path, file_specs=None, progress=MywProgressHandler()):
        """
        Init slots of self

        FILE_NAME is the path to a spatialite database
        """

        self.file_name = data_path
        self.progress = progress

        # Prevent accidental creation of DB files
        if not os.path.exists(self.file_name):
            raise MywError("No such file:", self.file_name)

        self.progress(8, "Opening database", self.file_name)

        # Open database
        self.sqa_engine = create_engine("sqlite:///" + self.file_name)

        # Set spatialite listener
        @event.listens_for(self.sqa_engine, "connect")
        def connect(dbapi_connection, connection_rec):
            progress(8, "Loading Spatialite extension")
            dbapi_connection.enable_load_extension(True)

            # On Linux we need to load the mod_spatialite we provide in Externals
            # if there is one.
            shared_lib = os.path.join(MywProduct().root_dir, "Externals", "rhel", "shared_lib")
            if sys.platform != "win32" and os.path.isdir(shared_lib):
                lib_path = os.path.join(shared_lib, "mod_spatialite")
            else:
                lib_path = "mod_spatialite"
            sql = "select load_extension('{}')".format(os.path.join(lib_path))
            dbapi_connection.execute(sql)

        # Cache table descriptors
        self.buildTableDescriptors()

    def buildTableDescriptors(self):
        """
        Read geometry columns definitions
        """

        # Read raw table defs
        self.sqa_metadata = MetaData()
        self.sqa_metadata.reflect(self.sqa_engine)

        # Get geometry column defs
        self.sqa_table_descs = self.sqa_metadata.tables  # TODO: HACK
        self.sqa_geom_cols = {}
        for tab_name in self.sqa_metadata.tables:
            self.sqa_geom_cols[tab_name] = {}

        for row in self.recordsOf("geometry_columns"):
            tab_name = row.f_table_name
            fld_name = row.f_geometry_column
            self.sqa_geom_cols[tab_name][fld_name] = row

        # Override table descriptors (declaring geometry columns)
        self.sqa_table_descs = {}
        for sqa_tab_desc in self.sqa_metadata.tables.values():
            tab_name = sqa_tab_desc.name

            sqa_geom_col_descs = []
            for fld_name, col_info in self.sqa_geom_cols[tab_name].items():
                sqa_geom_col = Column(fld_name, Geometry(srid=col_info.srid, management=True))
                sqa_geom_col_descs.append(sqa_geom_col)

            sqa_tab_desc = Table(
                tab_name, self.sqa_metadata, *sqa_geom_col_descs, extend_existing=True
            )
            self.sqa_table_descs[tab_name] = sqa_tab_desc

        # Build metadata
        # TODO: get srs

        # Find feature tables descriptors
        self.sqa_feature_descs = {}
        for tab_name, sqa_tab_desc in self.sqa_metadata.tables.items():
            if not tab_name in self.spatialite_tables:
                self.sqa_feature_descs[tab_name] = sqa_tab_desc

        # Set metadata
        self.metadata = {}
        for row in self.recordsOf("geometry_columns"):
            self.metadata["coord_system"] = row.srid  # ENH: Warn if not all identical

    def featureTypes(self, name_spec="*"):
        """
        The feature types in self
        """

        feature_types = set()

        for tab_name in self.sqa_feature_descs:
            if fnmatch(tab_name, name_spec):
                feature_types.add(tab_name)

        return sorted(feature_types)

    def featureDesc(self, feature_type):
        """
        Properties of FEATURE_TYPE (a MywFeatureDescriptor)
        """

        desc = MywFeatureDescriptor(self.file_name, feature_type)  # TODO: Trim path

        sqa_table_def = self.sqa_metadata.tables[feature_type]
        for sqa_col_desc in sqa_table_def.columns:
            fld_name = sqa_col_desc.name
            fld_type = self.mywTypeFor(feature_type, sqa_col_desc)
            desc.fields[fld_name] = MywFieldDescriptor(fld_name, fld_type)

        return desc

    def mywTypeFor(self, feature_type, sqa_col_desc):
        """
        The myWorld data type for sqlite column SQA_COL_DESC
        """

        geom_cols = self.sqa_geom_cols[feature_type]
        fld_name = sqa_col_desc.name

        # Case: Geometry column
        if fld_name in geom_cols:
            sqa_type = geom_cols[fld_name].geometry_type
            if sqa_type == 1:
                return "point"
            if sqa_type == 2:
                return "linestring"
            if sqa_type == 3:
                return "polygon"
            raise MywError(feature_type, fld_name, "Unknown geometry type:", sqa_type)

        # Case: Normal column
        sqa_name = str(sqa_col_desc.type)  # ENH: use type direct
        if sqa_name == "INTEGER":
            return "integer"
        if sqa_name.startswith("TEXT") or sqa_name.startswith("VARCHAR"):
            return "string"
        if sqa_name in ["REAL", "FLOAT", "NUMERIC"]:
            return "float"
        raise MywError(feature_type, fld_name, "Unknown column type:", sqa_name)

    def features(self, feature_type):
        """
        Yield the features of type FEATURE_TYPE
        """

        ftr_desc = self.featureDesc(feature_type)
        geom_cols = self.sqa_geom_cols[feature_type]

        n_recs = 0
        for raw_rec in self.recordsOf(feature_type):

            # Build record
            rec = {}
            for fld, fld_desc in ftr_desc.fields.items():
                val = raw_rec[fld]

                if fld_desc.isGeometry():
                    val = MywGeometry.newFromWKB(raw_rec[fld])

                rec[fld] = val

            # Set default change type
            # TODO: Copied from file packahe. Is it necessary?
            if not "myw_change_type" in rec:
                rec["myw_change_type"] = "insert"

            yield rec

            n_recs += 1

        self.progress(4, "Read", n_recs, "records", recs=n_recs)

    def recordsOf(self, table_name):
        """
        Yields raw records from TABLE_NAME
        """

        sqa_table_desc = self.sqa_metadata.tables[table_name]

        with self.sqa_engine.connect() as conn:
            query = select(sqa_table_desc.columns)

            for row in conn.execute(query):
                yield row
