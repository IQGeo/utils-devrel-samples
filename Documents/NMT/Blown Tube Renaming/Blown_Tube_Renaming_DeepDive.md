# Blown Tube Renaming - Code Deep Dive

## Table of Contents

-   [Blown Tube Renaming - Code Deep Dive](#blown-tube-renaming---code-deep-dive)
    -   [Table of Contents](#table-of-contents)
    -   [Tool Description](#tool-description)
    -   [Tool files](#tool-files)
    -   [How the tool works](#how-the-tool-works)
        -   [bf_tube_rename_plugin.js](#bf_tube_rename_pluginjs)
        -   [bf_tube_rename_modal.js](#bf_tube_rename_modaljs)

---

## Tool Description

The Blown Tube Renaming Tool automatically renames the Blown Tube Fibers, adding the fiber color to the end of each fiber name string. This is a handy information to have in the Fiber's name to quickly identify each individual fiber by its color.

## Tool files

The tool files are:

-   `bf_tube_rename_plugin.js` - The Configuration file for the Plugin
-   `bf_tube_rename_modal.js` - The file containing the React code used to render the modal window

All files are located in the `modules/devrel_samples/public/js/Samples/bf_tube_rename` folder

## How the tool works

In this section we will go over the tool source code describing how it works.

### bf_tube_rename_plugin.js

```
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { BFTubeRenameModal } from './bf_tube_rename_modal';
import bfTubeRenameImage from '../../images/BF_Tube_Rename_icon.svg';

```

-   The first import is for the `Plugin` class. Plugins is how add new functionalities to IQGeo applications. `PluginButton` is the class that creates buttons within the application itself.
-   `renderReactNode` is IQGeo’s render functionalities class, since the samples runs on a React window this class is needed.
-   `BFTubeRenameModal` contains the React code for the modal window, along with the renaming logic itself. This file will be covered later.
-   `bfTubeRenameImage` is the icon image to be used in the button

Next comes the class declaration, static properties initialization, and constructor

```
export class BFTubeRenamePlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'bfTubeRenamePlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'bf-tube-rename-button';
                    this.prototype.titleMsg = 'bf_tube_rename_title';
                    this.prototype.imgSrc = bfTubeRenameImage;
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

-   The class extends `Plugin`. As mentioned before, the `Plugin` class is how add new functionalities to IQGeo applications.
-   Next, the static properties of the class are initialized
    -   `this.prototype.nessageGroup` is the localisation information for this class
    -   `this.prototype.buttons` will contain information on the buttons related to this class. In this example this class only needs one button, and within this object there is
-   `dialog`: Which is a nested class declaration that extends `PluginButton`. This is the class that defines the look and behaviour of the interface button when pressed, the behaviour is defined by the `action()` function (i.e.: This button will call the function showModal() when pressed)
-   The constructor calls the `super` (i.e.: The `Plugin` class) constructor

Next comes the `showModal` function, which is the function that is called when the button is pressed.

```
    showModal() {
        this.renderRoot = renderReactNode(
            null,
            BFTubeRenameModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
```

-   The function calls `renderReactNode`, which is IQGeo’s wrapper for `createRoot`, `React.createRender`, and `root.render`, it receives as parameters:
    -   The DOM node to be used (in this case `null`)
    -   The React component (the `BFTubeRenameModal` class), which includes:
-   `open`, a Boolean flag that indicates that the modal window is open
-   A reference to the `Plugin` class itself
-   And finally the `this.renderRoot` itself

### bf_tube_rename_modal.js

Again, let’s start with the import statements

```
import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Input, Button, useLocale } from 'myWorld-client/react';
import { Alert } from 'antd';
```

-   `myw` is the a reference to the client. Some native client features will be used later when the user interacts with the map
-   Next are native React classes and four customized IQGeo React classes, including `useLocale`, which allows for the use of localised strings withing the React context
-   The `Alert` class from the Ant Design framework - https://ant.design/components/alert

Next is the declaration of the `BFTubeRenameModal` functional component, which receives as parameter an object containing the arguments described in the `bf_tube_rename_plugin.js` file, and the list of State hooks that will be used throughout the code, as well as the definition of the `msg` variable, used for localisation.

```
export const BFTubeRenameModal = ({ open, plugin, builder }) => {
    const { msg } = useLocale('bfTubeRenamePlugin');
    const appRef = myw.app;
    const db = appRef.database;
    const [isOpen, setIsOpen] = useState(open);
    const [bf_bundle, setBf_bundle] = useState(null);
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);
```

Then there is an Effect Hooks and two auxiliary functions

```
    useEffect(() => {
        setOnFunctions();
        setFeature();
    }, []);

    function setOnFunctions() {
        appRef.on('currentFeature-changed currentFeatureSet-changed', setFeature);
    }

    async function setFeature() {
        if (!appRef.currentFeature) return;
        const feature = appRef.currentFeature;
        if (feature.getType() === 'blown_fiber_tube') {
            const bundle = await db.getFeatureByUrn(feature.properties.housing);
            setBf_bundle(bundle);
            setDisabled(false);
        }
    }
```

-   The `useEffect` hook is called after the initial render of the component, and it calls the two functions `setOnFunctions` and `setFeature`
    -   In `setOnFunctions` the application (via `appRef.on`) is set to call the function `updateFeatures` whenever `currentFeature` or `currentFeatureSet` is changed, which happens when the user clicks on a feature or select a group of features in the map. When that happens the function `updateFeatures` is called
    -   In `setFeature` the code checks what is the current feature selected in the application, and if that feature is a Blown Fiber Tube, we know that this Tube is housed in a Bundle. In order to get the Bundle information we call the function `db.getFeatureByUrn` passing as parameter the `properties.housing` parameter of the Fiber, since we know that the Fiber is always housed in a Bundle. The `bf_bundle` State is then set with the Bundle information and the `disabled` state is set to false, thus enabling the "Rename" button and allowing the user to rename the fibers within the bundle.

Next there are two self-explanatory functions

```
    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };
```

-   `hideIntro` sets the `showIntro` state to `false`. This is used to hide the introductory message when you first open the window
-   `handleCancel` is used in two places and it sets the `isOpen` state to false, effectively closing the window

Next comes the `renameTubes` function that handles the full process of renaming the Blown Fiber Tubes

```
    const renameTubes = async () => {
        var t = db.transaction();
        bf_bundle.followRelationship('conduits').then(async tubes => {
            const colors = msg('colors').split('|');
            let color_index = 0;
            // Reorder tubes based on the number at the end of tube.properties.name
            tubes.sort((a, b) => {
                const numA = parseInt(a.properties.name.match(/\d+$/)[0], 10);
                const numB = parseInt(b.properties.name.match(/\d+$/)[0], 10);
                return numA - numB;
            });
            console.log(tubes);
            tubes.forEach(tube => {
                const tubeColor = colors[color_index];
                tube.properties.name += ` - ${tubeColor}`;
                color_index++;
                if (color_index >= colors.length) {
                    color_index = 0;
                }
                t.addUpdate('blown_fiber_tube', tube);
            });

            await t.run().then(() => {
                setAlertMessage('TRANSACTION Tubes renamed successfully!');
                setIsAlertVisible(true);
                setTimeout(() => {
                    setIsAlertVisible(false);
                }, 5000);
            });
        });
    };
```

-   The function starts by creating a new Transaction object. A Transaction allow you to gather a set of Database operations and send them to the server in a single operation. The Transaction will run on the server as a python loop, but the database will still perform individual update operations, the advantage here is that all these update operations are requested using one REST API request which is much more efficient than many transactions.
-   Next the `followRelationship` function is called for the Bundle, looking for all `conduits` related to it, this asynchronous function will return all the Blown Fiber Tubes within the Bundle. `followRelationship` is a Calculated field within the Blown Fiber Tube table in the database. Under the hood a query is ran to gather the information of all `conduits` related to the Blown Fiber Tube.
-   Once the Fibers are returned, the code takes the `colors` string from the localization file and split it in the `|` to obtain an array with all the colors, in the localization file the `colors` string looks like below
    -   `"colors": "Blue|Orange|Green|Brown|Gray|White|Red|Black|Yellow|Purple|Pink|Turquoise"`
-   Next we sort the `tubes` return by the number at the end of the string, this is necessary given that the order of the fibers matter (i.e.: In our case the first fiber is blue, the second is Orange, etc...)
-   Then the code iterates over the `tubes` array changing the `tubes.properties.name` string by concatenating the current string to the end of it.
-   After changing the name the funtion `t.addUpdate` add the update specific for this tube to the Transaction Object.
-   Once the iteration is finished, `t.run` sends the request to the server containing all updates created previously in a single REST request. This is an asynchronous call, and once the function returns an alert is shown to the user informing that the renaming process is completed.

And finally the React `return` statement containing the HTML code to be rendered

```
    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={msg('bf_tube_rename_title')}
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
                              onClick={renameTubes}
                              type="primary"
                          >
                              Rename
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
                <div>
                    BF Bundle: <Input value={bf_bundle ? bf_bundle._myw.title : ''} disabled />
                    <br />
                    {isAlertVisible && (
                        <div>
                            <Alert message={alertMessage} type="success" />
                        </div>
                    )}
                </div>
            )}
        </DraggableModal>
    );
```

-   If `showIntro` is `true` then a text message describing the tool is shown to the user explaining how to use it, as well as a button to hide the message by calling the hideIntro function
-   Once `showIntro` is set to `false` the main interface is shown with fields for the Pole Name, Address, and Drop Cable Name, as well as a button that calls the `renameTubes` function and has its `disabled` parameter connected to the `disabled` State Hook. Note that the BF Bundle field has the `disabled` parameter, this is because this fields is only changed when the user clicks on a Blown Fiber Tube, triggering the `setFeature` function
-   And at the bottom there is the Alert that is shown only when the `isAlertVisible` state is set to `true`
