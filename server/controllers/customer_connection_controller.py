from pyramid.view import view_config
from myworldapp.modules.comms.server.controllers.mywcom_controller import MywcomController
from myworldapp.modules.utils_devrel_samples.server.connection_helper import ConnectionHelper

class CustomerConnectionController(MywcomController):

    def __init__(self, request):
        super().__init__(request, "DATA")

    @view_config(route_name='customer_connection_controller.buildConnections', request_method='GET', renderer='json')
    def buildConnections(self):
        """
        Controller code to connect customer addresses to a network

        Returns:
            dict: A dictionary indicating the operation status, e.g., {"status": "success"}.
        """
        # Asserts that the current user is authorized to perform the operation
        self.current_user.assertAuthorized(self.request)

        # Initializes the ConnectionHelper with the design ID from the request
        connection_helper = ConnectionHelper(self.db, self.request.matchdict['design_id'])

        # Retrieves the pole using the pole ID from the request
        pole = connection_helper.get_pole(self.request.matchdict['pole_id'])

        # Retrieves all addresses within a 50m radius of the pole
        near_addressses = connection_helper.get_near_addresses(pole)

        # Creates a splice closure and fiber splitter at the pole
        splice_closure_record = connection_helper.create_splice_closure(pole)
        fiber_splitter_record = connection_helper.create_fiber_splitter(pole, splice_closure_record)

        for addr in near_addressses:
            # Creates a wall box and an ONT at the address
            wall_box_record = connection_helper.create_wall_box(addr)
            ont_record = connection_helper.create_ont(wall_box_record)

            # Creates a route and a cable between the pole and the wall box
            connection_helper.create_route(pole, wall_box_record)
            cable_record = connection_helper.create_cable([pole, wall_box_record])

            # Retrieves the ordered cable segments
            cable_segments = connection_helper.network_view.cable_mgr.orderedSegments(cable_record)

            # Connects the cable to the fiber splitter and the ONT
            connection_helper.connect_cable_to_splitter(cable_segments[0], fiber_splitter_record)
            connection_helper.connect_cable_to_ont(cable_segments[0], ont_record)

            # Increments the cable name and splitter pin for the next iteration
            connection_helper.increment_cable_name(connection_helper.cable_name)
            connection_helper.current_splitter_pin += 1

        # Commits all changes to the database
        connection_helper.db.commit()

        # Prints a completion message in the server log and returns a success status object
        print("OPERATION COMPLETE")
        return {"status": "success"}
