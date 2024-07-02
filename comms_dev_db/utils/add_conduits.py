# Create cables and route them through the structure network

from myworldapp.modules.comms_dev_db.utils.comms_dev_db_conduit_manager import (
    CommsDevDBConduitManager,
)

# pylint: disable=undefined-variable
engine = CommsDevDBConduitManager(db.view(), 1)

# Outer conduits
engine.createAlong("outer", 1, {"diameter": 200}, "WH-C-02", "Woodhead Hub", "WH-C-01")
engine.createAlong("outer", 2, {"diameter": 150}, "WH-M-34", "WH-C-02", "WH-C-01", "WH-M-12")
engine.createAlong(
    "outer", 1, {"diameter": 150}, "WH-M-12", "WH-C-07", "WH-M-11", "WH-M-05", "WH-M-04"
)
engine.createAlong(
    "outer", 2, {"diameter": 150}, "WH-M-13", "WH-M-02", "WH-M-42", "WH-C-03", "WH-M-35"
)
engine.createAlong("outer", 1, {"diameter": 150}, "WH-M-04", "WH-M-58", "WH-M-57", "WH-M-21")
engine.createAlong("outer", 1, {"diameter": 150}, "WH-M-04", "WH-M-13", "WH-M-22")
engine.createAlong("outer", 1, {"diameter": 150}, "WH-M-17", "WH-M-16", "WH-C-05")
engine.createAlong("outer", 1, {"diameter": 150}, "WH-M-07", "WH-M-75")
engine.createAlong(
    "outer", 1, {"diameter": 150}, "WH-M-10", "WH-M-09", "WH-M-08", "WH-M-11"
)  # ENH: Prevent hop 10 -> 11
engine.createAlong("outer", 2, {"diameter": 150}, "WH-M-02", "WH-M-12")
engine.createAlong("outer", 1, {"diameter": 100}, "WH-M-42", "WH-M-47")
engine.createAlong("outer", 1, {"diameter": 100}, "WH-M-44", "WH-M-46")
engine.createAlong("outer", 4, {"diameter": 120}, "WH-M-34", "WH-M-35")

engine.createAlong("outer", 1, {"diameter": 150}, "Woodhead Hub", "WH-M-32", "WH-M-29")
engine.createAlong("outer", 2, {"diameter": 120}, "WH-M-34", "WH-M-28")
engine.createAlong(
    "outer",
    3,
    {"diameter": 120},
    "WH-M-29",
    "WH-P-006",
    "WH-P-004",
    "WH-P-005",
    "WH-P-007",
    "WH-P-009",
    "WH-M-91",
)
engine.createAlong("outer", 1, {"diameter": 100}, "WH-M-246", "WH-M-60")
engine.createAlong("outer", 1, {"diameter": 100}, "WH-M-102", "WH-M-113")

# Inner conduits
engine.createAlong("inner", 3, {"diameter": 60}, "Woodhead Hub", "WH-M-29")
engine.createAlong("inner", 2, {"diameter": 70}, "WH-M-35", "WH-M-02", "WH-M-04", "WH-M-05")
engine.createAlong(
    "inner", 4, {"diameter": 50}, "WH-M-04", "WH-M-49", "WH-M-21", "WH-M-17", "WH-M-22", "WH-M-13"
)
engine.createAlong("inner", 1, {"diameter": 100}, "WH-M-102", "WH-M-113")
