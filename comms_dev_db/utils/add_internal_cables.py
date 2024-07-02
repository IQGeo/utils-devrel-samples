# Create cables and route them through the structure network

from myworldapp.modules.comms_dev_db.utils.comms_dev_db_cable_manager import CommsDevDBCableManager

# pylint: disable=undefined-variable
engine = CommsDevDBCableManager(db.view(), 1)

# Hub internal cables
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  # Rack2 -> ODF1
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  # Rack2 -> ODF1
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  # Rack3 -> ODF1
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  # Rack3 -> ODF2

# MDU internal Cables
engine.routeInternal(engine.create(48, type="Internal"), "Blackthorn")  # Patch Panel -> ONT
engine.routeInternal(engine.create(8, type="Internal"), "Alice Bell")  # Patch Panel -> ONT
engine.routeInternal(engine.create(8, type="Internal"), "Alice Bell")  # CCP -> CCP (Riser)
engine.routeInternal(engine.create(4, type="Internal"), "Alice Bell")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Alice Bell")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Alice Bell")  # CCP -> ONT
engine.routeInternal(
    engine.create(12, type="Internal", specification="NETCONNECT 12 Count OM4"), "Gladeside"
)  # CCP -> CCP (Riser)
engine.routeInternal(
    engine.create(12, type="Internal", specification="NETCONNECT 12 Count OM4"), "Gladeside"
)  # CCP -> CCP (Riser)
engine.routeInternal(
    engine.create(12, type="Internal", specification="NETCONNECT 12 Count OM4"), "Gladeside"
)  # CCP -> CCP (Riser)
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(engine.create(4, type="Internal"), "Gladeside")  # CCP -> ONT
engine.routeInternal(
    engine.create(4, type="Internal"), "Gladeside Park"
)  # For testing structure deletion w/ internal cable

engine.routeInternal(
    engine.create(48, type="Internal"), "Woodhead Hub"
)  # Rack2 -> ODF1 for Coax path to WH-ON-001
