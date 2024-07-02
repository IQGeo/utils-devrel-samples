# Copyright: IQGeo Limited 2010-2023

import copy, json, geojson
from geojson import FeatureCollection

import myworldapp.core.server.controllers.base.myw_globals as myw_globals
from myworldapp.core.server.base.core.myw_error import MywInternalError
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.controllers.base.myw_utils import featuresFromRecs

from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.api.mywcom_error import MywcomError
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.networks.connection_trace_node import (
    ConnectionTraceNode,
)
from myworldapp.modules.comms.server.networks.segment_trace_node import SegmentTraceNode
from myworldapp.modules.comms.server.networks.port_trace_node import PortTraceNode
from myworldapp.modules.comms.server.networks.pseudo_connection_trace_node import (
    PseudoConnectionTraceNode,
)


class PathFinderManager:
    """
    Provides protocols for calculating fiber paths which can be through unconnected fibers.

    Works as follows:
       1. Trace route network between start and end location to get a set of potential route paths.
          Doing this helps to constrain the fiber level trace and to provide us with a more accurate
          A* distance heuristic.
       2. Trace the fiber network and when we encounter a potential new connection, create a PseudoConnection node
          that jumps from in-coming range to out-going range. The outgoing range may be larger than incoming to give us the
          choice of which fiber to go down.
       3. When we find a complete path, we need to narrow the ranges at the pseudo connections to create a valid fiber
          path. Also tidy up path and extend into end structure as far as possible (so that we go through ODFs etc.)

    """

    # Prefix for settings
    setting_name = "mywcom.path_finder"

    # How the sort_by parameter is used to sort the results.
    sort_props = {
        "shortest": ["distance", "new_splices", "existing_splices"],
        "least_new": ["new_splices", "distance", "existing_splices"],
        "least_existing": ["existing_splices", "distance", "new_splices"],
    }

    def __init__(
        self, db, delta, progress=MywSimpleProgressHandler(3, "INFO: PATH FINDER ")
    ):
        self.db = db
        self.delta = delta
        self.progress = progress
        self.db_view = db.view(delta)
        self.nw_view = NetworkView(self.db_view)

    def findPaths(
        self,
        from_urn,
        to_urn,
        include_urns,
        avoid_urns,
        sort_by,
        max_paths,
        max_distance,
        options,
    ):
        """
        Find paths between FROM_URN and TO_URN up to MAX_PATHS. INCLUDE_URNS and AVOID_URNS are lists of URNs
        that need to be include or excluded from the paths.
        """

        self.progress(2, f"findPaths from={from_urn} to={to_urn}")

        self.checkValidStartLocation(from_urn)
        self.checkValidEndLocation(to_urn)

        if include_urns:
            include_urns = include_urns.split(";")
        if avoid_urns:
            avoid_urns = set(avoid_urns.split(";"))

        # Add options from settings. These are internal options for fine-tuning the algorithm.
        settings_options = self.db.setting(self.setting_name)
        if settings_options:
            for setting_name in settings_options:
                if setting_name not in options:
                    options[setting_name] = settings_options[setting_name]

        options["max_distance"] = (
            max_distance if max_distance else options["max_dist_default"]
        )

        # Create engines
        fiber_engine = self.networkEngineFor("mywcom_fiber", self.delta, options)
        fiber_path_engine = self.networkEngineFor(
            "mywcom_fiber_path", self.delta, options
        )
        route_engine = self.networkEngineFor("mywcom_routes", self.delta, {})

        # Trace out as far as we can along connected network and if we get a result return it
        result = self.traceOutConnected(fiber_engine, from_urn, to_urn, options)
        if result:
            return result

        stop_urn = self.toplevelHousing(to_urn)

        self.progress(2, "Looking for route paths ...")

        # The include_as_via means that we will trace a path to the first include urn, from there
        # to the second etc. The other branch is that we generate path and then filter out paths that don't
        # pass through all the include urns
        if options["include_as_via"]:
            (route_features, route_path_start) = self.findRoutePathsViaInclude(
                route_engine, from_urn, to_urn, include_urns, avoid_urns, options
            )
        else:
            (route_features, route_path_start) = self.findRoutePaths(
                route_engine, from_urn, to_urn, include_urns, avoid_urns, options
            )

        self.progress(
            2, f"Found route paths. Number of features: {len(route_features)}"
        )

        if not route_features:
            raise MywcomError("path_finder_no_route_paths")

        results = []
        options["route_features"] = route_features
        options["sort_by"] = sort_by
        end_nodes = []
        similar_found = 0

        self.progress(2, "Looking for fiber paths ...")

        for root_node, end_node in fiber_path_engine.findPaths(
            from_urn, [stop_urn], options=options, end_distances=self._end_distances
        ):

            if end_node:

                self.progress(2, f"Found path ending at {end_node.feature}")

                housings = self.housingsFor(end_node)
                if not set(include_urns) <= housings:
                    self.progress(
                        2, f"Excluding path. Doesn't pass through all include features"
                    )
                    continue

                # Check if similar to other paths
                if options["exclude_similar"] and self.isSimilarTo(
                    end_nodes, end_node, options["similarity_threshold"]
                ):
                    self.progress(
                        2, f"Excluding similar path that ends at {end_node.feature}"
                    )
                    similar_found += 1

                    # This ensures we don't loop if there really is only one path
                    if similar_found > max_paths:
                        break
                    else:
                        continue

                # Extend trace inside stop structure and ensure we end at a port
                extended_end_node = self.extendInternalPath(
                    fiber_engine, end_node, "both", root_node
                )
                if not extended_end_node:
                    continue

                (path, splices, new_splices) = self.extractPath(extended_end_node)

                self.progress(
                    2,
                    f"Found fiber path with {splices} existing splices and {new_splices} new splices",
                )

                # This compresses fiber segments for same cable and turns segments into cables
                path.tidy()

                self.calculateNewConnections(path)

                path = self.result_from(path, "tree", feature_types=None)

                results.append(
                    {
                        "properties": {
                            "distance": round(extended_end_node.dist, 2),
                            "existing_splices": splices,
                            "new_splices": new_splices,
                            "loss": round(extended_end_node.cumulativeLoss, 2),
                        },
                        "result": path,
                    }
                )

                self.add_results(results)

                end_nodes.append(end_node)

                similar_found = 0

            if len(results) >= max_paths:
                break

        self.sortResults(results, sort_by)

        self.logResults(route_path_start, root_node)

        self.progress(2, f"Fiber paths len={len(results)}")
        if len(results) == 0:
            raise MywcomError("path_finder_no_paths")

        return results

    def sortResults(self, results, sort_by):
        """
        Sort results as indicated by sort_by parameter
        """

        sort_tuple = self.sort_props[sort_by]

        def sort_key(item):
            return list(map(lambda prop: item["properties"][prop], sort_tuple))

        results.sort(key=sort_key)

    def isSimilarTo(self, end_nodes, end_node, threshold):
        """
        Detect if path is similar to ones we have already encountered.
        """

        end_node.routes = self.routesFor(end_node)

        for other_end_node in end_nodes:
            avg_size = (len(other_end_node.routes) + len(end_node.routes)) / 2
            measure = (
                len(other_end_node.routes.intersection(end_node.routes)) / avg_size
            )
            if measure * 100 > threshold:
                return True

        return False

    def housingsFor(self, end_node):
        """
        Calculate top level housings that path passes through
        """

        housings = set()

        while end_node:
            housing = self.toplevelHousing(end_node.feature._urn())
            if housing:
                housings.add(housing)

            # For routes, add start and end structures to set.
            feature_type = housing.split("/")[0]
            if feature_type in self.nw_view.routes:
                housing_rec = self.db_view.get(housing)
                housings.add(housing_rec.in_structure)
                housings.add(housing_rec.out_structure)

            end_node = end_node.parent

        return housings

    def routesFor(self, end_node):
        """
        Calculate route set for a path
        """
        routes = set()

        while end_node:
            route = self.routeFor(end_node)
            if route:
                routes.add(route)
            end_node = end_node.parent

        return routes

    def routeFor(self, node):
        """
        Calculate route for a node if it corresponds to one
        """

        feature = node.feature
        if hasattr(feature, "root_housing"):
            feature_type = feature.root_housing.split("/")[0]
            if feature_type in self.nw_view.routes:
                return feature.root_housing
        else:
            return None

    def traceOutConnected(self, fiber_engine, from_urn, to_urn, options):
        """
        Traceout using connected trace engine to see if we have a connected path to end.
        """

        (fiber_trace_root_node, fiber_trace_stop_node) = fiber_engine._trace(
            from_urn,
            "downstream",
            max_dist=options["max_distance"],
            max_nodes=options["max_nodes"],
        )

        # See if we have a path to the z-location
        (path, end_node) = self.pathTo(fiber_trace_root_node, to_urn)

        # If we have a path then just return it.
        if path:

            path.tidy()

            path = self.result_from(path, "tree", feature_types=None)

            results = []
            results.append(
                {
                    "properties": {
                        "distance": round(end_node.dist, 2),
                        "existing_splices": 0,
                        "new_splices": 0,
                        "loss": round(end_node.cumulativeLoss, 2),
                    },
                    "result": path,
                }
            )
            return results

    def pathTo(self, root_node, to_urn):
        """
        Find a path from ROOT_NODE which stops at TO_URN
        """

        stack = [root_node]
        path = None

        while stack:
            node = stack.pop()
            if node.children:
                stack.extend(node.children)
            else:
                if self.toplevelHousing(node.feature._urn()) == to_urn:
                    path = node
                    break

        if not path:
            return None, None

        end_node = path

        while path.parent:
            path.parent.children = [path]
            path = path.parent

        return (path, end_node)

    def add_results(self, results):
        """
        Add result if progress supports the method
        """

        # This is necessary as parent logger class is part of platform
        if callable(getattr(self.progress, "add_result", None)):
            self.progress.add_result({"paths": results})

    def extendInternalPath(self, trace_engine, node, direction, root_node):
        """
        Trace will have stopped at first entry into stop structure, so see if we can extend it further,
        through, for example, patch panels

        """

        struct_urn = self.toplevelHousing(node.feature._urn())
        stepping = True
        visited = set()

        while stepping:
            visited.add(node.node_id)

            stepping = False
            for conn_node in trace_engine.connectedNodes(node, direction, root_node):
                if conn_node.node_id in visited:
                    continue
                if not self.toplevelHousing(conn_node.feature._urn()) == struct_urn:
                    continue

                node = conn_node
                stepping = True

        # Check node is port trace node
        if isinstance(node, PortTraceNode):
            return node
        else:
            return None

    def calculateNewConnections(self, start_node):
        """
        Walk the path starting from NODE to narrow the ranges to match the size of the starting node.
        """

        node = start_node
        pins = node.pins

        while node.children:

            # This a simple path and so there will only be one child node
            child_node = node.children[0]
            if isinstance(child_node, PseudoConnectionTraceNode) or isinstance(
                child_node, ConnectionTraceNode
            ):
                # Narrow to range to fix range of pins
                from_pins = child_node.conn.from_pins
                from_pins.high = from_pins.low + pins.size - 1
                to_pins = child_node.conn.to_pins
                to_pins.high = to_pins.low + pins.size - 1
            elif isinstance(child_node, PortTraceNode) or isinstance(
                child_node, SegmentTraceNode
            ):
                node_pins = child_node.pins
                node_pins.high = node_pins.low + pins.size - 1

            node = child_node

    def toplevelHousing(self, urn):
        """
        Return root housing for URN or URN if it is not a contained feature
        """

        feature = self.db_view.get(urn)
        return feature.root_housing if hasattr(feature, "root_housing") else urn

    def findRoutePathsViaInclude(
        self, engine, from_urn, to_urn, include_urns, avoid_urns, options
    ):
        """
        Find the route shortest path. There has to be one and we will use it
        as part of heuristic to select edges to explore.
        """

        from_urn = self.toplevelHousing(from_urn)
        to_urn = self.toplevelHousing(to_urn)

        paths = []

        from_to_pairs = []
        current_urn = from_urn
        for urn in include_urns:
            from_to_pairs.append([current_urn, urn])
            current_urn = urn

        from_to_pairs.append([current_urn, to_urn])

        route_features = set()
        for (from_urn, to_urn) in from_to_pairs:

            for start_node, end_node in engine.findPaths(
                from_urn, [to_urn], avoid_urns=avoid_urns, options=options
            ):

                if not end_node:
                    continue

                paths.append((start_node, end_node))
                if len(paths) >= options["max_route_paths"]:
                    break

            for (start, end) in paths:
                self.routeSetForRouteTree(route_features, end)

        # calc least distance to end for each node in graph
        self._end_distances = {}
        for (start, end) in paths:
            self.distanceToEnd(end, end)

        return (route_features, start_node)

    def findRoutePaths(
        self, engine, from_urn, to_urn, include_urns, avoid_urns, options
    ):
        """
        Find the route shortest path. There has to be one and we will use it
        as part of heuristic to select edges to explore.
        """

        from_urn = self.toplevelHousing(from_urn)
        to_urn = self.toplevelHousing(to_urn)

        paths = []
        for start_node, end_node in engine.findPaths(
            from_urn, [to_urn], avoid_urns=avoid_urns, options=options
        ):

            if not end_node:
                continue

            paths.append((start_node, end_node))
            if len(paths) >= options["max_route_paths"]:
                break

        if include_urns:
            self.filterRoutePaths(start_node, to_urn, include_urns)

        # calc least distance to end for each node in graph
        self._end_distances = {}
        for (start, end) in paths:
            self.distanceToEnd(end, end)

        route_features = set()
        for (start, end) in paths:
            self.routeSetForRouteTree(route_features, end)

        return (route_features, start_node)

    def routeSetForRouteTree(self, routes, node):
        """
        Create a set of routes and structures from the path-tree
        """

        while node:
            feature = node.feature
            if (
                feature.feature_type in self.nw_view.routes
                or feature.feature_type in self.nw_view.structs
            ):
                routes.add(feature._urn())
            node = node.parent

    def distanceToEnd(self, node, end):
        """
        Store distance to end for each node in route paths
        """

        self._end_distances[node.feature._urn()] = end.dist - node.dist
        if node.parent:
            self.distanceToEnd(node.parent, end)

    def filterRoutePaths(self, node, end_urn, include_urns, urns_in_path=set()):
        """
        In a path-tree, chop out paths that do not pass through objects in INCLUDE_URNS
        """

        # ENH: Do not use recursion

        urns_in_path.add(node.feature._urn())

        # Reached end of path so check we have passed through all INCLUDE_URNS
        if not node.children:
            return node.feature._urn() == end_urn and set(include_urns) <= urns_in_path

        # Loop over children and if subpath from child is ok, keep it as
        # as child otherwise orphan it.
        children = []
        for child in node.children:
            if self.filterRoutePaths(child, end_urn, include_urns, urns_in_path.copy()):
                children.append(child)
            else:
                child.parent = None

        node.children = children
        return len(children) > 0

    def extractPath(self, node):
        """
        Extract path by walking back up path-tree
        """

        splices = 0
        new_splices = 0

        while node.parent:
            parent = copy.copy(node.parent)
            parent.children = [node]
            node.parent = parent
            node = parent

            splices += 1 if self.isSplice(node) else 0
            new_splices += 1 if self.isNewSplice(node) else 0

        return (node, splices, new_splices)

    def isSplice(self, node):
        return not isinstance(node, PseudoConnectionTraceNode) and isinstance(
            node, ConnectionTraceNode
        )

    def isNewSplice(self, node):
        return isinstance(node, PseudoConnectionTraceNode)

    def networkEngineFor(self, name, delta, options={}):
        """
        Returns MywNetworkEngine engine for network NAME (error if not found)
        """

        # Find network record
        network_def = self.db.config_manager.networkDef(name)

        # Construct engine
        db_view = self.db.view(delta)
        return MywNetworkEngine.newFor(
            db_view, network_def, extra_filters=options, progress=self.progress
        )

    def createCircuitFromPath(self, feature_type, feature, path):
        """
        Create circuit FEATURE_TYPE with properties in FEATURE making use of PATH.
        """

        # Create new connections in path
        self.createConnectionsInPath(path)

        # Set in and out properties from the path
        (in_qurn, out_qurn) = self.endsFromPath(path)

        (in_urn, in_pins) = in_qurn
        (out_urn, out_pins) = out_qurn

        props = feature["properties"]
        if "in_feature" not in props:
            props["in_feature"] = in_urn
            props["in_pins"] = in_pins

        if "out_feature" not in props:
            props["out_feature"] = out_urn
            props["out_pins"] = out_pins

        # Insert record
        table = self.db_view.table(feature_type)
        circuit = table.insert(props)

        out_feature = circuit._field("out_feature").rec()
        out_pins = PinRange.parse(circuit.out_pins)
        trace_node = self.nw_view.circuit_mgr.findPathTo(out_feature, out_pins, "fiber")

        # Set circuit route information and geometry
        self.nw_view.circuit_mgr.route(circuit, trace_node)

        return circuit

    def checkValidStartLocation(self, location_urn):
        """
        Check that start location is valid.
        """

        feature = self.db_view.get(location_urn)
        if not self.nw_view.equip_mgr.hasPorts(feature):
            raise MywcomError("path_finder_start_location_no_ports")

    def checkValidEndLocation(self, location_urn):
        """
        Check that the end location is valid - it has equipment with ports.
        """

        feature = self.db_view.get(location_urn)
        has_ports = [
            self.nw_view.equip_mgr.hasPorts(equip)
            for equip in self.nw_view.equip_mgr.allEquipmentIn(feature)
        ]

        if not any(has_ports):
            raise MywcomError("path_finder_end_location_no_ports")

    def endsFromPath(self, path):
        """
        Extract information about start and end of path suitable for circuit creation
        """

        nodes = path["nodes"]
        first_node = nodes["1"]
        in_qurn = (first_node["feature"], first_node["ports"])

        last_node = nodes[str(len(nodes))]
        out_qurn = (last_node["feature"], last_node["ports"])

        return (in_qurn, out_qurn)

    def createConnectionsInPath(self, path):
        """
        Create new connections in path
        """

        for node_idx in range(1, len(path["nodes"]) + 1):
            node = path["nodes"][str(node_idx)]
            if node.get("is_new_connection", False):
                housing = self.db_view.get(node["feature"])
                ftr1_urn = node["from_ref"]
                ftr2_urn = node["to_ref"]
                pins1 = PinRange.parse(node["from_pins"])
                pins2 = PinRange.parse(node["to_pins"])
                self.makeConnection(housing, ftr1_urn, pins1, ftr2_urn, pins2)

                self.progress(
                    4, "Setting connection: ", ftr1_urn, pins1, ftr2_urn, pins2
                )

    def makeConnection(self, housing, ftr1_urn, pins1, ftr2_urn, pins2):
        """
        Creates connection between cables. If there is a enclosure between the two cables in the housing,
        use that enclosure, otherwise create a new one (as per configuration).
        """

        ftr1 = self.db_view.get(ftr1_urn)
        ftr2 = self.db_view.get(ftr2_urn)

        settings_options = self.db.setting(self.setting_name)
        sc_feature_type = settings_options.get("splice_closure_type", "")
        props = settings_options.get("splice_closure_properties", {})

        # If no SC feature type configured, create connection in housing
        if not sc_feature_type:
            self.progress(
                2,
                "No SC feature type specified. Creating connection in structure housing",
            )
            self.nw_view.connection_mgr.connect(
                "fiber", housing, ftr1, pins1, ftr2, pins2
            )
            return

        # For each connection in housing, see if it's between the same segments as this connection
        # and use that enclosure.
        struct_conns = self.nw_view.connection_mgr.connectionsIn(housing)
        enclosure = None

        # Use the enclosure that the segments meet at if there is one
        if ftr1.out_equipment and ftr1.out_equipment == ftr2.in_equipment:
            enclosure = self.db_view.get(ftr1.out_equipment)
        elif ftr1.in_equipment and ftr1.in_equipment == ftr2.out_equipment:
            enclosure = self.db_view.get(ftr1.in_equipment)

        # Or see if there are existing connections
        if not enclosure:
            for conn in struct_conns:
                if conn.in_object in [ftr1_urn, ftr2_urn] and conn.out_object in [
                    ftr1_urn,
                    ftr2_urn,
                ]:
                    enclosure = self.db_view.get(conn.housing)
                    break


        # If not, create new enclosure
        if not enclosure:
            enclosure = self.createSpliceClosure(sc_feature_type, housing, props)

        self.nw_view.connection_mgr.connect(
            "fiber", enclosure, ftr1, pins1, ftr2, pins2
        )

    def createSpliceClosure(self, sc_feature_type, housing, props):
        """
        Create splice closure
        """

        table = self.db_view.table(sc_feature_type)
        props["root_housing"] = housing._urn()
        props["housing"] = housing._urn()

        enclosure = table.insert(props)
        self.nw_view.equip_mgr.posInsertTrigger(enclosure)
        enclosure._primary_geom_field.set(housing._primary_geom_field.geom())
        enclosure = self.db_view.table(enclosure.feature_type).update(enclosure)

        self.nw_view.runPosInsertTriggers(enclosure)

        return enclosure

    def result_from(self, tree, result_type, feature_types=None, application=None):
        """
        Returns trace result PATH as a jsonifible result (applying filters etc)

        Optional FEATURE_TYPES restricts result to those types only"""

        lang = None  # self.get_param(self.request, "lang", type=str, default=None)

        feature_aspects = {
            "include_display_values": True,
            "include_lobs": False,
            "include_geo_geometry": True,
            "lang": lang,
        }

        # Prevent return of inaccessible feature types
        # ENH: When in task worker, do we need to have an idea of the user?
        accessible_feature_types = self.featureTypes(
            "myworld", application_name=application
        )

        if feature_types:
            feature_types = set(feature_types).intersection(accessible_feature_types)
        else:
            feature_types = set(accessible_feature_types)

        # Case: List of features
        if result_type == "features":
            if not tree:
                return FeatureCollection([])
            recs = tree.subTreeFeatures(feature_types)
            features = featuresFromRecs(recs, **feature_aspects)
            return FeatureCollection(features)

        # Case: Tree
        if result_type == "tree":
            if not tree:
                return {}
            return tree.asTraceResult(feature_aspects, feature_types)

        # Case: Other
        raise MywInternalError("Bad result type:", result_type)

    def featureTypes(self, datasource, application_name=None, editable_only=False):
        """
        Names of the feature type in DATASOURCE user is authorised to view (or edit)

        If APPLICATION_NAME is given, return just items accessible to that application"""

        # ENH: Get rid of DATASOURCE arg, return a dist of lists?

        feature_defs = self.db.dd.featureTypes(datasource)

        return feature_defs

    def logResults(self, route_path_start, root_node):
        """
        Can be subclassed to log results to a file etc.
        """
        pass


def path_finder_process(
    db,
    progress,
    from_urn,
    to_urn,
    include_urns,
    avoid_urns,
    sort_by,
    max_paths,
    max_distance,
    options,
    delta,
    application,
):

    # Needed by pin_trace_node to calculate loss
    myw_globals.db = db

    fp_mgr = PathFinderManager(db, delta, progress=progress)
    results = fp_mgr.findPaths(
        from_urn,
        to_urn,
        include_urns,
        avoid_urns,
        sort_by,
        max_paths,
        max_distance,
        options,
    )

    return {"paths": results}
