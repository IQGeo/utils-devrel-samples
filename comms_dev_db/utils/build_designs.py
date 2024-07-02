import argparse
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.modules.comms_dev_db.utils.design_builder import CommsDevDBDesignBuilder
from myworldapp.core.server.base.db.globals import Session


# Design signature
arg_parser = argparse.ArgumentParser(prog="script")
arg_parser.add_argument("design_spec", type=str, nargs="?", default="*", help="Designs to build")
arg_parser.add_argument("trace_level", type=int, nargs="?", default=2, help="Witterage level")

# Unpick args
#pylint: disable=used-before-assignment
args = arg_parser.parse_args(args)

# Build data
# pylint: disable=undefined-variable
engine = CommsDevDBDesignBuilder(db, args.trace_level)
engine.run(args.design_spec)
