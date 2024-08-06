import { Checkbox } from 'antd';
import React, { useState } from 'react';

export const reactStates = () => {
    const [sorted, setSorted] = useState(false);
    const [splice, setSplice] = useState(false);
};

export const MenuItems = [
    {
        label: <span>List Cables</span>,
        title: 'List Cables',
        options: [
            {
                value: 'listCables',
                label: 'List Cables'
            }
        ]
    },
    {
        label: <span>Fuctions</span>,
        title: 'API Functions',
        options: [
            {
                value: 'highestUsedPinOn',
                label: 'highestUsedPinOn'
            },
            {
                value: 'connectionsFor',
                label: 'connectionsFor'
            },
            {
                value: 'internalSegments',
                label: 'internalSegments'
            },
            {
                value: 'createDetachedInternalSeg',
                label: 'createDetachedInternalSeg'
            },
            {
                value: 'createDetachedSlack',
                label: 'createDetachedSlack'
            },
            {
                value: 'splitSlack',
                label: 'splitSlack'
            },
            {
                value: 'createDetSlackAtSide',
                label: 'createDetSlackAtSide'
            },
            {
                value: 'addSlack',
                label: 'addSlack'
            },
            {
                value: 'transferConnections',
                label: 'transferConnections'
            },
            {
                value: 'connectionsOf',
                label: 'connectionsOf'
            },
            {
                value: 'segmentContainment',
                label: 'segmentContainment'
            },
            {
                value: 'setSegmentContainment',
                label: 'setSegmentContainment'
            },
            {
                value: 'setTickMark',
                label: 'setTickMark'
            },
            {
                value: 'findDownstreamSegsToTick',
                label: 'findDownstreamSegsToTick'
            },
            {
                value: 'findUpstreamSegsToTick',
                label: 'findUpstreamSegsToTick'
            },
            {
                value: 'cutCableAt',
                label: 'cutCableAt'
            },
            {
                value: 'isCable',
                label: 'isCable'
            },
            {
                value: 'isInternal',
                label: 'isInternal'
            },
            {
                value: 'rootHousingUrnOf',
                label: 'rootHousingUrnOf'
            },
            {
                value: 'getLength',
                label: 'getLength'
            },
            {
                value: 'segmentTypeForCable',
                label: 'segmentTypeForCable'
            },
            {
                value: 'slackTypeForCable',
                label: 'slackTypeForCable'
            },
            {
                value: 'slackTypeForSegment',
                label: 'slackTypeForSegment'
            },
            {
                value: 'isSegment',
                label: 'isSegment'
            },
            {
                value: 'segmentTypes',
                label: 'segmentTypes'
            },
            {
                value: 'connectionTypes',
                label: 'connectionTypes'
            },
            {
                value: 'slackTypes',
                label: 'slackTypes'
            },
            {
                value: 'pinCountFor',
                label: 'pinCountFor'
            }
        ]
    }
];

