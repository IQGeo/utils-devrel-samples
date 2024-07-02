# Configure labor costs
# Add labor_cost for each comms feature
# pylint: disable=undefined-variable

structs = db.setting("mywcom.structures") or {}
routes = db.setting("mywcom.routes") or {}
conduits = db.setting("mywcom.conduits") or {}
equips = db.setting("mywcom.equipment") or {}
cables = db.setting("mywcom.cables") or {}
specs = db.setting("mywcom.specs") or {}

# Get spec features from setting
spec_fts = []
for feature in specs.keys():
    spec_fts.append(feature + "_spec")

nm_features = (
    list(structs.keys())
    + list(routes.keys())
    + list(conduits.keys())
    + list(equips.keys())
    + list(cables.keys())
    + spec_fts
)

non_physical_features = [
    "mywcom_route_junction",
    "mywcom_fiber_slack",
    "mywcom_copper_slack",
    "mywcom_coax_slack",
]
for ft in non_physical_features:
    if ft in nm_features:
        nm_features.remove(ft)

labor_costs = db.setting("mywcom.laborCosts")
setting = dict.fromkeys(nm_features, "labor_costs")

db.setSetting("mywcom.laborCosts", setting)
