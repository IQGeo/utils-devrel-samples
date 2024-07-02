# Run consistency checks on network objects
import sys
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.modules.comms.server.validation.data_validator import DataValidator

# pylint: disable=undefined-variable

# Helper to get a poistional script arg
# pylint: disable=undefined-variable
def script_arg(n, default=None):
    if n < len(args):
        return args[n]
    return default


# Unpick args
delta = script_arg(0)
categories = script_arg(1)
trace_level = int(script_arg(2, "3"))

if delta == "master":
    delta = None

if delta and not db.view().get(delta):
    print("***Error*** No such delta:", delta)
    exit()

# Build engine
progress = MywSimpleProgressHandler(trace_level)
engine = DataValidator(db.view(delta), progress=progress)

if categories == "*":
    categories = None
elif categories:
    categories = categories.split(",")

# Run check
progress(1, "------------------------")
progress(1, "Checking data:", delta)
progress(1, "------------------------")
engine.run(categories)

# Show summary
n_errors = len(engine.errors)
print("Errors:", n_errors)
