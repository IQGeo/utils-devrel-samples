# Add custom attribute fields to network objects


from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler


class FieldEngine:
    """
    Engine for adding fields to features
    """

    def __init__(self, db, trace_level):
        """
        Init slots of self

        DB is a MywDatabase"""

        self.db = db
        self.progress = MywSimpleProgressHandler(trace_level)

        db.dd.progress.level -= 2  # TODO: Hack

    def addField(self, feature_type, name, external_name, type, **props):
        """
        Add a field NAME to FEATURE_TYPE
        """

        feature_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        desc = self.db.dd.featureTypeDescriptor(feature_rec)
        field_desc = desc.fields.get(name)

        props["external_name"] = external_name

        if not field_desc:
            self._addField(feature_rec, desc, name, type, props)
        else:
            self._updateField(feature_rec, desc, field_desc, type, props)

    # pylint: disable=undefined-variable
    def setDisplayUnit(self, feature_type_spec, unit_scale, unit, **props):
        """
        Set the display unit and format for fields with stored unit UNIT
        """

        for feature_rec in db.dd.featureTypeRecs("*", feature_type_spec):
            feature_type = feature_rec.feature_name
            desc = db.dd.featureTypeDescriptor(feature_rec)

            for field_name, field_desc in desc.fields.items():
                if field_desc.unit_scale == unit_scale and field_desc.unit == unit:
                    self._updateField(feature_rec, desc, field_desc, field_desc.type, props)

    def _addField(self, feature_rec, desc, name, type, props):
        """
        Add a field NAME to FEATURE_TYPE
        """

        full_field_name = feature_rec.feature_name + "." + name

        self.progress(1, "Adding field", full_field_name)
        desc.addField(name, type, **props)
        self.db.dd.alterFeatureType(feature_rec, desc)

    def _updateField(self, feature_rec, desc, field_desc, type, props):
        """
        Update a field of FEATURE_REC
        """
        # ENH: Change type too!

        full_field_name = feature_rec.feature_name + "." + field_desc.name

        changed = False  # ENH: Implement field_desc.update()
        for prop, value in props.items():
            if field_desc[prop] != value:
                self.progress(
                    3, "Changing", full_field_name, prop, ":", field_desc[prop], "->", value
                )
                field_desc[prop] = value
                changed = True

        if not changed:
            return

        self.progress(2, "Updating field", full_field_name)
        self.db.dd.alterFeatureType(feature_rec, desc)

    def addEnumtoField(self, feature_type, name, enum):
        """
        Add an enum to a field

        feature_type: Feature type name
        name: Field name
        enum: Enum name
        """
        feature_rec = self.db.dd.featureTypeRec("myworld", feature_type)
        desc = self.db.dd.featureTypeDescriptor(feature_rec)
        field_desc = desc.fields.get(name)
        if not field_desc:
            return
        self._updateField(feature_rec, desc, field_desc, field_desc.type, {"enum": enum})

    def getCopperFeatureTypes(self):
        """
        Return a list of copper feature types
        """
        copper_cables = ["copper_cable"]
        copper_equips = []
        equips = self.db.setting("mywcom.equipment")

        for equip in equips:
            if equips[equip]["tech"] == "copper":
                copper_equips.append(equip)

        return copper_cables + copper_equips


# ==============================================================================
#
# ==============================================================================
# pylint: disable=undefined-variable
engine = FieldEngine(db, 2)


# Routes
for feature_type in ["ug_route", "oh_route"]:
    engine.addField(feature_type, "length", "Measured Length", "double")  # Just sets external name
    engine.addField(
        feature_type,
        "geom_length",
        "Calculated Length",
        "double",
        unit_scale="length",
        unit="m",
        value="method(geomLengthStr)",
    )

engine.addField("ug_route", "cover_type", "Cover", "string(32)", enum="cover_type")
engine.addField(
    "ug_route",
    "blown_fiber_tubes",
    "Blown Fiber Tubes",
    "reference_set",
    value="select(blown_fiber_tube.root_housing)",
    read_only=True,
)


# Structures
engine.addField("building", "owner", "Owner", "string(32)")
engine.addField("building", "access_code", "Access Code", "string(32)")

engine.addField(
    "manhole",
    "size_x",
    "Length",
    "double",
    unit="mm",
    unit_scale="length",
    display_unit="in",
    display_format=0,
)
engine.addField(
    "manhole",
    "size_y",
    "Width",
    "double",
    unit="mm",
    unit_scale="length",
    display_unit="in",
    display_format=0,
)
engine.addField(
    "manhole",
    "size_z",
    "Depth",
    "double",
    unit="mm",
    unit_scale="length",
    display_unit="in",
    display_format=0,
)
engine.addField("manhole", "lockable", "Lockable", "boolean")
engine.addField("manhole", "powered", "Powered", "boolean")

engine.addField("cabinet", "type", "Type", "string(32)")
engine.addField("cabinet", "powered", "Powered", "boolean")
engine.addField("cabinet", "photo", "Photo", "image")

engine.addField("pole", "type", "Type", "string(32)")
engine.addField("pole", "height", "Height", "double", unit_scale="length", unit="m")
engine.addField("pole", "owner", "Owner", "string(32)")


engine.addField("drop_point", "type", "Type", "string(32)")

