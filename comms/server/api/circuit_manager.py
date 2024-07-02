# Copyright: IQGeo Limited 2010-2023

from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.api.mywcom_error import MywcomError
from myworldapp.core.server.base.core.myw_progress import MywProgressHandler
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.db.myw_db_predicate import MywDbPredicate
from myworldapp.core.server.networks.myw_network_engine import MywNetworkEngine
from myworldapp.modules.comms.server.base.geom_utils import GeomUtils

from .manager import Manager
from .pin_range import PinRange
from sqlalchemy.sql import null

from myworldapp.modules.comms.server.base.geom_utils import GeomUtils


class CircuitManager(Manager):
    """Engine for routing circuits via a fibre network trace"""

    # -----------------------------------------------------------------------
    #                                 ROUTING
    # -----------------------------------------------------------------------
    
    def routeCircuit(self,circuit,tech):
        """
        Routes a circuit using start and end information on circuit record. Raises exception if there
        is no path.
        """
    
        out_feature = circuit._field("out_feature").rec()
        out_pins = PinRange.parse(circuit.out_pins)
      
        self.unroute(circuit, tech)
      
        in_node = self.findPathTo(out_feature, out_pins, tech)

        if in_node is None or in_node.feature._urn() != circuit.in_feature or in_node.pins.spec != circuit.in_pins:
            raise MywcomError("bad_circuit_path", bad_path=True) 

        self.route(circuit, in_node)


    def findPathTo(self, feature, pins, tech):
        """Find path terminating at pins.
        Returns IN_NODE (a fiber trace node) or None"""

        self.progress(1, "Finding path to", feature, pins)

        # Get network engine
        network = self.nw_view.networks[tech]
        network_def = self.db.config_manager.networkDef(network.network_name)
        network_engine = MywNetworkEngine.newFor(self.db_view, network_def)

        # Trace upstream
        out_node = network_engine.traceOutRaw(feature, pins, "upstream")  # ENH: Support pins in

        # Find upstream end
        in_nodes = out_node.leafNodes()

        if len(in_nodes) > 1:
            return None

        self.progress(3, "Found upstream paths:", *in_nodes)
        in_node = in_nodes[0]

        return in_node

    def route(self, circuit, in_node):
        """Set route for CIRCUIT from trace that starts at IN_NODE (a fiber trace node)
        Updates features to reference the circuit, and sets the circuit's geometry"""

        self.progress(1, "Routing", circuit)

        # Get tables
        circuit_tab = self.db_view.table(circuit.feature_type)

        # Set service port
        self.progress(1, "Setting service port:", in_node.feature, in_node.pins)
        circuit._field("in_feature").set([in_node.feature])
        circuit.in_pins = in_node.pins.spec
        circuit_tab.update(circuit)

        # Apply circuit information to the features
        node = in_node
        while node:
            self._applyCircuitInfo(circuit, node)
            node = node.parent

        # Build circuit geometry from trace features
        geom = self.constructGeomFromTrace(circuit, in_node)
        self.applyGeometry(circuit, geom)

    def _applyCircuitInfo(self, circuit, node):
        """Updates the node's feature to contain reference to the circuit"""

        # Case: Port node
        if node.type == "port":
            circuit_info = self.parseCircuitInfo(node.feature.circuits)
            if not circuit_info.get(circuit._urn()):
                circuit_info[circuit._urn()] = []
            circuit_info[circuit._urn()].append(node.pins)
            node.feature.circuits = self.serializeEquipmentCircuits(circuit_info)
            self.update(node.feature)

        # Case: Cable segment node
        if node.type == "segment" and node.leaving:
            circuit_info = self.parseCircuitInfo(node.feature.circuits)
            circuit_info[circuit._urn()] = [node.pins]
            node.feature.circuits = self.serializeCableCircuits(circuit_info)
            self.update(node.feature)

    def unroute(self, circuit, tech):
        """Remove routing substructure"""

        # Get all segemnts fiber_segments of the circuit
        cable_segs = self.cableSegmentsOf(circuit, tech)
        if not cable_segs:
            return

        # Remove circuit information from the fiber_segments
        for seg in cable_segs:
            circuit_infos = self.parseCircuitInfo(seg.circuits)
            del circuit_infos[circuit._urn()]
            seg.circuits = self.serializeCableCircuits(circuit_infos)
            self.update(seg)

        # Get a list of all structures from the fiber_segments
        struct_urns = set()
        for seg in cable_segs:
            struct_urns.add(seg.in_structure)
            struct_urns.add(seg.out_structure)

        # For each Structure, and each Equipment type,
        # locate and remove the circuit from Equipment
        for feature_type in self.nw_view.equips:
            if (
                self.nw_view.equips[feature_type]["tech"] == "fiber"
                or self.nw_view.equips[feature_type]["tech"] == "mixed"
            ):

                tab = self.db_view.table(feature_type)
                for struct_urn in struct_urns:
                    pred = tab.field("root_housing") == struct_urn
                    pred &= tab.field("circuits").like("%{}?%".format(circuit._urn()))
                    equips = self.nw_view.getRecs(tab, pred)

                    # Remove circuit from the equipment
                    for equip in equips:
                        circuit_infos = self.parseCircuitInfo(equip.circuits)
                        del circuit_infos[circuit._urn()]
                        equip.circuits = self.serializeEquipmentCircuits(circuit_infos)
                        self.update(equip)

    # -----------------------------------------------------------------------
    #                                 DATA ACCESS
    # -----------------------------------------------------------------------

    def structHasCircuits(self, struct):
        """True if there are any circuits running on equipment or internal segments in STRUCT"""

        # Check equipment ports
        all_equips = self.nw_view.equip_mgr.equipsIn(struct)

        if any(hasattr(equip, "circuits") and self.equipHasCircuits(equip) for equip in all_equips):
            return True

        # Check internal segments
        all_internal_segs = self.nw_view.cable_mgr.internalSegmentsOf(struct)
        if any(seg.circuits for seg in all_internal_segs):
            return True

        # Check splices
        splice_conns = self.nw_view.connection_mgr.connectionsOfAll(
            struct, "root_housing", splices=True
        )
        return self.connectionsHaveCircuits(splice_conns)

    def equipHasCircuits(self, equip):
        """True if there are any circuits running on EQUIP"""

        if not hasattr(equip, "circuits"):
            return False
        # Check equipment ports
        circuit_infos = self.parseCircuitInfo(equip.circuits)
        if len(circuit_infos) > 0:
            return True

        # Check splices
        splice_conns = self.nw_view.connection_mgr.connectionsOfAll(equip, "housing", splices=True)
        if self.connectionsHaveCircuits(splice_conns):
            return True

        return False

    def segmentHasCircuits(self, seg):
        """True if there are any circuits running on cable segment SEG"""

        circuit_infos = self.parseCircuitInfo(seg.circuits)
        return len(circuit_infos) > 0

    def pinsHaveCircuits(self, feature, pins):
        """True if there are any circuits running on PINS of FEATRUE (a cable segment or equip)"""

        for rec in self.circuitsOn(feature, pins, False, False):
            return True

        return False

    def circuitSegmentsAt(self, struct, include_proposed=False):
        """Gets circuit_segments attached at struct."""
        all_segments = self.allCableSegmentsAt(struct, include_proposed)

        all_circuit_segments = []
        for seg in all_segments:
            all_circuit_segments += self.toCircuitSegments(seg)

        circuit_segments = self.uniqueFirstsBy(all_circuit_segments, ["seg_urn", "circuit_urn"])
        return circuit_segments

    def circuitPortsAt(self, struct, include_proposed=False):
        """Gets circuit_ports at structure."""
        equips = self.allEquipsIn(struct, include_proposed)
        all_circuit_ports = []
        for equip in equips:

            all_circuit_ports += self.toCircuitPorts(equip)

        circuit_ports = self.uniqueFirstsBy(all_circuit_ports, ["equip_urn", "circuit_urn", "side"])
        return circuit_ports

    def circuitSegmentsIn(self, route, include_proposed):
        """Gets all circuit_segments in ROUTE.
        A circuit_segment is a deprecated model which represents a circuit through a cable_segment.
        This method returns data from the cable_segment that mimics the structure of a circuit_segment"""

        all_circuit_segments = []

        for segment_type in self.nw_view.segments:
            tab = self.db_view.table(segment_type)
            pred = tab.field("root_housing") == route._urn()
            all_segments = self._getRecs(tab, pred, include_proposed)

            for seg in all_segments:
                all_circuit_segments += self.toCircuitSegments(seg)

        circuit_segments = self.uniqueFirstsBy(all_circuit_segments, ["seg_urn", "circuit_urn"])
        return circuit_segments

    def toCircuitPorts(self, equip):
        """Converts EQUIP circuits field to list<circuit_port> representation"""
        circuit_ports = []

        if not hasattr(equip, "circuits"):
            return circuit_ports
        circuit_infos = self.parseCircuitInfo(equip.circuits)
        for circuit_urn, pin_ranges in circuit_infos.items():
            for pin_range in pin_ranges:
                circ = {
                    "circuit_urn": circuit_urn,
                    "equip_urn": equip._urn(),
                    "low": pin_range.low,
                    "high": pin_range.high,
                    "side": pin_range.side,
                }
                if hasattr(equip, "myw_delta") and equip.myw_delta != self.db_view.delta:
                    circ["delta"] = equip.myw_delta

                circuit_ports.append(circ)
        return circuit_ports

    def toCircuitSegments(self, cable_seg):
        """Converts CABLE_SEG circuits field to list<circuit_segment> representation"""
        circuit_segments = []
        circuit_infos = self.parseCircuitInfo(cable_seg.circuits)
        for circuit_urn, pin_ranges in circuit_infos.items():
            for pin_range in pin_ranges:
                circ = {
                    "circuit_urn": circuit_urn,
                    "seg_urn": cable_seg._urn(),
                    "low": pin_range.low,
                    "high": pin_range.high,
                }
                if hasattr(cable_seg, "myw_delta") and cable_seg.myw_delta != self.db_view.delta:
                    circ["delta"] = cable_seg.myw_delta

                circuit_segments.append(circ)
        return circuit_segments

    def circuitsOn(self, feature, pins, get_circuits=False, include_proposed=False):
        """
        Return circuits on a piece of equipment or housing FEATURE
        """

        circuits_by_pin = {}

        # If looking for proposed, get all representations of this feature
        recs = [feature]
        if include_proposed:
            tab = self.db_view.table(feature.feature_type)
            pred = tab.field("id") == feature.id
            recs = self._getRecs(tab, pred, include_proposed)

        for rec in recs:

            if not hasattr(rec, "circuits"):
                continue

            circuit_infos = self.parseCircuitInfo(rec.circuits)
            if not circuit_infos:
                continue

            for circuit_id in circuit_infos:
                circ_item = circuit_id
                if get_circuits:
                    the_view = (
                        self.db.view(rec.myw_delta) if hasattr(rec, "myw_delta") else self.db_view
                    )
                    circ_item = the_view.get(circuit_id)

                for circuit_range in circuit_infos[circuit_id]:
                    if pins.side and circuit_range.side and pins.side != circuit_range.side:
                        continue

                    intersect = pins.intersect(circuit_range)
                    if intersect:
                        for pin in intersect.range():
                            if not circuits_by_pin.get(pin):
                                circuits_by_pin[pin] = {}
                            if not circuit_id in circuits_by_pin[pin]:
                                circuits_by_pin[pin][circuit_id] = circ_item

        # Convert to an array
        for pin in circuits_by_pin:
            circuits_by_pin[pin] = list(circuits_by_pin[pin].values())

        return circuits_by_pin

    def parseCircuitInfo(self, circuits):
        """Parses circuit information for circuits field"""
        results = {}
        if not circuits:
            return results

        for circuit_info in circuits.split(";"):
            (circ, qualifiers_str) = circuit_info.split("?")
            if not results.get(circ):
                results[circ] = []

            for qualifier_str in qualifiers_str.split("&"):
                (key, val) = qualifier_str.split("=")
                val_parts = val.split(":")

                if key == "in" or key == "out":
                    results[circ].append(PinRange(key, int(val_parts[0]), int(val_parts[1])))
                else:
                    results[circ].append(PinRange(None, int(val_parts[0]), int(val_parts[1])))

        return results

    def serializeCableCircuits(self, circuit_info):
        """Serialize fiber_segment circuit info"""
        qurns = []
        for circuit_id, pin_ranges in circuit_info.items():
            for pin_range in pin_ranges:
                qurn = "{0}?fibers={1}:{2}".format(circuit_id, pin_range.low, pin_range.high)
                qurns.append(qurn)

        qurns.sort()
        return ";".join(qurns)

    def serializeEquipmentCircuits(self, circuit_info):
        """Serializes equipment circuit info"""
        qurns = []
        for circuit_id, pin_ranges in circuit_info.items():
            qualifiers = [
                "{0}={1}:{2}".format(pin_range.side, pin_range.low, pin_range.high)
                for pin_range in pin_ranges
            ]
            qualifiers.sort()
            qurns.append("{0}?{1}".format(circuit_id, "&".join(qualifiers)))

        qurns.sort()
        return ";".join(qurns)

    def connectionsHaveCircuits(self, conn_recs):
        """True if there are any circuits running on connections CONN_RECS"""

        def pinsIntersect(a, b):
            if (a.side and b.side) and (a.side != b.side):
                return False
            return a.intersect(b) is not None

        for conn_rec in conn_recs:
            # Check In Side
            the_object = conn_rec._field("in_object").rec()
            if hasattr(the_object, "circuits"):
                in_pins = PinRange(conn_rec.in_side, conn_rec.in_low, conn_rec.in_high)
                circuit_infos = self.parseCircuitInfo(the_object.circuits)
                for circuit_urn, pin_ranges in circuit_infos.items():
                    if any([pinsIntersect(pr, in_pins) for pr in pin_ranges]):
                        return True

            # Check Out Side
            the_object = conn_rec._field("out_object").rec()
            if hasattr(the_object, "circuits"):
                out_pins = PinRange(conn_rec.out_side, conn_rec.out_low, conn_rec.out_high)
                circuit_infos = self.parseCircuitInfo(the_object.circuits)
                for circuit_urn, pin_ranges in circuit_infos.items():
                    if any([pinsIntersect(pr, out_pins) for pr in pin_ranges]):
                        return True

        return False

    def allEquipsIn(self, struct, include_proposed=False):
        # ENH: Move this and _getRecs to a better place.  Concerned about ruining existing functionality.
        """Gets all equipment in a structure.  Optionally retrieves equipment from other deltas"""
        struct_urn = struct._urn()
        equips = []

        for feature_type in self.nw_view.equips:
            tab = self.db_view.table(feature_type)
            pred = tab.field("root_housing") == struct_urn

            equips_by_type = self._getRecs(tab, pred, include_proposed)
            equips += equips_by_type

        return equips

    def allCableSegmentsAt(self, struct, include_proposed=False, tech="fiber"):
        """
        Gets all cable_segements in or connected to struct.  Optionally gets cable_segments from other deltas

        Note: This is similar to segmentsAt on cable manager except that this method also includes updated segments

        """

        struct_urn = struct._urn()

        segs = []
        for segment_type in self.nw_view.segments:
            tab = self.db_view.table(segment_type)
            pred = (tab.field("in_structure") == struct_urn) | (
                tab.field("out_structure") == struct_urn
            )

            segs += list(self._getRecs(tab, pred, include_proposed))

        return segs

    def _getRecs(self, tab, pred, include_proposed):
        """Gets recs in current and future view.
        Note that this is similar to getRecs, but also includes Updated features."""

        recs = tab.filter(pred).all()

        if include_proposed:
            # Now load Updates/Inserts
            current_delta = self.db_view.delta
            feature_model = self.db.dd.featureModel(tab.feature_type, schema="delta")

            # Find records from other deltas
            other_recs = (
                self.db.session.query(feature_model)
                .filter(feature_model.myw_change_type != "delete")
                .filter(feature_model.myw_delta != current_delta)
                .filter(pred.sqaFilter(feature_model.__table__))
            )
            recs += list(other_recs)

        return recs

    def uniqueFirstsBy(self, items, props):
        """From iterable of ITEMS, extracts the first unique items grouped by PROPS.
        PROPS is an array of property names.
        ITEMS is an iterable of objects, sorted such that items first seen have higher priority"""
        results = []
        uniques = {}
        for item in items:
            item_values = [item[p] for p in props]

            is_new = False
            tracker = uniques
            for v in item_values:
                if not v in tracker:
                    is_new = True
                    tracker[v] = {}
                tracker = tracker[v]

            if is_new:
                results.append(item)
        return results

    # -----------------------------------------------------------------------
    #                               MAINTENANCE
    # -----------------------------------------------------------------------

    def updateCircuitsAtStruct(self, cable_segs, old_coord, new_coord):
        """Updates the geometry for all circuits passing through CABLE_SEGS at a structure"""

        if not cable_segs:
            return

        circuit_ids = set()

        for cable_seg in cable_segs:
            circuit_urns = self.parseCircuitInfo(cable_seg.circuits)
            for circuit_urn in circuit_urns:
                circuit_ids.add(circuit_urn)

        # Rebuild geometry for each circuit in set
        for circuit_id in circuit_ids:
            self.updateCircuitPointById(circuit_id, old_coord, new_coord)

    def updateCircuitsInRoute(self, cable_segs, new_route_geom=None, old_route_geom=None):
        """
        Updates the geometry for all circuits passing through CABLE_SEGS that pass through a route
        """

        if not cable_segs:
            return

        circuit_ids = set()

        for cable_seg in cable_segs:
            circuit_urns = self.parseCircuitInfo(cable_seg.circuits)
            for circuit_urn in circuit_urns:
                circuit_ids.add(circuit_urn)

        # Rebuild geometry for each circuit in set
        for circuit_id in circuit_ids:
            self.updateCircuitRouteById(circuit_id, new_route_geom, old_route_geom)

    def updateCircuitPointById(self, circuit_id, old_coord, new_coord):
        """Updates the circuit geometry for the circuit with id CIRCUIT_ID"""
        circuit = self.db_view.get(circuit_id)
        geom = circuit._primary_geom_field.geom()

        new_circuit_geom = GeomUtils.replacePoint(geom, old_coord, new_coord)
        self.applyGeometry(circuit, new_circuit_geom)

    def updateCircuitRouteById(self, circuit_id, new_route_geom=None, old_route_geom=None):
        """Updates the circuit geometry for the circuit with id CIRCUIT_ID"""
        circuit = self.db_view.get(circuit_id)
        if new_route_geom:
            circuit_geom = circuit._primary_geom_field.geom()

            new_circuit_geom = GeomUtils.replaceLinestring(
                circuit_geom, old_route_geom, new_route_geom
            )
            if new_circuit_geom:
                self.progress(2, "updateCircuitById. quick update done")
                self.applyGeometry(circuit, new_circuit_geom)
                return

        if not new_route_geom or not new_circuit_geom:
            self.progress(2, "updateCircuitById. slow update needed")
            self.reconstructGeom(circuit)

    def reconstructGeom(self, circuit, update=True, tech="fiber"):
        """Reconstructs the circuit geometry by re-running a network trace.
        Optionally updates the circuit with the new geometry."""
        out_feature = circuit._field("out_feature").rec()
        out_pins = PinRange.parse(circuit.out_pins)
        trace_node = self.findPathTo(out_feature, out_pins, tech)
        geom = self.constructGeomFromTrace(circuit, trace_node)
        if update:
            self.applyGeometry(circuit, geom)
        return geom

    def constructGeomFromTrace(self, circuit, in_node):
        """Constructs the circuit geometry from trace result node"""
        self.progress(2, "Building primary geometry for", circuit)

        if not in_node:
            return None

        # Flatten trace node structure
        trace_nodes = []
        node = in_node
        while node:
            trace_nodes.append(node)
            node = node.parent

        # Create the geometry by merging all segments
        # Note that we only are interested in "leaving" trace nodes so that we don't get duplicates
        seg_nodes = [tn for tn in trace_nodes if tn.type == "segment" and tn.leaving]
        lines = [list(seg.feature._primary_geom_field.geom().coords) for seg in seg_nodes]
        merged_coords = GeomUtils.lineMerge(lines)
        merged_coords = GeomUtils.removeDuplicates(merged_coords)

        # Now that we have created the geometry, ensure that it is oriented correctly
        term_point = trace_nodes[-1].feature._primary_geom_field.geom().coord
        if GeomUtils.dist(merged_coords[0], term_point) < GeomUtils.dist(
            merged_coords[-1], term_point
        ):
            merged_coords = list(reversed(merged_coords))

        return MywLineString(merged_coords)

    def applyGeometry(self, circuit, geom):
        """Sets the geometry on the circuit and saves"""
        if geom:
            circuit._primary_geom_field.set(geom)
        else:
            primary_geom_name = circuit._descriptor.primary_geom_name
            circuit[primary_geom_name] = null()

        self.update(circuit)

    def cableSegmentsOf(self, circuit, tech):
        """Gets fiber segments that the circuit passes through."""

        segment_type = self.nw_view.networks[tech].segment_type
        seg_tab = self.db_view.table(segment_type)
        # ENH: A 'like' query may perform poorly in large databases.
        segs = [
            x
            for x in seg_tab.filter(seg_tab.field("circuits").like("%{}?%".format(circuit._urn())))
        ]
        return segs

    # -----------------------------------------------------------------------
    #                             TRIGGERS
    # -----------------------------------------------------------------------

    @classmethod
    def registerTriggers(self, NetworkView):
        """
        Register self's trigger methods on NETWORKVIEW
        """

        NetworkView.registerTrigger("circuit", "pos_insert_api", self, "routeCircuitTriggerAPI")
        NetworkView.registerTrigger("circuit", "pos_update_api", self, "updateRouteCircuitTriggerAPI")
        NetworkView.registerTrigger("circuit", "pre_delete_api", self, "unrouteCircuitTriggerAPI")
       
    def routeCircuitTriggerAPI(self, circuit, *args):
        """
        Args includes original request body and hence any additional data.
        Can be subclassed to route circuit making use of additional data.
        """

        self.routeCircuit(circuit, "fiber")

    def updateRouteCircuitTriggerAPI(self, circuit, *args):
        """
        Args includes original request body and hence any additional data.
        Can be subclassed to route circuit making use of additional data.
        """

        # This clears old route as well.  
        self.routeCircuit(circuit, "fiber")

    def unrouteCircuitTriggerAPI(self, circuit, *args):
        """
        Args includes original request body and hence any additional data.
        Can be subclassed to route circuit making use of additional data.
        """

        self.unroute(circuit, "fiber")        
        

   