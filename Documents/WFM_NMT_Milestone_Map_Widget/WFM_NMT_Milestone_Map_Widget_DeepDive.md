# WFM/NMT Milestone Map Widget - Code Deep Dive

## Table of Contents

-   [WFM/NMT Milestone Map Widget - Code Deep Dive](#wfmnmt-milestone-map-widget---code-deep-dive)
    -   [Table of Contents](#table-of-contents)
    -   [Tool Description](#tool-description)
    -   [Tool files](#tool-files)
    -   [How the tool works](#how-the-tool-works)
        -   [milestoneMapPlugin.js](#milestonemappluginjs)
        -   [milestoneMapModal.js](#milestonemapmodaljs)
        -   [mapTicketsLayer.js](#mapticketslayerjs)
        -   [timeRangeSlider.js](#timerangesliderjs)
        -   [milestoneMapFunctions.js](#milestonemapfunctionsjs)

---

&#8291;
&#8291;

## Tool Description

This tool is built in an environment with Workflow Manager (WFM) integrated with Network Manager Telecom (NMT), but can easily be re-used in environments where WFM is integrated with other Network Managers (e.g. Electric, Gas, et al).

This sample enables the user to create a temporary map layer of tickets of WFM Milestones associated with a user-selected Project and Group. The tool includes an interactive time slider to enable visualizing tickets that fall within the user-selected range of their milestones' planned beginning and end dates.

&#8291;
&#8291;

## Tool files

-   `milestoneMapPlugin.js` - The Configuration file for the Plugin
-   `milestoneMapModal.js` - The file containing the React code used to render the modal window
-   `mapTicketsLayer.js` - The file containing the class used to create and manage the temporary map layers
-   `timeRangeSlider.js` - The file containing the Slider component
-   `milestoneMapFunctions.js` - The class containing the support functions for the Modal code

All files are located in the `modules/utils-devrel-samples/public/js/Samples/WFM_NMT_Milestone_Map_Widget` folder

&#8291;
&#8291;

## How the tool works

In this section we will go over the tool's source code and describe how it works. This tool's sample code makes heavy use of React components but the functionality can be replicated with other Javascript frameworks/component libraries.

&#8291;
&#8291;

### milestoneMapPlugin.js

This file's structure is very similar to the Javascript "plugin" files found in our other samples. To review:

```
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import mapWidgetImage from '../../images/map_search_white.svg';
import { MilestoneMapModal } from './milestoneMapModal';
```

-   The first import is for the `Plugin` class. Plugins is how we add new functionality to IQGeo applications. `PluginButton` is the class that creates buttons within the application itself.
-   `renderReactNode` is IQGeo’s render functionalities class, since the samples runs on a React window this class is needed.
-   the `mapWidgetImage` is the SVG icon that we will use for our custom button on the toolbar.
-   the `MilestoneMapModal` class is the custom class we are creating that will contain the bulk of our execution logic since the modal window is where the user will interact with the tool.

&#8291;
&#8291;

```
export class MilestoneMapPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'mapWidgetPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'map-widget-button';
                    this.prototype.titleMsg = 'mapWidgetPluginTitle';
                    this.prototype.imgSrc = mapWidgetImage;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }
```

-   The `MilestoneMapPlugin` class extends `Plugin`. As mentioned before, the `Plugin` class is how we add new functionality to IQGeo applications.
-   Next, the static properties of the class are initialized
    -   `this.prototype.messageGroup` is the localisation information for this class
    -   `this.prototype.buttons` will contain information on the buttons related to this class. In this example this class only needs one button, and within this object there is
-   `dialog`: Which is a nested class declaration that extends `PluginButton`. This is the class that defines the look and behavior of the interface button when pressed, the behavior is defined by the `action()` function (i.e.: This button will call the function showModal() when pressed)

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
            MilestoneMapModal,,
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
    -   The React component (the `MilestoneMapModal` class), which includes:
-   `open`, a Boolean flag that indicates that the modal window is open
-   A reference to the `Plugin` class itself
-   And finally the `this.renderRoot` itself

&#8291;
&#8291;

### milestoneMapModal.js

The file starts with the relevant imports:

```
import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { useLocale } from 'myWorld-client/react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Select, Alert } from 'antd';

import ticketLegend from '../../images/ticket_legend_sm.png';

import TimeRangeSlider from './timeRangeSlider.js';
import dayjs from 'dayjs';

import MapTicketsLayer from './mapTicketsLayer.js';
import * as turf from '@turf/turf';

import { sortMilestones } from './milestoneMapFunctions.js';
```

A series of import statements begins the script. The familiar `myw`library as well as `React`. Note that we are importing state and effect hooks for React as well.

Localization will be done via the `useLocale` import, while some UI elements are being imported from both the `myWorld-client` library as well as the third-party `Antd` library. The legend graphic is imported from the project's images folder.

The Slider component to be used is imported from `timeRangeSlider.js` - a more complete description of that script is below. The `dayjs` library is imported to help with working with timestamps.

The `MapTicketsLayer` class from the `mapTicketsLayer.js` file is imported as that will handle the mechanics of creating, displaying, and deleting our temporary map layers. More information about the script can be found below.

The [Turf](https://turfjs.org/) library is imported so we can perform specialized geospatial functions.

Finally, the `sortMilestones` function is imported from a separate file to make things less cluttered--more details below.

&#8291;
&#8291;

```
export const MilestoneMapModal = ({ open }) => {
    const [db] = useState(myw.app.database);

    const { msg } = useLocale('mapWidgetModal');
    const [isOpen, setIsOpen] = useState(open);

    const [hullLayer] = useState(() => new MapTicketsLayer());
    const [pointsLayer] = useState(() => new MapTicketsLayer());

    const [showIntro, setShowIntro] = useState(false);
```

As the MilestoneMapModal is a lengthy class, we'll take it in pieces. After setting up references to the database and the localization library, we have state hooks to store whether the modal window is open, our two temporary mapping layers, and then whether introductory text is being shown.

&#8291;
&#8291;

```
    // alert message
    const [alertMessage, setAlertMessage] = useState('');
    const [alertType, setAlertType] = useState('success');
    const [isAlertVisible, setIsAlertVisible] = useState(false);

    // selectable message alert
    const [selectableMessage, setSelectableMessage] = useState('');
    const [selectableType, setSelectableType] = useState('success');
    const [isSelectableAlertVisible, setIsSelectableAlertVisible] = useState(false);

    // slider hooks
    const [sliderVisible, setSliderVisible] = useState(false);
    const [beginTime, setBeginTime] = useState('');
    const [endTime, setEndTime] = useState('');

    const [sliderMinTime, setSliderMinTime] = useState(null);
    const [sliderMaxTime, setSliderMaxTime] = useState(null);
```

More state hooks related to both our alert message as well as the message associated with the "Check Selectability" message. In additon, we set up the variables pertinent to our Slider component

&#8291;
&#8291;

```
    // project hooks
    const [projLoading, setProjLoading] = useState(true); // loading status of db call for projects
    const [allProjects, setAllProjects] = useState([]); // array that populates the Select widget
    const [selProjectId, setSelProjectId] = useState(''); // just the project id

    // group hooks
    const [projGroups, setProjGroups] = useState([]);
    const [selProjGroups, setSelProjGroups] = useState([]);
    const [selGroup, setSelGroup] = useState(null); // group id
    const [groupDisabled, setGroupDisabled] = useState(true);
    const [groupLoading, setGroupLoading] = useState(true);

    // milestone hooks
    const [allMilestones, setAllMilestones] = useState([]);
    const [groupMilestones, setGroupMilestones] = useState([]);
    const [projGroupMilestones, setProjGroupMilestones] = useState([]);
    const [selGroupMilestones, setSelGroupMilestones] = useState([]);
    const [selMilestone, setSelMilestone] = useState(null); // group id
    const [milestoneDisabled, setMilestoneDisabled] = useState(true);
    const [milestoneLoading, setMilestoneLoading] = useState(true);

    // tickets
    const [milestoneTickets, setMilestoneTickets] = useState([]);
    const [filteredTickets, setFilteredTickets] = useState([]);
```

Next, we have state hooks that will help us track the four types of WFM data that will drive the tool: Projects, Groups, Milestones, and Tickets.
&#8291;
&#8291;

&#8291;
&#8291;

```
    useEffect(() => {
        // we are pulling the data from the four tables we need when the modal window opens -
        // -- Projects - mywwfm_project
        // -- Project/Group Association - mywwfm_project_group_junction - provides Group info
        // -- Milestones - mywwfm_milestones
        // -- Group/Milestone Association - mywwfm_milestone_group_junction

        const listProjects = async () => {
            let arrProjects = [];

            db.getFeatures('mywwfm_project')
                .then(result => {
                    for (const feature in result) {
                        if (result[feature]?.properties) {
                            const props = result[feature]?.properties;
                            // do not load Default Project
                            // if (props['name'] !== 'Default Project') {
                            arrProjects.push({
                                value: props['id'],
                                label: props['name']
                                //     });
                                // }
                            });
                        }
                    }
                    if (arrProjects.length === 0) {
                        setAlertType('warning');
                        setAlertMessage('No projects found.');
                        return;
                    } else {
                        setAllProjects(arrProjects);
                    }
                })
                .catch(error => {
                    setAlertType('error');
                    setAlertMessage('Failed to load Projects table data.');
                    console.error('Failed to load Projects table:', error);
                    setAllProjects([]);
                    return;
                })
                .finally(() => {
                    setProjLoading(false);
                });
        };
        listProjects();

        // load all Project - Group associations into projGroups state hook
        const getProjGroupJunction = async () => {
            let arrGroupsProjects = [];
            db.getFeatures('mywwfm_project_group_junction')
                .then(result => {
                    for (const group in result) {
                        if (result[group]?.properties) {
                            const props2 = result[group]?.properties;

                            arrGroupsProjects.push(props2);
                        }
                    }

                    if (arrGroupsProjects.length === 0) {
                        setAlertType('warning');
                        setAlertMessage('No Project/Group associations found.');

                        return;
                    } else {
                        setProjGroups(arrGroupsProjects);
                    }
                })
                .catch(error => {
                    setAlertType('error');
                    setAlertMessage('Failed to load project-group junction data.');
                    console.error('Failed to load project-group junction data:', error);
                    setProjGroups([]);
                    return;
                });
        };

        getProjGroupJunction();

        // load all Milestones
        const listMilestones = async () => {
            let arrMilestones = [];
            db.getFeatures('mywwfm_milestone')
                .then(result => {
                    for (const feature in result) {
                        if (result[feature]?.properties) {
                            const props = result[feature]?.properties;

                            arrMilestones.push({
                                milestone_id: props['id'],
                                name: props['name'],
                                status: props['status'],
                                proj_id: props['project_id'],
                                parent_id: props['parent_id'],
                                prior_sibling_id: props['prior_sibling_id'],
                                planned_start_datetime: props['planned_start_datetime'],
                                planned_end_datetime: props['planned_end_datetime']
                            });
                        }
                    }

                    if (arrMilestones.length === 0) {
                        setAlertType('warning');
                        setAlertMessage('No Milestone records found.');
                        return;
                    } else {
                        setAllMilestones(arrMilestones);
                    }
                })
                .catch(error => {
                    setAlertType('error');
                    setAlertMessage('Failed to load Milestone table data.');
                    console.error('Failed to load Milestone table data:', error);
                    setAllMilestones([]);
                    return;
                });
        };
        listMilestones();

        // load all Group - Milestones associations into groupMilestones state hook
        const getGroupMilestoneJunction = async () => {
            let arrGroupsMilestones = [];
            db.getFeatures('mywwfm_milestone_group_junction')
                .then(result => {
                    for (const feature in result) {
                        if (result[feature]?.properties) {
                            const props = result[feature]?.properties;

                            arrGroupsMilestones.push({
                                junction_id: props['id'],
                                milestone_id: props['milestone'],
                                group_name: props['group_name']
                            });
                        }
                    }
                    if (arrGroupsMilestones.length === 0) {
                        setAlertType('warning');
                        setAlertMessage('No Milestone-Group Junction records found.');
                        console.log('no milestone group junction records found');
                        return;
                    } else {
                        setGroupMilestones(arrGroupsMilestones);
                    }
                })
                .catch(error => {
                    setAlertType('error');
                    setAlertMessage('Failed to load milestone-group junction data.');
                    console.error('Failed to load milestone-group junction data:', error);
                    setGroupMilestones([]);
                    return;
                });
        };

        getGroupMilestoneJunction();
    }, []);


```

This effect hook fires when the modal window opens, and we are querying four tables asynchronously that will pull all WFM Projects, all of the associations between Projects and Groups that will include the Group name information, all of the Milestones, and finally the associations between Groups and Milestones. Once we have retrieved the table data, we choose the properties of interest and store the info in state hook variables as arrays.

Note that once we have the Project data, we `setProjLoading(false);` so as to make the Project selector available for user interaction.

&#8291;
&#8291;
&#8291;

```
    useEffect(() => {
        if (selMilestone && beginTime && endTime) {
            setSliderVisible(true);
        }
    }, [selMilestone, beginTime, endTime]);

```

This effect fire when there is any change in the state hooks for selected Milestone, the slider beginning time, and the slider end time. Once these three hooks are set, the slider visibility is set to true.

&#8291;
&#8291;
&#8291;

```
    useEffect(() => {
        // we want to call the filter for the milestone tickets
        // based on the new Slider date range
        if (beginTime && endTime) {
            filterTickets({ beginTime, endTime });
        }
    }, [beginTime, endTime]);
```

This effect fires when either the beginning time or end time is changed by the user using the slider. Once the new time range is set, the `filterTickets` function is fired.

&#8291;
&#8291;
&#8291;

```

    useEffect(() => {
        if (hullLayer) {
            hullLayer.clear();
        }
        if (pointsLayer) {
            pointsLayer.clear();
        }
        if (milestoneTickets.length > 0) {
            if (filteredTickets.length > 0) {
                mapTickets(filteredTickets);
            } else {
                setAlertType('info');
                setAlertMessage('No tickets meet date range criteria.');
            }
        }
    }, [filteredTickets]);

```

This effect fires when the filteredTickets state hook is updated, which indicates that the existing temporary map layers should be cleared and the `mapTickets` function fired to map the updated set of tickets. Note that before sending the `filteredTickets` off to be mapped we are checking to make sure there is at least one ticket in the array and if not, the appropriate alert message is sent to the user.

&#8291;
&#8291;
&#8291;

```
    useEffect(() => {
        // when the alert message changes
        // we want to display it
        if (alertMessage.length > 0) {
            setIsAlertVisible(true);
        } else {
            setIsAlertVisible(false);
        }
    }, [alertMessage]);


```

The next effect is fired when the `alertMessage` changes. If the alert message has text, it is displayed to the user; if it is zero-length, the alert is hidden.

&#8291;
&#8291;
&#8291;

```
    const getTickets = async idArray => {
        await retrieveMilestoneTickets(idArray);
    };

    // when a milestone is newly selected, retrieve its tickets and tickets of
    // child milestones
    const retrieveMilestoneTickets = async milestoneArray => {
        let arrTickets = [];
        for await (const item of milestoneArray) {
            try {
                const result = await db.getFeaturesByValue(
                    'mywwfm_ticket',
                    'mywwfm_milestone',
                    '=',
                    item.id
                );

                for (const feature in result) {
                    if (result[feature]?.properties) {
                        const ticketObject = result[feature];
                        // add the milestone start and end time to the properties of the ticket myw feature
                        ticketObject.properties.milestone_start = item.startTime;
                        ticketObject.properties.milestone_end = item.endTime;
                        arrTickets.push(ticketObject);
                    }
                }
            } catch (error) {
                etAlertType('error');
                setAlertMessage('Failed to load tickets for milestone.');
                console.error(`Failed to load tickets for milestone ${item.id}:`, error);
                setMilestoneTickets([]);
                return;
            }
        }
        if (arrTickets.length === 0) {
            setMilestoneTickets([]);
            setAlertType('info');
            setAlertMessage('No tickets found for selected milestone(s).');
        } else {
            setMilestoneTickets(arrTickets);
        }
    };
```

-   We have that `getTickets` function to asynchronously call the `retrieveMilestoneTickets` to retrieve ticket data once we have an array of milestones that we iterate through to make database calls to pull tickets based on the id of the milestone.

-   Once we have ticket features, we iterate through them and tack on the start time and end time data from the milestone to which they belong and set those properties as `milestone_start` and `milestone_end`.

-   We add a check to ensure there are actually tickets retrieved associated with the milestone. If none are found, the appropriate alert is sent to the user.

&#8291;
&#8291;
&#8291;

```
    const filterTickets = ({ beginTime, endTime }) => {
        const sliderBegin = dayjs(beginTime);
        const sliderEnd = dayjs(endTime);

        const filtered = milestoneTickets.filter(ticket => {
            const milestoneStart = dayjs(ticket.properties.milestone_start);
            const milestoneEnd = dayjs(ticket.properties.milestone_end);

            return (
                ((milestoneStart.isBefore(sliderBegin) || milestoneStart.isSame(sliderBegin)) &&
                    (milestoneEnd.isAfter(sliderEnd) || milestoneEnd.isSame(sliderEnd))) ||
                ((milestoneStart.isAfter(sliderBegin) || milestoneStart.isSame(sliderBegin)) &&
                    (milestoneEnd.isBefore(sliderEnd) || milestoneEnd.isSame(sliderEnd)))
            );
        });

        setFilteredTickets(filtered);
    };
```

-   The `filterTickets` function takes all of the tickets associated with the selected milestone and filters them based on the begin and end date state hook values that change when the user interacts with the Slider.

-   The `dayjs` library is used to convert to take the date/timestamp and base the comparison on whole days.

&#8291;
&#8291;
&#8291;

```
    const mapTickets = inputTickets => {
        // when a milestone changes we feed in milestone tickets
        // when the slider changes the dates, we feed in the filtered tickets

        const allTicketsQty = inputTickets.length; // total number of input tickets
        let geomTicketsQty = 0; // track number of tickets with geometry
        let geoJSONFeatures = []; // same array of features, but in GeoJSON format
        let turfFeatureCollection = [];

        for (const feature in inputTickets) {
            if (inputTickets[feature]?.geometry) {
                const thisObject = inputTickets[feature];
                const thisGeometry = thisObject.geometry;
                const thisGeometryType = thisGeometry.type;
                const theseCoordinates = thisGeometry.coordinates;

                // for this demo we are only mapping Point geometries and verifying coordinates are supplied
                if (thisGeometryType === 'Point' && theseCoordinates.length > 1) {
                    const ticketId = thisObject.properties.id;
                    const ticketStatus = thisObject.properties.mywwfm_status;

                    pointsLayer.addMywGeoms(thisGeometry, ticketId, ticketStatus);

                    geomTicketsQty += 1;

                    geoJSONFeatures.push(thisObject.asGeoJson());

                    turfFeatureCollection = turf.featureCollection(geoJSONFeatures);
                }
            }
        }

        if (geomTicketsQty > 2) {
            // NOTE: we need at least three point geometries to create a hull polygon
            // create a convex hull using the Turf feature collection
            const ticketConvexHull = turf.convex(turfFeatureCollection);

            //plot on map
            hullLayer.addGeoJSONCollection(ticketConvexHull);
            hullLayer.show();
        }

        // if we have at least one valid geometry, we can plot ticket points
        if (geomTicketsQty > 0) {
            //plot points
            pointsLayer.show();
            setAlertType('success');
            setAlertMessage(
                allTicketsQty.toString() +
                    ' tickets  / ' +
                    geomTicketsQty.toString() +
                    ' ticket Point geoms'
            );
        } else {
            setAlertType('info');
            setAlertMessage(
                allTicketsQty.toString() + ' tickets, but no tickets with Point geometry'
            );
        }
        setIsAlertVisible(true);

        // Calculate bounding box; move map to new set of tickets

        // calculate bounding box coordinates using Turf.js
        const hullBBOX = turf.bbox(turfFeatureCollection);

        // create a myWorld bounding box
        const mywBBOX = myw.latLngBounds(
            myw.latLng(hullBBOX[1], hullBBOX[0]),
            myw.latLng(hullBBOX[3], hullBBOX[2])
        );

        const maxMapZoom = { maxZoom: 13 };
        myw.app.map.fitBounds(mywBBOX, maxMapZoom);
    };
```

The `mapTickets` function is called to create the two temporary map layers: a Point layer representing the individual tickets fed into the function and a Polygon layer which represents the hull encompassing all of the point features. We will be working with geometries using both the standard `myw` library as well as the Turf.js library - which have smany similarities but also subtle differences (e.g. coordinate order).

-   If the selected milestone changes, the tickets associated with that milestone with Point geometries are mapped.
-   If the user changes the begin or end date using the Slider, the filtered tickets are fed to the function to be mapped.
-   Not all tickets have geometry, so we have to make sure we only attempt to map valid geometries, while keeping a count of all tickets `allTicketsQty` and a separate count of tickets with geometry `geomTicketsQty` and include that information in the alert message.
-   To create the ticket Points layer, we using the geometry property of the MyWorld ticket feature object.

    -   We inspect the geometry to ensure it has a geometry type of 'Point'.
    -   We then check that coordinates are present.
    -   If both conditions are met:
        -   We create variables of for ID and status properties.
        -   We add the geometry to the Point layer by calling call `.addMywGeoms` method from the `MapTicketsLayer` class feeding in the geometry, ID, and status.
        -   We increment the count of valid point geometries.
        -   We convert the ticket's MyWorld feature to a GeoJSON feature using the `.asGeoJson()` method and add it to the array of GeoJSON point features.
        -   We create a `turfFeatureCollection` from the array of GeoJSON features.

-   If there three or more point features, we create a bounding hull polygon for the points using the Turf library directly:

    -   A convex hull polygon is created using Turf's `convex` function and feed it the `turfFeatureCollection`
    -   The hull layer is fed into the `.addGeoJSONCollection` method of the `MapTicketsLayer` class.
    -   We `.show` the hull layer by calling the method from the `MapTicketsLayer` class.

-   We then map our ticket features using the `.show` method.
    -   The alert message with the ticket counts is shown, while also handling the scenario where no valid Point geometries are found.
    -   We then calculate a Turf.js bounding box using our `turfFeatureCollection` array.
    -   Then we create a `myw` bounds object using the coordinates of the Turf.js bounding box.
    -   We use the map's `fitBounds` method to "zoom to" the extent of the `myw` bounds object.

&#8291;
&#8291;
&#8291;

```
    const determineGroups = async proj_value => {
        let selectGroups = [];

        // filter groups by project id passed in after Project is selected
        const thisProjectGroups = projGroups.filter(function (arr) {
            return arr.project === proj_value;
        });

        if (thisProjectGroups.length > 0) {
            thisProjectGroups.forEach(item => {
                selectGroups.push({
                    value: item.id,
                    label: item.group_name
                });
            });

            if (selectGroups.length > 0) {
                setSelProjGroups(selectGroups);
                setGroupLoading(false);
            } else {
                setAlertType('warning');
                setAlertMessage('No groups found for this project.');
                setSelProjGroups([]);
            }
        }
    };

```

The `determineGroups` function takes in the ID of the chosen project and filters the records in the projGroups state hooks to create an array of groups associated with the chosen project that feeds the Groups drop-down selector in the modal window. Note we're setting `setGroupLoading(false)` when done to make the selector available for user interaction. If no Groups are found for the chosen Project, we alert the user appropriately.

&#8291;
&#8291;
&#8291;

```
    const determineMilestones = async groupName => {
        // filter milestone - group junction by group name
        const groupFilteredMilestones = groupMilestones.filter(function (arr) {
            return arr.group_name === groupName;
        });

        // filter milestones by project
        const projFilteredMilestones = allMilestones.filter(function (arr) {
            const thisProjIdString = selProjectId.toString(); // project id is stored as a string in the milestones table
            return arr.proj_id === thisProjIdString;
        });

        // performing an inner join between Milestones-Filtered-by-Group and Milestones-Filtered-by-Project
        const map = new Map(groupFilteredMilestones.map(item => [item.milestone_id, item]));
        const joinedMilestoneArray = projFilteredMilestones
            .filter(item => map.has(item.milestone_id))
            .map(item => ({
                ...map.get(item.milestone_id),
                ...item
            }));

        // sort joinedArray - by parent_id and then prior_sibling_id with nulls first
        const sortedMilestones = sortMilestones(joinedMilestoneArray);

        setProjGroupMilestones(sortedMilestones);

        let arrSelMilestones = [];

        // only put top-level Milestones in the dropdown
        sortedMilestones.forEach(item => {
            if (item.parent_id === null) {
                arrSelMilestones.push({
                    value: item.milestone_id,
                    label: item.name
                });
            }
        });

        if (arrSelMilestones.length > 0) {
            setSelGroupMilestones(arrSelMilestones);
            setMilestoneLoading(false);
            setMilestoneDisabled(false);
        } else {
            setAlertType('warning');
            setAlertMessage('No milestones found for chosen Project and Group.');
            setSelGroupMilestones([]);
            setMilestoneDisabled(true);
        }
        return joinedMilestoneArray;
    };
```

The `determineMilestones` function performs two filters and a join in order to create an array of parent milestones that will feed the selector element for Milestones.

-   First, given the inputted group name, we filter against the group-milestone junction state hook array.
-   Secondly, we filter the state hook array containing all of the Milestones using the ID of the selected project
-   Then we "join" the array of Milestones filtered by Groups with the Milestones filtered by Milestones to get a single set of milestones associated with the chosen Project and Group with no duplicates.
-   We send this array of milestones to the `sortMilestones` function will be explained below.
-   Finally, we iterate through the milestones and choose only those with a null parent_id to populate the selector dropdown.
    -   If no Milestones are found, we alert the user.

&#8291;
&#8291;
&#8291;

```
    const selectableTest = async () => {
        const ticketLayerId = 'Ticket Clusters'; // the tickets Layer name defined in the Configuration
        const ticketLayer = myw.app.map.layerManager.getLayer(ticketLayerId);
        if (ticketLayer == null) {
            setSelectableMessage('No Layer with ID= "' + ticketLayerId + '" found - check Config');
            setSelectableType('error');
            setIsSelectableAlertVisible(true);
            setTimeout(() => {
                setIsSelectableAlertVisible(false);
            }, 4000);
        } else {
            const ticketCode = ticketLayer.layerDef.code;
            const ticketDisplayName = ticketLayer.layerDef.display_name;

            const layersOn = myw.app.map.layerManager.getCurrentLayerIds(); // returns array of layer codes
            if (layersOn.includes(ticketCode)) {
                setSelectableMessage('Tickets are selectable');
                setSelectableType('success');
                setIsSelectableAlertVisible(true);
                setTimeout(() => {
                    setIsSelectableAlertVisible(false);
                }, 4000);
            } else {
                setSelectableMessage(
                    'Tickets are not selectable. The layer "' +
                        ticketDisplayName +
                        '" needs to be checked on.'
                );
                setSelectableType('warning');
                setIsSelectableAlertVisible(true);
                setTimeout(() => {
                    setIsSelectableAlertVisible(false);
                }, 4000);
            }
        }
    };


```

The `selectableTest` function determines if the map has been configured with a WFM Tickets layer and if that layer is currently toggled on. If so, the user can click on the temporary layer ticket points, and the underlying tickets of the pre-configured layer will be "selected". If the layer is toggled off, the user will be notified.

The key is that the `ticketLayerId` be set to the proper name of the WFM Tickets layer found in the Configuration. In this demonstration, the layer is named "Ticket Clusters"--but each application setup may name their layers differently.

We then use the `layerManager` object to verify that the Tickets layer is part of the current map. If not, then the user is notified.

If the layer is part of the map, we set up variables for the layer code and the layer display name. Then we call the `.getCurrentLayerIds` method to determine which layers are toggled on and if the array includes the layer code for the Tickets layer. If so, the user is informed that the points on the temporary layer are "selectable". If the Tickets layer is currently toggled off, the user is informed as well using the display name of the layer.

&#8291;
&#8291;
&#8291;

```
    const depthSearchMilestones = async parentId => {
        const result = [];
        // populate the parent first in the result array
        const original_parent = allMilestones.filter(item => item.milestone_id === parentId);
        result.push({
            id: original_parent[0].milestone_id,
            startTime: original_parent[0].planned_start_datetime,
            endTime: original_parent[0].planned_end_datetime
        });

        // start time and end time of parent milestone *should* encompass date ranges
        // of all descendant milestones
        setBeginTime(original_parent[0].planned_start_datetime);
        setEndTime(original_parent[0].planned_end_datetime);

        // start searching descendants
        function searchRecursive(currentParentId) {
            // Find all direct children
            const children = allMilestones.filter(
                item => item.parent_id === currentParentId.toString()
            );

            // Add children to result and search their descendants
            children.forEach(child => {
                result.push({
                    id: child.milestone_id,
                    startTime: child.planned_start_datetime,
                    endTime: child.planned_end_datetime
                });
                searchRecursive(child.milestone_id);
            });
        }

        searchRecursive(parentId);
        getTickets(result);
    };
```

A milestone can have multiple levels or "generations" of child milestones. We have set up a recursive depth search that takes a milestone ID and looks for that value in the `parent_id` property of the `allMilestones` object. For each milestone that meets this condition, we add its ID to an array along with its `planned_start_datetime` and `planned_end_datetime`. Note that while the ID has a numeric data type, the `parent_id` data type is a string, hence our use of the `.toString()` function when testing equivalence.

Once we have a `result` array of parent and descendant milestones, we send it to the `getTickets` function.

&#8291;
&#8291;
&#8291;

```
    const getTimestamps = chosen_milestone_id => {
        const chosenMilestone = allMilestones.filter(function (arr) {
            return arr.milestone_id === chosen_milestone_id;
        });
        const startTime = chosenMilestone[0].planned_start_datetime;
        const endTime = chosenMilestone[0].planned_end_datetime;

        setBeginTime(startTime);
        setEndTime(endTime);

        // Set the slider range (with padding) - only changes when milestone changes
        setSliderMinTime(dayjs(startTime).subtract(3, 'days').valueOf());
        setSliderMaxTime(dayjs(endTime).add(3, 'days').valueOf());
    };

```

The date range of a parent milestone will encompass the date ranges of all child milestones, so when a milestone is chosen by the user, we call the `getTimestamps` function to use its `planned_start_datetime` and `planned_end_datetime` to set the limits of for the time slider.

Note that we are building a buffer of three days on either end with the `setSliderMinTime` and `setSliderMaxTime` for a more user-friendly display while mainting the true start and end dates in the `beginTime` and `endTime` state hook variables.

&#8291;
&#8291;
&#8291;

```
    // creating the Select widget and populating it with available Projects
    const renderProject = () => {
        if (projLoading || allProjects.length < 1) {
            return null;
        } else {
            return (
                <Select
                    loading={projLoading}
                    placeholder="please select a Project"
                    options={allProjects}
                    onChange={onProjectSelected}
                />
            );
        }
    };

    const renderGroups = () => {
        return (
            <Select
                loading={groupLoading}
                placeholder="please select a Group"
                options={selProjGroups}
                onChange={onGroupSelected}
                value={selGroup}
                disabled={groupDisabled}
            />
        );
    };

    const renderMilestone = () => {
        return (
            <Select
                loading={milestoneLoading}
                placeholder="please select a Milestone"
                options={selGroupMilestones}
                onChange={onMilestoneSelected}
                value={selMilestone}
                disabled={milestoneDisabled}
            />
        );
    };


```

The `renderProject`, `renderGroups`, and `renderMilestone` functions return the Select elements for display in the modal with the properties being set to state hook variables so when as selections are made the elements display correctly.

&#8291;
&#8291;
&#8291;

```
    const renderSlider = () => {
        if (!beginTime || !endTime || !sliderMinTime || !sliderMaxTime) {
            return null;
        }
        const sliderStartTime = dayjs(beginTime).valueOf();
        const sliderEndTime = dayjs(endTime).valueOf();
        const marks = generateDailyMarks(sliderStartTime, sliderEndTime);
        return (
            <TimeRangeSlider
                key={selMilestone}
                initialStartTime={beginTime} // Current selection
                initialEndTime={endTime} // Current selection
                sliderMinTime={sliderMinTime} // Fixed slider range
                sliderMaxTime={sliderMaxTime} // Fixed slider range
                onChange={handleTimeRangeChange}
                marks={marks}
            />
        );
    };



```

The `renderSlider` function returns that Slider UI element that is based on the imported `TimeRangeSlider` class described in more detail below.

Note that we are tracking two sets of dates so when `beginTime` and `endTime` change as the user interacts with the slider, the slider's date scale does not change because `sliderMinTime` and `sliderMaxTime` will remain constant until a new milestone is selected.

&#8291;
&#8291;
&#8291;

```
    const renderSelectableLegend = () => {
        return (
            <div>
                <span>
                    <Button key="ok" onClick={selectableTest} type="primary">
                        Check Selectability
                    </Button>
                </span>
                <span>
                    {' '}
                    {isSelectableAlertVisible && (
                        <div>
                            <Alert message={selectableMessage} type={selectableType} />
                        </div>
                    )}
                </span>
                <br />
                <br />
                <span>
                    <img src={ticketLegend} alt="Ticket Legend" />
                </span>
            </div>
        );
    };

```

The `renderSelectableLegend` function renders the button/message elements associated with the "selectability" functionality described above in the description of the `selectableTest` function. In addition, we are rendering an image of the map legend describing the point symbology.

&#8291;
&#8291;
&#8291;

```
    const generateDailyMarks = (startTime, endTime) => {
        const marks = {};
        const startDate = dayjs(startTime).startOf('day');
        const endDate = dayjs(endTime).startOf('day');
        const totalDays = endDate.diff(startDate, 'day');

        for (let i = 0; i <= totalDays; i++) {
            const currentDate = startDate.add(i, 'day');
            const timestamp = currentDate.valueOf();

            marks[timestamp] = ' '; // no labels
        }

        return marks;
    };


```

The `generateDailyMarks` functions creates tick marks on the slider that represent whole days when called by the `renderSlider` function.

&#8291;
&#8291;
&#8291;

```
    const onProjectSelected = (value, option) => {
        setSelProjectId(value);

        determineGroups(value);
        setGroupDisabled(false);
        setSelGroup(null);
        setIsAlertVisible(false);

        setSelMilestone(null);
        setMilestoneDisabled(true);
        setSliderVisible(false);
    };

    const onGroupSelected = (value, option) => {
        setAlertType('');
        setAlertMessage('');
        setSelMilestone(null);
        setMilestoneDisabled(true);
        determineMilestones(option.label);
        setSelGroup(value);
        setSliderVisible(false);
    };

    const onMilestoneSelected = (value, option) => {
        setAlertType('');
        setAlertMessage('');
        setSliderVisible(false);
        setSelMilestone(value);
        depthSearchMilestones(value);
        getTimestamps(value);
    };

```

-   `onProjectSelected` is called when a Project is chosen by the user.
    -   various state hooks are set and the `determineGroups` function is called.
-   Similarly, `onGroupSelected` is called when a Group is chosen by the user.
    -   various state hooks are set and the `determineMilestones` function is called.
-   `onMilestoneSelected` is called when the user chooses a Milestone.
    -   two state hooks are set, and the `depthSearchMilestones` and `getTimestamps` functions are called.

&#8291;
&#8291;
&#8291;

```
    const handleTimeRangeChange = ({ startTime, endTime }) => {
        setBeginTime(startTime);
        setEndTime(endTime);
    };

    const handleCancel = () => {
        setIsOpen(false);
        hullLayer.hide();
        pointsLayer.hide();
    };

    const hideIntro = () => {
        setShowIntro(false);
    };

```

-   `handleTimeRangeChange` is called by the Slider itself whenever there is a change from user interaction.
-   `handleCancel` is called when the Cancel button is pressed or the modal window is manually pressed.
    -   Note that the temporary map layers are removed from the map.
-   `hideIntro` hides the introductory text.

&#8291;
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
            footer={
                showIntro
                    ? [
                          <Button key="ok" onClick={hideIntro} type="primary">
                              Next
                          </Button>
                      ]
                    : [
                          <Button key="cancel" onClick={handleCancel}>
                              Cancel
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>
                    <p>
                        In this sample we are showing how to create a temporary map layer of tickets associated with
                        a Milestone and all of its descendant milestones.
                    </p>
                </div>
            ) : (
                <div>
                    Choose a Project:
                    {renderProject()}
                    <br />
                    <br />
                    Choose a Group associated with Project:
                    {renderGroups()}
                    <br />
                    <br />
                    Choose a Top-Level Milestone associated with Group:
                    {renderMilestone()}
                    <br />
                    <br />
                    {isAlertVisible && (
                        <div>
                            <Alert message={alertMessage} type="success" />
                        </div>
                    )}
                    <br />
                    {sliderVisible && renderSlider()}
                    <br />
                    <br />
                    {sliderVisible && renderSelectableLegend()}
                </div>
            )}
        </DraggableModal>
    );
};

```

Finally, we return the rendering of the modal window itself. After setting up basic properties, we have the footer HTML with two buttons. In the main body of the modal we have:

-   `{renderProject()}` is generating the Select widget with the list of available Projects.
-   `{renderGroups()}` is generating the Select widget with the list of available Groups given the selected Project.
-   `{renderMilestone()}` is generating the Select widget with the list of available Milestones given the selected Project and selected Group.
-   an Alert message whose visibility is controlled by the `isAlertVisible` state hook.
-   `renderSlider()` whose visibility is controlled by the `sliderVisible` state hook.
-   `renderSelectableLegend()` whose visibility is also controlled by the `slideVisible` state hook.

    &#8291;
    &#8291;
    &#8291;
    &#8291;

### mapTicketsLayer.js

This file contains the `MapTicketsLayer` class of helper functions based on [the GeoJSONVectorLayer class](https://docs.iqgeo.com/Applications/Platform/7.4/en/JSApiDoc/module-layers_geoJSONVectorLayer.GeoJSONVectorLayer.html) that are called from the `milestoneMapModal.js` file.

&#8291;
&#8291;
&#8291;

```

import myw, { GeoJSONVectorLayer, LineStyle, FillStyle, SymbolStyle } from 'myWorld-client';

```

A concise import line of the myworld library and the mapping related classes that we will be using.

&#8291;
&#8291;
&#8291;

```
class MapTicketsLayer {
    constructor(app) {
        this.app = myw.app;

        this.layer = new GeoJSONVectorLayer({ zindex: 1000 });

        this.polygonStyle = new FillStyle({
            color: '#ff77ff',
            opacity: 0.45
        });
        this.pointStyles = {
            Open: new SymbolStyle({
                symbol: 'circle',
                size: '20',
                sizeUnit: 'px',
                borderColor: '#0c6404ff',
                color: '#7ada96ff'
            }),
            Closed: new SymbolStyle({
                symbol: 'circle',
                size: '20',
                sizeUnit: 'px',
                borderColor: '#121212ff',
                color: '#abaaaeff'
            }),
            DEFAULT: new SymbolStyle({
                symbol: 'circle',
                size: '20',
                sizeUnit: 'px',
                borderColor: '#ffe91fff',
                color: '#8633f4ff'
            })
        };
    }
```

The constructor instantiates a new copy of the `GeoJSONVectorLayer` class and assigns a z-value of 1000 to ensure the temporary map layers will be displayed over top of the normal map layers.

Custom styling properties for a polygon feature are declared, and will be subsequently applied below to the hull polygon.

We are also setting up a `pointStyles` object with three distinct styles, one of which we will assign based on each ticket's status:

-   Open
-   Closed
-   and everything else with a status that is neither 'Open' or 'Closed', designated here as 'DEFAULT'.

&#8291;
&#8291;
&#8291;

```
    show() {
        this.layer.setMap(this.app.map);
    }

    hide() {
        this.layer.setMap(null);
        this.layer.clear();
        this.app.map.removeLayer(this.layer);
    }

    clear() {
        this.layer.clear();
    }

```

&#8291;
&#8291;
&#8291;

-   `show()`, `hide()`, and `clear()` functions control the display of a temporary layer on the map.

&#8291;
&#8291;
&#8291;

```
    addMywGeoms(mywGeom, ticket_id, ticket_status) {
        // assign point style based on ticket status
        const currentPointStyle = this.pointStyles[ticket_status] || this.pointStyles['DEFAULT'];
        const tooltipText = ticket_id + '<br>' + ticket_status;

        const map_feature = this.layer.addGeom(mywGeom, currentPointStyle);
        map_feature.bindTooltip(tooltipText);
    }

```

The `addMywGeoms` shows how to add a MyWorld geometry to the temporary layer and apply custom styling based on a property value of `ticket_status`. In addition we are creating a tool tip that will show the ticket ID and ticket status on mouseover. The `.addGeom` method adds the myWorld ticket geometry and its style to the temporary point layer and the `.bindTooltip` method associates the tooltip text with the newly added `map_feature`.

&#8291;
&#8291;
&#8291;

```
    addGeoJSONCollection(geoJSONCollection) {
        this.layer.addGeoJSON(geoJSONCollection, this.polygonStyle);
    }

```

By contrast, the `addGeoJSONCollection` takes a collection of features in the GeoJSON format and adds them to a temporary map layer. In this case we are feeding in a geoJSONCollection representing the hull polygon and using the `polygonStyle` created in the constructor.

&#8291;
&#8291;
&#8291;

```
    removeFeature(feature) {
        this.layer.removeFeature(feature);
    }
}
export default MapTicketsLayer;


```

-   the `removeFeature` function allows one to remove individual features from the temporary map layer. Not used by our tool.
-   finally, we export the class

&#8291;
&#8291;
&#8291;

### timeRangeSlider.js

This script contains the `TimeRangeSlider` class which provides the logic for the interactive Slider component when imported by the `milestoneMapModal.js` script.

```
import React, { useState } from 'react';
import { Slider, Typography, Space } from 'antd';
import dayjs from 'dayjs';


```

Note that the imports are all from libraries already present in the IQGeo environment.
&#8291;
&#8291;
&#8291;

```
const TimeRangeSlider = ({
    initialStartTime,
    initialEndTime,
    sliderMinTime,
    sliderMaxTime,
    onChange,
    marks
}) => {
    // Convert initial timestamps to dayjs objects
    const sliderMinTimestamp =
        sliderMinTime || dayjs(initialStartTime).subtract(3, 'days').valueOf();
    const sliderMaxTimestamp = sliderMaxTime || dayjs(initialEndTime).add(3, 'days').valueOf();

    // State to hold the current selected range in milliseconds
    const [currentRange, setCurrentRange] = useState([initialStartTime, initialEndTime]);


```

The `TimeRangeSlider` will reference a variety of parameters. Recall that `sliderMinTime` and `sliderMaxTime` need to be implemented so that the date range of the slider remains constant as they adjust the start and end dates on the slider for a given milestone. Note too that a buffer of three days is being added to both ends of the static range to make it more user friendly.

A state hook is being used to store the current date range.

&#8291;
&#8291;
&#8291;

```
    // Handle slider value changes
    const handleSliderChange = value => {
        setCurrentRange(value);
    };

    // Handle slider value changes
    const handleSliderChange = value => {
        setCurrentRange(value);
    };

    // Handle slider release (afterChange) to trigger the parent's onChange
    const handleAfterChange = value => {
        if (onChange) {
            onChange({
                startTime: dayjs(value[0]).toISOString(),
                endTime: dayjs(value[1]).toISOString()
            });
        }
    };

    // Format the timestamp for display
    const formatTimestamp = timestamp => {
        return dayjs(timestamp).format('YYYY-MM-DD');
    };

```

Functions to handle the basics of slider behavior. Note that slider date/times are stored in milliseconds and then converted to more user-friendly formatted strings.

&#8291;
&#8291;
&#8291;

```
    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Text>Selected Range:</Text>
            <Text strong>
                {formatTimestamp(currentRange[0])} - {formatTimestamp(currentRange[1])}
            </Text>
            <Slider
                range
                min={sliderMinTimestamp}
                max={sliderMaxTimestamp}
                value={currentRange}
                onChange={handleSliderChange}
                marks={marks}
                step={86400000} // 1 day in milliseconds (optional, for snapping to days)
                onChangeComplete={handleAfterChange}
                tipFormatter={formatTimestamp} // Format tooltip values
            />
        </Space>
    );
};

export default TimeRangeSlider;


```

The element itself is defined with the appropriate properties and exported.

&#8291;
&#8291;
&#8291;

### milestoneMapFunctions.js

This script contains a single "vanilla" ES6 function to sort arrays. It was put in a separate script to declutter the `milestoneMapModal.js` script into which it is imported.

```
export const sortMilestones = array => {
    // Create a copy to avoid mutating the original array (best practice).
    const sortedArray = [...array];

    sortedArray.sort((a, b) => {
        // Helper function to safely convert a value to an integer.
        const toInt = value => (value === null || value === undefined ? null : parseInt(value, 10));

        // Compare by project_id (numeric, ascending)
        const projectIdA = toInt(a.project_id);
        const projectIdB = toInt(b.project_id);
        if (projectIdA !== projectIdB) {
            return projectIdA - projectIdB;
        }

        // Compare by parent_id (numeric, nulls first)
        const parentIdA = toInt(a.parent_id);
        const parentIdB = toInt(b.parent_id);
        if (parentIdA !== parentIdB) {
            // Logic for nulls first:
            // If a.parent_id is null, it comes first (-1).
            if (parentIdA === null) return -1;
            // If b.parent_id is null, it comes first (1).
            if (parentIdB === null) return 1;
            // Both are non-null, so compare them numerically.
            return parentIdA - parentIdB;
        }

        // Compare by prior_sibling_id (numeric, nulls first)
        const priorSiblingIdA = toInt(a.prior_sibling_id);
        const priorSiblingIdB = toInt(b.prior_sibling_id);
        if (priorSiblingIdA !== priorSiblingIdB) {
            // Logic for nulls first:
            // If a.prior_sibling_id is null, it comes first (-1).
            if (priorSiblingIdA === null) return -1;
            // If b.prior_sibling_id is null, it comes first (1).
            if (priorSiblingIdB === null) return 1;
            // Both are non-null, so compare them numerically.
            return priorSiblingIdA - priorSiblingIdB;
        }

        // If all properties are equal, maintain the original order.
        return 0;
    });

    return sortedArray;
};
```

There are no imports -- this is a pure ES6 script to sort the milestones array by project ID, parent_id, and prior_sibling_id with the key that null values are sorted first. This ensures that "parent" milestones will all be at the beginning of the array and make sanity-checking the depth search function a bit easier.
