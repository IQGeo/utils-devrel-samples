import re
from pyramid.view import view_config
from myworldapp.modules.comms.server.controllers.mywcom_controller import MywcomController
from myworldapp.modules.comms.server.api.manager import *
from myworldapp.modules.comms.server.api.cable_manager import *
from myworldapp.modules.comms.server.api.connection_manager import *
from myworldapp.modules.comms.server.api.pin_range import *

class CustomerConnectionController(MywcomController):
    cable_name = "DROP-6000"
    current_splitter_pin = 1

    def __init__(self, request):
        super().__init__(request, "DATA")

    def _createSpliceClosure(self, pole, pole_coords):
        splice_closure_props = {"name": "Splice Closure", "specification": "CS-FOSC-400B4-S24-4-NNN", "housing": pole._urn(), "root_housing": pole._urn(), "location": pole_coords}
        return self.splice_closure_table.insert(splice_closure_props)

    def _createFiberSplitter(self, pole, pole_coords, splice_closure_record):
        fiber_splitter_props = {"name": "Fiber Splitter", "n_fiber_in_ports": 1, "n_fiber_out_ports": 64, "housing": splice_closure_record._urn(), "root_housing": pole._urn(), "location": pole_coords}
        return self.fiber_splitter_table.insert(fiber_splitter_props)
    
    def _createWallBox(self, name, coord):
        wall_box_props = {"name": name, "location": coord}
        return self.wall_box_table.insert(wall_box_props)

    def _createOnt(self, wall_box, coord):
        ont_props = {"name": "ONT", "n_fiber_in_ports": 64, "housing": wall_box._urn(), "root_housing": wall_box._urn(), "location": coord}
        return self.ont_table.insert(ont_props)
    
    def _createRoute(self, pole, wall_box, coords):
        route_props = {"in_structure": pole._urn(), "out_structure": wall_box._urn(), "length": coords.geoLength(), "path": coords}
        return self.route_table.insert(route_props)

    def _createCable(self, structs):
        cable_props = {"name": self.cable_name, "fiber_count": 16, "directed": True}
        cable_record = self.fiber_table.insert(cable_props)
        routes = self.cable_manager.findPath(structs)
        self.cable_manager.route(cable_record, *routes)
        return cable_record

    def _connectCableToSplitter(self, cable_segment, fiber_splitter):
        fiber_splitter_pin_range = PinRange ("out", self.current_splitter_pin, self.current_splitter_pin)
        cable_pin_range = PinRange("in", 1, 1)
        return self.connection_manager.connect("fiber", fiber_splitter, fiber_splitter, fiber_splitter_pin_range, cable_segment, cable_pin_range)

    def _connectCableToOnt(self, cable_segment, ont):
        ont_pin_range = PinRange("in", 1, 1)
        cable_pin_range = PinRange("out", 1, 1)
        return self.connection_manager.connect("fiber", ont, cable_segment, cable_pin_range, ont, ont_pin_range)
    
    def _incrementCableName(self):
        match = re.match(r'(.*?)(\d+)$', self.cable_name)
        if match:
            text_part, num_part = match.groups()
            incremented_num = str(int(num_part) + 1)
            padded_num = incremented_num.zfill(len(num_part))
            self.cable_name = text_part + padded_num


    @view_config(route_name='customer_connection_controller.buildConnections', request_method='GET', renderer='json')
    def buildConnections(self):
        self.current_user.assertAuthorized(self.request)

        self.design = self.db.view("design/" + self.request.matchdict['design_id'])
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

        pole_table_filtered = self.pole_table.filterOn('id', self.request.matchdict['pole_id'])
        filtered_poles = pole_table_filtered.recs(limit = 1)
        pole = next(filtered_poles)
        pole_coords = MywPoint(pole.primaryGeometry().x, pole.primaryGeometry().y)

        address_predicate = self.address_table.field('location').geomWithinDist(pole_coords, 50)
        near_addressses = self.address_table.filter(address_predicate)

        splice_closure_record = self._createSpliceClosure(pole, pole_coords)
        fiber_splitter_record = self._createFiberSplitter(pole, pole_coords, splice_closure_record)

        for addr in near_addressses:
            if addr.street_name is not None and addr.street_number is not None:
                wall_box_name = addr.street_name + " " + addr.street_number + " Wall Box"
            else:
                wall_box_name = "Wall Box"
            addr_coordinates = MywPoint(addr.primaryGeometry().x, addr.primaryGeometry().y)
            wall_box_record = self._createWallBox(wall_box_name, addr_coordinates)
            wall_box_coordinates = MywPoint(wall_box_record.primaryGeometry().x, wall_box_record.primaryGeometry().y)
            ont_record = self._createOnt(wall_box_record, wall_box_coordinates)

            route_coords = MywLineString([pole_coords, wall_box_coordinates])
            route_record = self._createRoute(pole, wall_box_record, route_coords) 
            cable_record = self._createCable([pole, wall_box_record])

            cable_segments = self.cable_manager.orderedSegments(cable_record)
            splitter_connection_record = self._connectCableToSplitter(cable_segments[0], fiber_splitter_record)
            ont_connection_record = self._connectCableToOnt(cable_segments[0], ont_record)

            self._incrementCableName()
            self.current_splitter_pin += 1
            
        self.db.commit()
        print("OPERATION COMPLETE")
        return {"status": "success"}
