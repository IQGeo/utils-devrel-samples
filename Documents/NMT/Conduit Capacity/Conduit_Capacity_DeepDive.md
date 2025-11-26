# Conduit Capacity - JavaScript - Code Deep Dive

## Table of Contents
- [Conduit Capacity - JavaScript - Code Deep Dive](#conduit-capacity---javascript---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Custom Calculated Field](#custom-calculated-field)
    - [newConduit.js](#newconduitjs)
  - [How to use the tool](#how-to-use-the-tool)
    - [Steps to use](#steps-to-use)
  - [File Walkthroughs](#file-walkthroughs)
    - [conduit\_capacity\_plugin.js](#conduit_capacity_pluginjs)
    - [conduit\_capacity\_modal.js](#conduit_capacity_modaljs)
    - [conduit\_capacity\_builder.js](#conduit_capacity_builderjs)

---

## Tool Description

The Conduit Capacity sample demonstrates how to visualize conduit utilization dircetly on the map by calculatin the fill ratio of conduits within the current map window. It uses the IQGeo JS API to query conduit features, retrieve related cable data, and visualize capacity status using color-coded map overlays.

**NOTE:** Depending on the amount of conduits, consider creating a python controller to reduce high netwrok traffic on client side. Navigate to the `python_customer_controller` code sample for more information on how to create a python controller. 

This sample consists of three files:

- `conduit_capacity_modal.js` — React-based user interface that allows users to trigger the capacity calculation and view the visual results.  
- `conduit_capacity_builder.js` — Logic class that performs the conduit capacity calculations and determines the capacity status (e.g., OK, Empty, Overfull).
- `conduit_capacity_plugin.js` - Plugin file that adds the sample to the DevRel sample menu on the IQGeo application.

The tool highlights conduits using the following color scheme:

| Status | Color | Meaning |
|--------|--------|---------|
| **OK** | Green (`#2ecc71`) | Conduit fill ratio is within acceptable limits |
| **EMPTY** | Gray (`#a1b3b3ff`) | No cables found inside the conduit |
| **OVERFILL** | Red (`#e74c3c`) | Conduit is overfilled beyond capacity |
| **No data** | Yellow (`#f1c40f`) | Missing diameter information for conduit or cables |

---

## Custom Calculated Field

In addition to the visualization tool, conduits in the `Details` panel display a calculated field showing the capacity percentage. This value is computed using a custom JavaScript function registered in the application’s custom/js/conduit_capacity directory. This function is invoked by the calculated field definition in the data model and runs whenever a conduit feature is viewed.

In order to configure this custom method, navigate to `Configuration -> Features -> conduit -> Calculated Fields` within the application. Select `Add Field` at the bottom of the current list of calculated fields. Fill in the values as seen in the image below:

![Adding custom calculated field](./Conduit_Capacity_DeepDive_1.png)

Then, within your `custom/public/js` directory, you will see the `newConduit.js` file. This is the custom method that will be called from within the application when a conduit is shown on the map. 

In order to import this file into the `main.nmt_samples.js`, add the following line to the top with all the other imports:

`import NewConduit from '../Samples/conduit_capacity/newConduit';`

### newConduit.js

Here is a walkthrough of the `newConduit.js` file which is an extension of the `conduit.js` comms feature. 

```
import myw from 'myWorld-client';
import Conduit from 'modules/comms/js/models/conduit';
```

- `myw` is the a reference to the client. Some native client features will be used later when the user interacts with the map
- `Conduit` imports the main conduit feature to extend from

```
export default class NewConduit extends Conduit {

    async capacity_summary() {
        const diameter = this.properties.diameter;
        if (!diameter) return null;

        const cables = await this.cables();
        if (!cables || cables.length === 0) return 0;

        const cableDiameters = cables
            .map(c => c.properties?.diameter)
            .filter(Boolean);

        if (cableDiameters.length === 0) return 0;

        const ratio = cableDiameters.reduce((sum, d) => sum + d ** 2, 0) / (diameter ** 2);
        console.log(ratio);
        return (ratio * 100).toFixed(1);
    }
}

myw.featureModels['conduit'] = NewConduit;
```
- The `NewConduit` method is extending from the base `Conduit` class 
- The `capacity_summary` custom method is calculating the capacity of the conduit. This is the method name that was set in the new calculated field for the conduit feature.
    - First, the diameter of the conduit is set to the `diameter` variable
    - Then, all the cables associated with that conduit is set to the list of `cables` variable
    - Using the `.map` function, each cable from the list of `cables` is queried to set a list of `cableDiameters`
    - Lastly, the ratio is calculated using the conduti fill ratio equation, which is then returned at the end


---

## How to use the tool

The sample is located at:  
`modules/utils-devrel-samples/public/js/Samples/conduit_capacity`

### Steps to use

1. **Open the map** to the desired area containing conduit data.  
   The tool uses the current map’s bounding box to determine which conduits to analyze.

2. **Launch the Conduit Capacity Modal.**  
   Once open, click the **“Visualize”** button to start the analysis.

3. **Behind the scenes**, the tool will:
   - Retrieve all conduits within the visible map bounds.
   - For each conduit, get its related cable segments and their diameters.
   - Compute the fill ratio based on conduit and cable diameters.
   - Determine the status (OK, Empty, Overfull, No data).
   - Display each conduit on the map with a corresponding color-coded line.

4. **View results on the map.**  
   The conduits will appear as colored lines, with tooltips showing the following information:
   - Conduit name
   - Status
   - Calculated fill ratio (in percentage)

   Example tooltip output:

   ![Conduit Capacity map output](./Conduit_Capacity_overview_1.png)
   <p align="center"><i>Fig. 1: Conduit Capacity map visualization output example including temporary map layer added.</i></p>


## File Walkthroughs

In this section we will go over the tool source code describing how it works.

### conduit_capacity_plugin.js

```
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { ConduitCapacityModal } from './conduit_capacity_modal';
import ConduitCapacityIcon from '../../images/Conduit_Capacity_icon.svg';
import ConduitCapacityBuilder from './conduit_capacity_builder';
```

- The first import is for the `Plugin` class. Plugins are how add new functionality to IQGeo applications. `PluginButton` is the class that creates buttons within the application itself.
- `renderReactNode` is IQGeo’s render functionalities class, since the samples runs on a React window this class is needed.
- `ConduitCapacityModal` and `ConduitCapacityBuilder` are the sample classes which will be covered later.
- `ConduitCapacityIcon` is the icon image to be used in the button


```
export class ConduitCapacityPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'ConduitCapacityPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'conduit_capacity-button';
                    this.prototype.titleMsg = 'conduit_capacity_title';
                    this.prototype.imgSrc = ConduitCapacityIcon;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);
        this.builder = new ConduitCapacityBuilder(this.app.database);
    }
```
- The class extends `Plugin`. As mentioned before, the `Plugin` class is how add new functionalities to IQGeo applications.
- Next, the static properties of the class are initialized
  - `this.prototype.messageGroup` is the localisation information for this class
  - `this.prototype.buttons` will contain information on the buttons related to this class. In this example this class only needs one button, and within this object there is
- `dialog`: Which is a nested class declaration that extends `PluginButton`. This is the class that defines the look and behaviour of the interface button when pressed, the behaviour is defined by the `action()` function (i.e.: This button will call the function showModal() when pressed)
- The constructor calls the `super` (i.e.: The `Plugin` class) constructor, as well as creating an instance of the `ConduitCapacityBuilder` class.

Next comes the `showModal` function, which is the function that is called when the button is pressed.

```
    showModal() {
        this.renderRoot = renderReactNode(
            null,
            ConduitCapacityModal,
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
  - The React component (the `ConduitCapacityModal` class), which includes:
- `open`, a Boolean flag that indicates that the modal window is open
- A reference to the `Plugin` class itself
- The `ConduitCapacityBuilder` instance created previously
- And finally the `this.renderRoot` itself


### conduit_capacity_modal.js

Again, let’s start with the import statements

```
import myw from 'myWorld-client';
import React, { useState } from 'react';
import { DraggableModal, Button, useLocale } from 'myWorld-client/react';
```

- `myw` is the a reference to the client. Some native client features will be used later when the user interacts with the map
- Next are native React classes and four customized IQGeo React classes, including `useLocale`, which allows for the use of string localization.

Next, is the declaration of the `ConduitCapacityModal` functional component, which receives as paramater an object containing the arguments described in the `conduit_capacity_plugin.j` file, and the list of State hooks that will be used throughout the code, as well as the definition of the `msg`, used for localisation.

```
export const ConduitCapacityModal = ({ open, builder }) => {
    const { msg } = useLocale('ConduitCapacityPlugin');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [isOpen, setIsOpen] = useState(open);
    const [overlay, setOverlay] = useState(null);
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
```
- This component receives two parameters:
    - `open` which is a boolean that determines whether the modal is displayed
    - `builder` an instance of the helper class (`ConduitCapacityBuilder`) that performs the data retrieval and calculations
- Several state variables are defined:
    - `loading` tracks whether the tool is currently running
    - `status` stores the latest status message displayed to the user
    - `isOpen` determines if the modal window is visible
    - `overlay` stores the map overlay reference that displays capacity visualization
    - `appRef` a reference to the current IQGeo app instance
    - `db` a reference to the application’s active database connection

Then, there is the `handleVisualize` function which is called when the user clicks the 'Vizualize' button on the modal.

```    
    const handleVisualize = async () => {
        setLoading(true);
        setStatus('Querying conduits in map window...');
        const map = appRef.map;

        // Get map bounds
        const bounds = map.getBounds();

        // Search for conduits in the bounding box
        try {
            const conduits = await db.getFeatures('conduit', { bounds });
            setStatus(`Found ${conduits.length} conduits. Calculating capacities...`);

            if (overlay) {
                overlay.clear();
            }

            const zIndex = 200;
            const newOverlay = new myw.GeoJSONVectorLayer({map, zIndex});
            setOverlay(newOverlay);

            // Define styles
            const lineStyles = {
                OK: new myw.LineStyle({ width: 4, color: '#2ecc71' }),
                EMPTY: new myw.LineStyle({ width: 4, color: '#a1b3b3ff' }),
                OVERFILL: new myw.LineStyle({ width: 4, color: '#e74c3c' }),
                'No diameter data': new myw.LineStyle({ width: 4, color: '#f1c40f' }),
                DEFAULT: new myw.LineStyle({ width: 4, color: '#3498db' })
            };

            const results = await Promise.all(
                conduits.map(async (conduit) => {
                    const { ratio, status } = await builder.calculateCapacity(conduit);
                    return { conduit, ratio, status };
                })
            );

            results.forEach(({ conduit, ratio, status }) => {
                const style = lineStyles[status] || lineStyles['DEFAULT'];

                const feature = newOverlay.addGeom(conduit.geometry, style);
                feature.bindTooltip(`
                        <b>${conduit.properties.name || 'Conduit'}</b><br>
                        Status: ${status}<br>
                        Ratio: ${(ratio * 100).toFixed(1)}%
                    `);
            });
            setStatus(`Visualization complete for ${conduits.length} conduits.`);
        } catch (error) {
            console.error(error);
            setStatus(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }


    };
```
- This function creates the temporary map layer which overlays current map layers, in order to show the conduit heat map
- The function starts by setting the loading and status as 'Querying' to show that the conduits within the map frame are being grabbed via API
- The bounds of the window are get the the `bounds` variable to pass through the API, thus only getting the conduits within the bounds
- Then, using the JS API `getFeatures`, we are grabbing the list on conduits and printing the lenghth of the list on the modal
- Using the `overlay` state hook, if there was a previous map set, that will then be cleared everytime the `handleVisualize` function is called
- In order to create a new overlay, we must set the `zIndex` which is used to set the thickness of the new layer lines. Then by calling the `GeoJSONVectorLayer` with the map and `zIndex`, we set a new overlay.
- Then, the lineStyles dictionary is defined with the colors of the lines to correspond the fill ratios of the conduits
    - Green = low usage
    - Yellow = moderate usage 
    - Red = full
- The `calculateCapacity` function is called from the builder class, passing in each conduit individually to query necessary fiber segments and determine its ratio
- Then, for each of the results, the `addGeom` function is called to add the lines to the map with the proper color. As well as a tool tip to shoe exact values
- Lastly, the `catch` error and `setLoading` values are set if the requests fail.

Next, the modal’s JSX structure handles rendering the window and controls:

```
return (
        <DraggableModal
            open={isOpen}
            title={msg('conduit_capacity_title')}
            onCancel={handleCancel}
            footer={
                [
                    <Button key="cancel" onClick={handleCancel}>
                        Cancel
                    </Button>,
                    <Button key="visualize" onClick={handleVisualize} type="primary" disabled={loading}>
                        {loading ? 'Loading...' : 'Visualize'}
                    </Button>
                ]
            }
        >
            <div className="p-4 space-y-3">
                <p>Click 'Visualize' to map conduit capacity.</p>
                <p>{status}</p>
                <p>This tool checks the capacity of conduits in the window bounding box.</p>
                <p>To use the tool, zoom to your desired window size, then click the 'Visualize' button. The tool will check all conduits within the geometry and add a map layer to visualize the capacity.</p>
                <p>You can find the source code in the folder modules/utils-devrel-samples/public/js/Samples/conduit_capacity.</p>
            </div>

            <div style={{ marginTop: 16, paddingTop: 8, borderTop: '1px solid #eee' }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Color Key</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, backgroundColor: '#a1b3b3ff', borderRadius: 3 }} />
                    <span>Empty</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, backgroundColor: '#2ecc71', borderRadius: 3 }} />
                    <span>OK</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, backgroundColor: '#e74c3c', borderRadius: 3 }} />
                    <span>Overfull</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 16, height: 16, backgroundColor: '#f1c40f', borderRadius: 3 }} />
                    <span>No data</span>
                </div>
                </div>
            </div>
        </DraggableModal>
    );
};
```
- The modal displays two buttons:
    - 'Close' to close the window
    - 'Visualize' to start the conduit capacity visualization process
- When the tool is running, the modal shows the status text dynamically updated
- Lastly, a color key is rendered to show what each color on the temporary map indicates


### conduit_capacity_builder.js

This file defines the `ConduitCapacityBuilder` class — the backend logic that powers the Conduit Capacity visualization tool.
It’s responsible for fetching related cable data, calculating how full each conduit is, and determining whether it is empty, within safe limits, or overfilled.

```
import myw from 'myWorld-client';

export default class ConduitCapacityBuilder extends myw.MywClass {
    constructor(database) {
        super();
        this.app = myw.app;
        this.database = database;
        this.datasource = database.getDatasource('myworld');
    }
```
- The ConduitCapacityBuilder class extends the core MywClass from the IQGeo client SDK.
- Its constructor sets up three key properties:
    - `app` reference to the main IQGeo app instance
    - `database` reference to the active database connection used for feature queries
    - `datasource` handle for the "myworld" datasource, used to access feature relationships

```
async calculateCapacity(conduit) {
        const diameter = conduit.properties.diameter;

        const segData = await this.datasource.getRelationship(conduit, 'cable_segments');
        const segments = segData || [];
        const cableRefs = [...new Set(
            segments.map(s => s.properties.cable).filter(Boolean)
        )];

        const diameters = [];
        const cableFeatures = await Promise.all(
            cableRefs.map(async cref => {
                const id = cref.split('/').pop();
                try {
                    return await this.database.getFeature('fiber_cable', id);
                } catch (err) {
                    console.warn(`Failed to get cable ${cref}:`, err);
                    return null;
                }
            })
        );

        for (const cable of cableFeatures.filter(Boolean)) {
            if (cable.properties?.diameter) diameters.push(cable.properties.diameter);
        }
        const { ratio, limit } = this.calcFillRatio(diameter, diameters);

        let status;
        if (ratio == null) status = 'No diameter data';
        else if (ratio === 0) status = 'EMPTY';
        else if (ratio <= limit) status = 'OK';
        else status = 'OVERFILL';
        return { ratio, limit, status };
    }
```
- This asynchronous method performs the main capacity calculation for a single conduit feature
    - Retrieves the diameter of the conduit
    - Fetches all related `cable_segments` using the `getRelationship` API
    - Extracts unique cable references from those segment relationships
- Next, the code loads the related cable features and collects their diameters
    - Each cable reference read using `getFeature`
    - The `Promise.all` ensures all database calls run in parallel, improving performance
    - Only cables with valid diameter values are included in the calculation
- Finally, the method computes the fill ratio by calling the `calcFillRatio` method passing in the diameter

```
calcFillRatio(conduitDiameter, cableDiameters) {
        if (!conduitDiameter || conduitDiameter === 0) {
            return { ratio: null, limit: null };
        }
        const ratio = cableDiameters.reduce((a, d) => a + d ** 2, 0) / (conduitDiameter ** 2);

        let limit = 1.0;
        if (cableDiameters.length === 1) limit = 0.65;
        else if (cableDiameters.length === 2) limit = 0.31;
        else limit = 0.40;

        return { ratio, limit };
    }
}
```
- This helper function uses a simplified geometric fill model based on circular cross-section areas
    - The ratio is computed as a sum of the squared cable diameters divided by the square of the conduit diameter
    - The limit value (maximum allowed ratio) varies depending on the number of cables:
        - 1 cable → limit = 0.65
        - 2 cables → limit = 0.31
        - 3+ cables → limit = 0.40