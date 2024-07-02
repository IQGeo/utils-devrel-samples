from .pin_range import PinRange


class Network:
    """
    The feature types and field names used for a given network technology
    """

    # Defined network types (keyed by name)
    types = {}

    # Mapping from segment feature type to network
    segment_types = {}

    # Mapping from connection feature type to network
    connection_types = {}

    @classmethod
    def defineTypesFrom(self, db):
        """
        Create definitions from setting
        """
        setting = db.setting("mywcom.network_types")

        # Can occur when running early upgrade but information is not needed.
        if not setting:
            return

        for name, props in setting.items():
            self.defineType(name, **props)

    @classmethod
    def defineType(self, name, **args):
        """
        Create definition and add to list of known types
        """
        network = self(name, **args)

        self.types[name] = network
        self.segment_types[network.segment_type] = network
        self.connection_types[network.connection_type] = network

    def __init__(self, name, **args):
        """
        Init slots of self
        """

        self.name = name
        self.segment_type = args["segment_type"]
        self.slack_type = args["slack_type"]
        self.connection_type = args["connection_type"]
        self.struct_in_segments_field = args["struct_in_segments_field"]
        self.struct_out_segments_field = args["struct_out_segments_field"]
        self.equip_n_in_pins_field = args["equip_n_in_pins_field"]
        self.equip_n_out_pins_field = args["equip_n_out_pins_field"]
        self.equip_n_pins_field = args["equip_n_pins_field"]
        self.cable_n_pins_field = args["cable_n_pins_field"]
        self.connections_field = args["connections_field"]
        self.splices_field = args["splices_field"]  # ENH: Remove need for this
        self.network_name = args["network_name"]  # ENH: Remove need for this

        self.struct_segments_fields = {
            "in": self.struct_in_segments_field,
            "out": self.struct_out_segments_field,
        }
        self.equip_n_pins_fields = {
            "in": self.equip_n_in_pins_field,
            "out": self.equip_n_out_pins_field,
        }

    def pinsOn(self, feature, side):
        """
        Pins of type SIDE of FEATURE (if any)

        Returns a PinRange (or None)"""

        n_pins = self.nPinsOn(feature, side)

        if n_pins:
            return PinRange(side, 1, n_pins)

        return None

    def nPinsOn(self, feature, side):
        """
        Number of pins on SIDE of FEATURE (an equip or cable segment)
        """

        # Case: Equipment with explicit port count
        field_name = self.equip_n_pins_fields[side]

        # Case: Equipment with implicit port count (for connectors)
        if not field_name in feature._descriptor.fields:
            field_name = self.equip_n_pins_field

        # Case: Cable
        if not field_name in feature._descriptor.fields:
            field_name = self.cable_n_pins_field  # For cables

        if field_name in feature._descriptor.fields:
            return feature[field_name]

        # Case: Cable segment
        if self.isSegment(feature):
            cable = feature._field("cable").rec()
            if hasattr(cable, field_name):
                return cable[field_name]

        return None

    def isSegment(self, feature):
        """
        True if FEATURE is a cable segment
        """
        return feature.feature_type == self.segment_type
    
    def portCountFields(self):
        """
        Names of fields on equipment that tell us number of ports on the equipment
        """
        
        return [self.equip_n_in_pins_field, self.equip_n_out_pins_field, self.equip_n_pins_field]

