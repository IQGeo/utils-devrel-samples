from myworldapp.modules.comms_dev_db.utils.comms_dev_db_cable_manager import CommsDevDBCableManager

# pylint: disable=undefined-variable

# Coax/RF cables
engine = CommsDevDBCableManager(db.view(), 1, cable_type="coax_cable")

cable_runs = [
    [266, 257, 255, 258, 260, 259],
    [255, 270, 271, 261, 272, 273, 274, 275, 276],
    [274, 277, 256],
]

offset_runs = [
    ["WH-ON-001", "WH-CTAP-001", "WH-2WSPL-001", "WH-CTAP-003", "WH-CTAP-002", "WH-CT-001"],
    [
        "WH-2WSPL-001",
        "WH-CTAP-004",
        "WH-CTAP-011",
        "WH-CTAP-010",
        "WH-CTAP-009",
        "WH-CTAP-008",
        "WH-2WSPL-002",
        "WH-CTAP-005",
        "WH-CT-002",
    ],
    ["WH-2WSPL-002", "WH-CTAP-007", "WH-CTAP-013"],
]

id = 1
cables = []

for cable_run in cable_runs:
    for (start, end) in zip(cable_run[:-1], cable_run[1:]):

        # We've already loaded the cables
        cable = engine.db_view.get(f"coax_cable/{id}")
        if not cable:
            cable = engine.create(id)

        engine.route(cable, "WH-M-{}".format(start), "WH-M-{}".format(end))
        cables.append(cable)
        id = id + 1


id = 0
for offset_run in offset_runs:
    for (start, end) in zip(offset_run[:-1], offset_run[1:]):
        cable = cables[id]

        engine.addOffsetBetween(cable, start, end)
        id += 1
