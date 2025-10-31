# Long Running Tasks (LRT) - Python/Javascript - Code Deep Dive

## Table of Contents

- [Long Running Tasks (LRT) - Python/Javascript - Code Deep Dive](#long-running-tasks-lrt---pythonjavascript---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [conection\_helper.py](#conection_helperpy)
    - [connection\_helper.py](#connection_helperpy)
    - [customer\_connection\_lrt.py](#customer_connection_lrtpy)
    - [lrt\_modal.js](#lrt_modaljs)
    - [lrt\_plugin.js](#lrt_pluginjs)

---

## Tool Description

The tool uses the Long Running Task (LRT) framework that is designed to handle high-volume/compute-intensive tasks that if performed with Javascript on the client would degrade the end-user experience (e.g. time-out errors).  The framework combines Python script execution on the server with task queues managed by Python RQ backed by a Redis instance that is already available in the containerized environment.  

Because of the "long-running" nature of the tasks, the example includes a technique for providing useful feedback to the end user about the progress of the task.

Similar to the use cases found elsewhere in the Samples, we are looking to automate the creation of a connection between a Pole and an Address.  But in this case we are creating connections to 2000 random addresses in order to demonstrate the LRT functionality.

Starting with an empty Design polygon, the script creates the necessary Structures and Equipment to create a Fiber connection:

- Creates a new pole
    - Adds a Splice Closure to the Pole
    - Adds a Fiber Splitter to the Splice Closure
        - Once the 24 ports on the Fiber Splitter are filled, it creates another Pole
  
- Within a random Address
    - Adds a Wall Box at the Address location
    - Adds an ONT to the Wall Box housing
    - Creates a Route between the Pole and Wall Box at the address
    - Connects the Cable to a Pin in the Fiber Splitter
    - Connects the Cable to a Pin in the ONT


The user is provided feedback on the progress of the 2000 connections being made via a message in the modal dialog.

## Tool files

The tool files are:

- `conection_helper.py` - The file containing helper functions that are shared between different python samples. This document focus on the functions used by this sample
- `customer_connection_lrt.py` - this is the Python file that includes both the execution logic for creating structures, equipment, and fiber cable connections as well as the logic for invoking the LRT framework and setting task parameters. 
    - Long Running Task Python files *must* reside in the `/server/tasks` folder.  In this case it should be in the `/modules/devrel_samples/server/tasks` folder.
- `lrt_modal.js` - The file containing the React code used to render the modal window, including displaying the progress in the execution of the Python script. 
    - This is found in the `/modules/devrel_samples/public/js/Samples/LRT` folder.
- `lrt_plugin.js` - the configuration file for the LRT plugin.  The LrtPlugin class will be then imported into the `main.sampleapp.js` file in a similar way as the other Palette tools. 
    - This is found in the `/modules/devrel_samples/public/js/Samples/LRT` folder.

## How the tool works

In this section we will go over the tool source code describing how it works.

### conection_helper.py

### connection_helper.py

Starting with the `import` statements

```
import re
from myworldapp.modules.comms.server.api.manager import MywPoint, MywLineString
from myworldapp.modules.comms.server.api.pin_range import PinRange
from myworldapp.modules.comms.server.api.network_view import NetworkView
```

- `re` is a regular expression library
- - The next three imports are NMT APIs that will be used in the logic to be created

Next the class is created, as well as the class constructor, which is called from the file `customer_connection_controller.py`

```
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

        self.network_view = NetworkView(self.db.view("design/" + design))
```

- The first reference is for the Database
- The first reference is for the Design that is passed as parameter by the client
- One important difference to note is that the `self.address_table` used is from the master database (`self.db.view()`) whereas all other tables are from the design. That is because all Objects we are going to create are going to be created in the Design, but the Addresses already exist in the master table
- Next, variables for the next available Fiber Splitter pin and next Cable name 
- An instance of `NetworkView` is created, this contains references to the Cable and Connection APIs that are used later in the process

Next there is a series of internal auxiliary functions that are used in the connection logic

```
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
```

- `createSpliceClosure` receives as parameters the Pole where the Splice Closure will be created and its coordinates, and returns the object created
- `createFiberSplitter` receives as parameters the Pole, its coordinates, and the Splice Closure that will house the Fiber Splitter to be created, and returns the object created
- `createWallBox` receives as parameters the name of the Wall Box to be created and the coordinates where it will be created (which are the Address' coordinates), and returns the object created
- `createOnt` receives as parameters the Wall Box that will house the ONT and the coordinates where it will be created, and returns the object created
- `createRoute` receives as parameters the Pole (where the route begins), the Wall Box (where the route ends) and the route coordinates, and returns the route created
  - In the previous functions the coordinates where always one point in the world where the Object would be created, but the route is a line, so the `coords` variable actually is an array with two points: The start (Pole) and end (Wall Box) of the route
- `createCable` receive as parameters an array with the structures (in this case the Pole and the Wall Box) where the cable will begin and end, and returns the object created
  - The previous functions received the structures separately and this one receives it as an array because these are used in the `findPath` function, which receives the same array, so this function receives the array just to simplify its logic
  - After creating the cable, we must call `findPath` which will look for the shortest paths between the the structures. In this case there will only be a single route between the two (the one created by `createRoute`)
  - With the route information, the function `route` is created, this is where the route is actually built in the database
- `connectCableToSplitter` receives as parameters the cable segment to be connected and the fiber splitter where it will be connected, and returns the connection created
  - The pin used in the cable is always 1, since the cable in the "in" side will always only connect to the Fiber Splitter
  - The pin used in the fiber splitter is the pin stored in the `self.current_splitter_pin` variable
- `connectCableToOnt` receives as parameters the cable segment to be connected and the ONT
  - For both cable and ONT the pin used it "1" because both the cable in the "out" side and the ONT will only connect with each other
- `_increment_name` is an internal function that increments the trailing number (if any) of a string. This will be used to increment the name of the cables to be created (e.g.: cable `DROP-6000` is created, the `self.cable_name` variable is incremented to `DROP-6001`)
- `increment_cable_name` and `increment_pole_name` call the internal `_increment_name` function to update the cable and pole name
- `get_pole` will return the Pole Object based on the ID that is passed by the client to the server
  - A query is performed in the `self.pole_table` via the `filterOn` function, looking for the Poles where the `id` field equals the ID passed in the `pole_id` parameter of the GET function, with the first record is returned (In fact, the `filterOn` function will return a single record since it queries the table using the unique ID)
- `get_all_addresses` returns all addresses from the table

### customer_connection_lrt.py

```
import random
from typing import Any

from myworldapp.core.server.tasks.myw_base_task import MywBaseTask, myw_task
from myworldapp.modules.utils_devrel_samples.server.connection_helper import ConnectionHelper
```

- As is customary in Python, at the top of our script we begin by importing our libraries:  
    - `random`, and `typing`,  are standard Python libraries 
    - we import the `MywBaseTask` and `myw_task` in order to work with the Long Running Task framework  
    - `ConnectionHelper` is the class created in the `connection_helper.py` file (see above)

```
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
```
- First the decorator that attaches a task to the MywBaseTask class and takes the following parameters
  - the name of the task (optional) - if not provided, the class name will be used
  - the name of the queue (optional) - if not provided, 'default' will be used
  - the timeout of the task in seconds (optional)- default = 180 seconds
  - And the task's require parameters. In this case the selected design and Pole ID
- Next the class declaration

Then we have the function that will do the work in the Long Running Task framework, it must be named `execute`
 
```
def execute(self, **kwargs: Any):
```

The function takes a number of keyword arguments of different data types, hence the use of `Any`.

```
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

        self.progress(4, f"{i} / 2000 addresses connected", progress_percent=(i/2001) * 100)
```

- The functions starts by creating an instance of `ConnectionHelper` passing a reference of the database and the selected design.
  - To get the parameters passed from the client to the task, use the function `kwargs.get` function, passing the name of the parameter
- Next, using the `ConnectionHelper` class functions, we get the current pole, create the underlying equipment, and all the addresses
- Then we randomyl select 2000 addresses and run the process of connecting the address in the network. If the equipment in the current pole is at capacity, we create a new pole and continue the process
- The task `progress` method takes a step integer, a progress message, and a progress percentage

```
connection_helper.db.commit()
return "Operation completed successfully"
```
  
- while we have inserted new records for the created structures and equipment, these records have not been committed to the database until the end of the script with the `connection_helper.db_commit()` call
- Finally we return a success message

### lrt_modal.js

```
import myw, { TaskManager } from 'myWorld-client';
import React, { useState, useEffect, useRef } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Alert } from 'antd';
import { useLocale } from 'myWorld-client/react';
```
We start by importing from the "myworld" client library, standard React hooks, UI library elements for use in the modal window, and a localization class.
&#8291;
  
&#8291;
```
export const LrtModal = ({ open }) => {
    const { msg } = useLocale('LRT');
    const [appRef] = useState(myw.app);
    const [isOpen, setIsOpen] = useState(open);
    const [design, setDesign] = useState('');
    const [coords_x, setCoords_x] = useState('');
    const [coords_y, setCoords_y] = useState('');
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);
    const [alertType, setAlertType] = useState('');
```
We create the `LrtModal` object by creating a localization `msg` object, a reference to the map application itself, and a series of objects using React state hooks and setting initial values.

&#8291;
  
&#8291;
```
    const progressStreamControlsRef = useRef({ close() {} });
    const [task, setTask] = useState(null);
    const defaultProgress = {
        percent: 0,
        message: '0 / 2000 adresses connected',
        status: 'Not running'
    };
    const [progress, setProgress] = useState(defaultProgress);
    const [isTaskRunning, setIsTaskRunning] = useState(false);

```
Here we are setting up objects spefically pertaining to the running the task, setting the initial properties of the progress object, and monitoring the running of the task.


&#8291;
  
&#8291;
```
    useEffect(() => {
        setOnFunctions();
        updateFeatures();
    }, []);

    useEffect(() => {
        if (design) {
            setDisabled(false);
        } else {
            setDisabled(true);
        }
    }, [design]);


```
Next we set up two useEffect hooks for the `setOnFunctions` and `updateFeatures` functions as well as a check that a design is selected.



&#8291;
  
&#8291;

```
    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

```
Here a couple of variables are declared to control modal window behavior

&#8291;
  
&#8291;

```
    function setOnFunctions() {
        appRef.on('currentFeature-changed currentFeatureSet-changed', updateFeatures);
    }

    function updateFeatures() {
        const feature = appRef.currentFeature;
        if (!feature || feature.getType() !== 'design') {
            setDesign('');
            return;
        } else {
            setDesign('design/' + feature.properties.name);
            setCoords_x(feature.geometry.coordinates[0][0][0]);
            setCoords_y(feature.geometry.coordinates[0][0][1]);
        }
    }

```
These functions fire when something on the map is selected.  In `updateFeatures` we are checking if the selected map object is a design and if it is we are getting the x and y coordinates of its first vertex. The design name and the coordinates will be keyword arguments passed to the Python script.

&#8291;
  
&#8291;

```
    function showAlert(type, message, time) {
        setAlertMessage(message);
        setAlertType(type);
        setIsAlertVisible(true);
        setTimeout(() => {
            setIsAlertVisible(false);
        }, time);
    }

```
Here we are setting up some behavior properties for the alert message to be shown in the modal window.
&#8291;
  
&#8291;
```
    const onBuildConnectionsLRT = async () => {
        const params = { design: design, coords_x: coords_x, coords_y: coords_y };
        console.log('Calling LRT');
        try {
            const task = await appRef.system.enqueueTask('lrt_task', params);
            setTask(task);
            setIsTaskRunning(true);

            console.log(`Task with id=${task.id} started...`);

            startStreamingProgress(task);
        } catch (errorInfo) {
            console.log('Failed:', errorInfo);
        }
    };


```
This code block sets up how the Long Running Task is to be called:

- async for asynchronous behavior
- passing in the design and the x,y coordinates derived above
- creating the task by calling the `enqueueTask` method
    - note that we are passing the LRT task name (`lrt_task`) that matches what the task is named with the decorator in the Python script.
- once the task is running, we log an message with the task.id
- the function to start the monitoring of progress of the task 
- if anything goes wrong, an error message is logged.

&#8291;
  
&#8291;

```
    const startStreamingProgress = task => {
        progressStreamControlsRef.current = appRef.system.streamTaskProgress(task.id, {
            onProgress: progress => {
                console.log('Progress:', progress);
                console.log('Task progress:', task.progress_percentage);
                console.log('Task progress:', task.progress_percent);
                setProgress(progress);
            },
            onEnd: () => {
                console.log('Task ended');
                setIsTaskRunning(false);
            },
            onFailure: error => {
                console.log('Task failed:', error);
                setIsTaskRunning(false);
            },
            onSuccess: result => {
                const prog = {
                    percent: 0,
                    message: '0 / 2000 adresses connected',
                    status: 'Not running'
                };
                setProgress(prog);
                console.log('Task succeeded:', result);
                setIsTaskRunning(false);
                showAlert('success', 'Long Running Task complete successfully!', 5000);
            }
        });
    };
```
This block of code manages how progress is reported from the `appRef.system.streamTaskProgress` object for the given task id.  Note the four states that get reported back from the task: `onProgress`, `onEnd`, `onFailure`, and `onSuccess`.

On success we call the `showAlert` function defined earlier and display it for a set period of time.



&#8291;
  
&#8291;
        
```
    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={msg('LRT_title')}
            width={500}
            onCancel={handleCancel}
            footer={
                showIntro
                    ? [
                          <Button key="ok" onClick={hideIntro} type="primary">
                              OK
                          </Button>
                      ]
                    : [
                          <Button key="cancel" onClick={handleCancel}>
                              Cancel
                          </Button>,
                          <Button
                              disabled={disabled}
                              key="create"
                              onClick={onBuildConnectionsLRT}
                              type="primary"
                          >
                              Create Connections using LRT
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
                <div>
                    Design: <Input value={design ? design : ''} disabled />
                    <br />
                    <br />
                    Task Status = {progress.status}
                    {isTaskRunning ? (
                        <div>
                            <br />
                            <br />
                            Task Progress = {progress.message}
                            <br />
                            Task Completion % = {progress.percent}%
                        </div>
                    ) : null}
                    {isAlertVisible && (
                        <div>
                            <Alert message={alertMessage} type={alertType} />
                        </div>
                    )}
                </div>
            )}
        </DraggableModal>
    );
};
```
Finally the modal window object is returned with these features:

- An initial set of properties 
- An introductory window with description/instructions etc.
- Hitting 'OK' displays another window with the selected design, the initial Task Status messages, and a button to kick off the LRT by calling the `onBuildConnectionsLRT` function defined earlier.
- `showIntro` displays the description message defined in the `devrel_samples.msg` file when first opened.
-  when the task is kicked off, the modal subsequently displays the progress status, the progress message, and progress percent. When the task is complete, an `alertMessage` indicating success is displayed.

&#8291;
  
&#8291;


### lrt_plugin.js
  
&#8291;
```
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customerConnectionImage from '../../images/Customer_Connection_LRT_icon.svg';
import { LrtModal } from './lrt_modal';
```
- The first import is for the `Plugin` class. Plugins is how add new functionalities to IQGeo applications. `PluginButton` is the class that creates buttons within the application itself.
- `renderReactNode` is IQGeo’s render functionalities class, since the samples runs on a React window this class is needed.
- `CustomerConnectionImage` is the icon image to be used fpr the LRT button.
- `LrtModal` is the React component created in the `lrt_modal.js` file.

  
&#8291;
```
export class LrtPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'LRT';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'LRT';
                    this.prototype.imgSrc = customerConnectionImage;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);
    }

```
      
&#8291;
- The class extends `Plugin`. As mentioned before, the `Plugin` class is how add new functionalities to IQGeo applications.
- Next, the static properties of the class are initialized
  - `this.prototype.messageGroup` is the localization information for this class
  - `this.prototype.buttons` will contain information on the buttons related to this class. In this example this class only needs one button, and within this object there is
- `dialog`: Which is a nested class declaration that extends `PluginButton`. This is the class that defines the look and behavior of the interface button when pressed, the behavior is defined by the `action()` function (i.e.: This button will call the function showModal() when pressed)
- The constructor calls the `super` (i.e.: The `Plugin` class) constructor.

Next comes the `showModal` function, which is the function that is called when the button is pressed.

&#8291;
```
      

    showModal() {
        this.renderRoot = renderReactNode(
            null,
            LrtModal,
            {
                open: true
            },
            this.renderRoot
        );
    }
}
```
&#8291;
- The function calls `renderReactNode`, which is IQGeo’s wrapper for `createRoot`, `React.createRender`, and `root.render`, it receives as parameters:
  - The DOM node to be used (in this case `null`)
  - The React component (the `LrtModal` class), which includes:
- `open`, a Boolean flag that indicates that the modal window is open
- And finally the `this.renderRoot` itself
