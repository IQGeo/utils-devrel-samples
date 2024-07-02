# Move cables segments into conduits (where they exist)

from myworldapp.modules.comms_dev_db.utils.comms_dev_db_conduit_manager import (
    CommsDevDBConduitManager,
)

# pylint: disable=undefined-variable
db_view = db.view()
engine = CommsDevDBConduitManager(db_view, 1)

segs = db_view.table("mywcom_fiber_segment").orderBy("id")

# Move cables into conduits (where they exist)
for seg in segs:
    engine.moveIntoConduit(seg)  # Move from route -> outer
for seg in segs:
    engine.moveIntoConduit(seg)  # Move from outer -> inner
