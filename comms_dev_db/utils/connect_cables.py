from myworldapp.modules.comms_dev_db.utils.splice_engine import SpliceEngine

# pylint: disable=undefined-variable
engine = SpliceEngine(db, 1)

# ========================
#    PON1 FTTH NETWORK
# ========================

# ---------------------
#  Feeders
# ---------------------


# Feeders
engine.connect(
    "WH-FCB-022#out:1:73", "WH-FCB-007#in:145:217", "WH-SC-020", False, trays=[1, 2, 3, 4, 5, 6, 7]
)  # WH-M-32
engine.connect(
    "WH-FCB-022#out:74", "WH-FCB-007#in:144", "WH-SC-020", False, trays=[8]
)  # WH-M-32
engine.connect(
    "WH-FCB-007#out:145:270",
    "WH-FCB-021#in:1:126",
    "WH-SC-023",
    False,
    trays=[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
)  # WH-M-29

engine.connect("WH-FCB-023#out:1:24", "WH-FCB-001#in:1:24", "WH-C-01")
engine.connect("WH-FCB-023#out:25:36", "WH-FCB-003#in:13:24", "WH-C-01")

engine.connect("WH-FCB-024#out:1:36", "WH-FCB-004#in:1:36", "WH-C-02")
engine.connect("WH-FCB-025#out:1:36", "WH-FCB-004#in:37:72", "WH-C-02")
engine.connect("WH-FCB-025#out:37:48", "WH-FCB-005#in:1:12", "WH-C-02")
engine.connect("WH-FCB-025#out:49:72", "WH-FCB-006#in:1:24", "WH-C-02")

engine.connect("WH-FCB-001#out:1:24", "WH-FCB-184#in:1:24", "WH-SC-045")  # Blackthorn MDU


# -------------------
#  Splitters
# -------------------

# Pole 6
engine.connect("WH-FCB-021#out:1:2", "RISER-001#in:1:2", "WH-SC-026")  # WH-M-244
engine.connect("RISER-001#out:1", "WH-SPL-001#in:1")
engine.connect("RISER-001#out:2", "WH-SPL-004#in:1")

# Pole 4
engine.connect("WH-FCB-021#out:3:4", "RISER-002#in:1:2", "WH-SC-027")  # WH-M-245
engine.connect(
    "WH-FCB-021#out:2", "RISER-002#in:3", "WH-SC-027"
)  # Dead fiber (already used above) for testing
engine.connect("RISER-002#out:1", "WH-SPL-002#in:1")
engine.connect("RISER-002#out:2", "WH-SPL-003#in:1")
engine.connect("RISER-002#out:3", "WH-SPL-005#in:1")  # Dead fiber

# Pole 5
engine.connect("WH-FCB-021#out:5:6", "RISER-003#in:1:2", "WH-SC-028")  # WH-M-246
engine.connect("RISER-003#out:1", "WH-SPL-011#in:1")
engine.connect("RISER-003#out:2", "WH-SPL-012#in:1")

# Pole 7
engine.connect("WH-FCB-021#out:7", "RISER-004#in:1", "WH-SC-029")  # WH-M-247
engine.connect("RISER-004#out:1", "WH-SPL-006#in:1")

# Pole 9
engine.connect("WH-FCB-021#out:8:9", "RISER-005#in:1:2", "WH-SC-030")  # WH-M-248
engine.connect("RISER-005#out:1", "WH-SPL-007#in:1")
engine.connect("RISER-005#out:2", "WH-SPL-008#in:1")

# Pole 8
engine.connect("WH-FCB-021#out:10", "RISER-006#in:1", "WH-SC-031")  # WH-M-249
engine.connect("RISER-006#out:1", "WH-SPL-009#in:1")

# Pole 10
engine.connect("WH-FCB-021#out:11", "RISER-007#in:1", "WH-SC-032")  # WH-M-251
engine.connect("RISER-007#out:1", "WH-SPL-010#in:1")


# ---------------------
#  Drops
# ---------------------

for cable in engine.db_view["fiber_cable"].orderBy("id"):
    if cable.name and cable.type == "Drop" and cable.fiber_count == 4:
        engine.connectPonDrop(cable.name)


# ==============================
#    DIRECT FEED FTTH NETWORK
# ==============================

# Feeder network
engine.connect("WH-FCB-025#out:101:200", "WH-FCB-006#in:25:124", "WH-C-02")
engine.connect("WH-FCB-006#out:50:74", "WH-FCB-009#in:1:25", "WH-SC-033")
engine.connect("WH-FCB-006#out:75:99", "WH-FCB-010#in:1:25", "WH-SC-033")
engine.connect("WH-FCB-010#out:4:9", "DROP-141#in:1:6", "WH-SC-037")  # WH-M-253 -> Alice Bell MDU
engine.connect("WH-FCB-009#out:1:6", "DROP-144#in:1:6", "WH-SC-039")  # WH-C-11 -> Gladeside MDU


# Drops
engine.connectDirectDrop("WH-FCB-006#out:25", "WH-0132")
engine.connectDirectDrop("WH-FCB-006#out:26", "WH-0133")
engine.connectDirectDrop("WH-FCB-006#out:27", "WH-0150")
engine.connectDirectDrop("WH-FCB-010#out:1", "WH-0134")
engine.connectDirectDrop("WH-FCB-010#out:2", "WH-0135")
engine.connectDirectDrop("WH-FCB-010#out:3", "WH-0136")

engine.connectDirectDrop("WH-FCB-010#out:10", "WH-0137")
# engine.connectDirectDrop('WH-FCB-010#out:','WH-0138')     # Planned

# engine.connectDirectDrop('WH-FCB-009#out:7:10','WH-0145') # MDU Planned
engine.connectDirectDrop("WH-FCB-009#out:11", "WH-0146")
# engine.connectDirectDrop('WH-FCB-009#out:12','WH-0147')   # Planned
engine.connectDirectDrop("WH-FCB-009#out:13", "WH-0148")

engine.connectAfter(
    "WH-FCB-006#out:28", "DROP-137#in:1", "mywcom_fiber_slack/12", "WH-SC-011"
)  # in between slacks, Manhole 26
engine.connect("DROP-137#out:1", "WH-ONT-149#in:1")  # connect from manhole 26 to ONT

# ========================
#     BACKBONE NETWORK
# ========================

# SP Hub Rack SP-BB-01
engine.connect("BB-FCB-016#in:9:14", "SP-S-015#in:3:8")  # Shelf 15 IN  East
engine.connect("BB-FCB-016#in:17:22", "SP-S-015#out:3:8")  # Shelf 15 OUT East
engine.connect("BB-FCB-016#out:17:22", "SP-S-015#in:10:15")  # Shelf 15 IN  West
engine.connect("BB-FCB-016#out:9:14", "SP-S-015#out:10:15")  # Shelf 15 OUT West

# Manhole 28
engine.connect(
    "BB-FCB-016#in:8:30", "BB-FCB-017#out:8:30", "WH-SC-024", False, trays=[1, 2, 3, 4, 5, 6, 7]
)  # All trays in SH-SC-24 for Ring east side

# WH Hub Rack WH-BB-01
engine.connect("WH-S-014#in:1:6", "BB-FCB-017#in:11:16")  # Shelf 14 IN
engine.connect("WH-S-014#out:1:6", "BB-FCB-017#in:19:24")  # Shelf 14 OUT
engine.connect("WH-S-013#in:1:6", "BB-FCB-017#out:1:6")  # Shelf 13 IN
engine.connect("WH-S-013#out:1:6", "BB-FCB-017#out:9:14")  # Shelf 13 OUT

# Manhole 29
engine.connect(
    "BB-FCB-016#out:11:30", "BB-FCB-017#in:1:20", "WH-SC-023", True, trays=[1, 2, 3]
)  # First 4 trays in Ring west side


# ========================
#      RAMSDEN SQUARE
# ========================
# This are deliberately complex (unrealistic) in order to test connection rebuilding in cable reroute

#  Splitters
engine.connect("WH-FCB-183#in:1", "WH-SPL-013#in:1")  # Splitter 13 in WH-M-89
engine.connect("WH-FCB-183#out:21:28", "WH-SPL-013#out:1:8")

engine.connect("WH-SPL-014#in:1", "WH-FCB-183#out:2")  # Splitter 14 in WH-M-89
engine.connect("WH-SPL-014#out:1:4", "WH-FCB-183#out:31:34")

engine.connect(
    "WH-FCB-183#in:3",
    "WH-SPL-016#in:1",
)  # Splitter 16 in WH-M-87
engine.connect("WH-SPL-016#out:3:4", "WH-FCB-183#out:35:36")

engine.connect(
    "WH-FCB-183#in:4",
    "WH-SPL-017#in:1",
)  # WH-M-86
engine.connect("WH-SPL-017#out:1:2", "WH-FCB-183#out:37:38")

engine.connect("WH-FCB-183#in:5:6", "WH-FCB-183#out:7:8", "WH-SC-042")  # Splices
engine.connect("WH-FCB-183#out:5:6", "WH-FCB-183#in:7:8", "WH-SC-041")

# Loopbacks
engine.connect("WH-FCB-183#in:10:11", "WH-FCB-183#in:12:13", "WH-SC-043")  # WH-M-90
engine.connect("WH-FCB-183#out:10:11", "WH-FCB-183#out:12:13", "WH-SC-043")  # WH-M-90

engine.connect("WH-FCB-183#in:10:11", "WH-FCB-183#in:12:13", "WH-SC-044")  # WH-M-83


# ========================
#      HUB INTERNALS
# ========================

# --------------------
#   PON1 FTTH
# --------------------

# OLTs
engine.connect("WH-OLT-010#out:1:8", "WH-INT-01#in:1:8")  # Rack WH-R-01 Shelf 1 Slot 3
engine.connect("WH-OLT-011#out:1:2", "WH-INT-01#in:9:10")  # Rack WH-R-01 Shelf 1 Slot 3
engine.connect("WH-OLT-006#out:1:6", "WH-INT-01#in:11:16")  # Rack WH-R-01 Shelf 4 Slot 7
engine.connect("WH-OLT-016#out:2:8", "WH-INT-02#in:1:7")  # Rack WH-R-02 Shelf 5 Slot 16
engine.connect("WH-OLT-017#out:3:7", "WH-INT-02#in:8:12")  # Rack WH-R-02 Shelf 5 Slot 16
engine.connect("WH-OLT-024#out:1:8", "WH-INT-03#in:1:8")  # Rack WH-R-03 Shelf 9 Slot 25
engine.connect("WH-OLT-023#out:1:4", "WH-INT-03#in:9:12")  # Rack WH-R-03 Shelf 9 Slot 25

engine.connect("WH-OLT-011#out:3:4", "WH-INT-04#in:9:10")  # Rack WH-R-01 Shelf 1 Slot 3 #
engine.connect("WH-OLT-011#out:5", "WH-INT-04#in:19")

# Internal cables
engine.connect("WH-INT-01#out:1:16", "WH-ODF-01E#in:1:16")
engine.connect("WH-INT-02#out:1:16", "WH-ODF-01E#in:17:32")
engine.connect("WH-INT-03#out:1:12", "WH-ODF-01E#in:33:44")

# Patch panels ODF 1
engine.connect("WH-ODF-01E#out:1:45", "WH-ODF-01#in:1:45")
engine.connect("WH-ODF-01#out:1:44", "WH-FCB-022#in:1:44")
engine.connect("WH-ODF-01#out:45",   "WH-FCB-022#in:74")

# --------------------
#   Direct Feed FTTH
# --------------------

# OLts
engine.connect("WH-OLT-025#out:1:8", "WH-INT-04#in:1:8")
engine.connect("WH-OLT-026#out:1:4", "WH-INT-04#in:11:14")
engine.connect("WH-OLT-026#out:5:8", "WH-INT-04#in:15:18")
engine.connect("WH-OLT-027#out:1:8", "WH-INT-04#in:21:28")
engine.connect("WH-OLT-028#out:1:8", "WH-INT-04#in:31:38")
engine.connect("WH-OLT-029#out:1:8", "WH-INT-04#in:41:48")

# Internal cables
engine.connect("WH-INT-04#out:1:48", "WH-ODF-02E#in:1:48")

# Patch panels ODF 2
engine.connect("WH-ODF-02E#out:1:8", "WH-ODF-02#in:101:108")  # Woodhead drive
engine.connect("WH-ODF-02E#out:11:14", "WH-ODF-02#in:109:112")
engine.connect("WH-ODF-02E#out:15:18", "WH-ODF-02#in:125:128")  # George Nuttall Cl
engine.connect("WH-ODF-02E#out:21:28", "WH-ODF-02#in:130:137")
engine.connect("WH-ODF-02E#out:31:38", "WH-ODF-02#in:150:157")  # Alice Bell Cl
engine.connect("WH-ODF-02E#out:41:48", "WH-ODF-02#in:158:165")
engine.connect("WH-ODF-02E#out:9:10", "WH-ODF-02#in:1:2")
engine.connect("WH-ODF-02E#out:19", "WH-ODF-02#in:3")

engine.connect("WH-ODF-02#out:1:36", "WH-FCB-023#in:1:36")  # To WH-C-01
engine.connect("WH-ODF-02#out:37:72", "WH-FCB-024#in:1:36")  # To WH-C-02
engine.connect("WH-ODF-02#out:73:93", "WH-FCB-025#in:1:21")
engine.connect("WH-ODF-02#out:101:201", "WH-FCB-025#in:101:201")

# ========================
#      MDU INTERNALS
# ========================

# Alice Bell
engine.connect("DROP-141#out:1:4", "WH-CPP-07#in:1:4")
engine.connect("DROP-141#out:5:7", "WH-CPP-08#in:1:3")
engine.connect("WH-CPP-08#out:1:3", "WH-INT-07#in:1:3")
engine.connect("WH-INT-07#out:1:3", "WH-CPP-09#in:1:3")
engine.connect("WH-CPP-09#out:1", "WH-INT-08#in:1")
engine.connect("WH-CPP-09#out:2", "WH-INT-09#in:1")
engine.connect("WH-CPP-09#out:3", "WH-INT-10#in:1")
engine.connect("WH-INT-08#out:1", "WH-ONT-158#in:1")
engine.connect("WH-INT-09#out:1", "WH-ONT-159#in:1")
engine.connect("WH-INT-10#out:1", "WH-ONT-160#in:1")
engine.connect("WH-CPP-07#out:1:4", "WH-INT-06#in:1:4")
engine.connect("WH-INT-06#out:1", "WH-ONT-157#in:1")
engine.connect("WH-INT-06#out:2", "WH-ONT-151#in:1")
engine.connect("WH-INT-06#out:3", "WH-ONT-139#in:1")

# Blackthorn
engine.connect("WH-FCB-184#out:1:24", "WH-CPP-06#in:1:24")
engine.connect("WH-CPP-06#out:1:24", "WH-INT-05#in:1:24")
engine.connect("WH-INT-05#out:1", "WH-ONT-154#in:1")
engine.connect("WH-INT-05#out:2", "WH-ONT-155#in:1")
engine.connect("WH-INT-05#out:3", "WH-ONT-156#in:1")

# Gladeside
engine.connect("DROP-144#out:1:10", "WH-CPP-10#in:1:10")
engine.connect("WH-CPP-10#out:1:4", "WH-INT-11#in:1:4")
engine.connect("WH-CPP-10#out:5:8", "WH-INT-12#in:1:4")
engine.connect("WH-CPP-10#out:9:12", "WH-INT-13#in:1:4")
engine.connect("WH-INT-11#out:1:4", "WH-CPP-11#in:1:4")
engine.connect("WH-INT-12#out:1:4", "WH-CPP-12#in:1:4")
engine.connect("WH-INT-13#out:1:4", "WH-CPP-13#in:1:4")
engine.connect("WH-CPP-11#out:1", "WH-INT-14#in:1")
engine.connect("WH-CPP-11#out:2", "WH-INT-15#in:1")
engine.connect("WH-CPP-11#out:3", "WH-INT-16#in:1")
engine.connect("WH-CPP-12#out:1", "WH-INT-17#in:1")
engine.connect("WH-CPP-12#out:2", "WH-INT-18#in:1")
engine.connect("WH-CPP-12#out:3", "WH-INT-19#in:1")
engine.connect("WH-CPP-12#out:4", "WH-INT-20#in:1")
engine.connect("WH-CPP-13#out:2", "WH-INT-21#in:1")
engine.connect("WH-CPP-13#out:3", "WH-INT-22#in:1", None, True)
engine.connect("WH-INT-14#out:1", "WH-ONT-140#in:1")
engine.connect("WH-INT-15#out:1", "WH-ONT-152#in:1")
engine.connect("WH-INT-16#out:1", "WH-ONT-167#in:1")
engine.connect("WH-INT-17#out:1", "WH-ONT-161#in:1")
engine.connect("WH-INT-18#out:1", "WH-ONT-162#in:1")
engine.connect("WH-INT-19#out:1", "WH-ONT-163#in:1")
engine.connect("WH-INT-20#out:1", "WH-ONT-164#in:1")
engine.connect("WH-INT-21#out:1", "WH-ONT-165#in:1")
engine.connect("WH-INT-22#out:1", "WH-ONT-166#in:1", None, True)

# Gladeside Park
engine.connect("WH-FCB-185#out:1:4", "WH-CPP-14#in:1:4")
engine.connect("WH-CPP-14#out:1:4", "WH-INT-23#in:1:4")
engine.connect("WH-INT-23#out:1", "WH-ONT-141#in:1")


# ========================
#  MISC FIBER
# ========================

# SP Hub splitters and mux (for testing tracing with non-directed cables)
engine.connect("BB-FCB-018#in:1", "SP-SPL-030#in:1")  # A -> SPL -> A,Z
engine.connect("SP-SPL-030#out:1", "BB-FCB-018#in:2")
engine.connect("SP-SPL-030#out:2", "BB-FCB-021#out:2")

engine.connect("BB-FCB-020#out:1", "SP-SPL-031#in:1")  # Z -> SPL -> Z,A
engine.connect("SP-SPL-031#out:1", "BB-FCB-020#out:2")
engine.connect("SP-SPL-031#out:2", "BB-FCB-019#in:2")

engine.connect("SP-MUX-020#in:1:6", "BB-FCB-020#out:50:55")  # Z -> MUX -> A
engine.connect("SP-MUX-020#out:1", "BB-FCB-018#in:20")

engine.connect("SP-MUX-021#in:1:6", "BB-FCB-019#in:30:35")  # A -> MUX -> Z
engine.connect("SP-MUX-021#out:1", "BB-FCB-021#out:56")

engine.connect("SP-S-017#out:1:8", "BB-FCB-022#in:1:8")
engine.connect("BB-FCB-022#out:1:4", "BB-FCB-023#in:1:4", "XX-SC-048")  # XX-M-217
engine.connect("BB-FCB-023#in:5:8", "BB-FCB-022#out:5:8", "XX-SC-048")
engine.connect("BB-FCB-023#out:1:8", "XX-CPP-15#in:1:8")

# Connection to stripped cable (for testing splice report)
engine.connect("WH-FCB-004#out:1:24", "WH-FCB-008#in:1:24", "WH-SC-047")  # WH-M-44

# ========================
#   SCIENCE PARK
# ========================

engine.connect("SP-S-018#out:1:10", "BB-FCB-024#in:1:10")
engine.connect("BB-FCB-027#out:1:10", "SP-S-019#in:1:10")


# ========================
#   OLT to Optical Node
# ========================

engine.connect(
    "WH-OLT-011#out:6", "WH-INT-46#in:1"
)  # Rack WH-R-01 Shelf 1 Slot 3 for path to coax optical node

engine.connect("WH-INT-46#out:1", "WH-ODF-01E#in:45")


# FCB 7 to FCB 190 at WH-m-29, FCB 190 to Optical Node in WH-M-266
engine.connect(
    "WH-FCB-007#out:144",
    "WH-FCB-198#in:1",
    "WH-SC-023",
    False,
    trays=[17],
)  # WH-M-29
engine.connect("WH-FCB-198#out:1", "WH-ON-001#in:1")
