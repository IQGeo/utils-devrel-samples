# Add more hub internal cables (for explicit connectivity)
# Done in separate script to avoid impact on slack segments etc

from myworldapp.modules.comms_dev_db.utils.comms_dev_db_cable_manager import CommsDevDBCableManager

# pylint: disable=undefined-variable
engine = CommsDevDBCableManager(db.view(), 1)

# ENH: Move all internal cable creation to after slacks, get rid of this
engine.seqs["Internal"] = 40

engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")  
engine.routeInternal(engine.create(48, type="Internal"), "Woodhead Hub")

