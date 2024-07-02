# Show properties of specs

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.modules.comms.server.validation.spec_validator import SpecValidator

# pylint: disable=undefined-variable
engine = SpecValidator(db, MywSimpleProgressHandler(0))
engine.printSpecs()
