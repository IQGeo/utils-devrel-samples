# Create cables and route them through the structure network

from myworldapp.modules.comms_dev_db.utils.comms_dev_db_cable_manager import CommsDevDBCableManager

# pylint: disable=undefined-variable
engine = CommsDevDBCableManager(db.view(), 1)

# Main cables
engine.route(
    engine.create(144), "WH-C-01", "WH-C-07", "WH-M-11", "WH-M-05", "WH-M-14", "WH-M-57", "WH-M-21"
)
engine.route(engine.create(72), "WH-M-12", "WH-M-03", "WH-C-04", "WH-M-22")
engine.route(engine.create(144), "WH-C-01", "WH-M-35", "WH-C-03", "WH-M-02")
engine.route(engine.create(144), "WH-C-02", "WH-M-35", "WH-M-42", "WH-M-47")
engine.route(engine.create(144), "WH-C-02", "WH-M-34", "WH-M-28")
engine.route(engine.create(144), "WH-C-02", "WH-M-35", "WH-M-61")
engine.route(engine.create(288), "WH-M-32", "WH-M-29")
engine.route(engine.create(24), "WH-M-44", "WH-M-46")
engine.route(engine.create(96), "WH-M-36", "WH-C-11", "WH-M-76")
engine.route(engine.create(96), "WH-M-36", "WH-M-53")
engine.route(engine.create(48), "WH-C-11", "WH-M-52")
engine.route(engine.create(48), "WH-M-37", "WH-M-56")
engine.route(engine.create(48), "WH-M-37", "WH-M-54")
engine.route(engine.create(24), "WH-M-37", "WH-M-56")
engine.route(engine.create(48), "WH-M-61", "WH-M-64")
engine.route(engine.create(48), "WH-M-61", "WH-M-60")
engine.route(engine.create(48), "WH-M-61", "WH-M-81")  # TODO: Better to cabinet WH-C-14
engine.route(engine.create(48), "WH-M-61", "WH-M-74")
engine.route(engine.create(24), "WH-M-66", "WH-M-65")
engine.route(engine.create(48), "WH-M-91", "WH-C-15", "WH-M-87", "WH-M-89", "WH-M-90", "WH-M-83")
engine.route(engine.create(144), "WH-M-43", "WH-M-124")

engine.route(engine.create(288), "Woodhead Hub", "WH-M-32")
engine.route(engine.create(144), "Woodhead Hub", "WH-C-01")
engine.route(engine.create(144), "Woodhead Hub", "WH-C-02")
engine.route(engine.create(576), "Woodhead Hub", "WH-C-02")

# Pole risers
engine.route(engine.create(4, type="Riser"), "WH-M-244", "WH-P-006")
engine.route(engine.create(4, type="Riser"), "WH-M-245", "WH-P-004")
engine.route(engine.create(4, type="Riser"), "WH-M-246", "WH-P-005")
engine.route(engine.create(4, type="Riser"), "WH-M-247", "WH-P-007")
engine.route(engine.create(4, type="Riser"), "WH-M-248", "WH-P-009")
engine.route(engine.create(4, type="Riser"), "WH-M-249", "WH-P-008")
engine.route(engine.create(4, type="Riser"), "WH-M-251", "WH-P-010")

# PON Drops
for route in engine.db_view.table("oh_route"):
    engine.routeDrop(engine.create(4, type="Drop"), route)

# Backbone network
engine.route(
    engine.create(72, type="Backbone"), "WH-M-43", "Science Park Hub", "XX-M-225"
)  # Main ring (clockwise)
engine.route(
    engine.create(72, type="Backbone"), "WH-M-29", "Woodhead Hub", "WH-M-33", "WH-M-28", "WH-M-29"
)  # WH Ring (clockwise)

# Direct Feed FTTH Drops
engine.route(engine.create(2, type="Drop"), "WH-M-24", "WH-0132")
engine.route(engine.create(2, type="Drop"), "WH-M-24", "WH-0133")
engine.route(engine.create(2, type="Drop"), "WH-M-24", "WH-0150")
engine.route(engine.create(2, type="Drop"), "WH-M-26", "WH-0149")
engine.route(engine.create(2, type="Drop"), "WH-M-253", "WH-0134")
engine.route(engine.create(2, type="Drop"), "WH-M-253", "WH-0135")
engine.route(engine.create(2, type="Drop"), "WH-M-253", "WH-0136")
engine.route(engine.create(8, type="Drop"), "WH-M-253", "Alice Bell")  # MDU
engine.route(engine.create(2, type="Drop"), "WH-M-53", "WH-0137")
engine.route(engine.create(2, type="Drop"), "WH-M-53", "WH-0138")
engine.route(engine.create(16, type="Drop"), "WH-C-11", "Gladeside")  # MDU
engine.route(engine.create(8, type="Drop"), "WH-C-11", "WH-0145")  # MDU
engine.route(engine.create(2, type="Drop"), "WH-C-11", "WH-0146")
engine.route(engine.create(2, type="Drop"), "WH-C-11", "WH-0147")
engine.route(engine.create(2, type="Drop"), "WH-C-11", "WH-0148")

# Undirected feeder for Ramsden Square (planned)
engine.route(
    engine.create(48, directed=False), "WH-M-91", "WH-M-87", "WH-M-89", "WH-M-90", "WH-M-249"
)  # WH Ring (clockwise)

# More MDU drops
engine.route(engine.create(48, type="External"), "WH-M-20", "Blackthorn")  # Blackhorn MDU
engine.route(engine.create(24), "WH-M-54", "Gladeside Park")  # Gladeside Park MDU

# Misc cables to SP Hub (for testing undirected trace through splitter / mux)
engine.route(engine.create(72, type="Backbone"), "Science Park Hub", "XX-M-225")
engine.route(engine.create(72, type="Backbone"), "Science Park Hub", "XX-M-225")
engine.route(engine.create(72, type="Backbone"), "XX-M-225", "Science Park Hub")
engine.route(engine.create(72, type="Backbone"), "XX-M-225", "Science Park Hub")
engine.route(engine.create(72, type="Backbone"), "Science Park Hub", "XX-M-217")
engine.route(engine.create(72, type="Backbone"), "XX-M-217", "XX-M-225")

# Cables for path finder in Science Park. Anti-clockwise and clockwise around ring
engine.route(engine.create(24, type="Backbone"), "SP-C-45", "SP-M-184")
engine.route(engine.create(24, type="Backbone"), "SP-M-184", "SP-M-174")
engine.route(engine.create(24, type="Backbone"), "SP-M-174", "SP-M-159")
engine.route(engine.create(24, type="Backbone"), "SP-M-159", "SP-C-46")
engine.route(
    engine.create(24, type="Backbone"), "SP-M-184", "SP-M-199", "SP-M-209", "SP-M-142", "SP-M-159"
)

engine.route(engine.create(48), "WH-M-63", "WH-C-10")

# Create path from coax optical node to Woodhead Hub OLT
engine.route(engine.create(12), "WH-M-29", "WH-M-266")
