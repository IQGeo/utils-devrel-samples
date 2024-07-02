# Run consistency checks on spec objects

import sys
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.modules.comms.server.validation.spec_validator import SpecValidator

# pylint: disable=undefined-variable

# Helper to get a positional script arg
def script_arg(n, default=None):
    if n < len(args):
        return args[n]
    return default


# Unpick args
trace_level = int(script_arg(0, "2"))

# Run check
progress = MywSimpleProgressHandler(trace_level)
progress(1, "------------------------")
progress(1, "Checking Specs")
progress(1, "------------------------")

engine = SpecValidator(db, progress)
engine.run()