export const CablePluginFunctionDictionary = {
    listCables: {
        body: (
            <div>
                <p>
                    Pressing the button will list all features that are configured as a cable in the
                    myw.config['mywcom.cables'] array.
                </p>
            </div>
        ),
        function: 'onListCables'
    },

    highestUsedPinOn: {
        body: (
            <div>
                <p>
                    highestUsedPinOn function checks if changing the count for a cable would not
                    invalidate any connections. Returns true if it does not.
                </p>
                <p>
                    Pressing the button will select a random cable and call the highestUsedPinOn
                    function.
                </p>
            </div>
        ),
        function: 'onHighestUsedPinOn'
    },

    connectionsFor: {
        body: (
            <div>
                <p>
                    connectionsFor function returns all the connections for a cable. The function
                    receives two additional parameter:
                    <br />
                    - splice: boolean, if true, the function will return the splices for the cable.
                    <br />- sorted: boolean, if true, the function will return the connections
                    sorted.
                </p>
                <p>
                    Pressing the button will show connections for the cable JS_Fiber_1, as well as
                    focus the map on it and show its details in the Details tab.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Splice' }, { label: 'Sorted' }],
        function: 'onConnectionsFor'
    },

    internalSegments: {
        body: (
            <div>
                <p>internalSegments returns all cable segments hosted in a housing</p>
                <p>
                    Pressing the button will select a random housing and call the internalSegments
                    function, as well as focus the map on it and show its details in the Details
                    tab.
                </p>
            </div>
        ),
        function: 'onInternalSegments'
    },

    createDetachedInternalSeg: {
        body: (
            <div>
                <p>
                    createDetachedInternalSeg creates a detached cable segment within a structure.
                    It is important to note that a detached segment, once create has NOT been
                    inserted in the database yet.
                </p>
                <p>
                    Pressing the button will create a new segment of the fiber cable JS_Fibre_1
                    within the Pole JS_Pole_1, as well as focus the map on the cable and show its
                    details in the Details tab.
                </p>
            </div>
        ),
        function: 'onCreateDetachedInternalSeg'
    },

    createDetachedSlack: {
        body: (
            <div>
                <p>
                    createDetachedSlack creates a detached cable slack within a structure. It is
                    important to note that a detached segment, once create has NOT been inserted in
                    the database yet. It receives as parameters the cable that will receive the
                    slack and its housing structure.
                </p>
                <p>
                    Pressing the button will create a new slack of the fiber cable JS_Fibre_1 within
                    the Pole JS_Pole_1, as well as focus the map on the cable and show its details
                    in the Details tab.
                </p>
            </div>
        ),
        function: 'onCreateDetachedSlack'
    },

    splitSlack: {
        body: (
            <div>
                <p>
                    splitSlack takes an existing slack and split it into two, the function returns
                    an array containing two elements: The original slack and the new slack. It
                    receives as parameters the slack to be split and the length of the new slack.
                </p>
                <p>
                    Pressing the button will split the existing slack in cable JS_Fibre_5 in half,
                    as well as focus the map on the cable and show its details in the Details tab.
                    The original length of the slack is 100ft.
                </p>
            </div>
        ),
        function: 'onSplitSlack'
    },

    createDetSlackAtSide: {
        body: (
            <div>
                <p>
                    createDetSlackAtSide works like createDetachedSlack, but the slack is created
                    already associated to a cable segment. It is important to note that a detached
                    segment, once create has NOT been inserted in the database yet. It receives as
                    parameters the cable segment that will receive the slack, its housing, and a
                    boolean (true if slack created before existing segment, otherwise false).
                </p>
                <p>
                    Pressing the button will create a detached slack associated with the a cable
                    segment of JS_Fibre_6, focus the map on the cable segment and show its details
                    in the "Details" tab. The return of the function is printed in the console.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onCreateDetSlackAtSide'
    },

    addSlack: {
        body: (
            <div>
                <p>
                    addSlack actually adds the detached slack to the database. It receives as
                    parameters the feature type (stored in geometry.type within the Object), the
                    detached Slack to be stored, the URN of the cable segment, and a boolean
                    flagging if the slack is to be stored before (true) or after (false) the cable
                    segment.
                </p>
                <p>
                    Pressing the button will first call createDetSlackAtSide to create the slack for
                    cable JS_Fiber_6, then add it to the database, focus the map on the cable
                    segment and show its details in the "Details" tab. The return of the function is
                    printed in the console.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onAddSlack'
    },

    transferConnections: {
        body: (
            <div>
                <p>
                    transferConnections allows you to transfer connectios from one cable segment to
                    another. It receives as parameters the URN of the old segment (containing the
                    connections), the URN of the new segment (that will receive the connections),
                    and a string representing the connections of which side you want to transfer
                    ("in" or "out", tick the checkbox for "in", untick for "out"). It returns an
                    array of updated features. It's important to note that the changes are NOT
                    pushed into the databse.
                </p>
                <p>
                    Pressing the button will transfer the connections from the cable JS_Fiber_1 to
                    the cable JS_Fiber_7. In the console you can see the output of the function and
                    the difference when calling it using "in" or "out".
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onTransferConnections'
    },

    connectionsOf: {
        body: (
            <div>
                <p>
                    connectionsOf returns an array containing all the connections of a given
                    feature. It receives as parameters the feature URN, its housing and the list of
                    splices (to limit the number of results).
                </p>
                <p>
                    Pressing the button will query for the connections of the cable JS_Fiber_1,
                    print the output in the console and focus the map on the cable.
                </p>
            </div>
        ),
        function: 'onConnectionsOf'
    },

    segmentContainment: {
        body: (
            <div>
                <p>
                    segmentContainment returns the URN of equipment in which the cable segment is
                    housed (if any). It receives as parameters the cable segment and a string
                    representing which side of the segment to check ("in" or "out", tick the
                    checkbox for "in", untick for "out").
                </p>
                <p>
                    IMPORTANT: Equipment connection need to be manually set for the cable. Check the
                    "Setting an Enclosure on a cable" page in the Developer Guide.
                </p>
                <p>
                    Pressing the button will query for the connections of the cable JS_Fiber_1,
                    print the output in the console and focus the map on the cable.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onSegmentContainment'
    },

    setSegmentContainment: {
        body: (
            <div>
                <p>
                    setSegmentContainment allows you to set the the equipment in which the cable
                    segment is housed. It receives as parameters the cable segment, which side of
                    the segment to set ("in" or "out"), and the equipment that will house the cable
                    (which can be 'null').
                </p>
                <p>
                    Pressing the button will set the housing for the "out" side of a segment of
                    cable JS_Fiber_7. If the housing is set it will remove it by setting it to null.
                    The output will be print in the console and the cable will be focused on the
                    map.
                </p>
            </div>
        ),
        function: 'onSetSegmentContainment'
    },

    setTickMark: {
        body: (
            <div>
                <p>
                    setTickMark allows you to set the tick mark of a cable. It receives as
                    parameters the cable segment, the new tick mark (as an integer), if the tick
                    should be in the IN out OUT end of the segment (as an 'in_tick' our 'out_tick'
                    string), the distance between tick marks, and the distance unit (e.g.: 'm' or
                    'ft').
                </p>
                <p>
                    Pressing the button will alternate the tick of the first cable segment for
                    JS_Fiber_4 between '123' and '456' within 1m of the segment, print the return in
                    the console, and focus the map on the cable segment.
                </p>
            </div>
        ),
        checkbox: [{ label: 'Side' }],
        function: 'onSetTickMark'
    },

    findDownstreamSegsToTick: {
        body: (
            <div>
                <p>
                    findDownstreamSegsToTick finds all downstream segments to a tick mark. It
                    receives as parameter the initial cable segment and returns an Object containing
                    all the found segments and the first tick mark found.
                </p>
                <p>
                    Pressing the button will call findDownstreamSegsToTick, starting on the first
                    cable segment of JS_Fiber_4, print the return in the console, and focus the map
                    on the cable segment.
                </p>
            </div>
        ),
        function: 'onFindDownstreamSegsToTick'
    },

    findUpstreamSegsToTick: {
        body: (
            <div>
                <p>
                    findDownstreamSegsToTick finds all upstream segments to a tick mark. It receives
                    as parameter the initial cable segment and returns an Object containing all the
                    found segments and the first tick mark found.
                </p>
                <p>
                    Pressing the button will call findDownstreamSegsToTick, starting on the first
                    cable segment of JS_Fiber_4, print the return in the console, and focus the map
                    on the cable segment.
                </p>
            </div>
        ),
        function: 'onFindUpstreamSegsToTick'
    },

    cutCableAt: {
        body: (
            <div>
                <p>
                    cutCableAt cuts a cable at a given position, creating new separate cables if
                    needed. It receives as parameters structure containing the cable, the segment to
                    be cut, a boolean representing if the cable should be cut forward, and the
                    housing (if any) for the new cables.
                </p>
                <p>
                    Pressing the button will call cutCableAt for the cable JS_Fiber_9, print the
                    return in the console, and focus the map on the cable segment.
                </p>
            </div>
        ),
        function: 'onCutCableAt'
    },

    isCable: {
        body: (
            <div>
                <p>
                    isCable checks if a given feature is a cable. It receives as parameter the
                    feature to be checked and returns true or false.
                </p>
                <p>
                    Pressing the button will call isCable for three features, one cable and two
                    non-cables, and will print the output in the console.
                </p>
            </div>
        ),
        function: 'onIsCable'
    },

    isInternal: {
        body: (
            <div>
                <p>
                    isInternal checks if a given cable segments are all internal (i.e.: The segments
                    start and end within the same structure). It receives as parameter the cable to
                    be checked and returns true or false.
                </p>
                <p>
                    Pressing the button will call isCable for two cables: JS_Fiber_10 (not internal)
                    and JS_Fiber_11 (internal inside JS_BLDG_1), and will print the output in the
                    console (false and true, respectively).
                </p>
            </div>
        ),
        function: 'onIsInternal'
    },

    rootHousingUrnOf: {
        body: (
            <div>
                <p>
                    rootHousingUrnOf returns the URN of the root housing of a cable segment. It
                    receives as parameter the cable.
                </p>
                <p>
                    Pressing the button will call rootHousingUrnOf for a random cable segment, print
                    the return in the console, and focus the map on the cable segment.
                </p>
            </div>
        ),
        function: 'onRootHousingUrnOf'
    },

    getLength: {
        body: (
            <div>
                <p>
                    rootHousingUrnOf returns the URN of the root housing of a cable segment. It
                    receives as parameter the cable.
                </p>
                <p>
                    Pressing the button will call rootHousingUrnOf for a random cable segment, print
                    the return in the console, and focus the map on the cable segment.
                </p>
            </div>
        ),
        function: 'onGetLength'
    },

    segmentTypeForCable: {
        body: (
            <div>
                <p>
                    segmentTypeForCable returns the segment types of a cable. It receives as
                    parameter the cable.
                </p>
                <p>
                    Pressing the button will call segmentTypeForCable for a random cable, print the
                    return in the console, and focus the map on the cable.
                </p>
            </div>
        ),
        function: 'onSegmentTypeForCable'
    },

    slackTypeForCable: {
        body: (
            <div>
                <p>
                    slackTypeForCable returns the slack type of a cable. It receives as parameter
                    the cable.
                </p>
                <p>
                    Pressing the button will call slackTypeForCable for a random cable, print the
                    return in the console, and focus the map on the cable.
                </p>
            </div>
        ),
        function: 'onSlackTypeForCable'
    },

    slackTypeForSegment: {
        body: (
            <div>
                <p>
                    slackTypeForSegment returns the slack type of a cable segment. It receives as
                    parameter the cables segment.
                </p>
                <p>
                    Pressing the button will call slackTypeForSegment for a random cable segment,
                    print the return in the console, and focus the map on the cable segment.
                </p>
            </div>
        ),
        function: 'onSlackTypeForSegment'
    },

    isSegment: {
        body: (
            <div>
                <p>
                    isSegment checks if a given feature is a cable segment. It receives as
                    paramenter the URN of the feature and returns true or false.
                </p>
                <p>
                    Pressing the button will call isSegment for three features, one cable segment
                    and two other features, and print the outputs in the console (true, false,
                    false)
                </p>
            </div>
        ),
        function: 'onIsSegment'
    },

    segmentTypes: {
        body: (
            <div>
                <p>
                    segmentTypes returns all features that are cofigured as cable segments in the
                    array myw.config['mywcom.network_types'].
                </p>
                <p>
                    Pressing the button will call segmentTypes and print the output in the console.
                </p>
            </div>
        ),
        function: 'onSegmentTypes'
    },

    connectionTypes: {
        body: (
            <div>
                <p>
                    connectionTypes returns all features that are cofigured as connections in the
                    array myw.config['mywcom.network_types'].
                </p>
                <p>
                    Pressing the button will call connectionTypes and print the output in the
                    console.
                </p>
            </div>
        ),
        function: 'onConnectionTypes'
    },

    slackTypes: {
        body: (
            <div>
                <p>
                    slackTypes returns all features that are cofigured as slacks in the array
                    myw.config['mywcom.network_types'].
                </p>
                <p>Pressing the button will call slackTypes and print the output in the console.</p>
            </div>
        ),
        function: 'onSlackTypes'
    },

    pinCountFor: {
        body: (
            <div>
                <p>
                    pinCountFor returns the pin count for a cable segment. It receives as parameters
                    the feature and an optional side ('in' or 'out').
                </p>
                <p>
                    Pressing the button will call pinCountFor for a random cable segment, print the
                    output in the console for 'undefined', 'in', and 'out', and focus the map on the
                    cable segment.
                </p>
            </div>
        ),
        function: 'onPinCountFor'
    }
};
