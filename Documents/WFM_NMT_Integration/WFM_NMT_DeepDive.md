# WFM/NMT Integration - Code Deep Dive

## Table of Contents

- [WFM/NMT Integration - Code Deep Dive](#wfmnmt-integration---code-deep-dive)
  - [Table of Contents](#table-of-contents)
  - [Tool Description](#tool-description)
  - [Tool files](#tool-files)
  - [How the tool works](#how-the-tool-works)
    - [fieldValidatorModal.js](#fieldvalidatormodaljs)

---

## Tool Description

The integration between the Workflow Manager (WFM) and Network Manager Telecom (NMT), allows users to manipulate WFM tickets from within NMT, making the processing of these tickets easier and more streamlined.

This sample allows the user to query the features database with a rule and create tickets associated with features that break this rule. 

For instance I want to ensure all my fiber cables have more than 24 fibers, if any of the cables have less than 24 fibers a ticket is created with basic information (that can be later edited) to replace this cable.

## Tool files

- `fieldValidatorPlugin.js` - The Configuration file for the Plugin
- `fieldValidatorModal.js` - The file containing the React code used to render the modal window
- `fieldValidatorFunctions.js` - The class containing the support functions for the Modal code

All files are located in the `modules/devrel_samples/public/js/Samples/WFM_NMT_Integration` folder

## How the tool works

In this section we will go over the tool source code describing how it works. This tool contains much React code that are not intrinsic to the process of creating a Workflow Manager ticket from within Network Manager Telecom. For sake of brevity and to focus on the functionality itself, this document will focus only in the code that is relevant for this operation itself.

### fieldValidatorModal.js

The file starts with the relevant imports

```
import wfm from '../../../../workflow_manager/public/js/base/wfm.js';
```

For the integration the only relevant import is `wfm.js`, which define namespace and general util functions

When the user presses the "OK" button the function `validateRule` is called

```
    const validateRule = async () => {
        setResult([]);
        let tempResult = [];
        db.getFeatures(pickedFeatureType, { bounds: appRef.map.getBounds() }).then(result => {
            for (const feature in result) {
                if (result[feature]?.properties) {
                    const props = result[feature]?.properties;
                    typeof props[pickedField] === 'number'
                        ? (props[pickedField] = props[pickedField].toFixed(2))
                        : props[pickedField];
                    const newResult = {
                        resultFeature: result[feature],
                        result: validate(props[pickedField], pickedRule, inputtedValue)
                    };
                    tempResult.push(newResult);
                }
            }
            setResult(tempResult);
        });
    };
```

- The function starts by resetting the `result` State, emptying the result array in case a validation has already been run

- Then `db.getFeatures` is called, where the database is queried for the selected feature type (stored in the `pickedFeatureType` state)
- The second parameter of `db.getFeatuers` is an object of the type `queryParameters` that is used to further filter the query. In the tool's case we are only using the `bounds` parameter with the current screen's map bounds (i.e.: The more the user zoom in, the smaller the area will be. The more the user zooms out, the larger the area will be )
- Since this is an asynchronous function the code waits for a return. It then iterates over the result, validating each feature against the rule defined by the user in the interface, and populating the `tempResult` variable
- Once the iteration finished, the `result` state is set with the `tempResult` array value
  - A temporary array is used because it the `result` state is constantly updated the screen will be unnecessarily refreshed every time

If a feature breaks the rule defined by the user next to it in the result list will be shown a "Create WFM Ticket" button, when this button is pressed the `createTicket` function is called

```
    const createTicket = async itemObj => {
        const ticketObj = createTicketObject(
            itemObj,
            pickedRule,
            pickedField,
            inputtedValue,
            pickedFeatureType
        );

        const { createTicket } = wfm.redux.tickets;
        await wfm.store.dispatch(createTicket({ values: ticketObj }));
    };
```
- `createTicket` starts by calling the `createTicketObject` which returns the object containing all relevant information for the ticket
- Next the `wfm.redux.tickets.createTicket` is obtained and dispatched to Redux's store for processing, this is where the Workflow Manager ticket is actually created. Once a response is received the pop-up informing the number of the ticket created is shown