# Customer Connection - JavaScript - Code Deep Dive

## Table of Contents

- [Customer Connection - JavaScript - Code Deep Dive](#customer-connection---javascript---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [customer\_connection\_plugin.js](#customer_connection_pluginjs)
    - [customer\_connection\_modal.js](#customer_connection_modaljs)
    - [customer\_connection\_builder.js](#customer_connection_builderjs)

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

The tool allows the user to simply select a Pole and an Address and the tool creates the connection, including the underlying equipment if needed.

## Tool files

The tool files are:

- `customer_connection_plugin.js` - The Configuration file for the Plugin
- `customer_connection_modal.js` - The file containing the React code used to render the modal window
- `customer_connection_builder.js` - The class containing the support functions that call IQGeo APIs

All files are located in the `modules/devrel_samples/public/js/Samples/customer_connection_JavaScript` folder

## How the tool works

In this section we will go over the tool source code describing how it works.

### customer_connection_plugin.js

```
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { CustomerConnectionModal } from './customer_connection_modal';
import CustomerConnectionBuilder from './customer_connection_builder';
import customerConnectionImage from '../../../images/Customer_Connection_JavaScript_icon.svg';
```

- The first import is for the `Plugin` class. Plugins is how add new functionalities to IQGeo applications. `PluginButton` is the class that creates buttons within the application itself.
- `renderReactNode` is IQGeo’s render functionalities class, since the samples runs on a React window this class is needed.
- `CustomerConnectionModal` and `CustomerConnectionBuilder` are the sample classes which will be covered later.
- `CustomerConnectionImage` is the icon image to be used in the button
  
Next comes the class declaration, static properties initialization, and constructor

```
export class CustomerConnectionPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'customerConnectionPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'customer_connection';
                    this.prototype.imgSrc = customerConnectionImage;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
 

    constructor(owner, options) {
        super(owner, options);
        this.builder = new CustomerConnectionBuilder(this.app.database);
    }
```

- The class extends `Plugin`. As mentioned before, the `Plugin` class is how add new functionalities to IQGeo applications.
- Next, the static properties of the class are initialized
  - `this.prototype.nessageGroup` is the localisation information for this class
  - `this.prototype.buttons` will contain information on the buttons related to this class. In this example this class only needs one button, and within this object there is
- `dialog`: Which is a nested class declaration that extends `PluginButton`. This is the class that defines the look and behaviour of the interface button when pressed, the behaviour is defined by the `action()` function (i.e.: This button will call the function showModal() when pressed)
- The constructor calls the `super` (i.e.: The `Plugin` class) constructor, as well as creating an instance of the `CustomerConnectionBuilder` class.

Next comes the `showModal` function, which is the function that is called when the button is pressed.

```    
      showModal() {
        this.renderRoot = renderReactNode(
            null,
            CustomerConnectionModal,
            {
                open: true,
                plugin: this,
                builder: this.builder
            },
            this.renderRoot
        );
    }
}
```
- The function calls `renderReactNode`, which is IQGeo’s wrapper for `createRoot`, `React.createRender`, and `root.render`, it receives as parameters:
  - The DOM node to be used (in this case `null`)
  - The React component (the `CustomerConnectionModal` class), which includes:
- `open`, a Boolean flag that indicates that the modal window is open
- A reference to the `Plugin` class itself
- The `CustomerConnectionBuilder` instance created previously
- And finally the `this.renderRoot` itself

### customer_connection_modal.js

Again, let’s start with the import statements

```
import myw from 'myWorld-client';
import React, { useState, useEffect} from 'react';
import { DraggableModal, Button, Input, useLocale } from 'myWorld-client/react';
import { Alert } from 'antd';
```

- `myw` is the a reference to the client. Some native client features will be used later when the user interacts with the map
- Next are native React classes and four customized IQGeo React classes, including `useLocale`, which allows for the use of localised strings withing the React context
- The `Alert` class from the Ant Design framework - https://ant.design/components/alert
  
Next is the declaration of the `CustomerConnectionModal` functional component, which receives as parameter an object containing the arguments described in the `customer_connection_plugin.js` file, and the list of State hooks that will be used throughout the code, as well as the definition of the `msg` variable, used for localisation.

```
export const CustomerConnectionModal = ({ open, plugin, builder }) => {
    const { msg } = useLocale('customerConnectionPlugin');
    const [appRef] = useState(myw.app);
    const [isOpen, setIsOpen] = useState(open);
    const [pole, setPole] = useState('');
    const [customer, setCustomer] = useState();
    const [dropCable, setDropCable] = useState('DROP-6000');
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);
```

Then there are two Effect Hooks and two auxiliary functions

```    
    useEffect(() => {
        setOnFunctions();
        updateFeatures();
    }, []);

    useEffect(() => {
        if (
            pole &&
            pole._myw.title.length > 0 &&
            customer &&
            customer._myw.title.length > 0 &&
            dropCable.length > 0
        ) {
            setDisabled(false);
        } else {
            setDisabled(true);
        }
    }, [pole, customer, dropCable]);

    function setOnFunctions() {
        appRef.on('currentFeature-changed currentFeatureSet-changed', updateFeatures);
    }

    function updateFeatures() {
        const feature = appRef.currentFeature;
        if (!feature) return;

        if (feature.getType() === 'pole') {
            setPole(feature);
        }

        if (feature.getType() === 'address') {
            setCustomer(feature);
        }
    }
```

- The first `useEffect` hook is called after the initial render of the component, and it calls the two functions `setOnFunctions` and `updateFeatures`
  - In `setOnFunctions` the application (via `appRef.on`) is set to call the function `updateFeatures` whenever `currentFeature` or `currentFeatureSet` is changed, which happens when the user clicks on a feature or select a group of features in the map. When that happens the function `updateFeatures` is called
  - In `UpdateFeatures` the code checks what is the current feature selected in the application, and if that feature is either a Pole or an Address, the appropriate State Hook is updated 
- The second `useEffect` is called when the states `pole`, `customer`, or `dropCable` are updated. If any of these are not set we set the `disabled` state to `true.` This state is used to enable/disable the “Create” button. The button should only be enabled when all parameters needed to create to connection are set.
  
Next there are two self-explanatory functions

```    
    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };
```

- `hideIntro` sets the `showIntro` state to `false`. This is used to hide the introductory message when you first open the window
- `handleCancel` is used in two places and it sets the `isOpen` state to false, effectively closing the window
  
Next comes the `buildConnection` function that handles the full process of creating the connection along with the `CustomerConnectionBuilder` class

```
    const buildConnection = async () => {
        let closure;
        const closures = await builder.findEquipmentIn(pole, 'splice_closure');
        if (closures.length === 0) {
            closure = await builder.buildSpliceClosure(pole);
        } else {
            closure = closures[0];
        }

        const splitters = await builder.findEquipmentIn(pole, 'fiber_splitter');
        let connPoint = await builder.findConnectionPoint(splitters);
        if (!connPoint) {
            connPoint = await builder.buildSplitter(
                pole,
                feederFiber,
                splitters.length + 1,
                closure
            );
        }

        let box = await builder.findWallBox(customer.geometry.coordinates);

        let ont = await builder.findOnt(customer.geometry.coordinates, box);

        const routeInfo = await builder.buildRoute(pole, box);

        const cableInfo = await builder.buildDropCable(routeInfo, pole, box, dropCable);

        const cableSegs = await cableInfo.followRelationship('cable_segments');

        await builder.connectDropToSplitter(connPoint.splitter, connPoint.port, cableSegs[0]);
        await builder.connectDropToTerminal(cableSegs[0], ont);

        setCustomer(null);

        setAlertMessage(
            (connPoint.splitter.properties.name || 'unnamed splitter') + ' OUT# ' + connPoint.port
        );
        setDropCable(builder.nextName(dropCable));

        setIsAlertVisible(true);
        setTimeout(() => {
            setIsAlertVisible(false);
        }, 5000);
    };
```

- The function starts by checking the `pole` for a splice closure. If there is none, a closure is created, otherwise the existing closure is used
- Next the same process for the Fiber Splitter. If there is a fiber splitter with available pins that is used, otherwise a new one is created
- Then the rest of equipment is created, in order: The Wall Box, the ONT, the route, and the cable (We will get into detail on how they are created in the `customer_connection_builder.js` file analysis)
- Then the connections to the Splitter and ONT are created
- Once all the connection logic is created the `alertMessage` and `dropCable` states are updated, `dropCable` is updated via a `CustomerConnectionBuilder` function because it is not as straightforward as simply updating the state, there are a few operations needed
- Finally `isAlertVisible` is set to `true` and a timeout starts to set it back to `false` in five seconds, this is to show a success message to the user
  
And finally the React `return` statement containing the HTML code to be rendered

```
    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={'Connect Customer'}
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
                              onClick={buildConnection}
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
                    Customer: <Input value={customer ? customer._myw.title : ''} disabled />
                    Drop Cable Name:{' '}
                    <Input value={dropCable} onChange={e => setDropCable(e.target.value)} />
                    <br />
                    {isAlertVisible && (
                        <div>
                            <Alert
                                message={alertMessage + ' created successfully!'}
                                type="success"
                            />
                        </div>
                    )}
                </div>
            )}
        </DraggableModal>
    );
```

- If `showIntro` is `true` then a text message describing the tool is shown to the user explaining how to use it, as well as a button to hide the message by calling the hideIntro function
- Once `showIntro` is set to `false` the main interface is shown with fields for the Pole Name, Address, and Drop Cable Name, as well as a button that calls the `builConnection` function and has its `disabled` parameter connected to the `disabled` State Hook. Note that the Pole Name and Address field have the `disabled` parameter, this is because these fields are only changed when the user clicks on a Pole or Address, triggering the `updateFeatures` function
- And at the bottom there is the Alert that is shown only when the `isAlertVisible` state is set to `true`

### customer_connection_builder.js

This class only has one `import` and begins with its constructor function. It also extends the `myw.MywClass` class which provides easier handling of options and mixins as well as localisation methods

```
import myw from 'myWorld-client';

class CustomerConnectionBuilder extends myw.MywClass {
    constructor(database) {
        super();
        this.app = myw.app;
        this.database = database;
        this.datasource = database.getDatasource('myworld');
        this.connectionManager = this.app.plugins.connectionManager;
    }
```
- `myw` is the a reference to the client. It is used to get a reference to the application in the constructor
- In the constructor
    - The `myw.MywClass` constructor is called
    - A reference to the application itself is stored, this will be used later to launch triggers when the class make changes
    - The reference to the database is stored
    - Then a specific reference to the datasource is also stored
    - Finally a reference to the application's Connection Manager API is also stored locally

Next is a private function that inserts a new feature into the database. This functil will be used by several other functions within the class and it also does an additional operation after the insert itself

```    
    async _insertFeature(featureType, properties, geometry) {
        const ftrData = { type: 'Feature', properties: properties, geometry: geometry };

        const id = await this.database.insertFeature(featureType, ftrData);

        const ftr = await this.database.getFeature(featureType, id);
        this.app.fire('featureCollection-modified', {
            featureType: featureType,
            changeType: 'insert',
            feature: ftr
        });
        return ftr;
    }
```

- The function receives as parameters the properties needed to create a feature in the database (the feature type, its properties, and geometry information)
- The first thing the function does is to create the `ftrData` object containing the relevant information for the feature
- Next the database's asynchronous `insertFeature` is called, passing as parameters the `featureType` and the `ftrData` object just created, the function returns the ID of the newly created feature
- Once the feature is created we query the database using the `getFeature` function passing as parameters the `featureType` and the `id`. The feature will be returned by the function because for additional operations the `customer_connection_modal.js` class will need the full feature, not only the ID
- Before returning the function calls `this.app.fire` to fire the `featurecollection-modified` trigger to any other classes listening to it

Next the `findEquipmentFunction`, which simply queries the comms (which is the old NMT name) for the equipments in a given structure. This is user by the `customer_connection_modal.js` class to check if the pole and the wall box has any underlying equipment already.

```
    async findEquipmentIn(struct, type) {
        return this.datasource.comms.equipsIn(struct, type);
    }
```

Then the functions that are used in the process of creating the equiment, route, and cable are created, starting with `buildSpliceClosure`, which receives as parameter the structure (in our case the pole) that will receive the Splice Closure

```
    async buildSpliceClosure(struct) {
        const spliceClosure = await this._addSpliceClosure(struct);
        return spliceClosure;
    }

    async _addSpliceClosure(struct) {
        const name = (struct.properties.name || struct.getType()) + '-SPLCLS';

        const spec = 'CS-FOSC-400B4-S24-4-NNN';
        const root_housing = struct.properties.root_housing || struct.getUrn();

        const props = {
            name: name,
            specification: spec,
            housing: struct.getUrn(),
            root_housing: root_housing
        };

        const geom = struct.geometry;
        return this._insertFeature('splice_closure', props, geom);
    }
```

- The public function in this case just calls the private `_addSpliceClosure`
- The `_addSpliceClosure` function starts by creating the name variable for the splice closure, using as basis the structure's `name`, and if that is not set, the type of the structure (via the function `getType()`)
- Next the function sets the specification for the closure, in this case the info is hard-coded, which is enough for this sample purpose
- Then the `root_housing` is set, which is going to be either the root housing of the `struct` passed as parameter or the `struct` itself in case it does not have a root housing.
  - The info used to specify the root housing is the structure's URN (via the `struct.getUrn()` function)
  - In the sample's case the function is always called passing a Pole as structure, and Poles usually do not have a root housing, so in this sample the root housing will always be `struct.getUrn()`, but it is good practice to check nonetheless
- With all this information the object `props` will be created
- The last step before inserting the object into the database, the geometry object is created using the structure geometry, which in this case it makes sense since the splitter is created in the pole, so the closure position will be the same
- Finally `_insertFeature` is called passing as parameters the type `splice_closure`, the `props` object and the `geom` object

Next is the three functions for the creation (or use, if there's any available) of a Fiber Splitter within the Splice Closure

```
    async findConnectionPoint(splitters) {
        for (let i = 0; i < splitters.length; i++) {
            let splitter = splitters[i];
            const pins = await this.connectionManager.freePinsOn(splitter, 'fiber', 'out');
            if (pins.length) return { splitter: splitter, port: pins[0] };
        }
    }

    async buildSplitter(struct, splitterNo, closure) {
        const splitter = await this._addSplitter(struct, splitterNo, closure);
        return { splitter: splitter, port: 1 };
    }

    async _addSplitter(struct, splitterNo, closure) {
        const name = (struct.properties.name || struct.getType()) + '-SPL' + splitterNo;

        const root_housing = struct.properties.root_housing || struct.getUrn();

        const props = {
            name: name,
            n_fiber_out_ports: 4,
            housing: closure.getUrn(),
            root_housing: root_housing
        };

        const geom = struct.geometry;
        return this._insertFeature('fiber_splitter', props, geom);
    }
```

- The `findConnectionPoint` function receive as parameter an array of Splitters from the Pole (if any exist), iterates over the array, and calls the Connection Manager API's `freePinsOn` function to check if any splitter has free pins. If any is found the first available pin is returned and in this case `buildSplitter` will not be called
  - Before calling this function, the `CustomerConnectionModal` class calls `findEquipmentIn` to check if any splitters already exist. `findEquipmentIn` returns the array that is used by `findConnectionPoint`
- If no pins are available `buildSplitter` is called, which just calls the private `_addSplitter` function. `buildSplitter` receives as parameters
  - The structure where the splitter will be created (the pole)
  - `splitterNo` which is the number of the splitter to be created within the closure (if this is the first splitter, `splitterNo` will be `1`). This information will be used to define the Fiber Splitter name
  - The closure where the Fiber Splitter will be created (the Splice Closure)
- Finally the private `_addSplitter` function (which receives the same three parameters) will
  - Set the name variable for the splice closure, using as basis the structure's `name`, and if that is not set, the type of the structure (via the function `getType()`)
  - Then the `root_housing` is set, which is going to be either the root housing of the `struct` passed as parameter or the `struct` itself in case it does not have a root housing.
  - With all this information the object `props` will be created
    - The `n_fiber_out_ports` property is being hardcoded with a value of `4`
  - The last step before inserting the object into the database, the geometry object is created using the structure geometry, which in this case it makes sense since the splitter is created in the pole, so the closure position will be the same
  - And then `_insertFeature` is called passing as parameters the type `fiber_splitter`, the `props` object and the `geom` object

The next functions in the class handle the search and creation of a Wall Box (if needed)

```
   async findWallBox(coord) {
        const latLng = {
            lat: coord[1],
            lng: coord[0]
        };
        const existingWallBox = await this.datasource.getFeaturesAround(['wall_box'], latLng, 0);

        if (existingWallBox.length > 0) {
            return wallBox[0];
        } else {
            return this._buildWallBox(coord, { name: 'Wall Box' });
        }
    }

    async _buildWallBox(coord, props = {}) {
        const geom = { type: 'Point', coordinates: coord };
        return this._insertFeature('wall_box', props, geom);
    }
```

- `findWallBox` receive as parameter an array containing the coordinates (in our case, the Address' coordinates)
- It then uses the `getFeaturesAround` function to search for an existing Wall Box in the same coordinates as the Address, `getFeaturesAround` receive as parameters
  - An array with the Features to look for (in our case, only `wall_box`)
  - The latitude and longitude where to search
  - The radius. Since we want Features at the same position as the Address, we use a radius of `0`
- If an existing Wall Box is found, the function returns it, otherwise the function `_buildWallBox` is called, passing as parameters
  - The coordinates where the Wall Box will be created
  - The properties object. For the Wall Box the only requested field is the `name`
- The `_buildWallBox` function is similar to the private functions we have seen previously
  - It starts slightly different, since we only receive the coordinates we have to manually create the Geometry object, defining the `type` as `Point` and passing the coordinates
  - It then calls the `_insertFeature` function passing as parameters the feature type (`wall_box`), the properties object and the geometry object

After creating the Wall Box, the next functions handle the creation of the ONT within the Wall Box

```
    async findOnt(coord, wallbox) {
        const latLng = {
            lat: coord[1],
            lng: coord[0]
        };

        const existingOnt = await this.datasource.getFeaturesAround(['fiber_ont'], latLng, 0);
        if (existingOnt.length > 0) {
            return existingOnt[0];
        } else {
            return this._buildOnt(coord, wallbox);
        }
    }

    async _buildOnt(coord, wallbox) {
        const props = {
            name: 'ONT',
            n_fiber_in_ports: 16,
            housing: wallbox.getUrn(),
            root_housing: wallbox.getUrn()
        };
        const geom = wallbox.geometry;
        return this._insertFeature('fiber_ont', props, geom);
    }
```

The process here is very similar to what is done for the search and creation of the Wall Box, the only difference being the additional detais in the properties Object for the ONT, which contains number of ports and housing information.

With the equipment in place the next step is to create the Route

```
    async buildRoute(struct, box) {
        const props = { in_structure: struct.getUrn(), out_structure: box.getUrn() };
        const geom = {
            type: 'LineString',
            coordinates: [struct.geometry.coordinates, box.geometry.coordinates]
        };
        return this._insertFeature('oh_route', props, geom);
    }
```

- The `buildRoute` function receive as parameters
  - The `struct` representing the origin of the route (in this sample's case, the Pole)
  - The `box` representing the end of the route, the Wall Box at the Address
- The first Object created contains the properties of the Feature to be created. In the case of a Route the required fields are the start and end of the route (the Pole and Wall Box, respectively)
- Next the Geometry Object is created, and this one is different from the previous ones because the route is not a Point in the map, but a Line, so the Object `type` is set as `LineString`, and since the route is a line it requires two coordinates: The start and the end of the Line
- With the objects created the `_insertFeature` function can be called, passing as parameters
  - The feature type (`oh_route`, an overhead route)
  - The Properties Object
  - The Geometry Object

With the Route in place, the Cable can be created

```
    async buildDropCable(route, struct, wallbox, cableName) {
        const props = {
            name: cableName,
            fiber_count: 16,
            directed: true
        };

        const geom = route.geometry;
        const cable = await this._insertFeature('fiber_cable', props, geom);
        await this.datasource.comms.routeCable(cable, [struct, wallbox]);
        return cable;
    }
  ```

  - The `buildDropCable` function receives as parameters
    - The Route object that was previously created
    - The Structure where the Route starts (the Pole)
    - The Wall Box where the Route ends
    - The name of the cable (defined in the `CustomerConnectionModal` class)
  - The first thing the function does is create the Properties Object containing
    - The name of the cable
    - The number of fibers in the cable (hardcoded to `16`)
    - If the cable is directed or not (in our case it is, from the Pole to the Wall Box)
  - Next the Geometry Object is created based on the Route's geometry
  - `_insertFeature` is called to create the cable in the database
  - Once the cable is inserted, the function `routeCable` needs to be called in order to find the shortest route for `cable` between the points in the array passed as parameter (in our case the `struct` and `wallBox`)

Finally the last function and last part of the process is to update the cable name

```
    nextName(name) {
        const matches = name.match(/\d+$/);
        if (!matches) return name;

        const numStr = matches[0];
        const num = parseInt(numStr, 10);
        const base = name.substring(0, name.length - numStr.length);

        const pad = numStr.length;
        const nextNumStr = (num + 1).toString().padStart(pad, '0');

        return base + nextNumStr;
    }
```

- The `nextName` function receives as parameter the `name` string. The `CustomerConnectionModal` class passes the name of the cable as parameter
- Initially the function searches for a number within the string, if no number is found the original name is returned
- If a number is found, it is incremented by one and concatenated with the non-number part of the name, then returned