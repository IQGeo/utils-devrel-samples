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

export const MilestoneMapModal = ({ open }) => {
    const [db] = useState(myw.app.database);

    const { msg } = useLocale('mapWidgetModal');
    const [isOpen, setIsOpen] = useState(open);

    const [hullLayer] = useState(() => new MapTicketsLayer());
    const [pointsLayer] = useState(() => new MapTicketsLayer());

    const [showIntro, setShowIntro] = useState(false);

    // alert message
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = useState(false);

    // slider hooks
    const [sliderVisible, setSliderVisible] = useState(false);
    const [beginTime, setBeginTime] = useState('');
    const [endTime, setEndTime] = useState('');

    const [sliderMinTime, setSliderMinTime] = useState(null);
    const [sliderMaxTime, setSliderMaxTime] = useState(null);

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

    // when the tickets associated with a milestone are retrieved from the database
    // they are stored in the state hook 'milestoneTickets'
    useEffect(() => {
        // milestone has changed - map milestoneTickets
        if (hullLayer) {
            hullLayer.clear();
        }
        if (pointsLayer) {
            pointsLayer.clear();
        }

        if (milestoneTickets.length > 0) {
            mapTickets(milestoneTickets);
        }
    }, [milestoneTickets]);

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
                        setAlertMessage('No projects found.');
                        return;
                    } else {
                        setAllProjects(arrProjects);
                    }
                })
                .catch(error => {
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
                        setAlertMessage('No Project/Group associations found.');

                        return;
                    } else {
                        setProjGroups(arrGroupsProjects);
                    }
                })
                .catch(error => {
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
                        setAlertMessage('No Milestone records found.');
                        return;
                    } else {
                        setAllMilestones(arrMilestones);
                    }
                })
                .catch(error => {
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
                        setAlertMessage('No Milestone-Group Junction records found.');
                        console.log('no milestone group junction records found');
                        return;
                    } else {
                        setGroupMilestones(arrGroupsMilestones);
                    }
                })
                .catch(error => {
                    console.error('Failed to load milestone-group junction data:', error);
                    setGroupMilestones([]);
                    return;
                });
        };

        getGroupMilestoneJunction();
    }, []);

    // ====end of Effect hook

    // useEffect for Slider recognizing date changes when
    // a milestone is selected
    useEffect(() => {
        if (selMilestone && beginTime && endTime) {
            setSliderVisible(true);
        }
    }, [selMilestone, beginTime, endTime]);

    // useEffect for slider time changes
    // (but Milestone remains the same)
    useEffect(() => {
        // we want to call the filter for the milestone tickets
        // based on the new Slider date range
        if (beginTime && endTime && milestoneTickets) {
            filterTickets({ beginTime, endTime });
        }
    }, [beginTime, endTime]);

    // when filteredTickets changes, our map layers and alert message should be cleared
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
                setAlertMessage('No tickets meet date range criteria.');
            }
        }
    }, [filteredTickets]);

    useEffect(() => {
        // when the alert message changes
        // we want to display it
        if (alertMessage.length > 0) {
            setIsAlertVisible(true);
        } else {
            setIsAlertVisible(false);
        }
    }, [alertMessage]);

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
                console.error(`Failed to load tickets for milestone ${item.id}:`, error);
                setMilestoneTickets([]);
                return;
            }
        }
        if (arrTickets.length === 0) {
            setMilestoneTickets([]);
            setAlertMessage('No tickets found for selected milestone(s).');
        } else {
            setMilestoneTickets(arrTickets);
        }
    };

    const filterTickets = ({ beginTime, endTime }) => {
        const sliderBegin = dayjs(beginTime);
        const sliderEnd = dayjs(endTime);

        if (milestoneTickets.length > 0) {
            const filtered = milestoneTickets.filter(ticket => {
                const milestoneStart = dayjs(ticket.properties.milestone_start);
                const milestoneEnd = dayjs(ticket.properties.milestone_end);

                return (
                    (milestoneStart.isAfter(sliderBegin) || milestoneStart.isSame(sliderBegin)) &&
                    (milestoneEnd.isBefore(sliderEnd) || milestoneEnd.isSame(sliderEnd))
                );
            });
            setFilteredTickets(filtered);
        }
    };

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
                const thisGeometryType = thisGeometry.type;
                const theseCoordinates = thisGeometry.coordinates;

                // for this demo we are only mapping Point geometries and verifying coordinates are supplied
                if (thisGeometryType === 'Point' && theseCoordinates.length > 1) {
                    const tooltipText =
                        thisObject.properties.id + '<br>' + thisObject.properties.mywwfm_status;

                    pointsLayer.addMywGeoms(thisGeometry, tooltipText);

                    geomTicketsQty += 1;

                    geoJSONFeatures.push(thisObject.asGeoJson());
                }
            }
        }

        if (geomTicketsQty > 2) {
            // We need a minimum of 3 ticket point geometries to create a polygon
            // make array of GeoJSON features into a proper Feature Collection
            // NOTE: we need at least three point geometries to create a hull polygon
            const turfFeatureCollection = turf.featureCollection(geoJSONFeatures);

            // create a convex hull using the Turf feature collection
            const ticketConvexHull = turf.convex(turfFeatureCollection);

            // calculate bounding box coordinates using Turf.js
            const hullBBOX = turf.bbox(ticketConvexHull);

            //plot on map
            hullLayer.addGeoJSONCollection(ticketConvexHull);
            hullLayer.show();
        }

        // if we have at least one valid geometry, we can plot ticket points
        if (geomTicketsQty > 0) {
            //plot points
            pointsLayer.show();
            setAlertMessage(
                allTicketsQty.toString() +
                    ' tickets  / ' +
                    geomTicketsQty.toString() +
                    ' ticket Point geoms'
            );
        } else {
            setAlertMessage(
                allTicketsQty.toString() + ' tickets, but no tickets with Point geometry'
            );
        }
        setIsAlertVisible(true);
    };

    // group related functions

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
                setAlertMessage('No groups found for this project.');
                setSelProjGroups([]);
            }
        }
    };

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

        if (arrSelMilestones.length > 0) {
            setSelGroupMilestones(arrSelMilestones);
            setMilestoneLoading(false);
            setMilestoneDisabled(false);
        } else {
            setAlertMessage('No milestones found for chosen Project and Group.');
            setSelGroupMilestones([]);
            setMilestoneDisabled(true);
        }
        return joinedMilestoneArray;
    };

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
        setAlertMessage('');
        setSelMilestone(null);
        setMilestoneDisabled(true);
        determineMilestones(option.label);
        setSelGroup(value);
        setSliderVisible(false);
    };

    const onMilestoneSelected = (value, option) => {
        setAlertMessage('');
        setSliderVisible(false);
        setSelMilestone(value);
        depthSearchMilestones(value);
        getTimestamps(value);
    };

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
