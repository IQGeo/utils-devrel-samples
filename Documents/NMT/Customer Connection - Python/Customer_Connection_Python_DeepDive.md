# Customer Connection - Python - Code Deep Dive

## Table of Contents

- [Customer Connection - Python - Code Deep Dive](#customer-connection---python---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [python\_customer\_connection\_plugin.js](#python_customer_connection_pluginjs)
    - [python\_customer\_connection\_modal.js](#python_customer_connection_modaljs)
    - [customer\_connection\_controller.py](#customer_connection_controllerpy)
    - [routing.py](#routingpy)

---

## Tool Description

The Customer Connection tool automates the creation of a connection between a Pole and an Address within the map.

If an user were to manually create a connection between a Pole that has no underlying equipment and and Address without equipment as well he would have to

- Add a Splice Closure to the Pole
- Add a Fiber Splitter to the Pole
- Add a Wall Box to the Address
- Add an ONT to the address
- Create a Route between the Pole and Address
- Create a Cable between the Pole and Address
- Connect the Cable to a Pin in the Fiber Splitter
- Connect the Cable to a Pin in the ONT

That's a lot of manual setting and configuration, which is time-consuming and error prone.

The Python tool not only automates the process, but also allows for bulk changes in the database with a single call from the client

## Tool files

The tool files are:

- `python_customer_connection_plugin.js` - The Configuration file for the Plugin. This file is located in the `modules/devrel_samples/public/js/Samples/customer_connection_python` folder
  
- `python_customer_connection_modal.js` - The file containing the React code used to render the modal window. This file is located in the `modules/devrel_samples/public/js/Samples/customer_connection_python` folder
- `customer_connection_controller.py` - The file containing all the Python logic that will run on the server. This file is located in the `modules/devrel_samples/server/controllers` folder
- `routing.py` - Where the Python code to HTTP address routing is configured. This file is located in the  `modules/devrel_samples/server/controllers` folder


## How the tool works

In this section we will go over the tool source code describing how it works.

### python_customer_connection_plugin.js

```
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { PythonCustomerConnectionModal } from './python_customer_connection_modal';
import customerConnectionImage from '../../../images/Customer_Connection_Python_icon.svg';
```

- The first import is for the `Plugin` class. Plugins is how add new functionalities to IQGeo applications. `PluginButton` is the class that creates buttons within the application itself.
- `renderReactNode` is IQGeo’s render functionalities class, since the samples runs on a React window this class is needed.
- `PythonCustomerConnectionModal` is the file containing React code that will be analysed later.
- `CustomerConnectionImage` is the icon image to be used in the button
  
Next comes the class declaration, static properties initialization, and constructor

```
export class PythonCustomerConnectionPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'pythonCustomerConnectionPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'python_customer_connection';
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
    }
```

- The class extends `Plugin`. As mentioned before, the `Plugin` class is how add new functionalities to IQGeo applications.
  
- Next, the static properties of the class are initialized
  - `this.prototype.nessageGroup` is the localisation information for this class
  - `this.prototype.buttons` will contain information on the buttons related to this class. In this example this class only needs one button, and within this object there is
- `dialog`: Which is a nested class declaration that extends `PluginButton`. This is the class that defines the look and behaviour of the interface button when pressed, the behaviour is defined by the `action()` function (i.e.: This button will call the function showModal() when pressed)
- The constructor calls the `super` (i.e.: The `Plugin` class) constructor

Next comes the `showModal` function, which is the function that is called when the button is pressed.

```    
    showModal() {
        this.renderRoot = renderReactNode(
            null,
            PythonCustomerConnectionModal,
            {
                open: true,
                plugin: this,
                datasource: this.app.database.getDatasource('myworld')
            },
            this.renderRoot
        );
    }
```
- The function calls `renderReactNode`, which is IQGeo’s wrapper for `createRoot`, `React.createRender`, and `root.render`, it receives as parameters:
  - The DOM node to be used (in this case `null`)
  - The React component (the `PythonCustomerConnectionModal` class), which includes:
  
- `open`, a Boolean flag that indicates that the modal window is open
- A reference to the `Plugin` class itself
- The `datasource` is a reference to the datasource `myworld` within the database. A datasource models a source of geographic data, typically a database server or Web service.
- And finally the `this.renderRoot` itself

### python_customer_connection_modal.js

Again, let’s start with the import statements

```
import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Input, useLocale } from 'myWorld-client/react';
import { Alert } from 'antd';
```

- `myw` is the a reference to the client. Some native client features will be used later when the user interacts with the map
  
- Next are native React classes and four customized IQGeo React classes, including `useLocale`, which allows for the use of localised strings withing the React context
- The `Alert` class from the Ant Design framework - https://ant.design/components/alert
  
Next is the declaration of the `PythonCustomerConnectionModal` functional component, which receives as parameter an object containing the arguments described in the `python_customer_connection_plugin.js` file, and the list of State hooks that will be used throughout the code, as well as the definition of the `msg` variable, used for localisation.

```
export const PythonCustomerConnectionModal = ({ open, datasource }) => {
    const { msg } = useLocale('pythonCustomerConnectionPlugin');
    const [appRef] = useState(myw.app);
    const [isOpen, setIsOpen] = useState(open);
    const [pole, setPole] = useState('');
    const [poleId, setPoleId] = useState('');
    const [designId, setDesignId] = useState('');
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);
    const [alertType, setAlertType] = useState('');
```

Then there are two Effect Hooks and two auxiliary functions

```    
    useEffect(() => {
        setOnFunctions();
        updateFeatures();
    }, []);

    useEffect(() => {
        if (pole) {
            setDisabled(false);
        } else {
            setDisabled(true);
        }
    }, [pole]);

    function setOnFunctions() {
        appRef.on('currentFeature-changed currentFeatureSet-changed', updateFeatures);
    }

    function updateFeatures() {
        const feature = appRef.currentFeature;
        if (!feature) {
            setPole(null);
            return;
        }

        if (feature.getType() === 'pole') {
            if (feature._myw.delta !== undefined) {
                setPole(feature);
                setPoleId(feature.id);
                setDesignId(feature._myw.delta);
            } else {
                showAlert('error', 'This pole must be part of a design!');
                setPole(null);
            }
        }
    }

```

- The first `useEffect` hook is called after the initial render of the component, and it calls the two functions `setOnFunctions` and `updateFeatures`
  - In `setOnFunctions` the application (via `appRef.on`) is set to call the function `updateFeatures` whenever `currentFeature` or `currentFeatureSet` is changed, which happens when the user clicks on a feature or select a group of features in the map. When that happens the function `updateFeatures` is called
  - In `UpdateFeatures` the code checks what is the current feature selected in the application, if that feature is a Pole, the code checks if the selected Pole is in a Design, if the Pole is in a design the states `pole`, `poleId`, and `designId` are set. If the pole is not in a design an alert informing the user is shown
  
- The second `useEffect` is called when the state `pole` is updated. If a Pole from a Design is selected the code sets the `disabled` state to `true.` This state is used to enable/disable the “Create” button. The button should only be enabled when a Pole from a Design is selected.
  
Next there are three self-explanatory functions

```    
    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    function showAlert(type, message) {
        setAlertMessage(message);
        setAlertType(type);
        setIsAlertVisible(true);
        setTimeout(() => {
            setIsAlertVisible(false);
        }, 5000);
    }
```

- `hideIntro` sets the `showIntro` state to `false`. This is used to hide the introductory message when you first open the window
  
- `handleCancel` is used in two places and it sets the `isOpen` state to false, effectively closing the window
- `showAlert` sets the States `alertMessage`, `alertType`, and `alertVisible` and then set a five second timeout to change `alertVisible` again. This function will be called to show different alerts for the user
  
Next comes the `callController` function that do the HTTP GET call to the server, starting the connection process

```
    const callController = () => {
        console.log('Calling controller');
        datasource
            .moduleGet(`modules/custom/customerconnection/` + poleId + '/' + designId.split('/')[1])
            .then(res => {
                console.log(res);
            });
    };
```

- The function starts by printing a message in the browser's development console letting the user know that the process started
  
- Next the `datasource.moduleGet` function is called triggering the HTTP GET function, it receive as parameters
  - The address of the function. This address is set in the `routing.py` file, including the `poleId` and `designId` states
    - The full Design id format is `design/design_name`, since the Python code only needs the `design_name` part the rest of the ID is stripped before is sent to the server
- Once the asynchronous function returns a result, the result is printed in the development console
  
And finally the React `return` statement containing the HTML code to be rendered

```
    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={'Python Connect Customer'}
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
                              onClick={callController}
                              type="primary"
                          >
                              Create
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
                <div>
                    Pole: <Input value={pole ? pole._myw.title : ''} disabled />
                    <br />
                    {isAlertVisible && (
                        <div>
                            <Alert message={alertMessage} type={alertType} />
                        </div>
                    )}
                </div>
            )}
        </DraggableModal>
    );
```

- If `showIntro` is `true` then a text message describing the tool is shown to the user explaining how to use it, as well as a button to hide the message by calling the hideIntro function
  
- Once `showIntro` is set to `false` the main interface is shown with the Pole field, as well as a button that calls the `callController` function and has its `disabled` parameter connected to the `disabled` State Hook. Note that the Pole Name field have the `disabled` parameter, this is because this field is only changed when the user clicks on a Pole within a Design, triggering the `updateFeatures` function
- And at the bottom there is the Alert that is shown only when the `isAlertVisible` state is set to `true`, and will inform the user if the pole selected is not within a design or when the connections were created successfully

### customer_connection_controller.py

Starting with the `import` statements

```
import re
from pyramid.view import view_config
from myworldapp.modules.comms.server.controllers.mywcom_controller import MywcomController
from myworldapp.modules.comms.server.api.manager import *
from myworldapp.modules.comms.server.api.cable_manager import *
from myworldapp.modules.comms.server.api.connection_manager import *
from myworldapp.modules.comms.server.api.pin_range import *
```

- `re` is a regular expression library
  
- `pyramid` is the web application library used to create the route between this Python file and a web address to be accessed by users
- `Mywcomcontroller` is the base class of the class that will be created in this file
- The next four imports are NMT APIs that will be used in the logic to be created

Next the class is created, as well as the class constructor and two variables

```
class CustomerConnectionController(MywcomController):
    cable_name = "DROP-6000"
    current_splitter_pin = 1

    def __init__(self, request):
        super().__init__(request, "DATA")
```

- As mentioned before the class extends `MywcomController`
  
- `cable_name` is the variable containing the name of the cables to be created between the Pole and the Address
- `current_splitter_pin` stores the next available pin in the Pole's Fiber Splitter
- The constructor simply calls the constructor of `MywcomController`

Next there is a series of internal auxiliary functions that are used in the connection logic

```
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
```

- `_createSpliceClosure` receives as parameters the Pole where the Splice Closure will be created and its coordinates, and returns the object created
  
- `_createFiberSplitter` receives as parameters the Pole, its coordinates, and the Splice Closure that will house the Fiber Splitter to be created, and returns the object created
- `_createWallBox` receives as parameters the name of the Wall Box to be created and the coordinates where it will be created (which are the Address' coordinates), and returns the object created
- `_createOnt` receives as parameters the Wall Box that will house the ONT and the coordinates where it will be created, and returns the object created
- `_createRoute` receives as parameters the Pole (where the route begins), the Wall Box (where the route ends) and the route coordinates, and returns the route created
  - In the previous functions the coordinates where always one point in the world where the Object would be created, but the route is a line, so the `coords` variable actually is an array with two points: The start (Pole) and end (Wall Box) of the route
- `_createCable` receive as parameters an array with the structures (in this case the Pole and the Wall Box) where the cable will begin and end, and returns the object created
  - The previous functions received the structures separately and this one receives it as an array because these are used in the `findPath` function, which receives the same array, so this function receives the array just to simplify its logic
  - After creating the cable, we must call `findPath` which will look for the shortest paths between the the structures. In this case there will only be a single route between the two (the one created by `_createRoute`)
  - With the route information, the function `route` is created, this is where the route is actually built in the database
- `_connectCableToSplitter` receives as parameters the cable segment to be connected and the fiber splitter where it will be connected, and returns the connection created
  - The pin used in the cable is always 1, since the cable in the "in" side will always only connect to the Fiber Splitter
  - The pin used in the fiber splitter is the pin stored in the `self.current_splitter_pin` variable
- `_connectCableToOnt` receives as parameters the cable segment to be connected and the ONT
  - For both cable and ONT the pin used it "1" because both the cable in the "out" side and the ONT will only connect with each other
  - `_incrementCableName` will increment the trailing number (if any) of the `self.cable_name` variable once a cable is created (e.g.: cable `DROP-6000` is created, the `self.cable_name` variable is incremented to `DROP-6001`)

Finally we have the function that will be called from the user via HTTP GET

```
    @view_config(route_name='customer_connection_controller.buildConnections', request_method='GET', renderer='json')
    def buildConnections(self):
        self.current_user.assertAuthorized(self.request)
```

- Before creating the function itself the `view_config` decorator must be added. This marks the function below to be user as a service
  
- To ensure that the user is authenticated and has permission to run this service, the first thing the function calls should always be the `self.current_user.assertAuthorized` function.

Next are references to all database tables will be used 

```
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
```

- The first reference is for the Design that is passed as parameter, where all Objects will be created
  - The design ID is passed as parameter to the service, and is read using the `self.request.matchdict` function, and the ID `design_id` is defined in the `routing.py` file
  
- One important difference to note is that the `self.address_table` used is from the master database (`self.db.view()`) whereas all other tables are from the design. That is because all Objects we are going to create are going to be created in the Design, but the Addresses already exist in the master table
- Instances of `self.cable_manager` and `self.connection_manager` are created using the design as reference because, again, all Objects will be created in the Design

Then the function obtains the information needed to start the connection process

```
        pole_table_filtered = self.pole_table.filterOn('id', self.request.matchdict['pole_id'])
        filtered_poles = pole_table_filtered.recs(limit = 1)
        pole = next(filtered_poles)
        pole_coords = MywPoint(pole.primaryGeometry().x, pole.primaryGeometry().y)

        address_predicate = self.address_table.field('location').geomWithinDist(pole_coords, 50)
        near_addressses = self.address_table.filter(address_predicate)
```

- First a query is performed in the `self.pole_table` via the `filterOn` function, looking for the Poles where the `id` field equals the ID passed in the `pole_id` parameter of the GET function, with that the `pole` variable is set to the first record returned
  - In fact, the `filterOn` function will return a single record since it queries the table using the unique ID

- With the `pole` variable set, the `pole_coords` is created as a `MywPoint` object
- The `address_predicate` is the Predicate that will be used to filter the Address table and is built using
  - The `location` field of the table
  - The addresses that are within 50 meters from the `pole_coords`
- Then the `filter` function is called in the `address_table` passing the Predicate created as parameter

With all the information needed the process starts in earnest

```
        splice_closure_record = self._createSpliceClosure(pole, pole_coords)
        fiber_splitter_record = self._createFiberSplitter(pole, pole_coords, splice_closure_record)
```

- The Splice Closure is created by calling `self._createSpliceClosure`, and the Splice closure is stored in a variable to be used later
- The Fiber Splitter is created by calling `self._createFiberSplitter`, and the Fiber Splitter is stored in a variable to be used later

The Splice Closure and Fiber Splitter need to be created only once in the Pole, but from now on all Objects created must be created once for each connection, so the code iterates over the list `near_addresses` created earlier

```
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
```

- First I set the name of the Wall Box to be used, if the current Adress being connected has a `street_name` and `street_number` set, those are used in setting the name. Otherwise a generic "Wall Box" name is used.

- Another `MywPoint` is created, this time with the Address coordinates
- Then the Wall Box is created, as well as the `wall_box_coordinates` `MywPoint` variable, and the the ONT
- One point to note here is the creating of the `route_coords` variable, which ,as mentioned befire, is a `MywLineString` type that receives as perameters the `pole_coords` and `wall_box_coords` (the beginning and end of the route, respectively)
- After the remaining auxiliary functions are called, the `self.current_splitter_pin` variable is incremented so the next available pin in the Fiber Splitter is used

Once the `for` loop is finished the operation is almost complete

```
        self.db.commit()
        print("OPERATION COMPLETE")
        return {"status": "success"}
```

- The last step is calling the `db.commit()` function, which actually commit the changes created in the Design to Database
- Next a message is printed in the server log as reference for the user
  - In order to see the server log messages, within Visual Studio Code click on `Terminal -> Run Task... -> View Apache Error Log` and the message should be there
- Finally the function returns an object containing a single key and value, but anything could be returned here (e.g.: The objects created)

### routing.py

For the `routing.py` file a single change must be made

```
def add_routes(config: "MywRoutingHandler") -> None:

    config.add_route ("/modules/custom/customerconnection/{pole_id}/{design_id}", "python_customer_connection_controller", "buildConnections")

    pass
```

- Within the `add_routes` function (which should already exist within your `routing.py` file), add the `config.add_route` function, the parameters are
  - The first parameter is the address to be used by the clients, including the additional parameters they must send. In this case the address is `/modules/custom/customerconnection/{pole_id}/{design_id}`, including the two parameters `{pole_id}` and `{design_id}`
  - The second parameter is the name of file where the controller class is created (minus the `.py`)
  - The third parameter is the name of the function that had the `view_config` decorator added

**IMPORTANT:** Once both `customer_connection_controller.py` and `routing.py` files are created, you must refrest your Python environment in the server for the clients to be able to use the service created. To do so in Visual Studio Code click `Terminal -> Run Task... -> Restart Python Env in Apache`