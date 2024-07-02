from myworldapp.core.server.base.core.myw_error import MywError
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.network_view import NetworkView
from myworldapp.modules.comms.server.validation.data_validator import DataValidator
from myworldapp.core.server.base.geom.myw_line_string import MywLineString
from myworldapp.core.server.base.geom.myw_point import MywPoint
from myworldapp.core.server.base.core.myw_progress import MywSimpleProgressHandler
from myworldapp.core.server.startup.myw_python_mods import addprioritysitedir

from myworldapp.modules.comms_dev_db.utils.circuit_routing_engine import CircuitRoutingEngine

import os

utils_dir = os.path.dirname(os.path.dirname(__file__))
addprioritysitedir(utils_dir)


from myworldapp.modules.comms_dev_db.utils.scale_db.comms_build_fiber_rings import (
    CommsBuildFiberRings,
)


class CommsBuildLongHaul(CommsBuildFiberRings):
    def __init__(self, db, delta, section_length, num_sections, start_coord):

        super().__init__(db, delta, {})
        self.section_length = section_length
        self.num_sections = num_sections
        self.start_coord = start_coord

    def run(self):

        curr_coord = self.start_coord
        curr_struct = self.create_structure("manhole", "MH-LongHaul-0", curr_coord)
        curr_cable = None
        for n in range(self.num_sections):

            self.progress(1, "Create section", n)
            next_coord = self.translate(curr_coord, 100, self.section_length)
            next_struct = self.create_structure("manhole", f"MH-LongHaul-{n+1}", next_coord)
            line = MywLineString([curr_coord, next_coord])
            self.create_route("ug_route", line)

            next_cable = self.create_cable(f"BB-LongHaul-{n}", 96, [curr_coord, next_coord])
            if curr_cable:
                self.connect_cables(curr_struct, curr_cable, 1, 96, next_cable, 1, 96)

            curr_coord = next_coord
            curr_struct = next_struct
            curr_cable = next_cable
            # curr_splice = next_splice


if __name__ in ["builtins", "__main__"]:

    start_coord = MywPoint(-98.69619346339074, 27.542095698896787)
    delta = "design/longhaul"
    delta = ""
    builder = CommsBuildLongHaul(db, delta, 2500, 300, start_coord)
    if delta:
        builder.cleanup_design()
    builder.run()
