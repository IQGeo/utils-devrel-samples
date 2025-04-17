# WFM/NMT Integration - Code Deep Dive

## Table of Contents

-   [WFM/NMT Integration - Code Deep Dive](#wfmnmt-integration---code-deep-dive)
    -   [Table of Contents](#table-of-contents)
    -   [Tool Description](#tool-description)
    -   [Tool files](#tool-files)
    -   [How the tool works](#how-the-tool-works)
        -   [fieldValidatorPlugin.js](#fieldvalidatorpluginjs)
        -   [fieldValidatorModal.js](#fieldvalidatormodaljs)
        -   [fieldValidatorFunctions.js](#fieldvalidatorfunctionsjs)

---

&#8291;
&#8291;

## Tool Description

The integration between the Workflow Manager (WFM) and Network Manager Telecom (NMT), allows users to manipulate WFM tickets from within NMT, making the processing of these tickets easier and more streamlined.

This sample allows the user to query the features database with a rule and create tickets associated with features that break this rule.

For instance I want to ensure all my fiber cables have more than 24 fibers, if any of the cables have less than 24 fibers a ticket is created with basic information (that can be later edited) to replace this cable.

&#8291;
&#8291;

## Tool files

-   `fieldValidatorPlugin.js` - The Configuration file for the Plugin
-   `fieldValidatorModal.js` - The file containing the React code used to render the modal window
-   `fieldValidatorFunctions.js` - The class containing the support functions for the Modal code

All files are located in the `modules/devrel_samples/public/js/Samples/WFM_NMT_Integration` folder

&#8291;
&#8291;

## How the tool works

In this section we will go over the tool's source code and describe how it works. This tool's sample code makes heavy use of React but to be clear that React is not a strict requirement for creating a Workflow Manager ticket from within Network Manager Telecom.

&#8291;
&#8291;

### fieldValidatorPlugin.js

This file's structure is very similar to the Javascript "plugin" files found in our other samples. To review:

```
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customRulesImage from '../../images/fieldValidator.svg';
import { FieldValidatorModal } from './fieldValidatorModal';
```

-   The first import is for the `Plugin` class. Plugins is how we add new functionality to IQGeo applications. `PluginButton` is the class that creates buttons within the application itself.
-   `renderReactNode` is IQGeo’s render functionalities class, since the samples runs on a React window this class is needed.
-   the `customRulesImage` is the SVG icon that we will use for our custom button on the toolbar.
-   the `FieldValidatorModal` class is the custom class we are creating that will contain the bulk of our execution logic since the modal window is where the user will interact with the tool.

&#8291;
&#8291;

```
export class FieldValidatorPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'customRulePlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'cable-capture-button';
                    this.prototype.titleMsg = 'customRulePlugin';
                    this.prototype.imgSrc = customRulesImage;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }
```

-   The `FieldValidatorPlugin` class extends `Plugin`. As mentioned before, the `Plugin` class is how we add new functionality to IQGeo applications.
-   Next, the static properties of the class are initialized
    -   `this.prototype.messageGroup` is the localisation information for this class
    -   `this.prototype.buttons` will contain information on the buttons related to this class. In this example this class only needs one button, and within this object there is
-   `dialog`: Which is a nested class declaration that extends `PluginButton`. This is the class that defines the look and behaviour of the interface button when pressed, the behaviour is defined by the `action()` function (i.e.: This button will call the function showModal() when pressed)

&#8291;
&#8291;

```
    constructor(owner, options) {
        super(owner, options);
    }
```

-   The constructor calls the `super` (i.e.: The `Plugin` class).

&#8291;
&#8291;

```
    showModal() {
        this.renderRoot = renderReactNode(
            null,
            FieldValidatorModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
```

Next comes the `showModal` function, which is the function that is called when the button is pressed.

-   The function calls `renderReactNode`, which is IQGeo’s wrapper for `createRoot`, `React.createRender`, and `root.render`, it receives as parameters:
    -   The DOM node to be used (in this case `null`)
    -   The React component (the `FieldValidatorModal` class), which includes:
-   `open`, a Boolean flag that indicates that the modal window is open
-   A reference to the `Plugin` class itself
-   And finally the `this.renderRoot` itself

&#8291;
&#8291;

### fieldValidatorModal.js

The file starts with the relevant imports:

```
import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { useLocale } from 'myWorld-client/react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Avatar, Cascader, List, Select } from 'antd';
import greenImg from '../../images/green_check.png';
import redImg from '../../images/red_x.png';
import {
    buildFeatureList,
    validate,
    createTicketObject,
    buildFields
} from './fieldValidatorFunctions.js';
import wfm from 'modules/workflow_manager/js/base/wfm';
```

A series of import statements begins the script. The familiar `myw`library as well as `React`. Note that we are importing state and effect hooks for React as well.

Localization will be done via the `useLocale` import, while some UI elements are being imported from both the `myWorld-client` library as well as the third-party `Antd` library.

We import a couple of references to SVG images we'll be using inside the modal window.

To better organize the code for this application we have a series of associated functions in a separate file--`fieldValidatorFunctions.js`--which we are importing here. They are described in detail in its own section below.

Finally importing from `wfm.js` which define namespace and general util functions

&#8291;
&#8291;

```
export const FieldValidatorModal = ({ open }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(myw.app.database);
    const { msg } = useLocale('customRuleModal');
    const [isOpen, setIsOpen] = useState(open);
    const [featuresList, setFeaturesList] = useState([]);
    const [features, setFeatures] = useState();
    const [ruleType, setRuleType] = useState();
    const [pickedRule, setPickedRule] = useState('');
    const [inputtedValue, setInputtedValue] = useState('');
    const [pickedFeatureType, setPickedFeatureType] = useState('');
    const [pickedField, setPickedField] = useState('');
    const [result, setResult] = useState([]);

    const [projLoading, setProjLoading] = useState(true); // loading status of db call for projects
    const [allProjects, setAllProjects] = useState([]); // array that populates the Select widget
    const [selProject, setSelProject] = useState(''); // selected project id value
    const [selProjectName, setSelProjectName] = useState(''); // selected project name
```

As the FieldValidatorModal is a lengthy class, we'll take it in pieces. After setting up references to the map application itself, the database, and the localization library, we are setting up a series of self-explanatory variables using state hooks.

&#8291;
&#8291;

```
    useEffect(() => {
        const dbFeatures = db.getFeatureTypes();

        const filteredFeatures = Object.keys(dbFeatures)
            .filter(
                key =>
                    !/(IN|OUT|processed|comsof|mywwfm|spec|coax|copper|conduit|mywcom|ticket|iqgapp)/.test(
                        key
                    )
            )
            .reduce((obj, key) => {
                obj[key] = dbFeatures[key];
                return obj;
            }, {});

        setFeatures(filteredFeatures);

        let featuresListArray = [];
        featuresListArray = buildFeatureList(filteredFeatures);
        setFeaturesList(featuresListArray);

        const listProjects = async () => {
            let arrProjects = [];
            db.getFeatures('mywwfm_project').then(result2 => {
                for (const feature in result2) {
                    if (result2[feature]?.properties) {
                        const props = result2[feature]?.properties;
                        arrProjects.push({
                            value: props['id'],
                            label: props['name']
                        });
                    }
                }
                setAllProjects(arrProjects);
                setProjLoading(false);
            });
        };
        listProjects();
    }, []);
```

In this effect hook, we are managing the two sets of data that will populate the selector widgets the user sees when the modal window is first opened.

We begin the process of creating a list of network elements using the database call `db.getFeatureTypes()` returns a wide variety of elements in our application's database--many of which we are not interested in during this exercise. So we take the response object from the database and use `.filter` and `.reduce` to _remove_ all the records that contain any of the listed strings. We set up an empty array and call the `buildFeaturesList` function to create the list of the network elements of interest.

Next we set up the asynchronous `listProjects` function to get a list of WFM projects associated with our application. We parse the result to create an array of `value/label` pairs that will populate the Antd Select widget in the modal. Note that we are also managing a `projLoading` variable so that the application will be aware when the database call and result parsing has been completed.

&#8291;
&#8291;

```
    const renderProject = () => {
        if (projLoading || allProjects.length < 1) {
            return null;
        } else {
            return (
                <Select
                    loading={projLoading}
                    placeholder="please select a project"
                    options={allProjects}
                    key={allProjects.length}
                    onChange={onProjectSelected}
                />
            );
        }
    };
```

The `renderProject` component waits until the array of available projects has been created and the loading status is false before returning the Select component.

&#8291;
&#8291;

```
    const onProjectSelected = (value, option) => {
        setSelProject('mywwfm_project/' + value);
        setSelProjectName(option.label);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };
```

Two basic functions:

-   `onProjectSelected` just updates the project related hooks when the user makes a selection.
-   `handleCancel` sets the isOpen hook to false when the Cancel button is pressed.

    &#8291;
    &#8291;

```
    const onFieldSelected = value => {
        const cleanType = features[value[0]].fields[value[1]].type.replace(/\(\d+\)$/, '');
        setRuleType(cleanType);
        setPickedFeatureType(value[0]);
        setPickedField(value[1]);
        setPickedRule('');
        setInputtedValue('');
        setResult([]);
    };

    const onValueChange = e => {
        if (ruleType === 'integer' || ruleType === 'double') {
            const regex = /^\d+$/;
            if (regex.test(e.target.value) || e.target.value === '') {
                setInputtedValue(e.target.value);
            }
        } else {
            setInputtedValue(e.target.value);
        }
    };
```

-   `onFieldSelected` fires when the user chooses a network element (e.g. a fiber cable) and then a field associated with that element (e.g. 'Fiber Count'). Recall we can test three types of fields: String, Numeric (integer/double), and Boolean. Since string fields can be of variable lengths (which are not relevant to us here), a regular expression is used to remove that length information. And then a bunch of state hook values are set based on the user choice.

-   `onValueChange` fires when the user sets the criteria for the rule test. If the rule test involves a numeric field, then we verify that the input is suitably numeric.

&#8291;
&#8291;

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

-   The function starts by resetting the `result` State, emptying the result array in case a validation has already been run

-   Then `db.getFeatures` is called, where the database is queried for the selected feature type (stored in the `pickedFeatureType` state)
-   The second parameter of `db.getFeatuers` is an object of the type `queryParameters` that is used to further filter the query. In the tool's case we are only using the `bounds` parameter with the current screen's map bounds (i.e.: The more the user zoom in, the smaller the area will be. The more the user zooms out, the larger the area will be )
-   Since this is an asynchronous function the code waits for a return. It then iterates over the result, validating each feature against the rule defined by the user in the interface, and populating the `tempResult` variable
-   Once the iteration finished, the `result` state is set with the `tempResult` array value
    -   A temporary array is used because it the `result` state is constantly updated the screen will be unnecessarily refreshed every time

If a feature breaks the rule defined by the user next to it in the result list will be shown a "Create WFM Ticket" button, when this button is pressed the `createTicket` function is called

&#8291;
&#8291;

```
    const createTicket = async itemObj => {
        const ticketObj = createTicketObject(
            itemObj,
            pickedRule,
            pickedField,
            inputtedValue,
            pickedFeatureType,
            selProject,
            selProjectName
        );

        const { createTicket } = wfm.redux.tickets;

        await wfm.store.dispatch(createTicket({ values: ticketObj }));
    };
```

-   `createTicket` starts by calling the `createTicketObject` which returns the object containing all relevant information for the ticket
-   Next the `wfm.redux.tickets.createTicket` is obtained and dispatched to Redux's store for processing, this is where the Workflow Manager ticket is actually created. Once a response is received the pop-up informing the number of the ticket created is shown

&#8291;
&#8291;

```
    const renderFields = () => {
        switch (ruleType) {
            case 'integer':
            case 'double':
                return (
                    <div>
                        {buildFields(
                            [
                                { value: '<', label: '<' },
                                { value: '>', label: '>' }
                            ],
                            setPickedRule,
                            pickedFeatureType + ' - ' + pickedField,
                            inputtedValue,
                            onValueChange
                        )}
                    </div>
                );
            case 'string':
                return (
                    <div>
                        {buildFields(
                            [
                                { value: 'have', label: msg('have_radio') },
                                { value: 'notHave', label: msg('have_not_radio') }
                            ],
                            setPickedRule,
                            pickedFeatureType + ' - ' + pickedField,
                            inputtedValue,
                            onValueChange
                        )}
                    </div>
                );
            case 'boolean':
                return (
                    <div>
                        {buildFields(
                            [
                                { value: 'true', label: msg('true_radio') },
                                { value: 'false', label: msg('false_radio') }
                            ],
                            setPickedRule
                        )}
                    </div>
                );
        }
    };
```

In the modal window, after the user chooses both a network element and then a data field associated with that element, this function fires and a new element is rendered in the modal window to set up the rule to be tested, depending on whether the field chosen was numeric, a string, or a boolean.

&#8291;
&#8291;

```
    const renderResult = () => {
        return (
            <div>
                <br />
                <List
                    size="small"
                    bordered
                    dataSource={result}
                    header={pickedFeatureType + ' / ' + pickedField + msg('query_result')}
                    renderItem={item => (
                        <List.Item>
                            <List.Item.Meta
                                onClick={() => {
                                    appRef.map.zoomTo(item.resultFeature);
                                    appRef.setCurrentFeature(item.resultFeature);
                                }}
                                avatar={
                                    item.result ? (
                                        <Avatar src={greenImg} />
                                    ) : (
                                        <Avatar src={redImg} />
                                    )
                                }
                                title={
                                    item.resultFeature.properties.name +
                                    ' - ' +
                                    item.resultFeature.properties[pickedField]
                                }
                            />
                            {!item.result ? (
                                <Button
                                    type="primary"
                                    onClick={() => createTicket(item.resultFeature)}
                                >
                                    {msg('wfm_ticket_button')}
                                </Button>
                            ) : null}
                        </List.Item>
                    )}
                />
            </div>
        );
    };

```

The `renderResult` function returns the list of features in the map view and determines if they meet the user criteria. Features that pass get a green dot image, features that do not meet the criteria get a red dot image AND a button to create a ticket. Clicking on a feature in the list selects the feature on the map and its attributes are displayed in the Details pane. Note that the `{result}` state hook array is used to populate the list, while at the same time each item in the list has a `result` property (true/false) that indicates whether it met the user criteria.

&#8291;
&#8291;

```
    return (
        <DraggableModal
            wrapClassName="custom-rules-modal"
            open={isOpen}
            title={msg('windowHeader')}
            width={500}
            onCancel={handleCancel}
            footer={[
                <Button key="cancel" onClick={handleCancel}>
                    Cancel
                </Button>,
                <Button key="ok" onClick={validateRule} type="primary">
                    OK
                </Button>
            ]}
        >
            Choose a project:
            {renderProject()}
            <br />
            <br />
            Choose a network feature:
            <Cascader options={featuresList} onChange={onFieldSelected} />
            {renderFields()}
            {true && result.length > 0 ? renderResult() : null}
        </DraggableModal>
    );

```

Finally, we return the rendering of the modal window itself. After setting up basic properties, we have the footer HTML with two buttons. In the main body of the modal we have:

-   `{renderProject()}` is generating the Select widget with the list of available projects
-   the `<Cascader>` widget is where the user will choose a network element and an attribute field associated with that network element
-   `{renderFields()}` will allow the user to input the appropriate criteria to test depending on the data type of the field chosen
-   `{renderResult()}` is the list of network features in the current map view and whether they pass the testing criteria set up by the user. Note how a list will only render if the source array `result` is not empty.
    &#8291;
    &#8291;

### fieldValidatorFunctions.js

This file contains functions that are called from the `fieldValidatorModal.js` file--note how these functions are directly imported at the top of that file.

&#8291;
&#8291;

```
import React from 'react';
import { useLocale } from 'myWorld-client/react';
import { Radio, Input } from 'myWorld-client/react';
```

We start with React imports--the core library along with the localization component as well as the Radio and Input UI elements.

&#8291;
&#8291;

```
export const buildFeatureList = features => {
    let fieldsList = [];
    let featuresList = [];
    for (const feat in features) {
        fieldsList = [];
        for (const field in features[feat].fields) {
            if (features[feat].fields[field].visible.value) {
                fieldsList.push({
                    label: features[feat].fields[field].external_name,
                    value: features[feat].fields[field].internal_name
                });
            }
        }
        const featureListItem = {
            label: features[feat].external_name,
            value: feat,
            children: fieldsList
        };
        featuresList.push(featureListItem);
    }
    return featuresList;
};

&#8291;
&#8291;
```

The Cascader element in the modal window allows the user to select a feature, then select a particular data field of that feature. What this function does is iterates over the incoming list of features and generates an array of data fields associated with each feature. Then an object `featureListItem` is created that uses `fieldsList` array associated with each feature as the `children` property. This array of objects ends up being stored in the `{featuresList}` state hook in the `fieldValidatorModal.js` script.

&#8291;
&#8291;

```
export const validate = (a, rule, b) => {
    if (a && b) {
        const rules = {
            '>': (a, b) => Number(a) > Number(b),
            '<': (a, b) => Number(a) < Number(b),
            true: a => a,
            false: a => !a,
            have: (a, b) => a.includes(b),
            notHave: (a, b) => !a.includes(b)
        };

        if (rules[rule]) {
            return rules[rule](a, b);
        } else {
            throw new Error(`Unknown rule: ${rule}`);
        }
    } else {
        return false;
    }
};
```

The `validate` function is what tests the user's inputted value against the picked field's value and returns a boolean of `true` or `false`.

To reiterate, we have three types of rules we can test depending on the type of data field--we we can see in the `const rules` object:

-   is the numerical value of a data field greater than or less than the inputted value?
-   does the data field string contain the inputted string value?
-   is the data field boolean true or false?

Note that if the user provides fails to provide input an error will be returned -- see the line `throw new Error('Unknown rule: ${rule}');`

&#8291;
&#8291;

```
export const buildFields = (
    radioOptions,
    setRuleFunction,
    inputPlaceholder = null,
    valueState = null,
    onValueChangeFunction = null
) => {
    const { msg } = useLocale('customRuleModal');
    return (
        <div>
            <br />
            <strong>{msg('rule_title')}</strong>
            <Radio.Group
                optionType="button"
                buttonStyle="solid"
                onChange={e => setRuleFunction(e.target.value)}
            >
                {radioOptions.map(option => (
                    <Radio key={option.value} value={option.value}>
                        {option.label}
                    </Radio>
                ))}
            </Radio.Group>
            {inputPlaceholder && (
                <div>
                    <br />
                    <strong>{msg('value_title')}</strong>
                    <Input
                        placeholder={inputPlaceholder}
                        value={valueState}
                        onChange={onValueChangeFunction}
                    />
                </div>
            )}
        </div>
    );
};

```

This function is called by the `renderFields` function in the `fieldValidatorModal.js` script and determines the UI element needed for the user inputted value depending on the data type of the selected data field of the feature. Recall that if the data type is a string or boolean the user will input their target value through a Radio UI element. If the data type is numeric, they will use an Input element where the user will enter their numeric value to test.

&#8291;
&#8291;

```
export const createTicketObject = (
    itemObj,
    rule,
    pickedField,
    value,
    pickedFeature,
    projId,
    projName
) => {
    const { msg } = useLocale('customRuleModal');
    let ruleStr = '';
    switch (rule) {
        case '<':
            ruleStr = msg('less_than');
            break;
        case '>':
            ruleStr = msg('more_than');
            break;
        case 'true':
            ruleStr = msg('true');
            break;
        case 'false':
            ruleStr = msg('false');
            break;
        case 'have':
            ruleStr = msg('have');
            break;
        case 'notHave':
            ruleStr = msg('not_have');
            break;
    }

    const issueStr =
        msg('value_of') +
        pickedFeature +
        ' - ' +
        pickedField +
        msg('is') +
        itemObj.properties[pickedField] +
        ruleStr +
        ' ' +
        value;

    const ticketObj = {
        geometry_type: null,
        id: 'Null',
        mywwfm_assigned_username: 'admin',
        // mywwfm_cause: 'Broken Custom Rule',
        mywwfm_cause: msg('cause'),
        geometry: itemObj.geometry,
        mywwfm_indicator: msg('medium'),
        mywwfm_issue: issueStr,
        mywwfm_last_modified_datetime: undefined,
        mywwfm_node: msg('node'),
        mywwfm_project: projId,
        mywwfm_project_name: projName,
        mywwfm_region: 'South',
        mywwfm_related_feature: null,
        mywwfm_source_system: null,
        mywwfm_status: 'Open',
        mywwfm_ticket_details: msg('default_ticket_details'),
        mywwfm_ticket_group: ['admin:Default'],
        mywwfm_type: 'Test Ticket',
        mywwfm_type_category: msg('default_category')
    };
    return ticketObj;
};

```

The last function in the file - `createTicketObject` - does what it says: it sets a bunch of properties for the ticket object that will be used to create a new WFM ticket in the database. It is called by the `createTicket` function in the `fieldValidatorModal.js` script.

A number of these properties use localization values -- which you can access by inspecting the `customRuleModal` section of the `utils-devrel-samples.msg` file in the `locales/en` folder.

The logic for `ruleStr` and `issueStr` simply does some string manipulation and concatenation in order to create the `mywwfm_issue` property value.

The `mywwfm_project` and `mywwfm_project_name` properties will be provided in the modal script by what project the user selects using the Select UI widget.

Finally, note the `geometry` property. When this function is called in the modal script, `itemObj` is a parameter that will take the feature object associated with the ticket. So for the `geometry` property of the ticket we are setting this property to the `geometry` property of the feature for which we are creating the ticket.
