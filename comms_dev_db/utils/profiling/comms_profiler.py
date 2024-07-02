"""
Provides a means to easily profile functions (particularly controller functions) by means of a decorator

Include this at the top of the controller file:
from myworldapp.modules.comms_dev_db.utils.profiling.comms_profiler import profileit
and the tag
@profileit at the top of the controller method

The profile output can be visualised using snakeviz

ENH: Provide a way to allow us to make @profileit decorator permanent and control
what gets profiled using switches in, for example, ini file.

"""
import cProfile, random
import functools, os


def profileit(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        datafn = func.__name__
        prof = cProfile.Profile()
        retval = prof.runcall(func, *args, **kwargs)
        prof.dump_stats(os.path.join("/tmp", f"{datafn}_{random.randrange(100)}.profile"))
        return retval

    return wrapper
