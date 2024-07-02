# Create fiber cables to DSLAMs etc

from myworldapp.modules.comms_dev_db.utils.comms_dev_db_cable_manager import CommsDevDBCableManager

# pylint: disable=undefined-variable
engine = CommsDevDBCableManager(db.view(), 1)

engine.route(engine.create(16), "Woodhead Hub", "WH-C-05")
