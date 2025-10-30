import re
from myworldapp.modules.comms.server.api.manager import MywPoint, MywLineString
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.network_view import NetworkView

class ConnectionHelper:
    def __init__(self, db, design):
        self.db = db
        self.design = self.db.view("design/" + design)
        self.pole_table = self.design.table('pole')
        self.address_table = self.db.view().table('address')
        self.splice_closure_table = self.design.table('splice_closure')
        self.fiber_splitter_table = self.design.table('fiber_splitter')
        self.wall_box_table = self.design.table('wall_box')
        self.ont_table = self.design.table('fiber_ont')
        self.route_table = self.design.table('oh_route')
        self.fiber_table = self.design.table('fiber_cable')

        self.current_splitter_pin = 1
        self.cable_name = "DROP-6000"
        self.pole_name = "CustomerConnectionPole-6000"
        self.polePosition_lng = 0
        self.polePosition_lat = 0

        self.network_view = NetworkView(self.db.view("design/" + design))

    def create_splice_closure(self, pole, pole_coords = None):
        """
        Creates a new splice closure in the given pole

        Args:
            pole: The pole object to which the splice closure will be attached
            pole_coords (optional): The pole coordinates (as a MywPoint object). If not provided, the pole coordinates are used

        Returns:
            The newly created splice closure

        This function creates the splice closure properties object and inserts a new record into the splice_closure_table. 
        It also stores the created record in self.current_splice_closure for later use.
        """
        if pole_coords is None:
            pole_coords = MywPoint(pole.primaryGeometry().x, pole.primaryGeometry().y)
        splice_closure_props = {"name": "Splice Closure", "specification": "CS-FOSC-400B4-S24-4-NNN", "housing": pole._urn(), "root_housing": pole._urn(), "location": pole_coords}
        self.current_splice_closure = self.splice_closure_table.insert(splice_closure_props)
        return self.current_splice_closure

    def create_fiber_splitter(self, pole, splice_closure_record, pole_coords = None):
        """
        Creates a new fiber splitter in the given pole and closure

        Args:
            pole: The pole object to which the fiber splitter will be attached
            splice_closure_record: The splice closure object to which the fiber splitter will be attached
            pole_coords (optional): The pole coordinates (as a MywPoint object). If not provided, the pole coordinates are used

        Returns:
            The newly created fiber splitter

        This function creates the fiber splitter properties object and inserts a new record into the fiber_splitter_table
        The housing is set to the splice closure, and the root housing is set to the pole
        """
        if pole_coords is None:
            pole_coords = MywPoint(pole.primaryGeometry().x, pole.primaryGeometry().y)
        fiber_splitter_props = {"name": "Fiber Splitter", "n_fiber_in_ports": 1, "n_fiber_out_ports": 64, "housing": splice_closure_record._urn(), "root_housing": pole._urn(), "location": pole_coords}
        self.current_fiber_splitter = self.fiber_splitter_table.insert(fiber_splitter_props)
        return self.current_fiber_splitter

    def create_wall_box(self, addr):
        """
        Creates a new wall box using the provided address information

        Args:
            addr: The address where the wall box will be created

        Returns:
            The newly created wall box

        The function creates a wall box name based on the address's street name and number,
        then it creates the wall box properties object and inserts a new record into the Wall Box table
        """
        if addr.street_name is not None and addr.street_number is not None:
             wall_box_name = addr.street_name + " " + addr.street_number + " Wall Box"
        else:
            wall_box_name = "Wall Box"
        addr_coordinates = MywPoint(addr.primaryGeometry().x, addr.primaryGeometry().y)
        wall_box_props = {"name": wall_box_name, "location": addr_coordinates}
        return self.wall_box_table.insert(wall_box_props)

    def create_ont(self, wall_box):
        """
        Creates a new ONT

        Args:
            wall_box: The wall box to which the ONT will be associated.

        Returns:
            The newly created ONT

        The function creates a ONT properties object and inserts a new record into the ONT table
        """
        wall_box_coordinates = MywPoint(wall_box.primaryGeometry().x, wall_box.primaryGeometry().y)
        ont_props = {"name": "ONT", "n_fiber_in_ports": 64, "housing": wall_box._urn(), "root_housing": wall_box._urn(), "location": wall_box_coordinates}
        return self.ont_table.insert(ont_props)
    
    def create_route(self, pole, wall_box):
        """
        Creates a route between a pole and a wall box

        Args:
            pole: The pole where the route starts
            wall_box: The wall box where the route ends

        Returns:
            The newly created route

        The route is defined as a line string between the coordinates of the pole and the wall box
        The function creates a route properties object and inserts a new record into the route table
        """
        pole_coords = MywPoint(pole.primaryGeometry().x, pole.primaryGeometry().y)
        wall_box_coordinates = MywPoint(wall_box.primaryGeometry().x, wall_box.primaryGeometry().y)
        route_coords = MywLineString([pole_coords, wall_box_coordinates])
        route_props = {"in_structure": pole._urn(), "out_structure": wall_box._urn(), "length": route_coords.geoLength(), "path": route_coords}
        return self.route_table.insert(route_props)

    def create_cable(self, structs):
        """
        Creates and routes a cable record between the given structures

        Args:
            structs (list): A list of structures used to determine the cable route

        Returns:
            The newly created cable

        This function creates a cable properties object, then calls the findPath function which associates the cable
        to a route between the given structs and inserts a new record into the fiber_cable table
        """
        cable_props = {"name": self.cable_name, "fiber_count": 16, "directed": True}
        cable_record = self.fiber_table.insert(cable_props)
        # routes = self.cable_manager.findPath(structs)
        # self.cable_manager.route(cable_record, *routes)
        routes = self.network_view.cable_mgr.findPath(structs)
        self.network_view.cable_mgr.route(cable_record, *routes)
        return cable_record

    def connect_cable_to_splitter(self, cable_segment, fiber_splitter):
        """
        Connects a cable segment to a fiber splitter

        Args:
            cable_segment: The cable segment to be connected to the splitter
            fiber_splitter: The fiber splitter to which the cable segment will be connected

        Returns:
            The result of the connection_manager.connect operation, which represents the established connection

        The function first create the PinRange objects with the information about the range of pins to be used for the connection,
        the object contains, in order:
            - The side of the equipment ("in" or "out") where the connection will be created
            - The starting pin number
            - The ending pin number

        In our case we'll always use one pin for our connections. Then the connect function from the Connection API is called, with the paremeters:
            - The type of connection ("fiber" in this case)
            - Where the connection is housed (fiber splitter)
            - Where the connection starts (fiber splitter)
            - The pin range on the fiber splitter side
            - Where the connection ends (cable segment)
            - The pin range on the cable segment side
        """
        fiber_splitter_pin_range = PinRange ("out", self.current_splitter_pin, self.current_splitter_pin)
        cable_pin_range = PinRange("in", 1, 1)
        # return self.connection_manager.connect("fiber", fiber_splitter, fiber_splitter, fiber_splitter_pin_range, cable_segment, cable_pin_range)
        return self.network_view.connection_mgr.connect("fiber", fiber_splitter, fiber_splitter, fiber_splitter_pin_range, cable_segment, cable_pin_range)

    def connect_cable_to_ont(self, cable_segment, ont):
        """
        Connects a cable segment to a ONT

        Args:
            cable_segment: The cable segment to be connected to the ONT
            ont: The ONT to which the cable segment will be connected

        Returns:
            The result of the connection_manager.connect operation, which represents the established connection

        The function first create the PinRange objects with the information about the range of pins to be used for the connection,
        the object contains, in order:
            - The side of the equipment ("in" or "out") where the connection will be created
            - The starting pin number
            - The ending pin number
            
        In our case we'll always use one pin for our connections. Then the connect function from the Connection API is called, with the paremeters:
            - The type of connection ("fiber" in this case)
            - Where the connection is housed (ONT)
            - Where the connection starts (cable segment)
            - The pin range on the cable segment side
            - Where the connection ends (ONT)
            - The pin range on the ONT side
        """
        
        ont_pin_range = PinRange("in", 1, 1)
        cable_pin_range = PinRange("out", 1, 1)
        # return self.connection_manager.connect("fiber", ont, cable_segment, cable_pin_range, ont, ont_pin_range)
        return self.network_view.connection_mgr.connect("fiber", ont, cable_segment, cable_pin_range, ont, ont_pin_range)
    
    @staticmethod
    def _increment_name(name):
        """
        Increments the trailing integer in a given string name by 1, used to increment the cables and poles names
        Args:
            The input string potentially ending with a number
        Returns:
            The modified string with the trailing number incremented, or the original string if no trailing number exists
        Example:
            _incrementName("DROP-6000") -> "DROP-6001"
        """

        match = re.match(r'(.*?)(\d+)$', name)
        if match:
            text_part, num_part = match.groups()
            incremented_num = str(int(num_part) + 1)
            padded_num = incremented_num.zfill(len(num_part))
            name = text_part + padded_num
        return name
    
    def increment_cable_name(self, cable_name):
        self.cable_name = self._increment_name(cable_name)

    def increment_pole_name(self, pole_name):
        self.pole_name = self._increment_name(pole_name)
    
    def get_pole(self, id):
        """
        Retrieves a pole record by its ID, updates the instance's longitude and latitude attributes
        with the pole's coordinates, and returns the pole object
        Args:
            The unique identifier of the pole to retrieve
        Returns:
            The pole record corresponding to the given ID
        """

        pole_table_filtered = self.pole_table.filterOn('id', id)
        filtered_pole = pole_table_filtered.recs(limit = 1)
        pole = next(filtered_pole)
        self.polePosition_lng = pole.primaryGeometry().x
        self.polePosition_lat = pole.primaryGeometry().y 
        return pole
    
    def get_near_addresses(self, pole):
        """
        Finds and returns addresses located within a 50-meter radius of the given pole
        Args:
            pole: The pole used as the center point for the search
        Returns:
            A filtered collection of addresses from the address_table that are within 50 meters
            of the pole
        """

        pole_coords = MywPoint(pole.primaryGeometry().x, pole.primaryGeometry().y)
        address_predicate = self.address_table.field('location').geomWithinDist(pole_coords, 50)
        near_addressses = self.address_table.filter(address_predicate)
        return near_addressses

    def get_all_addresses(self):
        addresses = self.address_table.recs()
        return addresses

    def create_new_pole(self):
        """
        Creates a new pole inserts it into the pole table, and creates the pole's splice closure and fiber splitter

        Returns:
            The newly created pole

        This method increments the current pole's longitude and latitude by a small value to generate
        a new position, creates a new pole entry with the updated coordinates and name, and inserts it
        into the database. It then updates the pole name for the next creation, and creates the splice closure
        and fiber splitter linked to the new pole
        """

        self.polePosition_lng += 0.00001
        self.polePosition_lat += 0.00001
        self.pole_coords = MywPoint(self.polePosition_lng, self.polePosition_lat)
        pole_props = {"name": self.pole_name, "location": self.pole_coords}

        newPole = self.pole_table.insert(pole_props)

        self.increment_pole_name(self.pole_name)

        self.current_splice_closure = self.create_splice_closure(newPole, self.pole_coords)
        self.current_fiber_splitter = self.create_fiber_splitter(newPole, self.current_splice_closure, self.pole_coords)
        return newPole