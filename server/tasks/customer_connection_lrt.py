import random
from typing import Any

from myworldapp.core.server.tasks.myw_base_task import MywBaseTask, myw_task
from myworldapp.modules.utils_devrel_samples.server.connection_helper import ConnectionHelper

@myw_task(name='customer_connection_task',
          queue='high_priority',
          timeout=600,
          params={
              "design": {
                  "required": True,
                  "type": str
              },
              "pole_id": {
                  "required": True,
                  "type": int
              },
          }
)
class CustomerConnectionLongRunningTask(MywBaseTask):

    def execute(self, **kwargs: Any):
        """
        Executes the Long Running Task connecting 2000 random customer addresses to a network

        Args:
            **kwargs: Arguments object containing 'design' and 'pole_id'

        Returns:
            str: A message indicating the operation completed successfully
        """

        # Retrieves the design ID and initializes a ConnectionHelper instance
        design_id = kwargs.get("design").split('/')[1]
        connection_helper = ConnectionHelper(self.db, design_id)

        # Gets the current pole and creates a splice closure and fiber splitter at that pole
        self.current_pole = connection_helper.get_pole(kwargs.get("pole_id"))
        splice_closure_record = connection_helper.create_splice_closure(self.current_pole)
        connection_helper.create_fiber_splitter(self.current_pole, splice_closure_record)

        # Retrieves all available addresses to connect
        addr_list = list(connection_helper.get_all_addresses())

        for i in range(2001):

            # Randomly selects an address
            addr = random.choice(addr_list)

            # Creates a wall box and ONT for the address
            wall_box_record = connection_helper.create_wall_box(addr)
            ont_record = connection_helper.create_ont(wall_box_record)

            # Creates a route and cable between the current pole and the wall box
            connection_helper.create_route(self.current_pole, wall_box_record)
            cable_record = connection_helper.create_cable([self.current_pole, wall_box_record])
            cable_segments = connection_helper.network_view.cable_mgr.orderedSegments(cable_record)
            
            # Connects the cable to the splitter and ONT
            connection_helper.connect_cable_to_splitter(cable_segments[0], connection_helper.current_fiber_splitter)
            connection_helper.connect_cable_to_ont(cable_segments[0], ont_record)
            
            # Increments cable naming and splitter pin counters
            connection_helper.increment_cable_name(connection_helper.cable_name)
            connection_helper.current_splitter_pin += 1

            # If the splitter is at capacity, creates a new pole, closure and splitter
            if (connection_helper.current_splitter_pin > 64):
                connection_helper.current_splitter_pin = 1
                self.current_pole = connection_helper.create_new_pole()

            # Updates progress
            self.progress(4, f"{i} / 2000 addresses connected", progress_percent=(i/2001) * 100)

        # Commits all changes to the database
        connection_helper.db.commit()
        return "Operation completed successfully"
