import os,re
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.system.myw_product import MywProduct
from myworldapp.core.server.base.core.myw_error import MywError

from .structure_manager import StructureManager
from .conduit_manager import ConduitManager
from .cable_manager import CableManager
from .equipment_manager import EquipmentManager
from .circuit_manager import CircuitManager
from .connection_manager import ConnectionManager
from .loc_manager import LOCManager
from .network import Network


class NetworkView:
    """
    A view of a network manager network

    Acts as a broker for finding managers.
    Also provides shared settings and database view"""

    # -----------------------------------------------------------------------
    #                           CUSTOMISATION HOOKS
    # -----------------------------------------------------------------------

    # Lookup from manager type to class
    manager_classes = {
        "structure": StructureManager,
        "conduit": ConduitManager,
        "cable": CableManager,
        "equipment": EquipmentManager,
        "circuit": CircuitManager,
        "connection": ConnectionManager,
        "line_of_count": LOCManager,
    }

    manager_classes_loaded = False

    # Engine for determining which proposed objects to include
    delta_filter = None

    product = MywProduct()

    # -----------------------------------------------------------------------
    #                            CONSTRUCTION
    # -----------------------------------------------------------------------

    def __init__(self, db_view, progress=MywProgressHandler()):
        """
        Init slots of self

        DB_VIEW is a MywFeatureView"""

        self.db = db_view.db
        self.db_view = db_view
        self.progress = progress

        # Static feature types
        Network.defineTypesFrom(self.db)
        self.networks = Network.types
        self.segments = Network.segment_types
        self.connections = Network.connection_types
        self.conduit_runs = ["mywcom_conduit_run"]
        self.line_of_counts = ["mywcom_line_of_count", "mywcom_line_of_count_section"]

        # Lookup from feature type to manager instance
        self._ft_managers = {}

        self._load_manager_classes()

    def _load_manager_classes(self):
        """
        Load custom manager classes as specified in settings and register triggers for all of them
        """

        if NetworkView.manager_classes_loaded:
            return
        
        NetworkView.manager_classes_loaded = True        

        custom_mgr_classes = self.db.setting("mywcom.customManagerClasses")
     
        self.progress(5,"Loading custom manager classes: ", custom_mgr_classes)

        if custom_mgr_classes:
            for mgr_type, mgr_class_path in custom_mgr_classes.items():              
                cls = self._load_manager_class(mgr_class_path)
                if not cls:
                    raise MywError(f"Unable to load manager class {mgr_class_path}")              
                NetworkView.manager_classes[mgr_type] = cls

        for mgr_class in NetworkView.manager_classes.values():
            mgr_class.registerTriggers(NetworkView)             

    def _load_manager_class(self, class_name, progress=MywProgressHandler()):
        """
        Loads manager class with CLASS_NAME
        """

        progress(9, "Finding manager class for", class_name)

        # Construct expected name of class file. Handles conversion of LOCManager to loc_manager.
        file_name = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', class_name)
        file_name = re.sub('([a-z0-9])([A-Z])', r'\1_\2', file_name).lower()     

        # For each module (including core) ..
        for module in self.product.modules():

            # Check if file exists
            file_path = module.file("server", "api", file_name + ".py")
            progress(9, "Trying", file_path)
            if not os.path.exists(file_path):
                continue

            # Load it .. and extract class
            progress(9, "Loading manager class from", file_path)
            python_path = module.python_path("server", "api", file_name)
            python_module = __import__(python_path, globals(), locals(), fromlist=("myworldapp"))
            engine_class = getattr(python_module, class_name)

            return engine_class

        # Case: Not found
        return None

    # -----------------------------------------------------------------------
    #                          CONFIGURED FEATURE TYPES
    # -----------------------------------------------------------------------

    @property
    def structs(self):
        if not hasattr(self, "_structs"):
            self._structs = self.db.setting("mywcom.structures")

        return self._structs

    @property
    def routes(self):
        if not hasattr(self, "_routes"):
            self._routes = self.db.setting("mywcom.routes")

        return self._routes

    @property
    def conduits(self):
        if not hasattr(self, "_conduits"):
            self._conduits = self.db.setting("mywcom.conduits")

        return self._conduits

    @property
    def equips(self):
        if not hasattr(self, "_equips"):
            self._equips = self.db.setting("mywcom.equipment")

        return self._equips

    @property
    def cables(self):
        if not hasattr(self, "_cables"):
            self._cables = self.db.setting("mywcom.cables")

        return self._cables

    @property
    def circuits(self):
        if not hasattr(self, "_circuits"):
            self._circuits = self.db.setting("mywcom.circuits")

        return self._circuits

    @property
    def other(self):
        """
        returns versioned feature types that are not registered as Network Manager Comms objects
        """
        all_versioned_feature_types = self.db_view.db.dd.featureTypes(
            "myworld", versioned_only=True
        )
        nm_feature_types = [
            key
            for d in [
                self.structs,
                self.routes,
                self.equips,
                self.cables,
                self.conduits,
                self.segments,
                self.connections,
                self.circuits,
            ]
            for key in d.keys()
        ]

        nm_feature_types += self.conduit_runs + self.line_of_counts

        other_feature_types = set(all_versioned_feature_types).difference(set(nm_feature_types))

        self._other = {}
        for ft in other_feature_types:
            self._other[ft] = {}

        return self._other

    # -----------------------------------------------------------------------
    #                             MANAGERS
    # -----------------------------------------------------------------------

    @property
    def struct_mgr(self):
        if not hasattr(self, "_struct_mgr"):
            self._struct_mgr = self.manager_classes["structure"](self, self.progress)

        return self._struct_mgr

    @property
    def conduit_mgr(self):
        if not hasattr(self, "_conduit_mgr"):
            self._conduit_mgr = self.manager_classes["conduit"](self, self.progress)

        return self._conduit_mgr

    @property
    def equip_mgr(self):
        if not hasattr(self, "_equip_mgr"):
            self._equip_mgr = self.manager_classes["equipment"](self, self.progress)

        return self._equip_mgr

    @property
    def cable_mgr(self):
        if not hasattr(self, "_cable_mgr"):
            self._cable_mgr = self.manager_classes["cable"](self, self.progress)

        return self._cable_mgr

    @property
    def circuit_mgr(self):
        if not hasattr(self, "_circuit_mgr"):
            self._circuit_mgr = self.manager_classes["circuit"](self, self.progress)

        return self._circuit_mgr

    @property
    def connection_mgr(self):
        if not hasattr(self, "_connection_mgr"):
            self._connection_mgr = self.manager_classes["connection"](self, self.progress)

        return self._connection_mgr

    @property
    def loc_mgr(self):
        if not hasattr(self, "_loc_mgr"):
            self._loc_mgr = self.manager_classes["line_of_count"](self, self.progress)

        return self._loc_mgr

    # -----------------------------------------------------------------------
    #                             NETWORK TYPES
    # -----------------------------------------------------------------------

    def networkFor(self, feature, side=None):
        """
        Get network for a feature taking into account the side if provided.
        """

        if side:
            fields = [f"equip_n_{side}_pins_field", "equip_n_pins_field"]
        else:
            fields = [
                "equip_n_in_pins_field",
                "equip_n_out_pins_field",
                "equip_n_pins_field",
            ]

        for name, network in self.networks.items():

            if feature.feature_type in [network.segment_type, network.slack_type]:
                return name

            for field in fields:
                field_name = getattr(network, field)
                if field_name in feature._descriptor.fields:
                    return name

    # -----------------------------------------------------------------------
    #                             MANAGER ACCESS
    # -----------------------------------------------------------------------

    def managerFor(self, rec):
        """
        Returns manager for REC if there is one
        """

        return self.managerForType(rec.feature_type)

    def managerForType(self, feature_type):
        """
        Returns manager for FEATURE_TYPE if there is one
        """

        if not feature_type in self._ft_managers:
            self._ft_managers[feature_type] = self._managerForType(feature_type)

        return self._ft_managers[feature_type]

    def _managerForType(self, feature_type):
        """
        Returns manager for feature type based on configuration
        """

        if self.structs.get(feature_type) or self.routes.get(feature_type):
            return self.struct_mgr

        if self.conduits.get(feature_type):
            return self.conduit_mgr

        if self.equips.get(feature_type):
            return self.equip_mgr

        if self.cables.get(feature_type) or self.segments.get(feature_type):
            return self.cable_mgr

        if self.circuits.get(feature_type):
            return self.circuit_mgr

        self.progress(2, "No manager for", feature_type)

        return None

    # -----------------------------------------------------------------------
    #                                DATA ACCESS
    # -----------------------------------------------------------------------

    def getRecs(self, tab, pred, include_proposed=False, change_type="insert"):
        """
        Returns records from table TAB filtered with PRED

        If INCLUDE_PROPOSED then include records from other deltas
        """

        recs = tab.filter(pred).all()

        if include_proposed:
            db = self.db
            current_delta = self.db_view.delta

            feature_model = db.dd.featureModel(tab.feature_type, schema="delta")

            # Build filter engine
            delta_filter = None
            if self.delta_filter:
                # pylint: disable=not-callable
                delta_filter = self.delta_filter(self, self.progress)

            # Find records from other deltas
            other_recs = (
                db.session.query(feature_model)
                .filter(feature_model.myw_change_type == change_type)
                .filter(feature_model.myw_delta != current_delta)
                .filter(pred.sqaFilter(feature_model.__table__))
            )

            # Add them to list (if appropriate)
            for rec in other_recs:

                # Apply filter
                if delta_filter and not delta_filter.include(rec):
                    continue

                # Set view (so that relationship following works)
                rec._view = self.db.view(rec.myw_delta)  # ENH: Share these?

                recs.append(rec)

        return recs

    def referencedRecs(self, recs, field_name):
        """
        Returns records referenced by FIELD_NAME or RECS (with duplicates removed)
        """

        ref_recs = set()

        for rec in recs:
            if field_name in rec._descriptor.fields:
                ref_recs.update(rec._field(field_name).recs())

        return list(ref_recs)

    # -----------------------------------------------------------------------
    #                                TRIGGERS
    # -----------------------------------------------------------------------

    # Hook for registering trigger methods. A list of (class,m
    triggers = {}

    @classmethod
    def registerTrigger(self, category, trigger_type, class_ref, meth_name):
        """
        Register a trigger for objects of type CATEGORY

        TRIGGER_TYPE is one of:
          pre_insert    callback: meth(feature)
          pos_insert    callback: meth(rec)
          pos_update    callback: meth(rec,orig_rec)
          pos_delete    callback: meth(rec)

        CLASS_REF is a class object whose constructor takes args nw_view and progress.
        METH_NAME is a method to call on CLASS."""

        # Find trigger list
        key = "{}_{}".format(category, trigger_type)
        triggers = self.triggers.get(key)

        if not triggers:
            triggers = self.triggers[key] = []

        # Add item
        triggers.append([class_ref, meth_name])

    def runPreInsertTriggers(self, feature):
        """
        Perform pre-insert actions
        """

        self.runTriggers(feature, "pre_insert")

    def runPosInsertTriggers(self, rec):
        """
        Perform post-insert actions
        """

        self.runTriggers(rec, "pos_insert")

    def runPosUpdateTriggers(self, rec, orig_rec):
        """
        Perform post-update actions
        """

        self.runTriggers(rec, "pos_update", orig_rec)

    def runPreDeleteTriggers(self, rec):
        """
        Perform pre-delete actions
        """

        self.runTriggers(rec, "pre_delete")

    def runTriggers(self, rec, trigger_type, *args):
        """
        Run registered trigger methods for REC (if any)

        Returns updated rec"""
        # ENH: Return a transaction

        # Determine record type
        category = self.categoryOf(rec.feature_type)
        self.progress(3, "Running", trigger_type, "triggers for", rec, "category=", category)

        # Get triggers to run
        key = "{}_{}".format(category, trigger_type)
        triggers = self.triggers.get(key)
        if not triggers:
            return rec

        # Run them
        for class_ref, meth_name in triggers:
            self.progress(5, "Running trigger", class_ref, meth_name, "on", rec)
            obj = class_ref(self, self.progress)
            func = getattr(obj, meth_name)
            func(rec, *args)

    def categoryOf(self, feature_type):
        """
        Returns manager for feature type based on configuration
        """

        return self._feature_types.get(feature_type)

    @property
    def _feature_types(self):
        """
        Network feature types (in top-down order)

        Return mapping from feature type -> category"""

        if not hasattr(self, "__feature_types"):
            self.__feature_types = {}
            for ft in self.routes:
                self.__feature_types[ft] = "route"
            for ft in self.structs:
                self.__feature_types[ft] = "struct"
            for ft in self.equips:
                self.__feature_types[ft] = "equip"
            for ft in self.conduits:
                self.__feature_types[ft] = "conduit"
            for ft in self.cables:
                self.__feature_types[ft] = "cable"
            for ft in self.circuits:
                self.__feature_types[ft] = "circuit"
            for ft in self.conduit_runs:
                self.__feature_types[ft] = "conduit_run"
            for ft in self.segments:
                self.__feature_types[ft] = "segment"
            for ft in self.connections:
                self.__feature_types[ft] = "connection"
            for ft in self.line_of_counts:
                self.__feature_types[ft] = "line_of_count"
            for ft in self.other:
                self.__feature_types[ft] = "other"

        return self.__feature_types
