# Script to set explicit containment on some cable segment ends
from myworldapp.modules.comms_dev_db.utils.splice_engine import SpliceEngine

# pylint: disable=undefined-variable
fc_engine = SpliceEngine(db, 1, 'fiber_cable')
cc_engine = SpliceEngine(db, 1, 'copper_cable')

# External fiber
fc_engine.setSegmentContainment('WH-SC-009', 'WH-FCB-006', 'in' )  # WH-M-34 passthough 

fc_engine.setSegmentContainment('WH-SC-001', 'WH-FCB-006', 'out' ) # WH-M-35 passthough 

fc_engine.setSegmentContainment('WH-SC-049', 'WH-FCB-015', 'out' )  # WH-M-55 passthough 
fc_engine.setSegmentContainment('WH-SC-049', 'WH-FCB-019', 'in' )   # WH-M-55 start

fc_engine.setSegmentContainment('WH-SC-051', 'WH-FCB-019', 'out' )   # WH-M-65 end

fc_engine.setSegmentContainment('WH-SC-052', 'WH-FCB-006', 'out' )   # WH-M-61 end
fc_engine.setSegmentContainment('WH-SC-052', 'WH-FCB-015', 'in' )    # WH-M-61 start
fc_engine.setSegmentContainment('WH-SC-052', 'WH-FCB-016', 'in' )    # WH-M-61 start
fc_engine.setSegmentContainment('WH-SC-052', 'WH-FCB-017', 'in' )    # WH-M-61 start
fc_engine.setSegmentContainment('WH-SC-052', 'WH-FCB-018', 'in' )    # WH-M-61 start

# External copper
cc_engine.setSegmentContainment('WH-CS-01', 'WH-CC-001', 'out' )   # WH-M-12 copper end
cc_engine.setSegmentContainment('WH-CS-01', 'WH-CC-002', 'in' )    # WH-M-12 copper start

# Internal
fc_engine.setInternalSegmentContainment('WH-BB-01', 'WH-R-01',  'WH-INT-41') # Woodhead Hub BB rack -> rack 01
fc_engine.setInternalSegmentContainment('WH-BB-01', 'WH-S-005', 'WH-INT-42') # Woodhead Hub BB rack -> rack 02
fc_engine.setInternalSegmentContainment('WH-S-014', 'WH-R-03',  'WH-INT-43') # Woodhead Hub BB rack -> rack 03
fc_engine.setInternalSegmentContainment('WH-R-03' , 'WH-BB-01', 'WH-INT-44') # Woodhead Hub BB rack <- rack 03
fc_engine.setSegmentContainment('WH-R-03', 'WH-INT-45', 'in')              # Woodhead rack 03 -> None

