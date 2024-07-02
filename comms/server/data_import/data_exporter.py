# Copyright: IQGeo Limited 2010-2023

import os, csv, datetime
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.dd.myw_field_descriptor import MywFieldDescriptor
from myworldapp.core.server.dd.myw_reference import MywReference
from myworldapp.core.server.io.myw_csv_feature_ostream import MywCsvFeatureOStream
from myworldapp.modules.comms.server.api.network_view import NetworkView

from myworldapp.core.server.io.myw_data_exporter import MywDataExporter

class DataExporter(MywDataExporter):
    """
    Engine for exporting Comms physical data in NM CDIF format
    """

    def __init__(self, db_view, dir, region=None, current_user=None, coord_sys=None, progress=MywProgressHandler()):
        """
        Init slots of self

        NB_VIEW is a MywFeatureView. DIR is the directory to create / overwrite.
        Optional REGION (a polygon geometry) defines area to dump."""       
        super().__init__(current_user, db_view, coord_sys)
        self.db_view = db_view
        self.dir = dir
        self.region = region
        self.progress = progress
        self.geom_encoding = "ewkb"  # ENH: Pass in
        self.changes_only = False  # ENH: Pass in
        self.encoding = "utf8"

        self.dd = db_view.db.dd
        self.nw_view = NetworkView(db_view, self.progress)
        self.os_engine = MywOsEngine(self.progress)

    def run(self):
        """
        Create export directory tree and dump files
        """
        self.runExport()


    # ------------------------------------------------------------------------------
    #                                  FEATURE EXPORT
    # ------------------------------------------------------------------------------

    def runExport(self):
        """
        Create export directory tree and dump files
        """
        # Create root directory
        self.os_engine.ensure_empty(self.dir)

        # Find slacks
        equip_fts = []
        slack_fts = []
        for ft, config in self.nw_view.equips.items():
            if config.get("function") == "slack":  # ENH: Encapsulate
                slack_fts.append(ft)
            else:
                equip_fts.append(ft)

        # Dump data
        with self.progress.operation("Exporting features"):
            self.exportFeatureTypes("structures", self.nw_view.structs)
            self.exportFeatureTypes("routes", self.nw_view.routes)
            self.exportFeatureTypes("equipment", equip_fts)
            self.exportFeatureTypes("conduits", self.nw_view.conduits)
            self.exportFeatureTypes("conduits", self.nw_view.conduit_runs)
            self.exportFeatureTypes("cables", self.nw_view.cables)
            self.exportFeatureTypes("cables", slack_fts)
            self.exportFeatureTypes("cables", self.nw_view.segments)
            self.exportFeatureTypes("line_of_counts", self.nw_view.line_of_counts)

            if self.changes_only:
                self.exportConnectionChanges("connections", self.nw_view.connections)
            else:
                self.exportFeatureTypes("connections", self.nw_view.connections)

        # Output version info
        self.exportPackageMetadata()
        # ENH: Output data extent

    def exportFeatureTypes(self, sub_dir, feature_types):
        """
        Export data for FEATURE_TYPES to subdirectory SUB_DIR
        """

        # Create directory (if necessary)
        dir_path = os.path.join(self.dir, sub_dir)
        self.os_engine.ensure_exists(dir_path)

        # For each feature type .. dump data
        for ft in feature_types:
            self.exportFeatureType(dir_path, ft)

    def exportFeatureType(self, dir_path, ft):
        """
        Export data for FEATURE_TYPE to DIR
        """

        with self.progress.operation("Exporting", ft) as stats:

            # Get list of stored fields
            ft_rec = self.dd.featureTypeRec("myworld", ft)
            ft_desc = self.dd.featureTypeDescriptor(ft_rec)

            field_descs = ft_desc.storedFields()

            # Work out what to dump
            # ENH: Use MywDataLoad._featureRecs() .. or cut-and-paste it
            tab = self.db_view.table(ft)
            if self.changes_only:
                db_recs = tab._delta_recs
                field_descs["myw_change_type"] = MywFieldDescriptor(
                    "myw_change_type", "string"
                )  # ENH: Find a cleaner way
            else:
                if self.region:
                    geom_field = tab.field(tab.descriptor.primary_geom_name)
                    tab = tab.filter(
                        geom_field.geomIntersects(self.region)
                        | geom_field.geomCoveredBy(self.region)
                    )
                db_recs = tab.recs()

            # Convert IDs to refs
            # ENH: Mutate the field descriptors too
            recs = []
            for db_rec in db_recs:
                rec = self.buildUrnRec(db_rec, field_descs)
                recs.append(rec)

            # Dump it
            stats["n_recs"] = self.exportRecs(dir_path, ft, recs, field_descs)

    def buildUrnRec(self, db_rec, field_descs):
        """
        Build a copy of DB_REC, converting IDs to URNs

        FIELD_DESCS are descriptors for the stored fields of DB_REC"""

        # Build copy, mapping IDs to references
        rec = {}
        for fld, fld_desc in field_descs.items():
            val = db_rec[fld]

            if not val is None:
                type_desc = fld_desc.type_desc  # ENH: Do once

                # Map ID to URN
                if fld_desc.key:
                    val = MywReference("myworld", db_rec.feature_type, val).urn()

                # Replace foreign key values by URNs
                elif type_desc.base == "foreign_key":
                    val = MywReference("myworld", type_desc.args[0], val).urn()

                # Encode geometries (workaround because CSV uses rec._field() to encode geom)
                elif fld_desc.isGeometry():
                    val = db_rec._field(fld).encode(self.geom_encoding)

            rec[fld] = val

        return rec

    def exportRecs(self, dir_path, ft, recs, fields):
        """
        Helper to write RECS to file

        RECS is a list of records or a query. FIELDS is a list of field names or descriptors"""

        # Build full path
        file_path = os.path.join(dir_path, ft + ".csv")

        # Output data
        n_recs = 0
        with MywCsvFeatureOStream(file_path, fields, encoding=self.encoding) as strm:
            for rec in recs:
                strm.writeFeature(rec)
                n_recs += 1

        self.progress(0, "Exported", n_recs, "records")

        # Delete empty files
        # ENH: Avoid creating them
        if n_recs:
            self.exportFieldMetadata(dir_path, ft, fields)
        else:
            self.os_engine.remove_if_exists(file_path)

        return n_recs

    # ------------------------------------------------------------------------------
    #                               CONNECTION CHANGE EXPORT
    # ------------------------------------------------------------------------------

    def exportConnectionChanges(self, sub_dir, feature_types):
        """
        Export pin connectivity changes to subdirectory SUB_DIR

        Required because we need to consolidate connection updates (see ConnectionManager)"""

        # Create directory
        dir_path = os.path.join(self.dir, sub_dir)
        self.os_engine.ensure_exists(dir_path)

        # For each feature type .. dump data
        for ft in feature_types:
            self.exportConnectionChangesFor(dir_path, ft)

    def exportConnectionChangesFor(self, dir_path, ft):
        """
        Export pin connectivity changes for connection records FT to subdirectory SUB_DIR
        """

        tech = "fiber"  # ENH: Determine fro FT

        with self.progress.operation("Exporting", ft) as stats:

            fields = [
                "in_object",
                "in_side",
                "in_low",
                "in_high",
                "out_object",
                "out_side",
                "out_low",
                "out_high",
                "housing",
            ]

            # Work out what to dump
            tab = self.db_view.table(ft)
            recs = tab._delta_recs.order_by("id")
            recs = self.consolidateConnections(recs)
            fields.append("myw_change_type")

            # Write file
            self.exportRecs(dir_path, ft, recs, fields)

    def consolidateConnections(self, recs):
        """
        Remove redundant disconnect/connect pairs, merge adjacent ranges

        RECS is a list of delta connection records

        This ensures we export real changes only (not technical updates)"""

        # Convert updates into delete + insert
        (connects, disconnects) = self.nw_view.connection_mgr.flattenChanges(recs)

        # Remove null changes + merge adjacent ranges
        (connect_conns, disconnect_conns) = self.nw_view.connection_mgr.consolidate(
            connects, disconnects
        )

        # Build pseudo-records
        recs = []
        for conn in disconnect_conns:
            rec = conn.asRec(myw_change_type="delete")
            recs.append(rec)

        for conn in connect_conns:
            rec = conn.asRec(myw_change_type="insert")
            recs.append(rec)

        return recs

    # ------------------------------------------------------------------------------
    #                                  METADATA EXPORT
    # ------------------------------------------------------------------------------

    def exportPackageMetadata(self):
        """
        Output version info etc
        """

        file_name = os.path.join(self.dir, "package.metadata")
        coord_sys = 4326  # WGS84 long/lat

        self.progress(1, "Exporting metadata")

        with open(file_name, "w", encoding=self.encoding, newline="") as strm:
            writer = csv.DictWriter(strm, fieldnames=["property", "value"])
            writer.writeheader()
            writer.writerow(dict(property="format", value="cdif"))
            writer.writerow(dict(property="coord_system", value=coord_sys))

            if self.region:
                val = self.region.geoEncode(4326, self.geom_encoding)
                writer.writerow(dict(property="boundary", value=val))

            # ENH: Add description, ...

    def exportFieldMetadata(self, dir_path, ft, field_descs):
        """
        Output field descriptor for feature type FT
        """

        file_path = os.path.join(dir_path, ft + ".fields")

        self.progress(1, "Exporting field metadata for:", ft)

        with open(file_path, "w", encoding=self.encoding, newline="") as strm:

            writer = csv.DictWriter(strm, fieldnames=["name", "type", "unit"])
            writer.writeheader()

            for field_name, field_desc in field_descs.items():

                cdif_type = self.exportTypeFor(field_desc)

                writer.writerow({"name": field_name, "type": cdif_type, "unit": field_desc.unit})

    def exportTypeFor(self, field_desc):
        """
        The data type to show in field metadata for FIELD_DESC

        Required because we map foreign keys etc to URNs on export"""

        if field_desc.key:
            return "id"

        type_desc = field_desc.type_desc

        if type_desc.base == "reference":
            return "id"
        if type_desc.base == "foreign_key":
            return "id"
        if type_desc.base == "reference_set":
            return "id_set"

        return field_desc.type
