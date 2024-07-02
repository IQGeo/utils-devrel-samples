# Copyright: IQGeo Limited 2010-2023

from .manager import Manager
from .mywcom_error import DbConstraintError
from myworldapp.core.server.base.geom.myw_point import MywPoint
import math


class EquipmentManager(Manager):
    """
    Manager for maintaining equipment
    """

    equipment_offset_dis = 0.00001605  # distance between structure and new offset
    tolerance = 1e-8
    radius_meters = 6371008.8  # Same radius as Turf

    def __init__(self, nw_view, progress=None):
        super().__init__(nw_view, progress)

        self.equip_offset_dis_meters = (
            self.radius_meters * math.pi * self.equipment_offset_dis
        ) / 180.0

        self.db = nw_view.db

    # -----------------------------------------------------------------------
    #                             TRIGGERS
    # -----------------------------------------------------------------------

    @classmethod
    def registerTriggers(self, NetworkView):
        """
        Register self's trigger methods on NETWORKVIEW
        """

        NetworkView.registerTrigger("equip", "pos_insert", self, "posInsertTrigger")
        NetworkView.registerTrigger("equip", "pos_update", self, "posUpdateTrigger")
        NetworkView.registerTrigger("equip", "pre_delete", self, "preDeleteTrigger")

    def posInsertTrigger(self, equip):
        """
        Called after EQUIP is inserted
        """

        self.progress(2, "Running insert trigger", equip)

        offset = self.offsetFor(equip)
        if offset:
            self.createEquipmentOffsetGeom(equip)

    def posUpdateTrigger(self, equip, orig_equip):
        """
        Called after EQUIP is updated

        ORIG_EQUIP is a pre-update clone of the equipment record
        """

        self.progress(2, "Running post-update trigger", equip)

        if self.functionOf(equip) == "slack":
            self.nw_view.cable_mgr.updateSlackSegment(equip)

    def preDeleteTrigger(self, equip):
        """
        Called before EQUIP is deleted
        """

        self.progress(2, "Running pre-delete trigger", equip)

        # Delete connections and internal segments
        self.disconnect(equip)

        # Maintain line of count information
        self.nw_view.loc_mgr.handleEquipmentDelete(equip)

        # Delete child equips and their connections
        for sub_equip in self.allEquipmentIn(equip):
            self.deleteEquipment(sub_equip)

    # -----------------------------------------------------------------------
    #                             OFFSET EQUIPMENT
    # -----------------------------------------------------------------------

    def createEquipmentOffsetGeom(self, equipment):
        """
        Saves new offset equipment in 'offset_geom'
        """
        offset_equipment = self.newOffsetForEquipment(equipment)
        equipment._field("offset_geom").set(offset_equipment)
        self.update(equipment)
        return equipment

    def newOffsetForEquipment(self, equipment):
        """
        Creates new offset equipment. Checks the secondary geometry of both cables and equipment in same housing.
        """
        housing = equipment._field("root_housing").rec()
        lines_to_avoid = self.getCableOffsets(housing)
        points_to_avoid = self.getEquipmentOffsets(housing)
        geoms_to_avoid = points_to_avoid + lines_to_avoid

        offset_bearing = 0
        increment = 180
        circuits = 1
        bearings = []
        while circuits < 4:
            # place offset equipment at equal angles based on the number of circuits. Circuit one is in 180 deg increments, circuit 2 is 90 deg, circuit 3 is 45 deg, etc.
            if offset_bearing == 360:
                # starting a new circuit
                offset_bearing = 0
                circuits += 1
                increment = 360 / 2**circuits

            # check that we haven't tried to use this location in a previous circuit
            if offset_bearing not in bearings:
                offset_geom = self.getPointAtDistance(
                    equipment._primary_geom_field.geom(),
                    offset_bearing,
                    self.equip_offset_dis_meters,
                )
                # check for intersecting geometry on previous equipment and cable offsets
                if all(
                    self.isValidOffset(offset_geom, other_geom) for other_geom in geoms_to_avoid
                ):
                    # beyond the tolerance from existing offsets, use this geometry
                    return offset_geom

                bearings.append(offset_bearing)

            offset_bearing += increment

        return None

    def isValidOffset(self, offset_geom, other_geom):
        """
        Compares the average distance of two geometries
        """
        total = 0
        for coord in offset_geom.coords:
            total += other_geom.distance(MywPoint(coord))

        count = len(offset_geom.coords.xy[0])
        ave = total / count
        return ave > 1e-6

    def getCableOffsets(self, housing):

        all_segments = self.nw_view.cable_mgr.segmentsAt(housing)
        coax_cables = self.nw_view.cable_mgr.getRouteOffsets(all_segments)

        return list(coax_cables)

    def getEquipmentOffsets(self, housing):
        """
        Returns current cables and equipment offset geometry
        """

        all_equips = self.equipmentOf(housing)
        # find other offset feature_types
        coax_equip_features = list(
            filter(
                lambda eq: self.offsetFor(eq),
                all_equips,
            )
        )
        equip_offset_geoms = []
        for equip_feature in coax_equip_features:
            equip_offset_geom = equip_feature._field("offset_geom").geom()
            if equip_offset_geom is not None:
                equip_offset_geoms.append(equip_offset_geom)

        return equip_offset_geoms

    def offsetFor(self, equipment):
        """
        Checks equipment config for offset on this feature_type
        """

        equip_defs = self.equipConfig()
        offset = equip_defs[equipment.feature_type].get("offset") == True

        return offset

    def equipConfig(self):
        if not hasattr(self, "_equipConfig"):
            self._equipConfig = self.db.setting("mywcom.equipment")

        return self._equipConfig

    def getPointAtDistance(self, orig_point, bearing, dis):
        R = self.radius_meters
        lat1 = math.radians(orig_point.y)
        lon1 = math.radians(orig_point.x)
        a = math.radians(bearing)
        lat2 = math.asin(
            math.sin(lat1) * math.cos(dis / R) + math.cos(lat1) * math.sin(dis / R) * math.cos(a)
        )
        lon2 = lon1 + math.atan2(
            math.sin(a) * math.sin(dis / R) * math.cos(lat1),
            math.cos(dis / R) - math.sin(lat1) * math.sin(lat2),
        )
        return MywPoint(math.degrees(lon2), math.degrees(lat2))

    # -----------------------------------------------------------------------
    #                           CONTAINMENT
    # -----------------------------------------------------------------------

    def moveAssembly(self, equip, housing):
        """
        Move EQUIP and its children to HOUSING

        If this is to a different root housing then connections and internal segments are deleted
        """

        self.progress(2, "Moving assembly", equip, housing)

        new_root_housing = self.rootHousingUrn(housing)
        changed_root_housing = equip.root_housing != new_root_housing

        # Move equip
        if changed_root_housing:
            self.disconnect(equip)
        self.setHousing(equip, housing)

        # Move contained equipment
        equip_geom = equip._primary_geom_field.geom()
        for sub_equip in self.allEquipmentIn(equip):
            if changed_root_housing:
                self.disconnect(sub_equip)
            sub_equip._primary_geom_field.set(equip_geom)
            sub_equip.root_housing = new_root_housing
            self.update(sub_equip)

    def copyAssembly(self, equip, housing):
        """
        Add copy of EQUIP and its children to HOUSING (recursive)

        Does not copy connections or internal segments
        """

        self.progress(2, "Copying assembly", equip, housing)

        housing_geom = housing._primary_geom_field.geom()

        housing_urn = housing._urn()
        root_housing_urn = self.rootHousingUrn(housing)

        new_equip = self.insertCopy(
            equip, False, housing=housing_urn, root_housing=root_housing_urn, name=None
        )
        new_equip._primary_geom_field.set(housing_geom)

        # Run triggers (to set name etc)
        self.nw_view.runPosInsertTriggers(new_equip)

        equips = self.equipmentOf(equip)

        for child_equip in equips:
            self.copyAssembly(child_equip, new_equip)

        return new_equip

    def allEquipmentIn(self, housing, features=None):
        """
        Returns all equipment under HOUSING (including sub equipment)
        """
        # ENH: Possibly faster to use root_housing then filter?

        if features is None:
            features = set()

        equips = self.equipmentOf(housing)
        for equip in equips:
            features.add(equip)
            self.allEquipmentIn(equip, features)

        return features

    def equipmentOf(self, rec):
        """
        Returns equipment housed directly in REC
        """

        urn = rec._urn()
        equips_config = self.nw_view.equips
        equips = []

        for feature_type in equips_config:
            equip_tab = self.db_view.table(feature_type)

            pred = equip_tab.field("housing") == urn
            equips += self.nw_view.getRecs(equip_tab, pred, include_proposed=True)

        return equips

    def deleteEquipment(self, equip):
        """
        Delete EQUIP and its connections
        """

        self.progress(2, "Deleting", equip)
        self.disconnect(equip)
        self.nw_view.loc_mgr.handleEquipmentDelete(equip)
        self.deleteRecord(equip)

    def disconnect(self, equip):
        """
        Delete connections and internal segments owned by EQUIP
        """

        # Prevent corruption of circuit paths
        if self.nw_view.circuit_mgr.equipHasCircuits(equip):
            raise DbConstraintError("equipment_has_circuit", feature=equip)

        if self.functionOf(equip) == "slack":
            # If directly removing slack, remove slack segment(s), maintain connections if they exist
            self.nw_view.cable_mgr.deleteSlackSegment(equip)
        else:
            # Remove connections
            self.nw_view.connection_mgr.deleteConnections(equip)
            self.nw_view.cable_mgr.deleteInternalSegments(equip)

        # Remove any explicit segment containment relationships
        self.nw_view.cable_mgr.removeSegmentsFrom(equip)

    # -----------------------------------------------------------------------
    #                          STRUCTURE CONTAINMENT
    # -----------------------------------------------------------------------
    # Provided for speed. Use root_housing field

    def updateEquipGeoms(self, struct):
        """
        Update location of all equipment contained within STRUCT
        """

        struct_urn = struct._urn()

        geom = struct._primary_geom_field.geom()

        equips_config = self.nw_view.equips

        # For each equipment type ..
        for feature_type in equips_config:
            equip_tab = self.db_view.table(feature_type)

            # For each equip in structure .. update position
            for equip in equip_tab.filterOn("root_housing", struct_urn):
                equip._primary_geom_field.set(geom)
                self.update(equip)

    def deleteEquipmentInStructure(self, struct):
        """
        Deletes all equipment and connections in STRUCT
        """

        # Prevent corruption of circuit paths
        if self.nw_view.circuit_mgr.structHasCircuits(struct):
            raise DbConstraintError("structure_has_circuit", feature=struct)

        # Delete equipment and connections
        self.nw_view.cable_mgr.deleteInternalSegments(
            struct, root_housing=True, keep_slack_segs=True
        )

        for conn in self.nw_view.connection_mgr.connectionsOfAll(struct, "root_housing"):
            self.deleteRecord(conn)

        for equip in self.equipsIn(struct):
            if self.functionOf(equip) != "slack":
                self.deleteRecord(equip)

    def equipsIn(self, struct, include_proposed=False):
        """
        Returns all equipment housed in STRUCT
        """
        # ENH: Duplicates allEquipsIn(). Move to structure manager?

        struct_urn = struct._urn()

        equips = []

        for feature_type in self.nw_view.equips:
            tab = self.db_view.table(feature_type)
            pred = tab.field("root_housing") == struct_urn

            equips += self.nw_view.getRecs(tab, pred, include_proposed)

        return equips

    def slacksIn(self, struct):
        """
        Returns all slack housed in STRUCT
        """

        slack = []
        for equip in self.equipsIn(struct):
            if self.functionOf(equip) == "slack":
                slack.append(equip)

        return slack

    def hasPorts(self, feature):
        """
        Determines if equipment feature has ports
        """

        ft_desc = feature._descriptor
        for network in self.nw_view.networks.values():
            if (
                network.equip_n_in_pins_field in ft_desc.fields
                or network.equip_n_out_pins_field in ft_desc.fields
                or network.equip_n_pins_field in ft_desc.fields
            ):
                return True
