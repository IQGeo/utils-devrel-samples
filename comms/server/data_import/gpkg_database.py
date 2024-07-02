import os
from datetime import datetime
from sqlite3 import connect
from pyproj.crs import CRS
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem

from .gpkg_table import GpkgTable


class GpkgDatabase:
    ##
    ## Engine for creating a GeoPackage
    ##

    def __init__(
        self,
        file_name,
        mode="r",
        coord_sys=None,
        canonical=True,
        progress=MywProgressHandler(),
    ):
        ##
        ## Create a new GeoPackage FILE_NAME
        ##
        ## MODE is one:
        ##  'r'   File must exist
        ##  'rw'  Create if doesn't exist
        ##  'w'   Create
        ##  'W'   Create (overwriting if necesary)
        ##
        ## Optional COORD_SYS is the coordinate system for new tables (default: WGS84)
        ## If optional CANONICAL is true, translate field names to lowercase

        self.file_name = file_name
        self.canonical = canonical
        self.coord_sys = coord_sys
        self.progress = progress

        # Set name for progress messages
        self.name = os.path.split(file_name)[-1]

        # Open tables
        self._openDB(mode)
        self._readTableDefs()

        # Determine nominal coordinate system
        # ENH: Warn if multiple .. or None
        if not self.coord_sys:
            for tab in self.tables.values():
                self.coord_sys = tab.coord_sys
                break

        # Set backstop
        if not self.coord_sys:
            self.coord_sys = MywCoordSystem(4326)  # WGS84

    def __ident__(self):
        ##
        ## String to use in progress messages etc
        ##

        return "{}({})".format(self.__class__.__name__, self.name)

    def _openDB(self, mode):
        ##
        ## Open geopackage file
        ##

        file_exists = os.path.exists(self.file_name)

        if mode == "r":
            if not file_exists:
                raise MywError("No such file", ":", self.file_name)

        elif mode == "w":
            if file_exists:
                raise MywError("File already exists", ":", self.file_name)
            self._createDB()

        elif mode == "rw":
            if not file_exists:
                self._createDB()

        elif mode == "W":
            self._createDB()

        else:
            raise MywError("Cannot open", self.file_name, ":", "Bad mode:", mode)

    # ------------------------------------------------------------------------------
    #                                DATABASE CREATION
    # ------------------------------------------------------------------------------

    def _createDB(self, flavor="epsg"):
        ##
        ## Create new empty database (overwriting any existing DB)
        ##
        ## FLAVOR is 'epsg' or 'esri'

        # Remove any exsiting DB
        if os.path.exists(self.file_name):
            os.remove(self.file_name)

        # Create system tables
        self._createSystemTables()

        # Add default coord system catalogue
        self._createCoordSysCatalogue(flavor)

    def setCoordSystem(self, coord_sys):
        ##
        ## Set coordinate system of all self's tables
        ##
        ## Tables assumed empty. Does not transform existing geoms

        with self.progress.operation(self, "Setting coordinate system to:", coord_sys):

            # Add entry in coord system catalog (if necessary)
            self._ensureCoordSystem(coord_sys)

            # Update table defs
            sql = "UPDATE gpkg_geometry_columns SET srs_id={}".format(coord_sys.srid)
            self.executeSql(sql)

            sql = "UPDATE gpkg_contents SET srs_id={}".format(coord_sys.srid)
            self.executeSql(sql)

            # Update cached properties
            self.coord_sys = coord_sys
            for tab in self.tables.values():
                tab.coord_sys = coord_sys

    # ------------------------------------------------------------------------------
    #                                TABLE CREATION
    # ------------------------------------------------------------------------------

    def tableExists(self, name):
        ##
        ## True if self has a feature table NAME
        ##

        return name in self.tables

    def addTable(self, name, fld_descs):
        ##
        ## Create a feature table NAME with fields FLD_DESCS
        ##
        ## Returns a GpkgTable

        tab = GpkgTable(self, name)
        tab.createTable(fld_descs)

        self.tables[name] = tab

        return tab

    def registerTable(self, table_name, geom_fld_desc, coord_sys):
        ##
        ## Add metadata entries for TABLE_NAME
        ##

        self._ensureCoordSystem(coord_sys)
        self._registerGeomColumn(table_name, geom_fld_desc, coord_sys)
        self._registerFeatureTable(table_name, coord_sys)
        self._registerFeatureTableOgr(table_name)
        self._addFeatureTableOgrTriggers(table_name)

    def _registerGeomColumn(
        self, table_name, geom_fld_desc, coord_sys, z_enabled=False, m_enabled=False
    ):
        ##
        ## Add an entry in gpkg_geometry_columns
        ##

        z_enabled = 1 if z_enabled else 0
        m_enabled = 1 if m_enabled else 0

        sql = (
            "INSERT INTO gpkg_geometry_columns (table_name, column_name, geometry_type_name, srs_id, z, m)"
            + "VALUES (?, ?, ?, ?, ?, ?)"
        )

        values = (
            table_name,
            geom_fld_desc.name,
            geom_fld_desc.type,
            coord_sys.srid,
            z_enabled,
            m_enabled,
        )

        self.executeSql(sql, values)

    def _registerFeatureTable(self, table_name, coord_sys, description=""):
        ##
        ## Add an entry in gpkg_contents
        ##

        time_stamp = self._time_now()

        sql = "INSERT INTO gpkg_contents (table_name, data_type, identifier, last_change, srs_id) VALUES (?,?,?,?,?)"
        values = (table_name, "features", table_name, time_stamp, coord_sys.srid)

        self.executeSql(sql, values)

    def _registerFeatureTableOgr(self, table_name):
        ##
        ## Add an entry in gpkg_ogr_contents
        ##

        sql = "INSERT INTO gpkg_ogr_contents (table_name, feature_count) VALUES (?, ?)"
        values = (table_name, 0)

        self.executeSql(sql, values)

    def _addFeatureTableOgrTriggers(self, table_name):
        ##
        ## Adds triggers for TABLE_NAME
        ##

        insert_trigger = (
            "CREATE TRIGGER trigger_insert_feature_count_{0}",
            "AFTER INSERT ON {0}",
            "BEGIN UPDATE gpkg_ogr_contents SET feature_count = feature_count + 1 ",
            "WHERE lower(table_name) = lower('{0}');",
            "END;",
        )

        delete_trigger = (
            "CREATE TRIGGER trigger_delete_feature_count_{0}",
            "AFTER DELETE ON {0}",
            "BEGIN UPDATE gpkg_ogr_contents SET feature_count = feature_count - 1 ",
            "WHERE lower(table_name) = lower('{0}');",
            "END;",
        )

        insert_trigger_sql = " \n".join(insert_trigger).format(table_name)
        delete_trigger_sql = " \n".join(delete_trigger).format(table_name)

        self.executeSql(insert_trigger_sql)
        self.executeSql(delete_trigger_sql)

    def _time_now(self):
        ##
        ## Current time in Geopackage format
        ##

        return datetime.now().strftime("%Y-%m-%dT%H:%M:%S.%fZ")

    # ------------------------------------------------------------------------------
    #                                COORD SYSTEM CATALOGUE
    # ------------------------------------------------------------------------------

    def _ensureCoordSystem(self, coord_sys):
        ##
        ## Add COORD_SYS to the database catalogue (if necessary)
        ##

        if self._coordSystemExists(coord_sys):
            return

        # Get Build definition of coordinate system
        # ENH: Provide Core method MywCoordSystem.wktDef()
        crs = CRS.from_authority("EPSG", coord_sys.srid)

        sql = (
            "INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, "
            + " organization_coordsys_id, definition, description)"
            + " VALUES (?, ?, ?, ?, ?, ?)"
        )

        values = (crs.name, coord_sys.srid, "EPSG", coord_sys.srid, crs.to_wkt(), "")

        self.executeSql(sql, values)

    def _coordSystemExists(self, coord_sys):
        ##
        ## True if COORD_SYS already exists in self's catalogue
        ##

        sql = "SELECT srs_id FROM gpkg_spatial_ref_sys WHERE srs_id = {}".format(
            coord_sys.srid
        )
        res = self.executeSql(sql)

        return len(res) > 0

    # ------------------------------------------------------------------------------
    #                                    DATA ACCESS
    # ------------------------------------------------------------------------------

    def _readTableDefs(self):
        ##
        ## Names of feature tables in self
        ##

        self.tables = {}

        sql = "SELECT table_name,column_name,geometry_type_name,srs_id FROM gpkg_geometry_columns"
        for row in self.executeSql(sql):
            name = row[0]
            gpkg_geom_fld = row[1]
            gpkg_geom_type = row[2]
            srid = row[3]

            self.tables[name] = GpkgTable(self, name).open(srid)

    def featureTypes(self):
        ##
        ## Names of feature tables in self
        ##

        return self.tables.keys()

    def table(self, feature_type):
        ##
        ## The table for FEATURE_TYPE (which must exist)
        ##
        ## Returns a GpkgTable

        return self.tables[feature_type]

    # ------------------------------------------------------------------------------
    #                                   HELPERS
    # ------------------------------------------------------------------------------

    def executeSqlMany(self, sql, values):
        ##
        ## Run SQL on self
        ##
        # TODO: Rename as insertMany ?

        self.progress(8, self, "Running SQL Many:", sql, values)

        with connect(self.file_name, isolation_level="EXCLUSIVE") as conn:
            conn.executemany(sql, values)

    def executeSqls(self, sqls):
        ##
        ## Run SQLS on self
        ##

        with connect(self.file_name) as conn:

            for sql in sqls:
                self.progress(8, self, "Running SQL:", sql)
                conn.execute(sql)

        self.progress(8, "")

    def executeSql(self, sql, values=None):
        ##
        ## Run SQL on self
        ##

        self.progress(8, self, "Running SQL:", sql, values)

        with connect(self.file_name, isolation_level="EXCLUSIVE") as conn:
            if values:
                result = conn.execute(sql, values)
            else:
                result = conn.execute(sql)

            return result.fetchall()

    # ------------------------------------------------------------------------------
    #                                   CREATION SQL
    # ------------------------------------------------------------------------------

    def _createSystemTables(self):
        ##
        ## Create the metadata tables
        ##

        self.executeSql("PRAGMA application_id=0x47504b47")
        self.executeSql("PRAGMA user_version=10200")

        self.executeSql(
            """
            CREATE TABLE gpkg_spatial_ref_sys (
              srs_name TEXT NOT NULL,
              srs_id INTEGER NOT NULL PRIMARY KEY,
              organization TEXT NOT NULL,
              organization_coordsys_id INTEGER NOT NULL,
              definition  TEXT NOT NULL,
              description TEXT)
        """
        )

        self.executeSql(
            """
            CREATE TABLE gpkg_contents (
              table_name TEXT NOT NULL PRIMARY KEY,
              data_type TEXT NOT NULL,
              identifier TEXT UNIQUE,
              description TEXT DEFAULT '',
              last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%S.%fZ','now')),
              min_x DOUBLE,
              min_y DOUBLE,
              max_x DOUBLE,
              max_y DOUBLE,
              srs_id INTEGER,
              CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id))
        """
        )

        self.executeSql(
            """
            CREATE TABLE gpkg_geometry_columns (
              table_name TEXT NOT NULL,
              column_name TEXT NOT NULL,
              geometry_type_name TEXT NOT NULL,
              srs_id INTEGER NOT NULL,
              z TINYINT NOT NULL,
              m TINYINT NOT NULL,
              CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
              CONSTRAINT uk_gc_table_name UNIQUE (table_name),
              CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
              CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id))
        """
        )

        self.executeSql(
            """
            CREATE TABLE gpkg_tile_matrix_set (
              table_name TEXT NOT NULL PRIMARY KEY,
              srs_id INTEGER NOT NULL,
              min_x DOUBLE NOT NULL,
              min_y DOUBLE NOT NULL,
              max_x DOUBLE NOT NULL,
              max_y DOUBLE NOT NULL,
              CONSTRAINT fk_gtms_table_name FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
              CONSTRAINT fk_gtms_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys (srs_id))
        """
        )

        self.executeSql(
            """
            CREATE TABLE gpkg_tile_matrix (
              table_name TEXT NOT NULL,
              zoom_level INTEGER NOT NULL,
              matrix_width INTEGER NOT NULL,
              matrix_height INTEGER NOT NULL,
              tile_width INTEGER NOT NULL,
              tile_height INTEGER NOT NULL,
              pixel_x_size DOUBLE NOT NULL,
              pixel_y_size DOUBLE NOT NULL,
              CONSTRAINT pk_ttm PRIMARY KEY (table_name, zoom_level),
              CONSTRAINT fk_tmm_table_name FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name))
        """
        )

        self.executeSql(
            """
            CREATE TABLE gpkg_extensions (
              table_name TEXT,
              column_name TEXT,
              extension_name TEXT NOT NULL,
              definition TEXT NOT NULL,
              scope TEXT NOT NULL,
              CONSTRAINT ge_tce UNIQUE (table_name, column_name, extension_name))
        """
        )

        self.executeSql(
            """
            CREATE TABLE gpkg_ogr_contents (
              table_name TEXT NOT NULL PRIMARY KEY,
              feature_count INTEGER DEFAULT NULL)
        """
        )

    def _createCoordSysCatalogue(self, flavor):
        ##
        ## Populate the default coord system catalogue
        ##

        EPSG_4326 = 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],UNIT["degree",0.01745329251994328,AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]'

        ESRI_4326 = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'

        # Construct coord system catalogue
        flavor_wgs84_cs = {
            "epsg": ("WGS 84", 4326, "EPSG", 4326, EPSG_4326, ""),
            "esri": ("GCS_WGS_1984", 4326, "EPSG", 4326, ESRI_4326, ""),
        }

        srs_rows = [
            (
                "Undefined Cartesian SRS",
                -1,
                "NONE",
                -1,
                "undefined",
                "undefined cartesian coordinate reference system",
            ),
            (
                "Undefined Geographic SRS",
                0,
                "NONE",
                0,
                "undefined",
                "undefined geographic coordinate reference system",
            ),
            flavor_wgs84_cs[flavor],
        ]

        # Populate coord system catalogue
        # ENH: Use _ensureSRS()
        sql = (
            "INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition, description)"
            + " VALUES (?, ?, ?, ?, ?, ?)"
        )
        self.executeSqlMany(sql, srs_rows)
