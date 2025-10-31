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

This sample enables to user to map tickets associated with specific WFM Milestones associated with a user-selected Project and Group. The tool includes a time slider to permit visualizing tickets that fall within the user-selected range of their milestones' planned beginning and end dates

&#8291;
&#8291;

## Tool files

-   `milestoneMapPlugin.js` - The Configuration file for the Plugin
-   `milestoneMapModal.js` - The file containing the React code used to render the modal window
-   `mapTicketsLayer.js` - The file containing the class used to create and manage the temporary map layers
-   `timeRangeSlider.js` - The file containing the Slider component
-   `milestoneMapFunctions.js` - The class containing the support functions for the Modal code

All files are located in the `modules/utils_devrel_samples/public/js/Samples/WFM_NMT_Milestone_Map_Widget` folder

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

import TimeRangeSlider from './timeRangeSlider.js';
import dayjs from 'dayjs';

import MapTicketsLayer from './mapTicketsLayer.js';
import * as turf from '@turf/turf';

import { sortMilestones } from './milestoneMapFunctions.js';
```

A series of import statements begins the script. The familiar `myw`library as well as `React`. Note that we are importing state and effect hooks for React as well.

Localization will be done via the `useLocale` import, while some UI elements are being imported from both the `myWorld-client` library as well as the third-party `Antd` library.

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
    const [isAlertVisible, setIsAlertVisible] = useState(false);

    // slider hooks
    const [sliderVisible, setSliderVisible] = useState(false);
    const [beginTime, setBeginTime] = useState('');
    const [endTime, setEndTime] = useState('');

    const [sliderMinTime, setSliderMinTime] = useState(null);
    const [sliderMaxTime, setSliderMaxTime] = useState(null);
```

