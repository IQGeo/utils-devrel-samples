# Long Running Tasks (LRT) - Python/Javascript - Code Deep Dive

## Table of Contents

- [ Long Running Tasks (LRT) - Python/JavaScript - Code Deep Dive](#long-running-tasks-lrt---pythonjavascript---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [benchmarkTask.py](#benchmarktaskpy)
    - [lrt_modal.js](#lrt_modaljs)
    - [lrt_plugin.js](#lrt_pluginjs)

---

## Tool Description

The tool uses the Long Running Task (LRT) framework that is designed to handle high-volume/compute-intensive tasks that if performed with Javascript on the client would degrade the end-user experience (e.g. time-out errors).  The framework combines Python script execution on the server with task queues managed by Python RQ backed by a Redis instance that is already available in the containerized environment.  

Because of the "long-running" nature of the tasks, the example includes a technique for providing useful feedback to the end user about the progress of the task.

Similar to the use cases found elsewhere in the Samples, we are looking to automate the creation of a connection between a Pole and an Address.  But in this case we are creating connections to 2000 random addresses in order to demonstrate the LRT functionality.

Starting with an empty Design polygon, the script creates the necessary Structures and Equipment to create a Fiber connection:
- Creates a new pole
  - Adds a Splice Closure to the Pole
  - Adds a Fiber Splitter to the Splice Closure

    (once the 24 ports on the Fiber Splitter are filled, it creates another Pole)
- With a random Address
  - Adds a Wall Box at the Address location
  - Adds an ONT to the Wall Box housing
- Creates a Connection
  - Creates a Route between the Pole and Wall Box at the address
  - Creates a Cable between the Pole and Wall Box at the address
  - Connects the Cable to a Pin in the Fiber Splitter
  - Connects the Cable to a Pin in the ONT


The user is provided feedback on the progress of the 2000 connections being made via a message in the modal dialog.

## Tool files

The tool files are:

- `benchmarkTask.py` - this is the Python file that includes both the execution logic for creating structures, equipment, and fiber cable connections as well as the logic for invoking the LRT framework and setting task parameters. 
    - Long Running Task Python files *must* reside in the `/server/tasks` folder.  In this case it should be in the `/modules/devrel_samples/server/tasks` folder.
   
&#8291;
&#8291;

   


- `lrt_modal.js` - The file containing the React code used to render the modal window, including displaying the progress in the execution of the Python script. 


    - This is found in the `/modules/devrel_samples/public/js/Samples/LRT` folder.
   
&#8291;
&#8291;

   
- `lrt_plugin.js` - the configuration file for the LRT plugin.  The LrtPlugin class will be then imported into the `main.sampleapp.js` file in a similar way as the other Palette tools. 

    - This is found in the `/modules/devrel_samples/public/js/Samples/LRT` folder.


## How the tool works

In this section we will go over the tool source code describing how it works.

### benchmarkTask.py

```
import re
import random
from typing import Any

from myworldapp.core.server.tasks.myw_base_task import MywBaseTask, myw_task

from myworldapp.modules.comms.server.controllers.mywcom_controller import MywcomController
from myworldapp.modules.comms.server.api.manager import *
from myworldapp.modules.comms.server.api.cable_manager import *
from myworldapp.modules.comms.server.api.connection_manager import *
from myworldapp.modules.comms.server.api.pin_range import *

```

- As is customary in Python, at the top of our script we begin by importing our libraries:  

    - `re`, `random`, and `typing`,  are standard Python libraries 

    - we import the `MywBaseTask` and `myw_task` in order to work with the Long Running Task framework  

    - *not clear to me how we are using the MywcomController*

    - `manager`, `cable_manager`, `connection_manager`, and `pin_range` are NMT libraries we need to create Structures, Equipment, and connections.  
   
&#8291;
&#8291;

     
        

```
@myw_task(name='lrt_task', queue='high_priority', timeout=600)

```
- this is the decorator that attaches a task to the MywBaseTask class and takes the following parameters
  - the name of the task (optional) - if not provided, the class name will be used
  - the name of the queue (optional) - if not provided, 'default' will be used
  - the timeout of the task in seconds (optional)- default = 180 seconds

&#8291;
&#8291;


```
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
```

We set up our class `BenchmarkTask` by using the `MywBaseTask` and `MywcomController` imports.  Then we are just setting some initial values for the creation of Structures and Equipment.
  
&#8291;
&#8291;

Next we have a series of auxiliary functions: 
 
```
    def _incrementName(self, name):
        match = re.match(r'(.*?)(\d+)$', name)
        if match:
            text_part, num_part = match.groups()
            incremented_num = str(int(num_part) + 1)
            padded_num = incremented_num.zfill(len(num_part))
            newName = text_part + padded_num
            return newName
```

This is the auto-increment function used elsewhere in the samples that uses regex to auto-increment the numerical portions structure and equipment identifiers that are a combination of string + number.

&#8291;
&#8291;
 
```
    def _createPole(self):
        self.pole_coords = MywPoint(self.polePosition_x, self.polePosition_y)
        pole_props = {"name": self.pole_name, "location": self.pole_coords}

        newPole = self.pole_table.insert(pole_props)

        self.pole_name = self._incrementName(self.pole_name)
        self.polePosition_x += 0.00001
        self.polePosition_y += 0.00001
        
        self.current_splice_closure = self._createSpliceClosure(newPole, self.pole_coords)
        self.current_fiber_splitter = self._createFiberSplitter(newPole, self.pole_coords, self.current_splice_closure)
        return newPole

```
This function creates a new Pole.  It starts by taking an initial set of coordinates that are provided when the task is called (in the Javascript code below) and creating a geographic point that will represent the initial Pole location and the `pole_props` define the initial set of properties. The `newPole` line inserts a new pole using the current properties.  After the insert the pole name and coordinates are incremented so the properties are ready for the *next* pole to be created.

A splice closure is created by calling the `_createSpliceClosure` function by feeding it the `newPole` and the pole coordinates.
&#8291;

A fiber splitter is created by calling the `_createFiberSplitter` function by feeding it the `newPole`, the pole coordinates, and the just-created splice closure that houses the fiber splitter.

The `newPole` is returned.

&#8291;
&#8291;
 
```
    #Function that creates the splice closure in the pole
    def _createSpliceClosure(self, pole, pole_coords):
        splice_closure_props = {"name": "Splice Closure", "specification": "CS-FOSC-400B4-S24-4-NNN", "housing": pole._urn(), "root_housing": pole._urn(), "location": pole_coords}
        return self.splice_closure_table.insert(splice_closure_props)

    #Function that creates the fiber splitter in the pole using the splice closure as housing
    def _createFiberSplitter(self, pole, pole_coords, splice_closure_record):
        fiber_splitter_props = {"name": "Fiber Splitter", "n_fiber_in_ports": 1, "n_fiber_out_ports": 24, "housing": splice_closure_record._urn(), "root_housing": pole._urn(), "location": pole_coords}
        return self.fiber_splitter_table.insert(fiber_splitter_props)

```
The functions for inserting a Splice Closure and a Fiber Splitter.  They define a set of properties and then  insert those records.  

&#8291;
&#8291;
 
```
    #Function that creates the wall box in the address coordinates
    def _createWallBox(self, name, coord):
        wall_box_props = {"name": name, "location": coord}
        return self.wall_box_table.insert(wall_box_props)

    #Function that creates the ONT in the wall box
    def _createOnt(self, wall_box, coord):
        ont_props = {"name": "ONT", "n_fiber_in_ports": 64, "housing": wall_box._urn(), "root_housing": wall_box._urn(), "location": coord}
        return self.ont_table.insert(ont_props)

```
The functions for inserting a Wall Box and an ONT at the location of the current Address.  Note that an Address is not considered a Structure and is not formally part of the Containment model.  

&#8291;
&#8291;
 
```
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
```
The functions for creating a route and a cable.  Note that a route is created between structures--in this case the Pole and the Wall Box.  Those same two structures are used to create the cable record as well.

&#8291;
&#8291;
 
```
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

```
The final two auxiliary functions create the cable connections from the Fiber Splitter on the Pole to the ONT within the Wall Box at the address location. Note how we are keeping track of the pin range on the fiber splitter.
  
  
&#8291;
&#8291;

Here we start the function that will do the work--in the Long Running Task framework, it must be named `execute`
 
```
def execute(self, **kwargs: Any):
```
The function takes a number of keyword arguments of different data types, hence the use of `Any`.

  
  
&#8291;
&#8291;
```
        self.design = self.db.view(kwargs.get("design"))
        self.polePosition_x = float(kwargs.get("coords_x"))
        self.polePosition_y = float(kwargs.get("coords_y"))
```
These lines take in the arguments passed from Javascript.  The first line creates a reference to the design in the database. The second and third lines take in x and y coordinates that will be the longitude and latitude of the first pole created.
  
  
&#8291;
&#8291;
```
        self.pole_table = self.design.table('pole')
        self.address_table = self.db.view().table('address')
        self.splice_closure_table = self.design.table('splice_closure')
        self.fiber_splitter_table = self.design.table('fiber_splitter')
        self.wall_box_table = self.design.table('wall_box')
        self.ont_table = self.design.table('fiber_ont')
        self.route_table = self.design.table('oh_route')
        self.fiber_table = self.design.table('fiber_cable')
```
This section of code sets up references to the design database tables where we will insert the new Structures and Equipment records.  Note that `self.address_table` references the Address records in the main database. 
  
&#8291;
&#8291;
```
        self.cable_manager = CableManager(self.networkView(self.design))
        self.connection_manager = ConnectionManager(self.networkView(self.design))

```
Theses lines invoke the `CableManager` and `ConnectionManager` Python API classes for use with the current design.

  
&#8291;
&#8291;
```
        self.current_pole = self._createPole()
```
We create the first Pole with this line.
  
&#8291;
&#8291;
```
        addresses = self.address_table.recs()
        addr_list = list(addresses)

```
With these lines we create a reference to the Address records and then create a list of addresses.

  
&#8291;
&#8291;
Now we are ready to create the 2000 fiber cable connections
```
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
```
- The range function stops *before* the specified limit, hence we set the bound to 2001
- we select a random address from the address list
- if the address has a street name and number, we'll use those to name the Wall Box, otherwise we assign the name as just "Wall Box"
- extract the x,y coordinates of the address -- we will use them for the Wall Box
- insert a Wall Box record by calling the `_createWallBox` function
- extract the Wall Box coordinates so we can use them for the ONT location
- insert an ONT record by calling the `_createOnt` function
- create a `route_coords` line from the Pole location to the Wall Box location
- insert a route record by calling the `_createRoute` function (from the Pole to the Wall Box)
- insert a cable record by calling the `_createCable` function (from the Pole to the Wall Box)
- using the current cable record, get an array of ordered cable segments (in this case there is only one segment)

Now that we have created the Structures and Equipment and connected them with a cable, we now create the connections between the cables and equipment.
- a `splitter_connection_record` is created using the fiber splitter and the first cable segment
- a `ont_connection_record` is created using the first cable segment--because it is the *only* cable segment-- and the ONT.
- the `cable_name` is incremented
- the `current_splitter_pin` is incremented by one--this refers to the fiber splitter
- recall that when we create fiber splitters, they have 24 pin locations available so when the current splitter_pin count goes over 24 we:
    - set the splitter count back to one
    - create a new Pole by calling the `_createPole` function (which creates a new Pole, Wall Box, and Fiber Splitter)
  
&#8291;
- the task `progress` method takes a step integer, a progress message, and a progress percentage
  
&#8291;
- while we have inserted new records for the created structures and equipment, these records have not been committed to the database until the end of the script with the `self.db_commit()` call
  
&#8291;
- Finally we return a success message
  
&#8291;
  
&#8291;

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

