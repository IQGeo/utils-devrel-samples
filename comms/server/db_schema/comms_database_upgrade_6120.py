# Copyright: IQGeo Limited 2010-2023
import os
from myworldapp.modules.comms.server.db_schema.comms_database_upgrade import CommsDatabaseUpgrade
from myworldapp.core.server.base.geom.myw_line_string import MywLineString


class CommsDatabaseUpgrade6120(CommsDatabaseUpgrade):
    """
    Ugrade Network Manager Comms data model to 6.1.2.0
    """

    from_version = 521001
    supports_dry_run = True
    resource_dir = os.path.join(os.path.dirname(__file__), "resources", "upgrade_6120")

    updates = {
        612001: "add_circuit_segment_fields",
        612002: "add_circuits_layer",
        612003: "add_settings",
        612004: "disable_conduit_run_edit",
        612005: "add_rights",
        612006: "rename_trace_engine",
        612007: "remove_name_manager_setting",
        612008: "fix_bad_geometries",
        612009: "reverse_conduits",
    }

    def add_circuit_segment_fields(self):
        """
        Add fields structure fields to mywcom_circuit_segm
        """
        # Note: Does not populate fields as circuit functionality was hidden in 5.2

        dd = self.db.dd

        # Get descriptor
        feature_rec = dd.featureTypeRec("myworld", "mywcom_circuit_segment")
        feature_desc = dd.featureTypeDescriptor(feature_rec)

        # Add fields
        feature_desc.addField("in_structure", "reference", indexed=True)
        feature_desc.addField("out_structure", "reference", indexed=True)
        dd.alterFeatureType(feature_rec, feature_desc)

    def add_circuits_layer(self):
        """
        Add layer definition for displaying circuit data
        """

        self.loadResourceFiles("circuits", "*.layer")

        self.add_layer_to("mywcom", "mywcom_circuits")

    def add_settings(self):
        """
        Add settings for configuring design types and proposed object color
        """

        self.loadResourceFiles("settings", "*.settings")

    def disable_conduit_run_edit(self):
        """
        Disable editing of conduit runs from GUI
        """

        self.loadResourceFiles("conduits", "mywcom_conduit_run.def")

    def add_rights(self):
        """
        Add right for design rules master

        Also renamed manage specifications right"""

        self.loadResourceFiles(".", "*.rights", update=True)

    def rename_trace_engine(self):
        """
        Updates network definitions for rename of fiber trace engine
        """

        config_mgr = self.db.config_manager

        for name in config_mgr.networkNames():
            network_rec = config_mgr.networkRec(name)

            if network_rec.engine == "mywcom_fiber_network_engine":
                network_rec.engine = "mywcom_pin_network_engine"

    def remove_name_manager_setting(self):
        """
        Remove setting mywcom.name_manager

        Setting is replaced by server-side config at this release"""

        name_manager = self.db.setting("mywcom.nameManager")

        if name_manager:
            self.progress(1, "Dropping setting:", "mywcom.nameManager")
            self.db.setSetting("mywcom.nameManager", None)

    def fix_bad_geometries(self):
        """
        Fixup records that have bad geometries (GeometryCollections)

        These records cannot be read by the server (see issue 19895)"""

        # For each network feature type ...
        for ft in self.comms_5211_feature_types():
            self.progress(1, "Checking feature type", ft)

            # Get descriptor
            ft_rec = self.db.dd.featureTypeRec("myworld", ft)
            ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

            # Determine which schemas need checking
            schemas = ["data"]
            if ft_desc.versioned:
                schemas += ["base", "delta"]

            # For each schema ..
            for schema in schemas:

                # Get names of ID fields
                id_fields = [ft_desc.key_field_name]
                if schema in ["base", "delta"]:
                    id_fields += ["myw_delta"]

                # For each geometry field ..
                for geom_field in ft_desc.geomFields():

                    # Find bad records
                    sql_template = "select {3},ST_AsText({2}) from {0}.{1} where ST_GeometryType({2})='ST_GeometryCollection'"
                    sql = sql_template.format(schema, ft, geom_field, ",".join(id_fields))

                    # Show them
                    for raw_rec in self.db.executeSQL(sql):
                        ident = "{}.{}({})".format(schema, ft, raw_rec.id)

                        delta_ident = ""
                        if schema in ["base", "delta"]:
                            delta_ident = " in delta {}".format(raw_rec.myw_delta)

                        self.progress(
                            1, ident, ": Fixing field", geom_field, ":", raw_rec[-1], delta_ident
                        )

                    # Fix them
                    sql_template = "update {0}.{1} set {2} = NULL where ST_GeometryType({2})='ST_GeometryCollection'"
                    sql = sql_template.format(schema, ft, geom_field, ",".join(id_fields))
                    self.db.executeSQL(sql)

    def comms_5211_feature_types(self):
        """
        Names of the network manager feature types
        """
        # WARNING: Does not include designs or circuits

        structs = self.db.setting("mywcom.structures") or {}
        routes = self.db.setting("mywcom.routes") or {}
        conduits = self.db.setting("mywcom.conduits") or {}
        equips = self.db.setting("mywcom.equipment") or {}
        cables = self.db.setting("mywcom.cables") or {}
        segments = ["mywcom_fiber_segment"]
        connections = ["mywcom_fiber_connection"]

        return (
            list(structs.keys())
            + list(routes.keys())
            + list(conduits.keys())
            + list(equips.keys())
            + list(cables.keys())
            + segments
            + connections
        )

    def reverse_conduits(self):
        """
        Ensure that all conduits are forward

        Preparation for removal of 'forward' flag"""

        conduits = self.db.setting("mywcom.conduits") or {}

        # For each configured type ..
        for ft in conduits:

            # Get descriptor
            ft_rec = self.db.dd.featureTypeRec("myworld", ft)
            ft_desc = self.db.dd.featureTypeDescriptor(ft_rec)

            # Check for not reversable
            if not "forward" in ft_desc.storedFields():
                continue

            # Make them all forward
            with self.progress.operation("Processing", ft):
                self._reverse_conduits_for(ft)

    def _reverse_conduits_for(self, conduit_type):
        """
        Ensure that all conduits of CONDUIT_TYPE are forward
        """

        # Build queries
        models = self.db.dd.featureModelsFor(conduit_type)
        master_recs = self.db.session.query(models["data"]).filter_by(forward=False)
        base_recs = self.db.session.query(models["base"]).filter_by(forward=False)
        delta_recs = self.db.session.query(models["delta"]).filter_by(forward=False)

        # Do master records
        with self.progress.operation("Upgrading master records"):
            for cnd in master_recs:
                self._reverse_conduit(cnd)

        # Do base records
        with self.progress.operation("Upgrading base records"):
            for cnd in base_recs:
                self._reverse_conduit(cnd)

        # Do delta records
        with self.progress.operation("Upgrading delta records"):
            for cnd in delta_recs:
                self._reverse_conduit(cnd)

    def _reverse_conduit(self, cnd):
        """
        Set count field on CND from its parent cable (handling errors)

        DB_VIEW is the view to get cable record from"""

        self.progress(0, "Reversing", cnd)

        # Reverse references
        (cnd.in_structure, cnd.out_structure) = (cnd.out_structure, cnd.in_structure)
        (cnd.in_conduit, cnd.out_conduit) = (cnd.out_conduit, cnd.in_conduit)

        # Reverse geometry
        field = cnd._field("path")
        coords = field.geom().coords[::-1]  # Reversed
        geom = MywLineString(coords)
        field.set(geom)

        # Clear flag
        cnd.forward = True