for feature_type in ["manhole", "cabinet", "pole", "wall_box", "drop_point"]:
    engine.addField(feature_type, "installation_date", "Installed", "date")
    engine.addField(
        feature_type,
        "path_to_hub",
        "Shortest to Hub",
        "reference_set",
        value="method(pathToHub)",
        read_only=True,
    )
    engine.addField(
        feature_type,
        "served_customers",
        "Served Customers",
        "reference_set",
        value="select(address.serving_structure)",
        read_only=True,
    )

# Enclosures
for feature_type in ["rack", "fiber_shelf", "slot", "splice_closure"]:
    engine.addField(feature_type, "installation_date", "Installed", "date")
    engine.addField(feature_type, "job_id", "Job ID", "string(32)")

# Equipment
for feature_type in ["fiber_olt", "fiber_splitter", "fiber_mux"]:
    engine.addField(feature_type, "device_id", "Device ID", "string(64)")

for feature_type in ["fiber_olt", "fiber_splitter", "fiber_mux", "fiber_tap", "fiber_ont"]:
    engine.addField(feature_type, "installation_date", "Installed", "date")
    engine.addField(feature_type, "job_id", "Job ID", "string(32)")


for feature_type in ["fiber_splitter", "fiber_tap", "fiber_ont"]:
    engine.addField(feature_type, "served_customers",
        "Served Customers", "reference_set", value="select(address.serving_equipment)",
        read_only=True)
    engine.addField(feature_type, "service_status",
        "Service Status", "string(32)", enum="service_status", default="Built")

engine.addField("fiber_splice_tray", "slots", "Slots", "integer")

# Cables
for feature_type in ["fiber_cable"]:
    engine.addField(feature_type, "type", "Type", "string(64)", enum="cable_type")
    engine.addField(feature_type, "owner", "Owner", "string(32)")
    engine.addField(feature_type, "job_id", "Job ID", "string(32)")
    engine.addField(feature_type, "installation_date", "Installed", "date")
    engine.addField(
        feature_type,
        "diameter",
        "Diameter",
        "double",
        unit="mm",
        unit_scale="length",
        display_unit="in",
        display_format=2,
    )

# Conduits
for feature_type in ["conduit"]:
    engine.addField(feature_type, "material", "Material", "string(64)")
    engine.addField(feature_type, "owner", "Owner", "string(32)")
    engine.addField(feature_type, "installation_date", "Installed", "date")
    engine.setDisplayUnit(feature_type, "length", "mm", display_unit="mm")

# Slack
for feature_type in ["mywcom_fiber_slack"]:
    engine.addField(feature_type, "storage", "Type", "string(32)", enum="slack_storage")
    engine.addField(feature_type, "job_id", "Job ID", "string(32)")

# Specs
engine.addField(
    "fiber_cable_spec",
    "diameter",
    "Diameter",
    "double",
    unit="mm",
    unit_scale="length",
    display_unit="in",
    display_format=2,
)
engine.addField("conduit_spec", "material", "Material", "string(64)")
engine.addField("cabinet_spec", "type", "Type", "string(32)")
engine.addField("cabinet_spec", "powered", "Powered", "boolean")
engine.addField(
    "manhole_spec",
    "size_x",
    "Length",
    "double",
    unit="mm",
    unit_scale="length",
    display_unit="in",
    display_format=0,
)
engine.addField(
    "manhole_spec",
    "size_y",
    "Width",
    "double",
    unit="mm",
    unit_scale="length",
    display_unit="in",
    display_format=0,
)
engine.addField(
    "manhole_spec",
    "size_z",
    "Depth",
    "double",
    unit="mm",
    unit_scale="length",
    display_unit="in",
    display_format=0,
)
engine.setDisplayUnit("conduit_spec", "length", "mm", display_unit="mm")

engine.addField(
    "pole_spec",
    "height",
    "Height",
    "double",
    unit="m",
    unit_scale="length",
    display_unit="m",
    display_format=0,
)

engine.addField("pole_spec", "type", "Type", "string(32)")

# Circuits
engine.addField("ftth_circuit", "status", "Status", "string(64)", enum="circuit_status")
engine.addField("ftth_circuit", "customer", "Customer", "string(64)")
engine.addField("ftth_circuit", "address", "Address", "foreign_key(address)", indexed=True)
engine.addField(
    "ftth_circuit",
    "service_type",
    "Service Type",
    "string(32)",
    enum="ftth_circuit_type",
    default="Direct",
    mandatory=True,
    indexed=True,
)
engine.addField("ftth_circuit", "date", "Activation Date", "date")

# Designs
engine.addField("design", "type", "Type", "string(32)", enum="design_type", default="Network Build")
engine.addField("design", "work_order", "Work Order", "link")

# Set display units to imperial
engine.setDisplayUnit("*", "length", "m", display_unit="ft", display_format="1")

# Add copper_status enum to all copper features:
for feature_type in engine.getCopperFeatureTypes():
    engine.addEnumtoField(feature_type, "status", "copper_status")

# Add stop ripple field which controls if ripple will stop at a feature
for feature_type in ["cabinet", "fiber_splitter"]:
    engine.addField(
        feature_type, "stop_ripple", "Stop Ripple", "boolean", default=False, mandatory=True
    )
