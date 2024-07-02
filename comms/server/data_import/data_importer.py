# Copyright: IQGeo Limited 2010-2024

import os
from collections import defaultdict
from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.dd.myw_reference import MywReference

from myworldapp.modules.comms.server.base.system_utils import ProductUtils
from myworldapp.modules.comms.server.base.geom_utils import GeomUtils
from myworldapp.modules.comms.server.api.network_view import NetworkView

from myworldapp.modules.comms.server.data_import.file_feature_package import FeaturePackage
from myworldapp.modules.comms.server.data_import.mapped_feature_package import MappedFeaturePackage


class DataImporter:
    """
    Abstract superclass for engines importing Comms data from external sources

    Provides protocols for mapping IDs, handling defaults etc.
    Assumes data package is relatively small (can be held in memory)

    Makes use of insertMany and updateMany bulk operations for performance. 

    Subclasses must implement:
      .run()"""

    # ------------------------------------------------------------------------------
    #                                REGISTRATION
    # ------------------------------------------------------------------------------

    # Registered engine types (a list of classes, keyed by type name)
    _engines = {}

    @classmethod
    def registerEngine(self, name, engine_class):
        """
        Add ENGINE_CLASS to the list of known engine classes
        """

        self._engines[name] = engine_class

    @classmethod
    def engines(self):
        """
        Load engines from all modules
        """

        ProductUtils.importAll("server", "data_import")

        return self._engines

    @classmethod
    def engineFor(self, type, *args, **kwargs):
        """
        Returns instance of engine of TYPE

        ARGS and KWARGS are as per __init__()"""

        engine_class = self.engines().get(type)

        if not engine_class:
            raise MywError("Unknown data package type:", type)

        return engine_class(*args, **kwargs)

    @classmethod
    def buildEngine(
        self, data_path, engine_name, engine_opts, mappings, coord_sys, db_view, progress
    ):
        """
        Build engine for importing data package on DATA_PATH into DB_VIEW
        """
        # TODO: Support coord system override

        file_type_config = db_view.db.setting("mywcom.import_file_types") or {}

        feature_pkg = FeaturePackage.newFor(file_type_config, data_path, progress=progress)

        if mappings:
            feature_pkg = MappedFeaturePackage(feature_pkg, mappings)

        # Build engine
        engine = DataImporter.engineFor(
            engine_name,
            db_view,
            feature_pkg,
            options=engine_opts,
            coord_sys=coord_sys,
            progress=progress,
        )

        return engine

    # ------------------------------------------------------------------------------
    #                                   CREATION
    # ------------------------------------------------------------------------------

    def __init__(
        self, db_view, feature_pkg, options={}, coord_sys=None, progress=MywProgressHandler()
    ):
        """
        Init slots of self

        DB_VIEW is the target database view. FEATURE_PKG is the FeaturePackage to be imported

        If COORD_SYS (a MywCoordSys) is omitted, uses feature_pkg.coord_sys"""

        self.db_view = db_view
        self.feature_pkg = feature_pkg
        self.options = options
        self.coord_sys = coord_sys
        self.progress = progress

        self.db = self.db_view.db
        self.dd = self.db_view.db.dd
        self.nw_view = NetworkView(self.db_view)

        self.recs = {}  # Maps gid -> raw rec
        self.db_recs = {}  # Maps gid -> database rec
        self.feature_types = {} # Maps feature type -> boolean true if it exists in dd.

    # ------------------------------------------------------------------------------
    #                                  PREVIEW
    # ------------------------------------------------------------------------------

    def detachedFeatures(self, feature_types):
        """
        Returns features that would be created for FEATURE_TYPES

        Returns route records that would be created"""

        # ENH: Duplicates code with loadFeaturesFor ()

        det_recs = []

        for feature_type in self.featureTypes(feature_types):

            for det_rec in self.detachedFeaturesFor(feature_type):
                det_recs.append(det_rec)

        return det_recs

    def detachedFeaturesFor(self, feature_type):
        """
        Yields features that would be created for FEATURE_TYPE

        WARNING: Applies coordinate system transform but not field and unit mappings (for speed)"""

        coord_sys = self.coord_sys or self.feature_pkg.coord_sys
        tab = self.db_view.table(feature_type)

        # For each record we will create ...
        for rec in self.feature_pkg.features(feature_type):

            # Prevent problems with strings in int fields
            rec.pop(tab.descriptor.key_field_name, None)

            # Make detached record
            det_rec = tab._new_detached()
            det_rec.updateFrom(rec, coord_sys=coord_sys)

            yield det_rec

    # ------------------------------------------------------------------------------
    #                                FEATURE LOADING
    # ------------------------------------------------------------------------------

    def loadFeatures(self):
        """
        Load records for all feature types in the package

        Returns database records created"""

        with self.progress.operation("Loading data"):
            for feature_type in self.featureTypes():
                self.loadFeaturesFor(feature_type)

        return self.db_recs

    def loadFeaturesFor(self, feature_type):
        """
        Update database with features for FEATURE_TYPE, building ID map

        Records inserted or updated are added to self.db_recs"""

        tab = self.db_view.table(feature_type)

        with self.progress.operation("Feature type:", feature_type) as stats:

            # Get input table properties
            pkg_feature_desc = self.feature_pkg.featureDesc(feature_type)
            pkg_coord_sys = self.coord_sys or self.feature_pkg.coord_sys
            pkg_field_descs = pkg_feature_desc.fields

            # Get DB table properties
            db_ftr_rec = self.dd.featureTypeRec("myworld", feature_type)
            db_ftr_desc = self.dd.featureTypeDescriptor(db_ftr_rec)
            db_field_descs = db_ftr_desc.storedFields()

            # Load records
            n_recs = 0
            inserts = []
            insert_gids = []
            updates = {}
            update_gids = []

            for rec in self.feature_pkg.features(feature_type):
                gid = rec.get("id", id(rec))
                change_type = rec.get("myw_change_type", "insert")
                n_recs += 1

                # Stash source record (in case we need it for procesing later)
                self.recs[gid] = rec

                # Apply unit conversions etc
                props = self.buildDbRecFrom(rec, pkg_field_descs, db_field_descs)

                # Case: New record
                if change_type == "insert":
                    insert_gids.append(gid)
                    inserts.append(props)

                # Case: Update existing record (GID must be a urn)
                elif change_type == "update":
                    ref = MywReference.parseUrn(gid)  # TODO: Handle cannot parse
                    update_gids.append(gid)
                    updates[ref.id] = props

                # Case: Other
                else:
                    self.progress(
                        "warning", feature_type, gid, ":", "Cannot handle change type:", change_type
                    )

            # Do bulk inserts
            inserted_recs = tab.insertMany(inserts, coord_sys=pkg_coord_sys)
            for gid, db_rec in zip(insert_gids, inserted_recs):
                self.db_recs[gid] = db_rec
            
            # Do bulk updates
            updated_recs = tab.updateMany(updates, coord_sys=pkg_coord_sys)
            for gid, db_rec in zip(update_gids, updated_recs):
                self.db_recs[gid] = db_rec

            self.progress(0, f"Loaded {n_recs} records) #, {len(inserts)} inserts, {len(updates)} updates")

            stats["n_recs"] = n_recs

    def buildDbRecFrom(self, rec, pkg_field_descs, db_field_descs):
        """
        Helper to convert to property list of db values from package record

        Deals with the business of converting types and units
        
        Return dict of properties for database record"""

        props = {}

        for fld, db_field_desc in db_field_descs.items():

            # Skip ID (to force allocation by generator)
            if db_field_desc.key:
                continue

            # If we have a value .. use it
            if fld in rec:
                val = rec.get(fld)

                # Apply type conversion
                # TODO: Bools?  use field accessor later?
                db_type_desc = db_field_desc.type_desc  # ENH: Do this once
                if db_type_desc.base == "string" and isinstance(val, (int, float)):
                    val = str(val)

                # Apply unit conversion
                if db_field_desc.unit_scale and val != None:
                    pkg_field_desc = pkg_field_descs[fld]
                    pkg_unit = pkg_field_desc.unit
                    db_unit = db_field_desc.unit

                    if db_unit and pkg_unit and db_unit != pkg_unit:
                        self.progress(7, "Field", fld, ":", "Mapping unit", pkg_unit, "->", db_unit)
                        unit_scale = self.db.unitScale(
                            db_field_desc.unit_scale
                        )  # ENH: get this once upfront
                        val = float(val) * unit_scale.conversionFactor(pkg_unit, db_unit)

                props[fld] = val

            # .. else set field to default
            elif db_field_desc.default:
                props[fld] = db_field_desc.default  # TODO: Translate bools etc

        return props

    # ------------------------------------------------------------------------------
    #                                 ID MAPPING
    # ------------------------------------------------------------------------------

    def mapReferences(self, db_recs):
        """
        Map reference fields on DB_RECS to their new values (and update database)

        Entries in DB_RECS are updated with the modified record"""

        with self.progress.operation("Mapping references"):

            # Show ID map
            self.progress(4, "Mapping", len(self.db_recs), "ids")
            for gid, db_rec in self.db_recs.items():
                self.progress(10, "   ", gid, "->", db_rec)

            # Do mapping
            for gid, db_rec in self.db_recs.items():
                updated_props = self.mapReferencesOf(db_rec, db_rec._descriptor, gid)

                if updated_props:
                    # At this point db_rec is the correct record and so just need to update it
                    # from the props and then flush once at the end.
                    db_rec.updateFrom(updated_props)                
              
            self.db_view.session.flush()

        return db_recs

    def mapReferencesOf(self, rec, desc, gid):
        """
        Map reference fields on REC to their database values

        REC is a record or dict. DESC is a MywFeatureDescriptor.
        GID is rec's original ID (for error reporting)

        Returns:
          Fields to be updated
        """

        self.progress(6, "Checking reference fields on", rec)
        updated_props = {}
        
        # Map foreign key fields
        for fld, fld_desc in desc.storedFields("foreign_key").items():
            value = self.mapForeignKeyField(rec, fld, fld_desc, gid)
            if value:
                updated_props[fld] = value

        # Map reference fields
        for fld, fld_desc in desc.storedFields("reference").items():
            value = self.mapRefField(rec, fld, fld_desc, gid)
            if value:
                updated_props[fld] = value


        # Map reference set fields
        for fld, fld_desc in desc.storedFields("reference_set").items():
            value = self.mapRefSetField(rec, fld, fld_desc, gid)
            if value:
                updated_props[fld] = value

        return updated_props

    def mapForeignKeyField(self, rec, fld, desc, gid):
        """
        Calculates the ID in foreign key REC.FLD to new value (if possible)
        """

        # Get field value
        ref_gid = self.recs[gid].get(fld, None)
        if not ref_gid:
            return False

        self.progress(7, rec, ":", fld, ":", "Attempting to map foreign key", ref_gid)

        # Get field properties
        type_desc = desc.type_desc  # TODO: Do this once
        feature_type = type_desc.args[0]

        # Try GID is URN
        db_rec = self._recordFor(ref_gid)

        # Try GID is ID
        if not db_rec:
            urn = MywReference("myworld", feature_type, ref_gid).urn()
            db_rec = self._recordFor(urn)

        # Check for not found
        if not db_rec:
            self.progress("warning", gid, rec, ":", fld, ":", "Cannot find", ref_gid)
            return self.fixupForeignKeyValue(rec, fld, desc, ref_gid)

        # Set it
        self.progress(5, rec, ":", fld, ":", "Mapping", ref_gid, "->", db_rec._id)

        return db_rec._id

    def fixupForeignKeyValue(self, rec, fld, desc, gid):
        """
        Returns value to store in database field for an unmapped foreign key value

        TBR: Workaround for Core issue 23012 (bad foreign key breaks feature service)
        """

        self.progress(6, "Fixing up unmapped foreign key", rec, ":", fld, ":", gid)

        # Check for not urn
        ref = MywReference.parseUrn(gid, error_if_bad=False)
        if not ref:
            return None

        # Check for ref to wrong table
        target_ft = desc.type_desc.args[0]
        if ref.feature_type != target_ft:
            self.progress(
                5, rec, ":", fld, ":", "Wrong table:", target_ft, "Expected:", ref.feature_type
            )
            return None

        # Check for non-numeric ID
        target_desc = self.db_view.table(target_ft).descriptor
        if target_desc.key_field.type == "integer" and not ref.id.isdigit():
            self.progress(5, rec, ":", fld, ":", "Bad key for", target_ft, ":", ref.id)
            return None

        return ref.id

    def mapRefField(self, rec, fld, desc, gid):
        """
        Calculates the gid in reference field REC.FLD to mapped value (if possible)

        Returns True if record updated"""

        # Get source value
        ref_gid = self.recs[gid].get(fld, None)
        if not ref_gid:
            return None

        self.progress(7, rec, ":", fld, ":", "Attempting to map reference", ref_gid)

        # Get mapping
        urn = self._urnFor(ref_gid)
        if not urn:
            self.progress("warning", gid, rec, ":", fld, ":", "Cannot find", ref_gid)
            return None

        if urn == ref_gid:
            return None
        
        # Add qualifiers back if necessary
        ref = MywReference.parseUrn(ref_gid)
        if ref and ref.qualifiers:
            urn += "?" + "&".join([k + "=" + v for k, v in ref.qualifiers.items()])

        # Set it
        self.progress(5, rec, ":", fld, ":", "Mapping", ref_gid, "->", urn)

        return urn

    def mapRefSetField(self, rec, fld, desc, gid):
        """
        Calculate the gids in reference_set field REC.FLD to mapped values (if possible)

        Returns None if no change"""

        # Get source value
        gids_str = self.recs[gid].get(fld, None)
        if not gids_str:
            return None
        gids = gids_str.split(";")

        # Get database values
        any_changed = False
        for i, ref_gid in enumerate(gids):
            self.progress(7, rec, ":", fld, ":", "Attempting to map reference", ref_gid)

            urn = self._urnFor(ref_gid)
            if not urn:
                self.progress("warning", gid, rec, ":", fld, ":", "Cannot find", ref_gid)
                continue

            if urn == ref_gid:
                continue

            self.progress(7, rec, ":", fld, ":", "Mapping", ref_gid, "->", urn)
            gids[i] = urn
            any_changed = True

        if not any_changed:
            return None

        return ";".join(gids)

    # ------------------------------------------------------------------------------
    #                                 DEFAULTING
    # ------------------------------------------------------------------------------

    def setDerivedFields(self, db_recs):
        """
        Populate derived fields on self.db_recs (where necessary)
        """
        # ENH: Share logic with validation fixup code
        # ENH: Refactor to methods by category

        with self.progress.operation("Setting derived properties"):

            # ENH: Should do these iteratively to catch nested objects
            with self.progress.operation("Setting root housings"):
                self.setRootHousingFor(db_recs, self.nw_view.equips)
                self.setRootHousingFor(db_recs, self.nw_view.conduits)
                self.setRootHousingFor(db_recs, self.nw_view.segments)
                self.setRootHousingFor(db_recs, self.nw_view.connections)

            with self.progress.operation("Setting geometry"):
                self.setGeometryFor(db_recs, self.nw_view.equips)
                self.setGeometryFor(db_recs, self.nw_view.conduits)
                self.setGeometryFor(db_recs, self.nw_view.segments)
                self.setGeometryFor(db_recs, self.nw_view.connections)

            with self.progress.operation("Setting in/out structures"):
                self.setStructuresFor(db_recs, self.nw_view.conduits)
                self.setStructuresFor(db_recs, self.nw_view.segments)

            with self.progress.operation("Setting cable segment properties"):
                self.setSegmentPropsFor(db_recs, self.nw_view.segments)

            with self.progress.operation("Setting line of count properties"):
                self.setLineOfCountPropsFor(db_recs)                

    def setRootHousingFor(self, db_recs, feature_types):
        """
        Populate the root_housing field on DB_RECS (where necessary)

        Entries in DB_RECS are updated with the modified record"""

        # For each feature type of interest ..
        for gid, rec in db_recs.items():
            if not rec.feature_type in feature_types:
                continue

            # Check for already set
            if rec.root_housing:
                continue

            # Get housing record
            housing = rec._field("housing").rec()
            if not housing:
                continue
            self.progress(4, rec, ":", "root_housing", ":", "Setting from:", housing)

            # Determine root housing
            if hasattr(housing, "root_housing"):
                root_housing = housing.root_housing
            else:
                root_housing = rec.housing

            # Set it
            self.progress(4, rec, ":", "root_housing", ":", "Setting to:", root_housing)
            rec.root_housing = root_housing
            tab = self.db_view.table(rec.feature_type)
            db_recs[gid] = tab.update(rec)

        return db_recs

    def setLineOfCountPropsFor(self, db_recs):        
        """
        Set geometry for line of count records
        """

        # First update section records
        for gid, rec in db_recs.items():
            if not rec.feature_type == "mywcom_line_of_count_section":
                continue

            # Check for already set
            geom_field = rec._descriptor.primary_geom_name
            if not rec[geom_field] is None:
                continue

            # Get container
            container = rec._field("container").rec()
            if not container:
                continue

            # Get its geometry
            geom = container._primary_geom_field.geom()
            if not geom:
                continue
            self.progress(4, rec, ":", geom_field, ":", "Setting from:", container)
         
            # Set it
            self.progress(7, rec, ":", geom_field, ":", "Setting to", ":", geom)
            rec._field(geom_field).set(geom)
            tab = self.db_view.table(rec.feature_type)
            db_recs[gid] = tab.update(rec)

        # Now update line of count geometry

        loc_mgr = self.nw_view.loc_mgr
        for gid, rec in db_recs.items():
            if not rec.feature_type == "mywcom_line_of_count":
                continue

            # Check for already set
            geom_field = rec._descriptor.primary_geom_name
            if not rec[geom_field] is None:
                continue

            loc_mgr.setLOCGeom(rec)           
            db_recs[gid] = rec


    def setGeometryFor(self, db_recs, feature_types):
        """
        Populate the geometry field on DB_RECS (where necessary)

        Entries in DB_RECS are updated with the modified record"""

        # For each feature type of interest ..
        for gid, rec in db_recs.items():
            if not rec.feature_type in feature_types:
                continue

            # Check for already set
            geom_field = rec._descriptor.primary_geom_name
            if not rec[geom_field] is None:
                continue

            # Get root housing
            root_housing = rec._view.get( rec.root_housing )
            if not root_housing:
                continue

            # Get its geometry
            geom = root_housing._primary_geom_field.geom()
            if not geom:
                continue
            self.progress(4, rec, ":", geom_field, ":", "Setting from:", root_housing)

            # Handle reversal etc
            target_geom_type = rec._descriptor.fields[geom_field].type
            if target_geom_type == "linestring":

                # Case: Internal segment
                if geom.geom_type == "Point":
                    self.progress(7, rec, "Building linestring from:", geom)
                    geom = MywLineString([geom.coord, geom.coord])

                # Case: Reversed segment
                if hasattr(rec, "forward") and rec.forward == False:
                    self.progress(7, rec, "Reversing:", geom)
                    geom = GeomUtils.reverse(geom)

            # Set it
            self.progress(7, rec, ":", geom_field, ":", "Setting to", ":", geom)
            rec._field(geom_field).set(geom)
            tab = self.db_view.table(rec.feature_type)
            db_recs[gid] = tab.update(rec)

        return db_recs

    def setStructuresFor(self, db_recs, feature_types):
        """
        Populate the in_structure and out_structure fields on DB_RECS (where necessary)

        Entries in DB_RECS are updated with the modified record"""

        # For each feature type of interest ..
        for gid, rec in db_recs.items():
            if not rec.feature_type in feature_types:
                continue

            # Check for already set
            if rec.in_structure != None:
                continue

            # Get root housing
            root_housing = rec._field("root_housing").rec()
            if not root_housing:
                continue
            self.progress(4, rec, ":", "Setting in/out structures from:", root_housing)

            # Determine in and out structure
            housing_geom_type = rec._descriptor.primary_geom_field.type
            if housing_geom_type == "point":

                # Case: Internal segment
                in_struct = root_housing._urn()
                out_struct = root_housing._urn()
            else:
                # Case: Reversed segment
                if hasattr(rec, "forward") and rec.forward == False:
                    in_struct = root_housing.out_structure
                    out_struct = root_housing.in_structure
                else:
                    in_struct = root_housing.in_structure
                    out_struct = root_housing.out_structure

            # Set it
            self.progress(7, rec, ":", "in_structure ", ":", "Setting to", ":", in_struct)
            self.progress(7, rec, ":", "out_structure", ":", "Setting to", ":", out_struct)
            rec.in_structure = in_struct
            rec.out_structure = out_struct
            tab = self.db_view.table(rec.feature_type)
            db_recs[gid] = tab.update(rec)

        return db_recs

    def setSegmentPropsFor(self, db_recs, feature_types):
        """
        Populate the optional properties for cable segments FEATURE_TYPES

        Entries in DB_RECS are updated with the modified record"""

        # For each feature type of interest ..
        for gid, rec in db_recs.items():
            if not rec.feature_type in feature_types:
                continue

            # Check for already set
            if not rec.directed is None:
                continue

            # Get parent cable
            cable = rec._field("cable").rec()
            if not cable:
                continue
            self.progress(4, rec, ":", "directed", ":", "Setting from:", cable)

            # Set it
            rec.directed = cable.directed
            tab = self.db_view.table(rec.feature_type)
            db_recs[gid] = tab.update(rec)

        return db_recs

    # ------------------------------------------------------------------------------
    #                                  HELPERS
    # ------------------------------------------------------------------------------

    def featureTypes(self, feature_types=None):
        """
        Yields the feature types that self will create or modify

        If optional FEATURE_TYPES is supplied, consider only those types"""

        for feature_type in self.feature_pkg.featureTypes():

            # Check for not requested
            if feature_types and not feature_type in feature_types:
                continue

            # Check for not in DB
            tab = self.db_view.table(feature_type, error_if_none=False)
            if not tab:  # ENH: Add option to make this fatal?
                self.progress("warning", "Unknown feature type - skipping", ":", feature_type)
                continue

            # Prevent accidental update of master
            if self.db_view.delta and not tab.versioned:
                self.progress("warning", "Feature type not versioned - skipping", ":", feature_type)
                continue

            yield feature_type

    def previewFeatureTypes(self):
        """
        Returns feature types to include in the preview. Can be subclassed and default here is
        all feature types in the package
        """
        return list(self.featureTypes())

    def _recsOfType(self, db_recs, feature_types):
        """
        The elements of DB_RECS of type FEATURE_TYPE

        Yields:
          GID
          DB_REC"""

        for gid, rec in db_recs.items():
            if rec.feature_type in feature_types:
                yield gid, rec

    def _urnFor(self, gid):
        """
        Returns URN to which GID maps (if any)
        """

        db_rec = self._recordFor(gid)
        if db_rec:
            return db_rec._urn()

        return None

    def _recordFor(self, gid):
        """
        Return object identified by GID (if it exists)
        """

        ref = MywReference.parseUrn(gid)

        if ref:
            gid_urn = ref.urn(include_qualifiers=False)
        else:
            # Can occur if gid is name of spec for example
            gid_urn = gid

        # Try new objects
        db_rec = self.db_recs.get(gid_urn)
        if db_rec:
            return db_rec

        # Try existing objects (avoiding 'not such feature type' error)
        if ref and self._featureTypeExists(ref.feature_type):
            return self.db_view.get(ref, False)

        return None
    
    def _featureTypeExists(self,feature_type):
        """
        Determines if FEATURE_TYPE exists and cache result
        """

        if feature_type in self.feature_types:
            return self.feature_types[feature_type]
        
        exists = self.db.dd.featureTypeExists('myworld',feature_type)
        self.feature_types[feature_type] = exists
        return exists