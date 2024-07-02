import base64
from struct import pack
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.geom.myw_geometry import MywGeometry
from myworldapp.core.server.base.geom.myw_coord_system import MywCoordSystem
from myworldapp.core.server.dd.myw_feature_descriptor import MywFeatureDescriptor

from myworldapp.modules.comms.server.base.coord_system_utils import CoordSystemUtils

from .gpkg_field_desc import GpkgFieldDesc


class GpkgTable:
    ##
    ## A table in a GeoPackage database
    ##
    ## Can be used like a MywFeatureOStream
    ##
    ## Handles the business of mapping from canoncalised field names to DB names

    def __init__(self, gpkg_db, name):
        ##
        ## Init slots of self
        ##
        ## GPKG_DB is a GpkgDatabase
        ##

        self.db = gpkg_db
        self.name = name
        self.progress = gpkg_db.progress

        self.canonicalise = self.db.canonical

    def __ident__(self):
        ##
        ## String to use in progress messages etc
        ##

        return "{}({})".format(self.__class__.__name__, self.name)

    # --------------------------------------------------------------------------------
    #                                    CREATION
    # --------------------------------------------------------------------------------

    def createTable(self, fld_descs):
        ##
        ## Create table in database
        ##
        ## GPKG_DB is a GpkgDatabase. FLD_DESCS is a dict of MywFieldDescriptors

        # Check for already present
        if self.db.tableExists(self.name):
            raise MywError(self.db, "Table already exists:", self.name)

        # Build field descriptors
        gpkg_fld_descs = {}
        primary_geom_name = None

        for fld, fld_desc in fld_descs.items():
            if fld_desc.isGeometry():
                if not primary_geom_name:
                    self.progress(9, self.name, ":", "Found geometry field", fld)
                    primary_geom_name = fld
                else:
                    self.progress(
                        "warning",
                        self.name,
                        ":",
                        "Skipping secondary geometry field",
                        fld,
                    )  # ENH: Handle as WKT string
                    continue

            gpkg_type = self._gpkgTypeFor(fld_desc)
            gpkg_fld_descs[fld] = GpkgFieldDesc(fld, gpkg_type)

        # Hack to allow export of geometryless tables
        # ENH: Create as Geopackage attribute tables instead
        if not primary_geom_name:
            fld = "dummy_geometry"
            self.progress("warning", self.name, "Adding dummy column:", fld)
            gpkg_fld_descs[fld] = GpkgFieldDesc(fld, "POINT")
            primary_geom_name = fld

        # Show what we are about to do
        self.progress(8, "Adding table", self.name)
        for fld, gpkg_fld_desc in gpkg_fld_descs.items():
            self.progress(9, "   ", "field", fld, ":", gpkg_fld_desc)

        # Create table and metadata
        self._createDbTable(gpkg_fld_descs, primary_geom_name)
        self.db.registerTable(
            self.name, gpkg_fld_descs[primary_geom_name], self.db.coord_sys
        )

        # Open table
        self.open(self.db.coord_sys.srid)

    def _createDbTable(self, gpkg_fld_descs, primary_geom_name):
        ##
        ## Add table to database
        ##

        # Build field defs clause
        field_names = [desc.sqlRepr() for desc in gpkg_fld_descs.values()]
        cols_str = "," + ", ".join(field_names)

        # Create table
        # ENH: Make _row_id optional?
        create_table_sql = (
            "CREATE TABLE {} ("
            "_row_id INTEGER not null primary key autoincrement "
            "{})"
        )
        sql = create_table_sql.format(self.name, cols_str)

        self.executeSql(sql)

    # --------------------------------------------------------------------------------
    #                                     CONNECTION
    # --------------------------------------------------------------------------------

    def open(self, srid):
        ##
        ## Init basic metadata
        ##
        # Fix gpkg_database to use SRID direct and remove this

        self.coord_sys = CoordSystemUtils.coordSystem(srid)
        return self

    def _connect(self):
        ##
        ## Get field descriptors etc
        ##
        # Done lazily to avoid excessive SQL calls when DB is opened

        # Check for already done
        if hasattr(self, "gpkg_fields"):
            return

        # Get geopackage props (slow)
        self.gpkg_fields = self._gpkgFieldDescs()

        # Build mapping canonical field name -> geopackage field descriptor
        self.fields = {}
        for gpkg_fld_desc in self.gpkg_fields:
            gpkg_fld = gpkg_fld_desc.name

            # Map names (if requested)
            fld = gpkg_fld
            if self.canonicalise:
                fld = fld.lower()
                if fld == "geometries":  # ENH: Hack for compatibility with ogr streams
                    fld = "geometry"
            self.fields[fld] = gpkg_fld_desc

            # Find special fields
            if gpkg_fld_desc.key:
                self.key_fld = fld

            if gpkg_fld_desc.is_geom:  # ENH: Get from metadata
                self.geom_fld = fld
                self.progress(8, "Found geom field:", fld)

        # Build field list for SQL
        gpkg_fld_names = map(lambda f: '"{}"'.format(f.name), self.gpkg_fields)
        self.gpkg_flds_sql = ",".join(gpkg_fld_names)

        # Show what we found
        self.progress(
            8,
            self.db,
            "Opened Table",
            self.name,
            "geom=",
            self.geom_fld,
            self.coord_sys,
        )
        for desc in self.fields.values():
            self.progress(9, self.db, "   ", desc)

    def _gpkgFieldDescs(self):
        ##
        ## Read field descriptors of self from Geopackage metadata
        ##
        # ENH: Return a list of GpkgFieldDescs

        sql = "PRAGMA table_info({})".format(self.name)
        res = self.executeSql(sql)

        gpkg_fld_descs = []
        for cid, name, data_type, non_null, dflt_value, pk in res:
            size = None

            if data_type.startswith("TEXT") and len(data_type) > 4:
                len_str = data_type[4:]
                if len_str.startswith("(") and len_str.endswith(")"):
                    len_str = len_str[1:-1]
                size = int(len_str)
                data_type = "TEXT"

            gpkg_fld_descs.append(
                GpkgFieldDesc(name, data_type, size=size, key=(pk == 1))
            )

        return gpkg_fld_descs

    # --------------------------------------------------------------------------------
    #                                    OPERATIONS
    # --------------------------------------------------------------------------------

    def descriptor(self):
        ##
        ## Descriptor for self (a MywFeatureDescriptor)
        ##

        self._connect()

        desc = MywFeatureDescriptor(self.db.file_name, self.name)  # ENH: Trim path

        for fld, gpkg_fld_desc in self.fields.items():
            if self.canonicalise:
                fld_type = self.mywTypeFor(gpkg_fld_desc)
            else:
                fld_type = gpkg_fld_desc.type

            is_key = fld == self.key_fld
            desc.addField(fld, fld_type, key=is_key)

        return desc

    def getRec(self, id, coord_sys=None):
        ##
        ## Get record with key ID
        ##
        ## Returns a dict (or None). COORD_SYS is the coordinate system to yield geometry in

        self._connect()

        self.progress(8, self, "getRec", id)

        # Run query
        gpkg_key_fld = self.fields[self.key_fld].name
        sql = "SELECT {} FROM {} WHERE {}={}".format(
            self.gpkg_flds_sql, self.name, gpkg_key_fld, id
        )  # ENH: use params
        rows = self.executeSql(sql)

        if not rows:
            return None
        row = rows[0]  # ENH: Check for multiple

        # Build record
        return self._recFrom(row, coord_sys)

    def getRecs(self, coord_sys=None, offset=None, limit=None):
        ##
        ## Get record with key ID
        ##
        ## Returns a dict (or None). COORD_SYS is the coordinate system to yield geometry in

        self._connect()

        self.progress(8, self, "getRecs")

        # Run query
        sql = "SELECT {} FROM {}".format(
            self.gpkg_flds_sql, self.name
        )  # ENH: use params
        if limit:
            sql += " LIMIT {}".format(limit)
        if offset:
            sql += " OFFSET {}".format(offset)
        rows = self.executeSql(sql)

        for row in rows:
            rec = self._recFrom(row, coord_sys)
            yield rec

    def insertRec(self, rec, coord_sys=MywCoordSystem(4326)):
        ##
        ## Add REC to database
        ##
        ## REC is a dict. COORD_SYS is the coordinate system of its geometry
        ##
        ## Returns ID of record inserted

        self.insertRecs([rec], coord_sys)

        gpkg_key_fld = self.fields[self.key_fld].name
        sql = "SELECT MAX({}) FROM {}".format(
            gpkg_key_fld, self.name
        )  # ENH: Find a better way?
        res = self.executeSql(sql)

        return res[0][0]

    def insertRecs(self, recs, coord_sys=MywCoordSystem(4326)):
        ##
        ## Add RECS to database
        ##
        ## RECS is a list of dicts. COORD_SYS is the coordinate system of input geometries

        self._connect()

        # Build data as vectors
        rows = []
        for rec in recs:
            rows.append(
                self._rowFrom(rec, coord_sys, True)
            )  # ENH: Fix gpkg_tab and exclude key field

        # Build SQL
        field_names = []
        placeholders = []
        for gpkg_fld_desc in self.gpkg_fields:
            field_names.append(gpkg_fld_desc.name)
            placeholders.append("?")

        sql = "INSERT INTO {}({}) VALUES ({})".format(
            self.name, ",".join(field_names), ",".join(placeholders)
        )

        # Do insert
        self.db.executeSqlMany(sql, rows)

    def updateRec(self, rec, coord_sys=MywCoordSystem(4326)):
        ##
        ## Update REC in database
        ##

        # ENH: Avoid introducing coord system round trip jitter
        row = self._rowFrom(rec, coord_sys)

        # Build set clause
        fld_sqls = []
        for fld, gpkg_fld_desc in self.fields.items():
            if fld == self.key_fld:
                continue
            fld_sql = '"{}"=?'.format(gpkg_fld_desc.name)
            fld_sqls.append(fld_sql)

        set_sql = ",".join(fld_sqls)

        # Build SQL statement
        id = rec[self.key_fld]
        gpkg_key_fld = self.fields[self.key_fld].name
        sql = "UPDATE {} SET {} WHERE {}={}".format(
            self.name, set_sql, gpkg_key_fld, id
        )

        # Run it
        self.executeSql(sql, row)

    def deleteRec(self, id):
        ##
        ## Delete record ID from self
        ##

        # Build SQL statement
        gpkg_key_fld = self.fields[self.key_fld].name
        sql = "DELETE FROM {} WHERE {}={}".format(self.name, gpkg_key_fld, id)

        # Run it
        self.executeSql(sql)

    def count(self):
        ##
        ## Number of records in self
        ##

        self._connect()

        sql = "SELECT COUNT(*) FROM {}".format(self.name)
        res = self.executeSql(sql)

        return res[0][0]

    def truncate(self):
        ##
        ## Remove all records from self
        ##
        # Note: Does direct via SQL (to avoid connect overhead)

        sql = "DELETE from {}".format(self.name)

        self.executeSql(sql)

    # --------------------------------------------------------------------------------
    #                                   HELPERS
    # --------------------------------------------------------------------------------

    def _gpkgTypeFor(self, fld_desc):
        ##
        ## The GeoPackage type for FLD_DESC (a MywFieldDescriptor)
        ##
        # See https://www.geopackage.org/spec/#table_column_data_types

        base_type = fld_desc.type_desc.base

        if base_type == "boolean":
            return "INTEGER"
        if base_type == "integer":
            return "INTEGER"
        if base_type == "double":
            return "DOUBLE"
        if base_type == "numeric":
            return "DOUBLE"
        if base_type == "string":
            return "TEXT"
        if base_type == "json":
            return "TEXT"
        if base_type == "reference":
            return "TEXT"
        if base_type == "reference_set":
            return "TEXT"
        if base_type == "foreign_key":
            return "TEXT"
        if base_type == "link":
            return "TEXT"
        if base_type == "date":
            return "DATE"
        if base_type == "timestamp":
            return "DATETIME"
        if base_type == "image":
            return "BLOB"
        if base_type == "file":
            return "BLOB"

        if base_type == "point":
            return "POINT"
        if base_type == "linestring":
            return "LINESTRING"
        if base_type == "polygon":
            return "POLYGON"

        raise MywError(fld_desc.name, "Bad data type:", fld_desc.type)

    def mywTypeFor(self, gpkg_fld_desc):
        ##
        ## The myWorld data type for sqlite type GPKG_TYPE
        ##
        # See https://www.geopackage.org/spec/#table_column_data_types

        gpkg_type = gpkg_fld_desc.type

        if gpkg_type == "POINT":
            return "point"
        if gpkg_type == "LINESTRING":
            return "linestring"
        if gpkg_type == "POLYGON":
            return "polygon"
        if gpkg_type == "MULTIPOINT":
            return "point"
        if gpkg_type == "MULTILINESTRING":
            return "linestring"
        if gpkg_type == "MULTIPOLYGON":
            return "polygon"

        if gpkg_type == "BOOLEAN":
            return "boolean"
        if gpkg_type == "TINYINT":
            return "integer"
        if gpkg_type == "SMALLINT":
            return "integer"
        if gpkg_type == "MEDIUMINT":
            return "integer"
        if gpkg_type == "INTEGER":
            return "integer"
        if gpkg_type == "INT":
            return "integer"
        if gpkg_type == "FLOAT":
            return "double"
        if gpkg_type == "DOUBLE":
            return "double"
        if gpkg_type == "REAL":
            return "double"
        if gpkg_type == "DATE":
            return "date"
        if gpkg_type == "DATETIME":
            return "timestamp"
        if gpkg_type == "BLOB":
            return "string"

        if gpkg_type.startswith("TEXT"):
            myw_type = "string"
            if gpkg_fld_desc.size:
                myw_type += "({})".format(gpkg_fld_desc.size)
            return myw_type

        raise MywError(self.name, gpkg_fld_desc.name, "Unknown column type:", gpkg_type)

    def _recFrom(self, row, coord_sys=None):
        ##
        ## Build a dict from row vector ROW
        ##

        coord_sys = coord_sys or self.db.coord_sys

        rec = {}
        i = 0
        for fld in self.fields:
            val = row[i]
            if fld == self.geom_fld:
                val = self._asGeom(val, coord_sys)

            rec[fld] = val
            i += 1

        return rec

    def _rowFrom(self, rec, coord_sys, include_key=False):
        ##
        ## Build a row vector from dict REC
        ##
        ## If optional INCLUDE_KEY is false, exclude key field

        row = []

        for fld in self.fields:

            if not include_key and fld == self.key_fld:
                continue

            val = None
            if fld == self.geom_fld:
                val = self._asGpkgGeom(rec, fld, coord_sys)

            elif hasattr(rec, "_descriptor"):
                if fld in rec._descriptor.fields:
                    val = rec[fld]

            else:
                val = rec.get(fld)

            row.append(val)

        self.progress(8, "Built row:", row)

        return row

    def _asGeom(self, val, coord_sys):
        ##
        ## Build a geometry from GeoPackage geom VAL
        ##
        ## See https://www.geopackage.org/spec131/index.html section Geom Encoding

        # Size of envelope types, in bytes (see spec)
        envelope_type_lens = {0: 0, 1: 32, 2: 48, 3: 48, 4: 64}

        if not val:
            return None

        # Read fixed size fields of GP header
        magic = val[0:2]
        version = int.from_bytes(
            val[2:3], "little"
        )  # Endianness not important (its a byte!)
        flags = int.from_bytes(val[3:4], "little")

        # Unpick flags
        endianess = "little" if flags & 0b1 else "big"
        envelope_type = (flags >> 1) & 0b111

        # Build SRS ID
        srid = int.from_bytes(val[4:8], byteorder=endianess)

        self.progress(
            10,
            "GeoPackage geom",
            magic,
            "version=",
            version,
            "flags=",
            flags,
            "endianess=",
            endianess,
            "envelope_type=",
            envelope_type,
            "srid=",
            srid,
        )

        # Compute total length of GP header
        header_len = 2 + 1 + 1 + 4 + envelope_type_lens[envelope_type]

        # Get OGC geom (as hex string)
        wkb_val = base64.b16encode(val[header_len:]).decode()
        self.progress(11, "GeoPackage geom WKB", wkb_val)

        # Build in-memory geom
        geom = MywGeometry.decode(wkb_val)

        # Flatten multi-geoms (if possible)
        if (
            geom.geom_type in ["MultiPoint", "MultiLineString", "MultiPolygon"]
            and len(geom.geoms) == 1
        ):
            geom = MywGeometry.newFromShapely(geom.geoms[0])

        # Transform to nominal coordinate system (if necessary)
        if coord_sys and coord_sys != self.coord_sys:
            self.progress(
                8, "Transforming geometry from", self.coord_sys, "to", coord_sys
            )
            geom = geom.geoTransform(self.coord_sys, coord_sys)

        return geom

    def _asGpkgGeom(self, rec, fld, coord_sys):
        ##
        ## The value of FLD as a geopackage-encoded geometry
        ##

        # Get geom
        geom = None
        if hasattr(rec, "_descriptor"):
            if self.geom_fld in rec._descriptor.fields:  # Hack for dummy geom fields
                geom = rec._field(self.geom_fld).geom()
        else:
            geom = rec.get(fld)

        if not geom:
            return None

        # Transform it (if necessary)
        if coord_sys and coord_sys != self.db.coord_sys:
            self.progress(
                8, "Transforming geometry from", coord_sys, "to", self.coord_sys
            )
            geom = geom.geoTransform(coord_sys, self.coord_sys)

        # Encode it
        prefix = pack("<2s2bi", b"GP", 0, 1, self.coord_sys.srid)
        return prefix + geom.wkb

    def executeSql(self, sql, values=None):
        ##
        ## Execute a SQL statement
        ##

        return self.db.executeSql(sql, values)
