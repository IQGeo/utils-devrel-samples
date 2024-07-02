# Copyright: IQGeo Limited 2010-2023

from collections import OrderedDict
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.modules.comms.server.base.geom_utils import GeomUtils

from .mywcom_error import DbConstraintError
from .manager import Manager
from sqlalchemy.sql import null


class ConduitManager(Manager):
    """
    Manager for maintaining conduits and conduit runs

    A conduit can be free standing or form part of a connected chain ('continuous').

    Continuous conduits:
      Fields 'in_conduit', and 'out_conduit' are required for continuous conduit
    """

    def __init__(self, view, progress=None):
        """
        Init slots of self
        """

        super().__init__(view, progress)

        # Conduit feature types configured as continuous
        types = []
        for ft, cfg in self.nw_view.conduits.items():
            if cfg.get("continuous", False):
                types.append(ft)

        self.continuous_conduit_types = types

    # -----------------------------------------------------------------------
    #                             TRIGGERS
    # -----------------------------------------------------------------------

    @classmethod
    def registerTriggers(self, NetworkView):
        """
        Register self's trigger methods on NETWORKVIEW
        """

        NetworkView.registerTrigger("conduit", "pre_delete", self, "preDeleteTrigger")

    def preDeleteTrigger(self, conduit):
        """
        Called before CONDUIT is deleted
        """

        self.progress(2, "Running delete trigger", conduit)

        # Validate conduit contains no cable
        self.assertNoCables(conduit)

        # Delete contained conduits
        self.deleteConduitsIn(conduit)

        # Disconnect from chain (if in one)
        self.disconnectConduit(conduit)

    # -----------------------------------------------------------------------
    #                               SPLITTING
    # -----------------------------------------------------------------------

    def splitConduitsAt(self, struct, route, new_route, proportion):
        """
        Split conduits of ROUTE at STRUCT, putting new segments in NEW_ROUTE

        Returns list of (conduit,new_conduit) pairs, keyed by urn of old conduit"""

        self.progress(2, "Splitting conduits of", route, "at", struct, "putting inside", new_route)

        cnd_splits = {}

        # Split all conduits
        for cnd_tab_name in self.nw_view.conduits:
            cnd_table = self.db_view.table(cnd_tab_name)
            cnds = cnd_table.filterOn("root_housing", route._urn())

            for cnd in cnds.orderBy("id"):
                new_cnd = self.splitConduitAt(cnd, struct, route, new_route, proportion)
                cnd_splits[cnd._urn()] = (cnd, new_cnd)

        # Build housing lookup
        splits = {}
        splits.update(cnd_splits)
        splits[route._urn()] = (route, new_route)

        # Set housings and geoms
        for (cnd, new_cnd) in cnd_splits.values():
            (housing, new_housing) = splits[cnd.housing]

            new_cnd.housing = new_housing._urn()
            self.setConduitGeom(cnd, housing, update_segs=False, update_contained_conduits=False)
            self.setConduitGeom(
                new_cnd, new_housing, update_segs=False, update_contained_conduits=False
            )

        return cnd_splits

    def splitConduitAt(self, cnd, struct, root_housing, new_root_housing, proportion):
        """
        Split CND at STRUCT, putting new part into NEW_ROOT_HOUSING
        """

        self.progress(3, "Splitting", cnd, "of", root_housing, "at", struct)

        # Is this a conduit that could be chained with others
        is_continuous = self.continuousConduit(cnd)

        # Add new conduit
        new_cnd = self.insertCopy(cnd, triggers=True)
        new_cnd.root_housing = new_root_housing._urn()

        # If cnd has length... adjust lengths
        if cnd._descriptor.fields.get("length") and cnd.length:
            original_length = cnd.length
            cnd.length = original_length * proportion
            new_cnd.length = original_length * (1 - proportion)

        # Set start / end structures
        cnd._field("out_structure").set([struct])
        new_cnd._field("in_structure").set([struct])

        # Link conduit
        if is_continuous:
            new_cnd.name = cnd.name
            self.linkConduitAfter(struct, cnd, new_cnd)

        return new_cnd

    def linkConduitAfter(self, struct, conduit, new_conduit):
        """
        Insert NEW_CONDUIT into the chain after CONDUIT
        """

        self.progress(2, "Linking", conduit, "after", new_conduit)

        prev_conduit = conduit._field("in_conduit").rec()
        next_conduit = conduit._field("out_conduit").rec()

        # Link new_conduit -> conduit
        self.linkConduitsAt(struct, conduit, new_conduit)

        if prev_conduit:
            self.linkConduitsAt(conduit._field("in_structure").rec(), prev_conduit, conduit)

        if next_conduit:
            self.linkConduitsAt(
                new_conduit._field("out_structure").rec(), new_conduit, next_conduit
            )

    # -----------------------------------------------------------------------
    #                             MAINTENANCE
    # -----------------------------------------------------------------------

    def updateConduits(self, housing):
        """
        Update conduits and segments inside HOUSING to match housing
        geometry and structures (recursive)

        Returns list of cable segments modified"""
        # ENH: Replace recursion by use of root_housing

        conduits = self.conduitsOf(housing)
        segs = []

        for conduit in conduits:

            # Update conduit
            derived_props = self.derivedPropsFor(conduit, housing)
            conduit.in_structure = derived_props["in_structure"]
            conduit.out_structure = derived_props["out_structure"]

            geom = self.derivedGeomFor(conduit, housing)
            conduit._primary_geom_field.set(geom)

            self.update(conduit)

            # Update contained cables
            segs += self.nw_view.cable_mgr.updateSegments(conduit)

            # Update conduit runs
            self.maintainConduitRunFor(conduit)

            # Update contained conduits (and their cables)
            segs += self.updateConduits(conduit)

        return segs

    def updateConduitGeoms(self, housing, update_segs=True):
        """
        Update geometry of all conduits in HOUSING (a route or conduit)
        """
        # ENH: Replace recursion by use of root_housing

        self.progress(4, "Updating conduit geoms inside", housing)

        segs = []
        for cnd in self.conduitsOf(housing):
            segs += self.setConduitGeom(cnd, housing, update_segs)

        return segs

    def setConduitGeom(self, cnd, housing, update_segs=True, update_contained_conduits=True):
        """
        Update geometry of CND to match HOUSING (a route or conduit)

        Also updates contained cable segments and conduit runs

        Returns cable segments modified"""

        self.progress(
            4, "Setting geometry of", cnd, "from", housing, update_segs, update_contained_conduits
        )

        # Update conduit
        # ENH: Only if changed
        geom = self.derivedGeomFor(cnd, housing)
        cnd._primary_geom_field.set(geom)
        self.update(cnd)

        # Update conduit run
        self.maintainConduitRunFor(cnd)

        # Propagate changes to contained cables and conduits
        segs = []
        if update_segs:
            segs = self.nw_view.cable_mgr.updateSegmentGeoms(cnd)

        if update_contained_conduits:
            segs += self.updateConduitGeoms(cnd, update_segs)

        return segs

    def deleteConduitsIn(self, housing):
        """
        Delete conduits in housing and all inner conduits
        """
        # ENH: Replace recursion by use of root_houing

        self.progress(3, "Deleting conduits inside", housing)

        for conduit in self.conduitsOf(housing):
            self.deleteConduit(conduit)

    def deleteConduit(self, conduit):
        """
        Delete CONDUIT (and any inner conduits) (recursive)

        Throws error if cables are inside
        """

        self.progress(5, "Deleting conduit", conduit)

        # Check no cables
        self.assertNoCables(conduit)

        # Delete inner conduits
        for inner_conduit in self.conduitsOf(conduit):
            self.deleteConduit(inner_conduit)

        # Disconnect from chain (if necessary)
        self.disconnectConduit(conduit)

        # Delete the conduit itself
        self.deleteRecord(conduit)

    def assertNoCables(self, conduit):
        """
        Throws DbConstraintError if CONDUIT contains cables
        """

        if self.nw_view.cable_mgr.containsCable(conduit):
            raise DbConstraintError("conduit_has_cable", feature=conduit)

    def moveToHousing(self, conduit, housing):
        """
        Move CONDUIT into HOUSING
        If conduit is continuous moves all conduits of run into corresponding housing
        """

        if self.continuousConduit(conduit):
            # Move into continuous housing if appropriate
            ordered_conduits = self.conduitChain(conduit)
            original_housing = conduit._field("housing").rec()

            # Move all condits in run into route
            if self.continuousConduit(original_housing):
                self.moveContConduitOutOfContHousingIntoRoute(ordered_conduits, original_housing)
            else:
                self.setHousing(conduit, housing)

            # Move all conduits in run into appropriate housing
            if self.continuousConduit(housing):
                self.moveConduitIntoContinuousHousing(ordered_conduits, housing)
            else:
                self.setHousing(conduit, housing)

        else:
            self.setHousing(conduit, housing)

    def moveContConduitOutOfContHousingIntoRoute(self, ordered_conduits, housing_conduit):
        """
        Moves each segment of ORDERED_CONDUITS out of each segment of HOUSING (which is also a continuous conduit)
        Puts each segment on the root_housing of the segment
        """

        # Find the connected conduits of housing_conduit
        housing_conduits = self.conduitChain(housing_conduit)
        housing_conduit_urns = [r._urn() for r in housing_conduits]

        # For each conduit in the run
        for conduit in ordered_conduits:
            # If conduit.housing is in housing_conduit... move it to root
            if conduit.housing in housing_conduit_urns:
                conduit.housing = conduit.root_housing
                self.update(conduit)

    def moveConduitIntoContinuousHousing(self, ordered_conduits, housing_conduit):
        """
        Moves each segment of ORDERED_CONDUITS into matching segments of HOUSING
        HOUSING is also a continuous conduit
        """

        housing_conduits = self.conduitChain(housing_conduit)

        # Build lookup table route -> housing_conduit
        routes = {}
        for housing_conduit in housing_conduits:
            routes[housing_conduit.root_housing] = housing_conduit

        # For each conduit in the run...
        for conduit in ordered_conduits:
            # Find housing in same route
            housing_conduit = routes.get(conduit.root_housing)

            # If found move conduit into it
            if housing_conduit:
                conduit.housing = housing_conduit._urn()
                self.update(conduit)

    # -----------------------------------------------------------------------
    #                          CHAIN MANAGEMENT
    # -----------------------------------------------------------------------

    def _assertCanConnectAt(self, feature, struct):
        """
        Throws DbConstraintError if FEATURE is inside a continuous conduit at STRUCT
        """

        housing = feature._field("housing").rec()

        if self.isContinuousAt(housing, struct):
            raise DbConstraintError("conduit_is_continuous")

    def isContinuousAt(self, conduit, struct):
        """
        True if CONDUIT is a conduit and is passthrough at STRUCT
        """

        if not self.continuousConduit(conduit):
            return False

        struct_urn = struct._urn()

        if conduit.in_structure == struct_urn and conduit.in_conduit:
            return True

        if conduit.out_structure == struct_urn and conduit.out_conduit:
            return True

        return False

    def continuousConduit(self, conduit=None, feature_type=None):
        """
        Returns true if conduit supports chaining
        """

        if not feature_type:
            feature_type = conduit.feature_type

        return feature_type in self.continuous_conduit_types

    def connectedConduitAt(self, conduit, struct):
        """
        Returns conduit to which CONDUIT is connected in STRUCT (if any)
        """

        if not self.isContinuousAt(conduit, struct):
            return

        struct_urn = struct._urn()

        if conduit.in_structure == struct_urn:
            return conduit._field("in_conduit").rec()

        if conduit.out_structure == struct_urn:
            return conduit._field("out_conduit").rec()

    def connect(self, struct, conduit1, conduit2):
        """
        Connect CONDUIT1 to CONDUIT2 at STRUCT (if possible)
        """

        self.progress(2, "Connecting", conduit1, "to", conduit2, "in", struct)

        if self.nw_view.cable_mgr.containsCable(conduit1) or self.nw_view.cable_mgr.containsCable(
            conduit2
        ):
            raise DbConstraintError("conduit_contains_cable")

        if self.isContinuousAt(conduit1, struct) or self.isContinuousAt(conduit2, struct):
            raise DbConstraintError("conduit_already_connected")

        struct_urn = struct._urn()
        if (conduit1.in_structure != struct_urn and conduit1.out_structure != struct_urn) or (
            conduit2.in_structure != struct_urn and conduit2.out_structure != struct_urn
        ):
            raise DbConstraintError("conduit_not_found")

        self.linkConduitsAt(struct, conduit1, conduit2)

        # Update conduit run
        self.maintainConduitRunFor(conduit1)

    def conduitChain(self, conduit):
        """
        Returns chain of conduits of which CONDUIT is a member
        """

        if not self.continuousConduit(conduit):
            return []

        return self._orderedConduits(start_conduit=conduit)

    def chainConduits(self, conduit_infos):
        """
        Connect CONDUIT_INFOS together

        CONDUIT_INFOS is list of [conduit,forward]
        """

        # Firstly unlink conduits
        for conduit_info in conduit_infos:
            conduit_info[0].in_conduit = None
            conduit_info[0].out_conduit = None

        # Now link conduits
        for i, conduit_info in enumerate(conduit_infos):

            conduit = conduit_info[0]

            if i > 0:
                prev_conduit_info = conduit_infos[i - 1]
                prev_conduit = prev_conduit_info[0]
                prev_conduit_forward = prev_conduit_info[1]

                if prev_conduit_forward:
                    struct = prev_conduit._field("out_structure").rec()
                else:
                    struct = prev_conduit._field("in_structure").rec()

                self.linkConduitsAt(struct, prev_conduit, conduit)

            self.update(conduit)

    def disconnectConduit(self, conduit):
        """
        Disconnect CONDUIT from those either side of it
        """

        if not self.continuousConduit(conduit):
            return  # Nothing to do

        in_conduit = conduit._field("in_conduit").rec()
        if in_conduit:
            in_struct = conduit._field("in_structure").rec()
            self.unlinkConduitAt(in_struct, in_conduit)
            self.maintainConduitRunFor(in_conduit)

        out_conduit = conduit._field("out_conduit").rec()
        if out_conduit:
            out_struct = conduit._field("out_structure").rec()
            self.unlinkConduitAt(out_struct, out_conduit)
            self.maintainConduitRunFor(out_conduit)

        if not in_conduit and not out_conduit:
            # Single standalone conduit, ensure run is deleted
            conduit_run = conduit._field("conduit_run").rec()
            if conduit_run:
                self.deleteRecord(conduit_run)

    def disconnectConduitAt(self, conduit, struct):
        """
        Disconnect/cut conduit at pass through
        """

        # Get current connected conduit
        other_conduit = self.connectedConduitAt(conduit, struct)

        if not other_conduit:
            self.progress(2, "Conduit not connected", conduit, "at", struct)
            return

        # Prepare for update
        self.progress(2, "Disconnecting", conduit, "at", struct)

        # Unlink the conduits
        self.unlinkConduitAt(struct, conduit)
        self.unlinkConduitAt(struct, other_conduit)

        # Maintain the conduit runs
        self.maintainConduitRunFor(conduit)
        self.maintainConduitRunFor(other_conduit, force_new=True)

    def _orderedConduits(self, start_conduit=None, conduits=None):
        """
        Helper to follow chain of connected conduits

        CONDUITS - provide list of conduits to follow chain within
        START_CONDUIT - provide to follow chain starting from that conduit, used if no chain provided
        """

        if conduits is None:
            # Follow reference fields
            get_joined_conduits = lambda conduit: [
                conduit._field("in_conduit").rec(),
                conduit._field("out_conduit").rec(),
            ]
        else:
            # Follow chain within provided conduits
            start_conduit = conduits[0]

            # Build mapping from urn -> conduit
            conduits_map = {}
            for conduit in conduits:
                conduits_map[conduit._urn()] = conduit

            get_joined_conduits = lambda conduit: [
                conduits_map.get(conduit.in_conduit),
                conduits_map.get(conduit.out_conduit),
            ]

        # Walk up to the 'head' of the chain, which is the end we reach first
        seen_conduits = set()

        head_conduit = None
        next_conduit = start_conduit

        while next_conduit:
            head_conduit = next_conduit
            seen_conduits.add(next_conduit)

            joined_conduits = get_joined_conduits(next_conduit)

            if not joined_conduits[0]:
                break

            next_conduit = None
            for joined_conduit in joined_conduits:
                if joined_conduit not in seen_conduits:
                    next_conduit = joined_conduit
                    break

        # Now walk to the other end of the chain
        seen_conduits = set()
        ordered_conduits = []

        next_conduit = head_conduit

        while next_conduit:
            ordered_conduits.append(next_conduit)
            seen_conduits.add(next_conduit)

            joined_conduits = get_joined_conduits(next_conduit)

            next_conduit = None
            for joined_conduit in joined_conduits:
                if joined_conduit is None:
                    continue

                if joined_conduit not in seen_conduits:
                    next_conduit = joined_conduit
                    break

        return ordered_conduits

    def linkConduitsAt(self, struct, conduit1, conduit2):
        """
        Connect conduits at STRUCT

        Does NOT maintain conduit runs"""

        self.progress(2, "Linking", conduit1, "and", conduit2, "at", struct)

        struct_urn = struct._urn()

        # Link 1 -> 2
        if conduit1.in_structure == struct_urn:
            conduit1.in_conduit = conduit2._urn()
        if conduit1.out_structure == struct_urn:
            conduit1.out_conduit = conduit2._urn()

        if conduit2.in_structure == struct_urn:
            conduit2.in_conduit = conduit1._urn()
        if conduit2.out_structure == struct_urn:
            conduit2.out_conduit = conduit1._urn()

        self.update(conduit1)
        self.update(conduit2)

    def unlinkConduitAt(self, struct, conduit):
        """
        Disconnect CONDUIT in STRUCT

        Does NOT update the linked conduit i.e. leaves chain broke"""
        # ENH: Do both sides of chain

        struct_urn = struct._urn()

        unlinked_conduits = set()

        if conduit.in_structure == struct_urn:
            in_conduit = conduit._field("in_conduit").rec()
            if in_conduit:
                self.progress(6, "Unlinking", conduit, "from", in_conduit)
                unlinked_conduits.add(in_conduit)
                conduit.in_conduit = None

        if conduit.out_structure == struct_urn:
            out_conduit = conduit._field("out_conduit").rec()
            if out_conduit:
                self.progress(6, "Unlinking", conduit, "from", out_conduit)
                unlinked_conduits.add(out_conduit)
                conduit.out_conduit = None

        self.update(conduit)

        for unlinked_conduit in unlinked_conduits:
            self.unlinkConduitAt(struct, unlinked_conduit)

    # -----------------------------------------------------------------------
    #                                ROUTING
    # -----------------------------------------------------------------------

    def findPath(self, structs, conduit_type=None):
        """
        Returns an ordered list of routes
        """

        # Use cable manager to find the path
        # ENH: Move to superclass or structure manager
        cable_mgr = self.nw_view.cable_mgr
        route_infos = cable_mgr.findPath(structs, conduit_type)

        # Get route records from result
        routes = [route[0] for route in route_infos]

        # Is the path for a continuous chain of conduits
        continuous = conduit_type and self.continuousConduit(feature_type=conduit_type)

        # Remove duplicates keeping order
        # Note: Unlike cables we don't want to create conduits both ways)
        if not continuous:
            return list(OrderedDict.fromkeys(routes))

        # Include all routes for complete chain
        return routes

    def routeConduit(self, feature_type, props, structs, count):
        """
        Route new conduits between STRUCTS. PROPS is a dict or GeoJSON feature

        If FEATURE_TYPE supports chaining, also creates as conduit run

        Returns the conduit records created"""

        # ENH: Split this up

        self.progress(2, "Route conduit", feature_type)

        # Use cable manager to find the path
        # ENH: Move to superclass or structure manager
        cable_mgr = self.nw_view.cable_mgr
        route_infos = cable_mgr.findPath(structs, feature_type)

        continuous = self.continuousConduit(feature_type=feature_type)

        all_conduits = []

        conduit_table = self.db_view.table(feature_type)

        # ENH: Make this configurable or a parameter
        add_tube_number = continuous and (count > 1)

        # Determine if we want to create bundles
        bundle_feature_type = self.bundleFeatureType(feature_type)

        if bundle_feature_type:
            bundle_table = self.db_view.table(bundle_feature_type)
            bundle_continuous = self.continuousConduit(feature_type=bundle_feature_type)
            create_bundle = count > 1
        else:
            create_bundle = False

        bundle_chain = []

        # For each conduit in bundle...
        for i in range(count):
            path_conduits = []
            processed_routes = set()

            route_count = 0

            # Route conduit
            for route, forward in route_infos:

                # Do not create additional conduits for duplicate routes unless looking for a
                # continuous chain
                if route in processed_routes and not continuous:
                    continue
                processed_routes.add(route)

                # Create detached conduit
                det_conduit = conduit_table._new_detached()
                det_conduit.updateFrom(props)
                det_conduit.id = None  # Make sure new ID will be generated
                if continuous:
                    det_conduit.conduit_run = None
                    det_conduit.in_conduit = None
                    det_conduit.out_conduit = None
                det_conduit.root_housing = self.rootHousingUrn(route)
                det_conduit.housing = route._urn()

                # Set housing to bundle if we have one
                if len(bundle_chain) >= route_count + 1:
                    det_conduit.housing = bundle_chain[route_count][0]._urn()

                geom = route._primary_geom_field.geom()

                # Always create conduits in same direction as route
                det_conduit.in_structure = route.in_structure
                det_conduit.out_structure = route.out_structure
                det_conduit._primary_geom_field.set(geom)

                # Insert the conduit running pre/pos insert trigger
                new_conduit = self.insertRecord(det_conduit, True)

                path_conduits.append([new_conduit, forward])

                route_count += 1

                if create_bundle and i == 0:
                    # Create a bundle conduit to put created conduits in
                    # Note that these are not going to be joined together
                    det_bundle = bundle_table._new_detached()

                    det_bundle.updateFrom(new_conduit)
                    det_bundle.bundle_size = count
                    det_bundle.id = None  # Important to clear the ID so sequence is used

                    new_bundle = self.insertRecord(det_bundle, True)
                    new_bundle_urn = new_bundle._urn()

                    # Set as the housing on the conduit
                    new_conduit.housing = new_bundle_urn

                    bundle_chain.append([new_bundle, forward])

            if create_bundle and bundle_continuous and i == 0:
                # Join bundle conduits together
                self.chainConduits(bundle_chain)
                self.maintainConduitRunFor(bundle_chain[0][0])

            if continuous:
                # Set consistent name
                use_name = path_conduits[0][0].name

                if add_tube_number:
                    use_name = "{} : {}".format(use_name, i + 1)

                for conduit_info in path_conduits:
                    conduit_info[0].name = use_name

                # Join conduits making up the path together
                self.chainConduits(path_conduits)
                self.maintainConduitRunFor(path_conduits[0][0])

            for conduit_info in path_conduits:
                all_conduits.append(conduit_info[0])

        return all_conduits

    # -----------------------------------------------------------------------
    #                              CONDUIT RUNS
    # -----------------------------------------------------------------------

    def maintainConduitRunFor(
        self, conduit=None, ordered_conduits=None, force_new=False, delete_unused=True
    ):
        """
        Creates/updates conduit runs for continuous conduits

        ORDERED_CONDUITS - if provided this is the ordered path of conduits for the run
                           otherwise path is processed using conduit

        FORCE_NEW - if True then will generate a new conduit run record for the path.
        """
        # ENH: Split this method up, provide separate API for create new

        # Check for no need to create run
        continuous = ordered_conduits or (conduit and self.continuousConduit(conduit))
        if not continuous:
            return

        self.progress(3, "Maintaining conduit run for", conduit, force_new, delete_unused)

        # Find connected conduits
        if ordered_conduits is None:
            ordered_conduits = self.conduitChain(conduit)
        self.progress(6, "Conduit chain:", ordered_conduits)

        # Find their conduit_run records
        current_conduit_runs = set()
        if not force_new:
            for ordered_conduit in ordered_conduits:
                conduit_run = ordered_conduit._field("conduit_run").rec()

                if conduit_run:
                    current_conduit_runs.add(conduit_run)

        current_conduit_runs = sorted(current_conduit_runs, key=lambda r: r._id)

        self.progress(6, "Found conduit runs:", current_conduit_runs)

        # Reduce to a single conduit_run record
        if len(current_conduit_runs) == 0:
            # Create a new one
            run_table = self.db_view.table("mywcom_conduit_run")
            det_run = run_table._new_detached()
            use_run_record = self.insertRecord(det_run, True)

        elif len(current_conduit_runs) == 1:
            use_run_record = current_conduit_runs[0]

        else:
            # Have too many, keep first and delete the others
            use_run_record = current_conduit_runs[0]

            if delete_unused:
                for run_record in current_conduit_runs[1:]:
                    self.progress(4, "Deleting", run_record)

                    # Ensure conduits no longer pointing at the run
                    for conduit in run_record._field("conduits").recs():
                        conduit.conduit_run = None
                        self.update(conduit)

                    self.deleteRecord(run_record)

        self.progress(3, "Using", use_run_record)

        # Add conduits to run (where necessary)
        for conduit in ordered_conduits:
            if conduit.conduit_run != use_run_record._urn():
                self.progress(
                    5, "Changing", conduit, "run:", conduit.conduit_run, "->", use_run_record
                )
                conduit._field("conduit_run").set([use_run_record])
                self.update(conduit)

        # Remove conduits no longer in run
        orphaned_conduits = set(use_run_record._field("conduits").recs()) - set(ordered_conduits)

        for conduit in orphaned_conduits:
            self.progress(5, "Removing", conduit, "from", conduit.conduit_run)
            conduit.conduit_run = None
            self.update(conduit)

        # Build run geometry
        geom = self.calcConduitRunGeom(ordered_conduits)
        original_geom = use_run_record._primary_geom_field.geom()

        # If no geometry, and original geometry, update
        if not geom:
            if original_geom:
                primary_geom_name = use_run_record._descriptor.primary_geom_name
                use_run_record[primary_geom_name] = null()
                self.update(use_run_record)
            return use_run_record

        if not GeomUtils.coordsEqual(geom, original_geom):
            self.progress(5, "Setting geometry for", use_run_record, "to", geom)
            use_run_record._primary_geom_field.set(geom)
            self.update(use_run_record)

        return use_run_record

    def reBuildRunGeometry(self, conduit_run):
        """
        Set the geometry for CONDUIT_RUN from its conduits
        """
        # ENH: Only if unchanged?

        # Build new geometry
        ordered_conduits = self.conduitRunChain(conduit_run)
        geom = self.calcConduitRunGeom(ordered_conduits)
        original_geom = conduit_run._primary_geom_field.geom()

        # If no geometry, and original geometry, set it
        if not geom:
            if original_geom:
                primary_geom_name = conduit_run._descriptor.primary_geom_name
                conduit_run[primary_geom_name] = null()
                self.update(conduit_run)
            return

        # Set it
        conduit_run._primary_geom_field.set(geom)
        return self.update(conduit_run)

    def conduitRunChain(self, conduit_run):
        """
        The conduits of CONDUIT_RUN, in order
        """

        conduits = conduit_run._field("conduits").recs(ordered=True)

        if len(conduits) == 0:
            return []

        return self._orderedConduits(conduits=conduits)

    def calcConduitRunGeom(self, ordered_conduits):
        """
        Calculate line string based on ORDERED_CONDUITS
        """

        coords = []
        for ordered_conduit in ordered_conduits:
            conduit_geom = ordered_conduit._primary_geom_field.geom()
            conduit_coords = conduit_geom.coords

            # Determine how to chain the conduit coordinates into the overall chain
            if coords:
                if coords[0] == conduit_coords[0]:
                    coords.reverse()  # Reverses in-place

                elif coords[0] == conduit_coords[-1]:
                    coords.reverse()  # Reverses in-place
                    conduit_coords = conduit_coords[::-1]  # Reverses coordinates

                elif coords[-1] == conduit_coords[-1]:
                    conduit_coords = conduit_coords[::-1]  # Reverses coordinates

            for c in conduit_coords:
                if coords and c == coords[-1]:
                    continue
                coords.append(c)

        # Prevent wrong geometry being built
        coords = self.fixupLineStringCoords(coords)
        if not coords:
            return None

        return MywLineString(coords)

    # -----------------------------------------------------------------------
    #                                HELPERS
    # -----------------------------------------------------------------------

    def conduitsOf(self, housing, ordered=False):
        """
        Returns conduits in HOUSING (a route or conduit)
        """

        if not "conduits" in housing._descriptor.fields:
            return []

        return housing._field("conduits").recs(ordered=ordered)

    def bundleFeatureType(self, conduit_type):
        """
        Feature type to use as bundles for CONDUIT_TYPE
        """

        return self.nw_view.conduits.get(conduit_type, {}).get("bundle_type")

    def conduitRunsFor(self, conduits):
        """
        Conduit runs referenced by CONDUITS
        """

        return self.nw_view.referencedRecs(conduits, "conduit_run")

    # -----------------------------------------------------------------------
    #                                CONTENTS
    # -----------------------------------------------------------------------

    def conduitsAt(self, struct, include_proposed=False):
        """
        All conduits that start or end at STRUCT
        """

        struct_urn = struct._urn()

        conduits = []

        for feature_type in self.nw_view.conduits:
            tab = self.db_view.table(feature_type)
            pred = (tab.field("in_structure") == struct_urn) | (
                tab.field("out_structure") == struct_urn
            )

            conduits += self.nw_view.getRecs(tab, pred, include_proposed)

        return conduits

    def conduitsIn(self, route, include_proposed=False):
        """
        All conduits in ROUTE
        """

        route_urn = route._urn()

        conduits = []

        for feature_type in self.nw_view.conduits:
            tab = self.db_view.table(feature_type)
            pred = tab.field("root_housing") == route_urn

            conduits += self.nw_view.getRecs(tab, pred, include_proposed)

        return conduits
