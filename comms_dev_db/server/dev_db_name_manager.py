# Copyright: IQGeo Limited 2010-2023
from myworldapp.core.server.base.geom.myw_point import MywPoint

class DevDbNameManager:
    """
    Example of custom name manager
    """

    # Which features to use naming engine on, keyed on feature name, with abbreviation
    featureTypes = {
        "fiber_cable": {"abbr": "FCB", "service_area": "service_area"},
        "copper_cable": {"abbr": "CC", "service_area": "service_area"},
        "coax_cable": {"abbr": "HFC", "service_area": "node_boundary"},
        "manhole": {"abbr": "M", "service_area": "service_area"},
        "cabinet": {"abbr": "C", "service_area": "service_area"},
        "pole": {"abbr": "P", "service_area": "service_area"},
        "drop_point": {"abbr": "DP", "service_area": "service_area"},
        "conduit": {"abbr": "CND", "service_area": "service_area"},
        "splice_closure": {"abbr": "SC", "service_area": "service_area"},
        "copper_splice_closure": {"abbr": "CSC", "service_area": "service_area"},
        "slot": {"abbr": "SL", "service_area": "service_area"},
        "fiber_shelf": {"abbr": "S", "service_area": "service_area"},
        "copper_shelf": {"abbr": "CS", "service_area": "service_area"},
        "fiber_patch_panel": {"abbr": "ODF", "service_area": "service_area"},
        "fiber_splitter": {"abbr": "SPL", "service_area": "service_area"},
        "fiber_splice_tray": {"abbr": "TR", "service_area": "service_area"},
        "fiber_olt": {"abbr": "OLT", "service_area": "service_area"},
        "fiber_ont": {"abbr": "ONT", "service_area": "service_area"},
        "fiber_mux": {"abbr": "MUX", "service_area": "service_area"},
        "fiber_tap": {"abbr": "TAP", "service_area": "service_area"},
        "coax_tap": {"abbr": "CTAP", "service_area": "node_boundary"},
        "blown_fiber_tube": {"abbr": "BF", "service_area": "service_area"},
        "copper_repeater": {"abbr": "CRE", "service_area": "service_area"},
        "copper_load_coil": {"abbr": "LC", "service_area": "service_area"},
        "copper_capacitor": {"abbr": "CAP", "service_area": "service_area"},
        "copper_bridge_tap": {"abbr": "BT", "service_area": "service_area"},
        "copper_build_out": {"abbr": "BO", "service_area": "service_area"},
        "copper_dslam": {"abbr": "DSLAM", "service_area": "service_area"},
        "copper_pair_gain": {"abbr": "PG", "service_area": "service_area"},
        "copper_terminal": {"abbr": "T", "service_area": "service_area"},
        "coax_amplifier": {"abbr": "A", "service_area": "node_boundary"},
        "coax_splice": {"abbr": "CXS", "service_area": "node_boundary"},
        "coax_terminator": {"abbr": "CT", "service_area": "node_boundary"},
        "directional_coupler": {"abbr": "DC", "service_area": "node_boundary"},
        "inline_equalizer": {"abbr": "IE", "service_area": "node_boundary"},
        "internal_directional_coupler": {"abbr": "IDC", "service_area": "node_boundary"},
        "internal_splitter": {"abbr": "IS", "service_area": "node_boundary"},
        "optical_node_closure": {"abbr": "ONC", "service_area": "node_boundary"},
        "optical_node": {"abbr": "ON", "service_area": "node_boundary"},
        "power_block": {"abbr": "PB", "service_area": "node_boundary"},
        "power_inserter": {"abbr": "PI", "service_area": "node_boundary"},
        "power_supply": {"abbr": "PS", "service_area": "node_boundary"},
        "three_way_splitter": {"abbr": "3WSPL", "service_area": "node_boundary"},
        "two_way_splitter": {"abbr": "2WSPL", "service_area": "node_boundary"},
    }

    # Default to use when none found from scan
    defaultServiceAreaAbbr = "XX"

    # Search radius for service areas
    service_area_tolerance = 5

    @classmethod
    def registerTriggers(self, NetworkView):
        """
        Register self's trigger methods on NETWORKVIEW
        """

        # ENH: Use different methods for different categories
        NetworkView.registerTrigger("struct", "pos_insert", self, "setNameFor")
        NetworkView.registerTrigger("cable", "pos_insert", self, "setNameFor")
        NetworkView.registerTrigger("equip", "pos_insert", self, "setNameFor")
        NetworkView.registerTrigger("conduit", "pos_insert", self, "setNameFor")

        NetworkView.registerTrigger("struct", "pos_update", self, "setNameFor")
        NetworkView.registerTrigger("cable", "pos_update", self, "setNameFor")
        NetworkView.registerTrigger("equip", "pos_update", self, "setNameFor")
        NetworkView.registerTrigger("conduit", "pos_update", self, "setNameFor")

    def __init__(self, nw_view, progress):
        """
        Init slots of self

        NW_VIEW is a NetworkView. PROGRESS is a MywProgressHandler"""

        self.nw_view = nw_view
        self.db_view = nw_view.db_view
        self.progress = progress

    def setNameFor(self, rec, orig_rec=None):
        """
        Called after REC has been inserted

        Define feature names based on their service area and abbreviated feature type
        """

        if rec.feature_type in self.featureTypes:
            self._setValuesFor(rec)

    def _setValuesFor(self, rec):
        """
        Sets name value for feature

        TODO: Create engine for generating service area based id for feature and use in name
        """

        # Check for name already set
        if rec.name:
            return

        # Check for cannot determine name yet
        if not rec._primary_geom_field.geom():
            return

        feature_type = rec.feature_type
        feature_id = rec._id
        service_area = self.featureTypes[feature_type].get("service_area")
        service_area_abbr = self._getServiceAreaAbbrFor(rec, service_area)
        feature_abbr = self._getAbbreviationFor(feature_type)

        if feature_type in ["fiber_cable", "copper_cable"]:
            self._setValuesForCable(feature_abbr, service_area_abbr, rec, feature_id)
        else:
            self._setValuesForFeature(feature_abbr, service_area_abbr, rec, feature_id)

        self.progress(3, "Auto named", rec, "as", rec.name)

    def _setValuesForCable(self, feature_abbr, service_area_abbr, rec, id):
        """
        Set name on new fiber cable: <service area>-<feature abbreviation>-<id>
        if non-directed use BB for backbone in place of service area.
        """

        if rec.directed == True:
            rec.name = "{}-{}-{}".format(service_area_abbr, feature_abbr, id)
        else:
            rec.name = "BB-{}-{}".format(feature_abbr, id)

    def _setValuesForFeature(self, feature_abbr, service_area_abbr, rec, id):
        """
        Set name on structure: <service area>-<feature abbreviation>-<id>
        """

        rec.name = "{}-{}-{}".format(service_area_abbr, feature_abbr, id)

    def _getAbbreviationFor(self, name):
        """
        Returns abbreviated feature name for feature type
        """

        return self.featureTypes[name].get("abbr")

    def _getServiceAreaAbbrFor(self, rec, service_area):
        """
        Get service area name a feature is within
        """

        service_area_table = self.db_view.table(service_area)

        primary_geom_name = service_area_table.descriptor.primary_geom_name
        primary_geom_fld = service_area_table.field(primary_geom_name)

        rec_geom = rec._primary_geom_field.geom()

        # geomIntersects fails with internal cables which have two identical coordinates
        if (hasattr(rec, "type") and  rec.type == 'Internal'):
            rec_geom = MywPoint(rec_geom.coords[0])
    
        service_area_filter = primary_geom_fld.geomIntersects(rec_geom)

        service_area = service_area_table.filter(service_area_filter).first()

        if service_area:
            return service_area.name

        return self.defaultServiceAreaAbbr


# ==============================================================================
#                               TRIGGER REGISTRATION
# ==============================================================================
# ENH: Change trigger mechanism to ignore duplicates and do this from callers

from myworldapp.modules.comms.server.api.network_view import NetworkView

DevDbNameManager.registerTriggers(NetworkView)
