# Add backbone circuit to setting mywcom.circuits
# ENH: use .circuit_config file instead
# pylint: disable=undefined-variable
circuits = db.setting("mywcom.circuits")

circuits["bb_circuit"] = {
    "image": "modules/comms/images/features/circuit.svg",
    "inEquips": ["fiber_shelf"],
    "outEquips": ["fiber_shelf"],
}

db.setSetting("mywcom.circuits", circuits)
