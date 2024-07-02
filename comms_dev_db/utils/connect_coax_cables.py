from myworldapp.modules.comms_dev_db.utils.splice_engine import SpliceEngine

# ========================
#    COAX NETWORK
# ========================

engine = SpliceEngine(db, 1, cable_type="coax_cable")

connect_runs = [
    [
        "WH-ON-001",
        "WH-CA-002",
        "WH-CTAP-001",
        "WH-CA-003",
        "WH-2WSPL-001",
        "WH-CA-004",
        "WH-CTAP-003",
        "WH-CA-005",
        "WH-CTAP-002",
        "WH-CA-006",
        "WH-CTAP-012",
        "WH-CT-001",
    ],
    [
        "WH-2WSPL-001",
        "WH-CA-007",
        "WH-CTAP-004",
        "WH-CA-008",
        "WH-CTAP-011",
        "WH-CA-009",
        "WH-CTAP-010",
        "WH-CA-010",
        "WH-CTAP-009",
        "WH-CA-011",
        "WH-CTAP-008",
        "WH-CA-012",
        "WH-2WSPL-002",
        "WH-CA-013",
        "WH-CTAP-005",
        "WH-CA-014",
        "WH-CTAP-006",
        "WH-CT-002",
    ],
    ["WH-2WSPL-002", "WH-CA-015", "WH-CTAP-007", "WH-CA-016", "WH-CTAP-013"],
]

# Used to keep track on which port to use next for splitters.
next_free_port = dict()

for connect_run in connect_runs:
    for (start, end) in zip(connect_run[:-1], connect_run[1:]):
        out_port = next_free_port.get(start, 1)
        engine.connect(f"{start}#out:{out_port}:{out_port}", f"{end}#in:1:1")
        next_free_port[start] = out_port + 1
