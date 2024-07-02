################################################################################
# Superclass for myWorld batch utilities
################################################################################
# Copyright: IQGeo Limited 2010-2023

# pylint: disable=no-member

import site, os, re, sys, codecs, tempfile
import argparse, glob, shutil
from datetime import datetime
from timeit import Timer
from collections import OrderedDict
from contextlib import contextmanager

from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.base.core.myw_os_engine import MywOsEngine
from myworldapp.core.server.base.core.myw_error import MywError


class MywBatchUtility(object):
    """
    Superclass for command line utils
    """

    # TODO: Get rid of this. Delegate to os_engine instead

    def __init__(self, trace, suppress_timings=False):
        """
        Init slots of self
        """

        self.verbosity = trace
        self.progress = MywSimpleProgressHandler(self.verbosity)
        self.os_engine = MywOsEngine(progress=self.progress)
        self._suppress_timings = suppress_timings

    def run(self, step=None):
        """
        Do the build
        """

        if step:
            steps = step.split(",")
        else:
            steps = list(self.steps.keys())
        if not self._suppress_timings:
            self.progress(0, "Build started: {}".format(datetime.now().strftime("%H:%M:%S")))

        for step in steps:
            self.run_step(step)

        if not self._suppress_timings:
            self.progress(0, "Build finished: {}".format(datetime.now().strftime("%H:%M:%S")))

    def run_step(self, name):
        """
        Run a build step
        """
        start_time = datetime.now()

        meth = getattr(self, name)

        self.print_banner(self.steps[name])

        n_sec = Timer(meth).timeit(1)
        if not self._suppress_timings:
            self.progress(0, "Step {}: {:.1f} sec".format(name, n_sec))

    def print_banner(self, msg):
        """
        Print MSG with banner lines
        """
        banner = (len(msg) + 2) * "-"

        print("")
        print(banner)
        print("", msg)
        print(banner)
        print("")

        sys.stdout.flush()

    def _run(self, *cmd, **opts):
        """
        Run an external command
        """

        # See progress early in console log
        if not "use_pipes" in opts:
            opts["use_pipes"] = True

        try:
            return self.os_engine.run(*cmd, **opts)
        except MywError as cond:
            self.progress("warning", str(cond))

    @contextmanager
    def pushd(self, new_dir):
        previous_dir = os.getcwd()
        os.chdir(new_dir)
        yield
        os.chdir(previous_dir)