More state hooks related to our alert message as well as the variables pertinent to our Slider component

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
        // -- Project/Group Crosswalk - mywwfm_project_group_junction - provides Group info
        // -- Milestones - mywwfm_milestones
        // -- Group/Milestone Crosswalk - mywwfm_milestone_group_junction

        const listProjects = async () => {
            let arrProjects = [];
            db.getFeatures('mywwfm_project')
                .then(result2 => {
                    for (const feature in result2) {
                        if (result2[feature]?.properties) {
                            const props = result2[feature]?.properties;
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
                    setAllProjects(arrProjects);
                })
                .catch(error => {
                    console.error('Failed to load projects:', error);
                    setAllProjects([]);
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
                .then(result3 => {
                    for (const group in result3) {
                        if (result3[group]?.properties) {
                            const props2 = result3[group]?.properties;

                            arrGroupsProjects.push(props2);
                        }
                    }
                    setProjGroups(arrGroupsProjects);
                })
                .catch(error => {
                    console.error('Failed to load project-group junction data:', error);
                    setProjGroups([]);
                });
        };

        getProjGroupJunction();

        // load all Milestones -- optimize later
        const listMilestones = async () => {
            let arrMilestones = [];
            db.getFeatures('mywwfm_milestone')
                .then(result4 => {
                    for (const feature in result4) {
                        if (result4[feature]?.properties) {
                            const props = result4[feature]?.properties;

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
                    setAllMilestones(arrMilestones);
                })
                .catch(error => {
                    console.error('Failed to load milestone data:', error);
                    setAllMilestones([]);
                });
        };
        listMilestones();

        // load all Group - Milestones associations into groupMilestones state hook
        const getGroupMilestoneJunction = async () => {
            let arrGroupsMilestones = [];
            db.getFeatures('mywwfm_milestone_group_junction')
                .then(result5 => {
                    for (const feature in result5) {
                        if (result5[feature]?.properties) {
                            const props = result5[feature]?.properties;

                            arrGroupsMilestones.push({
                                junction_id: props['id'],
                                milestone_id: props['milestone'],
                                group_name: props['group_name']
                            });
                        }
                    }
                    setGroupMilestones(arrGroupsMilestones);
                })
                .catch(error => {
                    console.error('Failed to load milestone-group junction data:', error);
                    setGroupMilestones([]);
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
        if (filteredTickets.length > 0) {
            mapTickets(filteredTickets);
        }
    }, [filteredTickets]);

```

This effect fires when the filteredTickets state hook is updated, which indicates that the existing temporary map layers should be cleared and the `mapTickets` function fired to map the updated set of tickets.

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
                console.error('Failed to load tickets for milestone ${item.id}:', error);
            }
        }

        setMilestoneTickets(arrTickets);
    };
```

-   We have that `getTickets` function to asynchronously call the `retrieveMilestoneTickets` to retrieve ticket data once we have an array of milestones that we iterate through to make database calls to pull tickets based on the id of the milestone.

-   Once we have ticket features, we iterate through them and tack on the start time and end time data from the milestone to which they belong and set those properties as `milestone_start` and `milestone_end`.

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
                (milestoneStart.isAfter(sliderBegin) || milestoneStart.isSame(sliderBegin)) &&
                (milestoneEnd.isBefore(sliderEnd) || milestoneEnd.isSame(sliderEnd))
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

        for (const feature in inputTickets) {
            if (inputTickets[feature]?.geometry) {
                const thisObject = inputTickets[feature];
                const thisGeometry = thisObject.geometry;

                const tooltipText =
                    thisObject.properties.id + '<br>' + thisObject.properties.mywwfm_status;

                pointsLayer.addMywGeoms(thisGeometry, tooltipText);

                geomTicketsQty += 1;

                if (thisGeometry) {
                    geoJSONFeatures.push(thisObject.asGeoJson());
                }
            }
        }

        // if we have at least one valid geometry, plot on map
        if (geomTicketsQty > 0) {
            // make array of GeoJSON features into a proper Feature Collection
            const turfFeatureCollection = turf.featureCollection(geoJSONFeatures);

            // create a convex hull using the Turf feature collection
            const ticketConvexHull = turf.convex(turfFeatureCollection);

            // calculate bounding box coordinates using Turf.js
            const hullBBOX = turf.bbox(ticketConvexHull);

            //plot on map
            hullLayer.addGeoJSONCollection(ticketConvexHull);
            hullLayer.show();

            //plot points
            pointsLayer.show();

            setAlertMessage(
                allTicketsQty.toString() +
                    ' tickets ' +
                    ' / ' +
                    geomTicketsQty.toString() +
                    ' ticket geoms'
            );
        } else {
            setAlertMessage('No tickets in date range');
        }
        setIsAlertVisible(true);
    };
```

The `mapTickets` function is called to create the two temporary map layers: a Point layer representing the individual tickets fed into the function and a Polygon layer which represents the hull encompassing all of the point features.

-   If the selected milestone changes, the tickets associated with that milestone are mapped.
-   If the user changes the begin or end date using the Slider, the filtered tickets are fed to the function to be mapped.
-   Not all tickets have geometry, so we have to make sure we only attempt to map valid geometries, while keeping a count of all tickets `allTicketsQty` and a separate count of tickets with geometry `geomTicketsQty` and include that information in the alert message.
-   To create the ticket Points layer, we using the geometry property of the MyWorld ticket feature object. In addition we are creating a tooltip by combining the text of the ticket ID and the ticket status. For each ticket with geometry, we call `.addMywGeoms` method from the `MapTicketsLayer` class feeding in the geometry and the tooltip text.
-   To create the hull polygon, we are using a different technique altogether using the Turf library.
    -   We convert the ticket's MyWorld feature to a GeoJSON feature using the `.asGeoJson()` method.
    -   We take this array of GeoJSON features and create a proper GeoJSON feature collection using Turf's `.featureCollection` function.
    -   A convex hull polygon is created using Turf's `convex` function.
    -   the hull layer is fed into the `.addGeoJSONCollection` method of the `MapTicketsLayer` class.
-   We `.show` both layers by calling the method from the `MapTicketsLayer` class.
-   The alert message with the ticket counts is shown.

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

            setSelProjGroups(selectGroups);

            setGroupLoading(false);
        }
    };

```

The `determineGroups` function takes in the ID of the chosen project and filters the records in the projGroups state hooks to create an array of groups associated with the chosen project that feeds the Groups drop-down selector in the modal window. Note we're setting `setGroupLoading(false)` when done to make the selector available for user interaction.

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

        // sort joinedArray
        setProjGroupMilestones(sortMilestones(joinedMilestoneArray));

        let arrSelMilestones = [];

        // only put top-level Milestones in the dropdown
        joinedMilestoneArray.forEach(item => {
            if (item.parent_id === null) {
                arrSelMilestones.push({
                    value: item.milestone_id,
                    label: item.name
                });
            }
        });
        setSelGroupMilestones(arrSelMilestones);
        setMilestoneLoading(false);
        return joinedMilestoneArray;
    };

```

The `determineMilestones` function performs two filters and a join in order to create an array of parent milestones that will feed the selector element for Milestones.

-   First, given the inputted group name, we filter against the group-milestone junction state hook array.
-   Secondly, we filter the state hook array containing all of the Milestones using the ID of the selected project
-   Then we "join" the array of Milestones filtered by Groups with the Milestones filtered by Milestones to get a single set of milestones associated with the chosen Project and Group with no duplicates.
-   We send this array of milestones to the `sortMilestones` function will be explained below.
-   Finally, we iterate through the milestones and choose only those with a null parent_id to populate the selector dropdown.

&#8291;
&#8291;
&#8291;

```
    const depthSearchMilestones = async parent_id => {
        // the array of Milestones objects with id, planned start date, planned end date
        let arrSubMilestones = [];

        // get the planned start and end time of the parent milestone
        // (which will span the date ranges of the child milestones)
        const parentMilestone = allMilestones.filter(function (arr) {
            return arr.milestone_id === parent_id;
        });
        setBeginTime(parentMilestone[0].planned_start_datetime);
        setEndTime(parentMilestone[0].planned_end_datetime);

        // push top-level milestone to array
        arrSubMilestones.push({
            id: parentMilestone[0].milestone_id,
            startTime: parentMilestone[0].planned_start_datetime,
            endTime: parentMilestone[0].planned_end_datetime
        });

        // retrieve child milestones
        const firstLevelSub = projGroupMilestones.filter(function (arr) {
            const topMilestoneId = parent_id.toString(); // project id is stored as a string in the milestones table
            return arr.parent_id === topMilestoneId;
        });
        firstLevelSub.forEach(item => {
            arrSubMilestones.push({
                id: item.milestone_id,
                startTime: item.planned_start_datetime,
                endTime: item.planned_end_datetime
            });
        });

        getTickets(arrSubMilestones);
    };
```

A milestone can have multiple levels or "generations" of child milestones. For Version 1, we are only doing a search of one level of child milestones. For each milestone, we add its ID to an array along with its `planned_start_datetime` and `planned_end_datetime`.

Once we have an array of parent and child milestones, we send it to the `getTickets` function.

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
        setSelMilestone(null);
        setMilestoneDisabled(true);
        determineMilestones(option.label);
        setSelGroup(value);
        setMilestoneDisabled(false);
        setIsAlertVisible(false);
        setSliderVisible(false);
    };

    const onMilestoneSelected = (value, option) => {
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
                        In this sample we are showing how to create a map of tickets associated with
                        a Milestone
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

        this.layer = new GeoJSONVectorLayer({ zindex: 100 });

        this.lineStyle = new LineStyle({ width: 4, color: '#efa316dd' });

        this.polygonStyle = new FillStyle({
            color: '#ff77ff',
            opacity: 0.35
        });

        this.pointStyle = new SymbolStyle({
            symbol: 'circle',
            size: '20',
            sizeUnit: 'px',
            borderColor: '#ffe91fff',
            color: '#9c66e6ff'
        });
    }

```

The constructor instantiates a new copy of the `GeoJSONVectorLayer` class and assigns a z-value of 100 to ensure the temporary map layers will be displayed over top of the normal map layers.

Custom styling properties are declared that will define how are layers will be displayed.

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

-   `show()`, `hide()`, and `clear()` functions control the display of the temporary layer on the map

&#8291;
&#8291;
&#8291;

```
    addMywGeoms(mywGeom, tooltipText) {
        const map_feature = this.layer.addGeom(mywGeom, this.pointStyle);
        map_feature.bindTooltip(tooltipText);
    }

    addGeoJSONCollection(geoJSONCollection) {
        this.layer.addGeoJSON(geoJSONCollection, this.polygonStyle);
    }

```

-   `addMywGeoms` adds a MyWorld geometry and its tooltip text to a map layer
-   by contrast, the `addGeoJSONCollection` takes a collection of features in the GeoJSON format and adds them to the map.

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
