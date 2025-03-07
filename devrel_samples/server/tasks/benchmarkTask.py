import re
import random
from typing import Any

from myworldapp.core.server.tasks.myw_base_task import MywBaseTask, myw_task
from myworldapp.modules.comms.server.controllers.mywcom_controller import MywcomController
from myworldapp.modules.comms.server.api.manager import *
from myworldapp.modules.comms.server.api.cable_manager import *
from myworldapp.modules.comms.server.api.connection_manager import *
from myworldapp.modules.comms.server.api.pin_range import *

@myw_task(name='lrt_task', queue='high_priority', timeout=600)
class BenchmarkTask(MywBaseTask, MywcomController):
    cable_name = "DROP-6000"
    current_splitter_pin = 1
    pole_name = "BenchmarkPole-6000"
    polePosition_x = 0
    polePosition_y = 0
    current_pole = None
    current_splice_closure = None
    current_fiber_splitter = None
    pole_coords = None

    # ---------------------------------AUXLILIARY FUNCTIONS---------------------------------
    # Auxiliary function that increments the cable name by 1
    def _incrementName(self, name):
        match = re.match(r'(.*?)(\d+)$', name)
        if match:
            text_part, num_part = match.groups()
            incremented_num = str(int(num_part) + 1)
            padded_num = incremented_num.zfill(len(num_part))
            newName = text_part + padded_num
            return newName
        
    def _createPole(self):
        self.pole_coords = MywPoint(self.polePosition_x, self.polePosition_y)
        pole_props = {"name": self.pole_name, "location": self.pole_coords}
        self.pole_name = self._incrementName(self.pole_name)
        self.polePosition_x += 0.00001
        self.polePosition_y += 0.00001
        newPole = self.pole_table.insert(pole_props)
        self.current_splice_closure = self._createSpliceClosure(newPole, self.pole_coords)
        self.current_fiber_splitter = self._createFiberSplitter(newPole, self.pole_coords, self.current_splice_closure)
        return newPole

    #Function that creates the splice closure in the pole
    def _createSpliceClosure(self, pole, pole_coords):
        splice_closure_props = {"name": "Splice Closure", "specification": "CS-FOSC-400B4-S24-4-NNN", "housing": pole._urn(), "root_housing": pole._urn(), "location": pole_coords}
        return self.splice_closure_table.insert(splice_closure_props)

    #Function that creates the fiber splitter in the pole using the splice closure as housing
    def _createFiberSplitter(self, pole, pole_coords, splice_closure_record):
        fiber_splitter_props = {"name": "Fiber Splitter", "n_fiber_in_ports": 1, "n_fiber_out_ports": 24, "housing": splice_closure_record._urn(), "root_housing": pole._urn(), "location": pole_coords}
        return self.fiber_splitter_table.insert(fiber_splitter_props)

    #Function that creates the wall box in the address coordinates
    def _createWallBox(self, name, coord):
        wall_box_props = {"name": name, "location": coord}
        return self.wall_box_table.insert(wall_box_props)

    #Function that creates the ONT in the wall box
    def _createOnt(self, wall_box, coord):
        ont_props = {"name": "ONT", "n_fiber_in_ports": 64, "housing": wall_box._urn(), "root_housing": wall_box._urn(), "location": coord}
        return self.ont_table.insert(ont_props)

    #Function that creates the route between the pole and the wall box
    def _createRoute(self, pole, wall_box, coords):
        route_props = {"in_structure": pole._urn(), "out_structure": wall_box._urn(), "length": coords.geoLength(), "path": coords}
        return self.route_table.insert(route_props)

    #Function that creates the cable between the pole and the wall box, the function also creates the route
    #between the pole and the wall box
    def _createCable(self, structs):
        cable_props = {"name": self.cable_name, "fiber_count": 16, "directed": True}
        cable_record = self.fiber_table.insert(cable_props)
        routes = self.cable_manager.findPath(structs)
        self.cable_manager.route(cable_record, *routes)
        return cable_record

    #Function that connects the first pin of the cable segment to the first available pin in the splitter
    def _connectCableToSplitter(self, cable_segment, fiber_splitter):
        fiber_splitter_pin_range = PinRange ("out", self.current_splitter_pin, self.current_splitter_pin)
        cable_pin_range = PinRange("in", 1, 1)
        return self.connection_manager.connect("fiber", fiber_splitter, fiber_splitter, fiber_splitter_pin_range, cable_segment, cable_pin_range)

    #Function that connects the first pin of the cable segment to the first pin in the ONT
    def _connectCableToOnt(self, cable_segment, ont):
        ont_pin_range = PinRange("in", 1, 1)
        cable_pin_range = PinRange("out", 1, 1)
        return self.connection_manager.connect("fiber", ont, cable_segment, cable_pin_range, ont, ont_pin_range)

    def execute(self, **kwargs: Any):
        # seconds = kwargs.get("seconds", 60)
        # sleep_time = seconds / 10

        # for i in range(0, 100, 10):
        #     self.progress(4, f"Progress: {i}%", progress_percent=i)
        #     time.sleep(sleep_time)

        # self.progress(4, f"Progress: 100%", progress_percent=100)

        # return f"Long running task completed after {seconds} seconds"

        #Then I create references to the design as well as all tables that will be used in the operations
        self.design = self.db.view(kwargs.get("design"))
        self.polePosition_x = float(kwargs.get("coords_x"))
        self.polePosition_y = float(kwargs.get("coords_y"))
        self.pole_table = self.design.table('pole')
        self.address_table = self.db.view().table('address')
        self.splice_closure_table = self.design.table('splice_closure')
        self.fiber_splitter_table = self.design.table('fiber_splitter')
        self.wall_box_table = self.design.table('wall_box')
        self.ont_table = self.design.table('fiber_ont')
        self.route_table = self.design.table('oh_route')
        self.fiber_table = self.design.table('fiber_cable')
        self.cable_manager = CableManager(self.networkView(self.design))
        self.connection_manager = ConnectionManager(self.networkView(self.design))

        self.current_pole = self._createPole()

        addresses = self.address_table.recs()
        addr_list = list(addresses)

        # Next I'll iterate over the addresses that are near the pole and create the equipment and connections
        for i in range(2001):

            addr = random.choice(addr_list)
            if addr.street_name is not None and addr.street_number is not None:
                wall_box_name = addr.street_name + " " + addr.street_number + " Wall Box"
            else:
                wall_box_name = "Wall Box"
            addr_coordinates = MywPoint(addr.primaryGeometry().x, addr.primaryGeometry().y)

            wall_box_record = self._createWallBox(wall_box_name, addr_coordinates)
            wall_box_coordinates = MywPoint(wall_box_record.primaryGeometry().x, wall_box_record.primaryGeometry().y)
            ont_record = self._createOnt(wall_box_record, wall_box_coordinates)

            route_coords = MywLineString([self.pole_coords, wall_box_coordinates])
            route_record = self._createRoute(self.current_pole, wall_box_record, route_coords) 
            cable_record = self._createCable([self.current_pole, wall_box_record])
            cable_segments = self.cable_manager.orderedSegments(cable_record)
            splitter_connection_record = self._connectCableToSplitter(cable_segments[0], self.current_fiber_splitter)
            ont_connection_record = self._connectCableToOnt(cable_segments[0], ont_record)
            self.cable_name = self._incrementName(self.cable_name)
            self.current_splitter_pin += 1
            if (self.current_splitter_pin > 24):
                self.current_splitter_pin = 1
                self.current_pole = self._createPole()
            self.progress(4, f"{i} / 2000 adresses connected", progress_percent=(i/2001) * 100)
        self.db.commit()
        return "Operation completed successfully"
