# Create cables and route them through the structure network

from myworldapp.modules.comms.server.api.conduit_manager import ConduitManager
from myworldapp.modules.comms_dev_db.utils.comms_dev_db_conduit_manager import (
    CommsDevDBConduitManager,
)

# pylint: disable=undefined-variable
engine = CommsDevDBConduitManager(db.view(), 1)

props = {"diameter": 17}

# Main tubes
engine.createBfTubesAlong(6, props, "WH-C-08", "WH-M-253")
engine.createBfTubesAlong(6, props, "WH-C-11", "WH-M-52")
engine.createBfTubesAlong(
    6,
    props,
    "WH-C-11",
    "WH-M-76",
)
engine.createBfTubesAlong(8, props, "WH-M-36", "WH-C-11")

# Drop tubes
engine.createBfDropRoute("WH-M-253", "WH-0134", props)
engine.createBfDropRoute("WH-M-253", "WH-0135", props)
engine.createBfDropRoute("WH-M-253", "WH-0136", props)
engine.createBfDropRoute("WH-M-253", "Alice Bell", props)  # MDU
engine.createBfDropRoute("WH-M-53", "WH-0137", props)
engine.createBfDropRoute("WH-M-53", "WH-0138", props)
engine.createBfDropRoute("WH-C-08", "WH-0142", props)
engine.createBfDropRoute("WH-C-11", "Gladeside", props)  # MDU
engine.createBfDropRoute("WH-C-11", "WH-0145", props)  # MDU
engine.createBfDropRoute("WH-C-11", "WH-0147", props)
engine.createBfDropRoute("WH-C-11", "WH-0146", props)
engine.createBfDropRoute("WH-C-11", "WH-0148", props)

# Add tube for testing conduit moves
engine.createBfTubesAlong(4, props, "WH-M-40", "WH-M-48")
engine.createBfTubesAlong(1, props, "WH-M-45", "WH-M-46")
