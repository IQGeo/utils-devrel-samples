# Custom Settings Tab - Code Deep Dive

## Table of Contents

- [Custom Settings Tab - Code Deep Dive](#custom-settings-tab---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [index.js](#indexjs)
    - [customTab.js](#customtabjs)
    - [customTabForm.js](#customtabformjs)
    - [### custom\_tab\_plugin.js](#-custom_tab_pluginjs)

---

## Tool Description

This sample demonstrates how to create a Custom Settings Tab under `Configuration -> Settings`, where the user can save an advanced configuration and then read the configuration within an application.

## Tool files

The tool files are:

-   `index.js` - This is the file that registers the `CustomTab` class in the `configSettingsPages` array of the application, in order for the tab to be shown in the `Configuration->Settings` page
    -   This is found in the `modules/utils_devrel_samples/config` folder
-   `customTab.js`- CustomTab is a class that extends React's `Component` class and will render the React code used in the Custom Settings Tab
    -   This is found in the `modules/utils_devrel_samples/config` folder
-   `customTabForm.js` - CustomTabForm is a class that extends React's `Component` class and contains the React code to be rendered in the Custom Settings Tab
    -   This is found in the `modules/utils_devrel_samples/config` folder
-   `custom_tab_plugin.js` - The configuration file for the Custom Tab plugin. The CustomTabPlugin class will be then imported into the `main.nmt_samples.js` file in a similar way as the other Palette tools.
    -   This is found in the `/modules/utils_devrel_samples/public/js/Samples/custom_tab` folder.

## How the tool works

In this section we will go over the tool source code describing how it works.

**IMPORTANT**: Before using the sample you MUST create the `custom.feature` Advanced Configuration.

- Go to `Configuration -> Settings -> Advanced`
- Select the `Advanced` tab
- Click the `Add New` button
- Create a new setting with these configurations
  - Name: `custom.feature`
  - Type: `STRING`
  - Value: You can insert whatever you want
- Click `Save`

### index.js

Starting with the `import` statements

```
// Copyright: IQGeo Limited 2010-2024
import { CustomTab } from './CustomTab';
import myw from 'myWorld-base';

myw.configSettingsPages['custom.setting'] = CustomTab;
```

This file is short: It imports `myw` and `CustomTab` so it can register the `CustomTab` class into the array of configuration settings tabs.

Next the class is created, as well as the class constructor, which is called from the file `customer_connection_controller.py`

### customTab.js

```
// Copyright: IQGeo Limited 2010-2024
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { CustomTabForm } from './CustomTabForm';
```

The imports are:

-   The base React library and the `Component` class, which is the foundation for creating class-based React components that manage lifecycle methods and component state.
-   Next are the imports that provides access to MobX stores by injecting them as props into the wrapped component. [Learn more](https://mobx.js.org/react-integration.html).
-   Finally, the import for the `CustomTabForm` class.

```
@inject('store') // injects the MobX store into the component
@observer // makes the component observe changes in the MobX store
export class CustomTab extends Component {
    render() {
        const store = this.props.store.settingsStore;
        const settings = store.getAllConverted();
        return <CustomTabForm settings={settings} settingsStore={store} />;
    }
}
```

The class is a React Component that serves as a custom settings tab interface. It uses MobX for state management to reactively display and manage application settings.

Let's start with the decorators:

-   `@inject('store')` - Injects the MobX store instance into the component props
-   `@observer` - Makes the component reactive to changes in the MobX store, automatically re-rendering when observed data changes

Next the code:

-   Retrieves the `settingsStore` from the injected MobX store
-   Fetches all converted settings from the store using `getAllConverted()`
-   Renders a `CustomTabForm` component, passing the settings and store reference as props

### customTabForm.js

```
handleChange = value => {
    const update = {
        name: 'custom.feature',
        type: 'STRING',
        value: value
    };
    this.props.settingsStore.update('custom.feature', update).then(() => {
        console.log('Setting updated successfully!');
    });
};
```

In this file we will only focus on the `handleChange` function since the rest is standard React code. When a Feature is selected in the `Select` component `handleChange` is called.

In the function a `update` Object is created containing the parameters of the Advanced Configuration `custom.feature` created previously, then the `update` function of the `settingsStore` (which is passed as parameter to this class) send the `update` Object, once the database is updated and the asynchronous function returns a message is printed on the console indicating that the setting was updated.

### ### custom_tab_plugin.js

```
import myw from 'myWorld-client';
import { Plugin, PluginButton } from 'myWorld-client';
import customTabImage from '../../images/Custom_Tab_Plugin.svg';
```

- The first import is for the `myw` class which we'll use to read the advanced Configuration created
- Next import is for the `Plugin` class. Plugins are how add new functionality to IQGeo applications. `PluginButton` is the class that creates buttons within the application itself.
- `customTabImage` is the icon image to be used in the button
  
Next comes the class declaration, static properties initialization, and constructor

```
export class CustomTabPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'customTabPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'custom-tab-button';
                    this.prototype.titleMsg = 'custom_tab_title';
                    this.prototype.imgSrc = customTabImage;
                }

                action() {
                    this.owner.printConfig();
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
- The constructor calls the `super` (i.e.: The `Plugin` class) constructor, as well as creating an instance of the `customTabImage` class.

Next comes the `printConfig` function, which is the function that is called when the button is pressed.

```    
    printConfig() {
        console.log(
            'The currently selected feature is ' + myw.app.system.settings['custom.feature']
        );
    }
```
- The function simply prints in the Development Console the value of `myw.app.system.settings['custom.feature']` . `myw.app.system.settings` is the array that stores all the settings and `custom.feature` is the setting we have created previously.
