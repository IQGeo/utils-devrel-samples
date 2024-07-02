# Run consistency checks on comms config
import sys
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.modules.comms.server.config.config_validator import ConfigValidator

# pylint: disable=undefined-variable

# Helper to get a positional script arg
def script_arg(n, default=None):
    if n < len(args):
        return args[n]
    return default


# Unpick args
trace_level = int(script_arg(0, "2"))
warn = script_arg(1, False)

# Run check
progress = MywSimpleProgressHandler(trace_level)
progress(1, "------------------------")
progress(1, "Checking Comms Config")
progress(1, "------------------------")

engine = ConfigValidator(db, progress, warn)
engine.run()
