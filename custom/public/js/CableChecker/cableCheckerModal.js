import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Checkbox } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import { CodeSandboxCircleFilled } from '@ant-design/icons';

export const CableCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [pickedFunction, setPickedFunction] = useState('');
    const [cables, setCables] = useState([]);
    const [housings, setHousings] = useState([]);
    const [cabinets, setCabinets] = useState([]);
    const [poles, setPoles] = useState([]);
    const [slacks, setSlacks] = useState([]);
    const [fiberSegments, setFiberSegments] = useState([]);
    const [fiberSplitters, setFiberSplitters] = useState([]);
    const [sorted, setSorted] = useState(false);
    const [splice, setSplice] = useState(false);
    const [side, setSide] = useState(false);
    const [isOpen, setIsOpen] = useState(open);

    const menuItems = [
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
                }
            ]
        }
    ];

    useEffect(() => {
        const dbFeatures = db.getFeatureTypes();
        console.log(dbFeatures);
        // console.log(myw.config['mywcom.cables']);
        const housingPromises = [
            db.getFeatures('myworld/ug_route'),
            db.getFeatures('myworld/oh_route'),
            db.getFeatures('myworld/conduit'),
            db.getFeatures('myworld/building'),
            db.getFeatures('myworld/mdu')
        ];

        const cablePromises = [
            db.getFeatures('myworld/coax_cable'),
            db.getFeatures('myworld/copper_cable'),
            db.getFeatures('myworld/fiber_cable')
        ];

        Promise.all(cablePromises).then(results => {
            setCables(results.flat());
        });

        Promise.all(housingPromises).then(results => {
            setHousings(results.flat());
        });

        db.getFeatures('myworld/pole').then(result => {
            setPoles(result);
        });

        db.getFeatures('myworld/cabinet').then(result => {
            setCabinets(result);
        });

        db.getFeatures('myworld/mywcom_fiber_slack').then(result => {
            setSlacks(result);
        });

        db.getFeatures('myworld/mywcom_fiber_segment').then(result => {
            setFiberSegments(result);
        });

        db.getFeatures('myworld/fiber_splitter').then(result => {
            setFiberSplitters(result);
        });
    }, []);

    const closeWindow = () => {
        console.log(housings);
        setIsOpen(false);
    };

    const onHighestUsedPinOn = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);
        console.log('Calling the function for cable ' + cables[cableIndex].properties.name);

        plugin
            .highestUsedPinOn(cables[cableIndex])
            .then(result => {
                console.log(result);
            })
            .catch(alert);
    };

    const onConnectionsFor = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));
        console.log('Checking the connections for cable ' + cable.properties.name);
        plugin.connectionsFor(cable, splice, sorted).then(result => {
            console.log(result);
        });
        appRef.setCurrentFeature(cable, { zoomTo: true });
    };

    const onInternalSegments = () => {
        const housingIndex = Math.floor(Math.random() * housings.length);
        console.log('Calling the function for housing ' + housings[housingIndex].properties.name);

        plugin.internalSegments(housings[housingIndex], false).then(result => {
            console.log(result);
        });
    };

    const onCreateDetachedSegment = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));
        const pole = poles.find(pole => pole.properties.name.includes('JS_Pole_1'));
        console.log('Creating a detached segment for cable ' + cable.properties.name);
        plugin.createDetachedInternalSeg(pole, cable, pole.getUrn, 10).then(result => {
            console.log(result);
        });
    };

    const onCreateDetachedSlack = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));
        const pole = poles.find(pole => pole.properties.name.includes('JS_Pole_1'));
        console.log('Creating a slack for cable ' + cable.properties.name);
        plugin.createDetachedSlack(cable, pole).then(result => {
            console.log(result);
        });
    };

    const onSplitSlack = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_5'));
        const slack = slacks.find(slack => slack.properties.cable.includes(cable.getUrn()));
        console.log(
            'Splitting the slack ' + slack.properties.name + ' for cable ' + cable.properties.name
        );
        console.log(slack);
        plugin.splitSlack(slack, slack.properties.length / 2).then(result => {
            console.log(result);
        });
        appRef.setCurrentFeature(slack, { zoomTo: true });
    };

    const onCreateDetSlackAtSide = () => {
        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/100005')
        );
        const pole = poles.find(pole => pole.properties.name.includes('JS_Pole_1'));
        console.log(segment);
        plugin.createDetSlackAtSide(segment, pole, side).then(result => {
            console.log(result);
        });
    };

    const onAddSlack = () => {
        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/100005')
        );
        const pole = poles.find(pole => pole.properties.name.includes('JS_Pole_1'));
        console.log(segment.getUrn());
        plugin.createDetSlackAtSide(segment, pole, side).then(result => {
            console.log(result);
            plugin.addSlack(result.type, result, segment.getUrn(), side).then(result => {
                console.log(result);
                appRef.setCurrentFeature(result, { zoomTo: true });
            });
        });
    };

    const onTransferConnections = () => {
        const old_segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/100000')
        );
        const new_segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/100006')
        );
        plugin
            .transferConnections(old_segment.getUrn(), new_segment.getUrn(), side ? 'in' : 'out')
            .then(result => {
                console.log(result);
            });
    };

    const onConnectionsOf = () => {
        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/100000')
        );
        plugin.connectionsOf(segment.getUrn()).then(result => {
            console.log(result);
            appRef.setCurrentFeature(result, { zoomTo: true });
        });
    };

    const onSegmentContainment = () => {
        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/100000')
        );
        plugin.segmentContainment(segment, side ? 'in' : 'out').then(result => {
            console.log(result);
            appRef.setCurrentFeature(segment, { zoomTo: true });
        });
    };

    const onSetSegmentContainment = () => {
        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/100006')
        );
        const splitter = fiberSplitters.find(splitter =>
            splitter.properties.name.includes('JS_FiberSplitter_1')
        );
        console.log("Setting the 'out' equipment for cable segment " + segment.properties.name);
        console.log('The current equipment is: ' + segment.properties.out_equipment);
        plugin
            .setSegmentContainment(
                segment,
                'out',
                segment.properties.out_equipment === null ? splitter : null
            )
            .then(result => {
                console.log(result);
                appRef.setCurrentFeature(segment, { zoomTo: true });
            });
    };

    const onSetTickMark = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_8'));

        const segments = fiberSegments.filter(segment =>
            segment.properties.cable.includes(cable.getUrn())
        );

        let tick;

        if (side) {
            if (segments[0].properties.in_tick === 123) tick = 456;
            else tick = 123;
        } else {
            if (segments[0].properties.out_tick === 123) tick = 456;
            else tick = 123;
        }

        plugin
            .setTickMark(segments[0], tick, side ? 'in_tick' : 'out_tick', 1, 'm')
            .then(result => {
                console.log('Setting the tick for cable segment ' + segments[0]._myw.title);
                console.log(result);
                appRef.setCurrentFeature(segments[0], { zoomTo: true });
            });
    };

    const onFindDownstreamSegsToTick = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_8'));

        const segments = fiberSegments.filter(segment =>
            segment.properties.cable.includes(cable.getUrn())
        );

        plugin.findDownstreamSegsToTick(segments[segments.length - 1]).then(result => {
            console.log(
                'Finding downstream segments to tick for cable segment ' +
                    segments[segments.length - 1]._myw.title
            );
            console.log(result);
        });
    };

    const onFindUpstreamSegsToTick = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_8'));

        const segments = fiberSegments.filter(segment =>
            segment.properties.cable.includes(cable.getUrn())
        );

        plugin.findUpstreamSegsToTick(segments[0]).then(result => {
            console.log(
                'Finding downstream segments to tick for cable segment ' + segments[0]._myw.title
            );
            console.log(result);
        });
    };

    const onCutCableAt = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_9'));
        const cabinet = cabinets.find(cabinet => cabinet.properties.name.includes('JS_CAB_2'));
        const segments = fiberSegments.filter(segment =>
            segment.properties.cable.includes(cable.getUrn())
        );
        const housingId = Number(segments[1].properties.housing.split('/')[1]);
        const housing = housings.find(housing => housing.properties.id === housingId);

        plugin.cutCableAt(cabinet, segments[1], false, undefined).then(result => {
            console.log(result);
            appRef.setCurrentFeature(segments[0], { zoomTo: true });
        });
    };

    const onIsCable = () => {
        console.log(housings[0]);
        console.log(cables[0].properties.name + ' is a cable? ' + plugin.isCable(cables[0]));
        console.log(housings[0]._myw.title + ' is a cable? ' + plugin.isCable(housings[0]));
        console.log(poles[0].properties.name + ' is a cable? ' + plugin.isCable(poles[0]));
    };

    const onIsInternal = () => {
        const cable1 = cables.find(cable => cable.properties.name.includes('JS_Fiber_10'));
        const cable2 = cables.find(cable => cable.properties.name.includes('JS_Fiber_11'));

        plugin.isInternal(cable1).then(result => {
            console.log(cable1.properties.name + ' is internal? ' + result);
        });
        plugin.isInternal(cable2).then(result => {
            console.log(cable1.properties.name + ' is internal? ' + result);
        });
    };

    const onRootHousingUrnOf = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);
        const segments = fiberSegments.filter(segment =>
            segment.properties.cable.includes(cables[cableIndex].getUrn())
        );
        const segmentIndex = Math.floor(Math.random() * segments.length);
        console.log(
            'Calling the function for segment ' +
                segments[segmentIndex]._myw.title +
                ' of cable ' +
                cables[cableIndex]._myw.title
        );
        console.log('Housing is ' + plugin.rootHousingUrnOf(segments[segmentIndex]));
        appRef.setCurrentFeature(segments[segmentIndex], { zoomTo: true });
    };

    const onGetLength = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);
        console.log(
            'Length of ' +
                cables[cableIndex]._myw.title +
                ' is ' +
                plugin.getLength(cables[cableIndex])
        );
        appRef.setCurrentFeature(cables[cableIndex], { zoomTo: true });
    };

    const onSegmentTypeForCable = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);
        console.log(
            'Segment type for ' +
                cables[cableIndex]._myw.title +
                ' is ' +
                plugin.segmentTypeForCable(cables[cableIndex])
        );
        appRef.setCurrentFeature(cables[cableIndex], { zoomTo: true });
    };

    const onSlackTypeForCable = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);
        console.log(
            'Slack type for ' +
                cables[cableIndex]._myw.title +
                ' is ' +
                plugin.slackTypeForCable(cables[cableIndex])
        );
        appRef.setCurrentFeature(cables[cableIndex], { zoomTo: true });
    };

    const onSlackTypeForSegment = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);
        const segments = fiberSegments.filter(segment =>
            segment.properties.cable.includes(cables[cableIndex].getUrn())
        );
        const segmentIndex = Math.floor(Math.random() * segments.length);
        console.log(
            'Slack type for ' +
                segments[segmentIndex]._myw.title +
                ' is ' +
                plugin.slackTypeForSegment(segments[segmentIndex])
        );
        appRef.setCurrentFeature(segments[segmentIndex], { zoomTo: true });
    };

    const onListCables = () => {
        console.log(myw.config['mywcom.cables']);
    };

    function renderFields() {
        switch (pickedFunction) {
            case 'listCables':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                Pressing the button will list all features that are configured as a
                                cable in the myw.config['mywcom.cables'] array.
                            </p>
                            <Button type="primary" onClick={onListCables}>
                                List Equipment
                            </Button>
                        </Space>
                    </div>
                );
            case 'highestUsedPinOn':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                highestUsedPinOn function checks if changing the count for a cable
                                would not invalidate any connections. Returns true if it does not.
                            </p>
                            <p>
                                Pressing the button will select a random cable and call the
                                highestUsedPinOn function.
                            </p>
                            <Button type="primary" onClick={onHighestUsedPinOn}>
                                highestUsedPinOn
                            </Button>
                        </Space>
                    </div>
                );
            case 'connectionsFor':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                connectionsFor function returns all the connections for a cable. The
                                function receives two additional parameter:
                                <br />
                                - splice: boolean, if true, the function will return the splices for
                                the cable.
                                <br />- sorted: boolean, if true, the function will return the
                                connections sorted.
                            </p>
                            <p>
                                {/* Pressing the button will select a random cable and call the
                                connectionsFor function. You can also set the splice and sorted
                                parameters using the checkboxes. */}
                                Pressing the button will show connections for the cable JS_Fiber_1,
                                as well as focus the map on it and show its details in the Details
                                tab.
                            </p>
                            <Checkbox onChange={e => setSplice(e.target.checked)}>splice</Checkbox>
                            <Checkbox onChange={e => setSorted(e.target.checked)}>sorted</Checkbox>
                            <Button type="primary" onClick={onConnectionsFor}>
                                connectionsFor
                            </Button>
                        </Space>
                    </div>
                );
            case 'internalSegments':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>internalSegments returns all cable segments hosted in a housing</p>
                            <p>
                                Pressing the button will select a random housing and call the
                                internalSegments function.
                            </p>
                            <Button type="primary" onClick={onInternalSegments}>
                                highestUsedPinOn
                            </Button>
                        </Space>
                    </div>
                );
            case 'createDetachedInternalSeg':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                createDetachedInternalSeg creates a detached cable segment within a
                                structure. It is important to note that a detached segment, once
                                create has NOT been inserted in the database yet.
                            </p>
                            <p>
                                Pressing the button will create a new segment of the fiber cable
                                JS_Fibre_1 within the Pole JS_Pole_1.
                            </p>
                            <Button type="primary" onClick={onCreateDetachedSegment}>
                                createDetachedInternalSeg
                            </Button>
                        </Space>
                    </div>
                );
            case 'createDetachedSlack':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                createDetachedSlack creates a detached cable slack within a
                                structure. It is important to note that a detached segment, once
                                create has NOT been inserted in the database yet. It receives as
                                parameters the cable that will receive the slack and its housing
                                structure.
                            </p>
                            <p>
                                Pressing the button will create a new slack of the fiber cable
                                JS_Fibre_1 within the Pole JS_Pole_1.
                            </p>
                            <Button type="primary" onClick={onCreateDetachedSlack}>
                                createDetachedSlack
                            </Button>
                        </Space>
                    </div>
                );
            case 'splitSlack':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                splitSlack takes an existing slack and split it into two, the
                                function returns an array containing two elements: The original
                                slack and the new slack. It receives as parameters the slack to be
                                split and the length of the new slack.
                            </p>
                            <p>
                                Pressing the button will split the existing slack in cable
                                JS_Fibre_5 in half. The original length of the slack is 100ft.
                            </p>
                            <Button type="primary" onClick={onSplitSlack}>
                                splitSlack
                            </Button>
                        </Space>
                    </div>
                );
            case 'createDetSlackAtSide':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                createDetSlackAtSide works like createDetachedSlack, but the slack
                                is created already associated to a cable segment. It is important to
                                note that a detached segment, once create has NOT been inserted in
                                the database yet. It receives as parameters the cable segment that
                                will receive the slack, its housing, and a boolean (true if slack
                                created before existing segment, otherwise false).
                            </p>
                            <p>
                                Pressing the button will create a detached slack associated with the
                                a cable segment of JS_Fibre_6, focus the map on the cable segment
                                and show its details in the "Details" tab. The return of the
                                function is printed in the console.
                            </p>
                            <Checkbox onChange={e => setSide(e.target.checked)}>side</Checkbox>
                            <Button type="primary" onClick={onCreateDetSlackAtSide}>
                                createDetSlackAtSide
                            </Button>
                        </Space>
                    </div>
                );
            case 'addSlack':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                addSlack actually adds the detached slack to the database. It
                                receives as parameters the feature type (stored in geometry.type
                                within the Object), the detached Slack to be stored, the URN of the
                                cable segment, and a boolean flagging if the slack is to be stored
                                before (true) or after (false) the cable segment.
                            </p>
                            <p>
                                Pressing the button will first call createDetSlackAtSide to create
                                the slack for cable JS_Fiber_6, then add it to the database, focus
                                the map on the cable segment and show its details in the "Details"
                                tab. The return of the function is printed in the console.
                            </p>
                            <Checkbox onChange={e => setSide(e.target.checked)}>side</Checkbox>
                            <Button type="primary" onClick={onAddSlack}>
                                addSlack
                            </Button>
                        </Space>
                    </div>
                );
            case 'transferConnections':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                transferConnections allows you to transfer connectios from one cable
                                segment to another. It receives as parameters the URN of the old
                                segment (containing the connections), the URN of the new segment
                                (that will receive the connections), and a string representing the
                                connections of which side you want to transfer ("in" or "out"). It
                                returns an array of updated features. It's important to note that
                                the changes are NOT pushed into the databse.
                            </p>
                            <p>
                                Pressing the button will transfer the connections from the cable
                                JS_Fiber_1 to the cable JS_Fiber_7. In the console you can see the
                                output of the functions and the difference when calling it using
                                "in" or "out".
                            </p>
                            <Checkbox onChange={e => setSide(e.target.checked)}>"in"</Checkbox>
                            <Button type="primary" onClick={onTransferConnections}>
                                transferConnections
                            </Button>
                        </Space>
                    </div>
                );
            case 'connectionsOf':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                connectionsOf returns an array containing all the connections of a
                                given feature. It receives as parameters the feature URN, its
                                housing and the list of splices (to limit the number of results).
                            </p>
                            <p>
                                Pressing the button will query for the connections of the cable
                                JS_Fiber_1, print the output in the console and focus the map on the
                                cable.
                            </p>
                            <Button type="primary" onClick={onConnectionsOf}>
                                connectionsOf
                            </Button>
                        </Space>
                    </div>
                );
            case 'segmentContainment':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                segmentContainment returns the URN of equipment in which the cable
                                segment is housed (if any). It receives as parameters the cable
                                segment and a string representing which side of the segment to check
                                ("in" or "out").
                            </p>
                            <p>
                                IMPORTANT: Equipment connection need to be manually set for the
                                cable. Check the "Setting an Enclosure on a cable" page in the
                                Developer Guide.
                            </p>
                            <p>
                                Pressing the button will query for the connections of the cable
                                JS_Fiber_1, print the output in the console and focus the map on the
                                cable.
                            </p>
                            <Checkbox onChange={e => setSide(e.target.checked)}>"in"</Checkbox>

                            <Button type="primary" onClick={onSegmentContainment}>
                                segmentContainment
                            </Button>
                        </Space>
                    </div>
                );
            case 'setSegmentContainment':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                setSegmentContainment allows you to set the the equipment in which
                                the cable segment is housed. It receives as parameters the cable
                                segment, which side of the segment to set ("in" or "out"), and the
                                equipment that will house the cable (which can be 'null').
                            </p>
                            <p>
                                Pressing the button will set the housing for the "out" side of a
                                segment of cable JS_Fiber_7. If the housing is set it will remove it
                                by setting it to null. The output will be print in the console and
                                the cable will be focused on the map.
                            </p>
                            <Button type="primary" onClick={onSetSegmentContainment}>
                                setSegmentContainment
                            </Button>
                        </Space>
                    </div>
                );
            case 'setTickMark':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                setTickMark allows you to set the tick mark of a cable. It receives
                                as parameters the cable segment, the new tick mark (as an integer),
                                if the tick should be in the IN out OUT end of the segment (as an
                                'in_tick' our 'out_tick' string), the distance between tick marks,
                                and the distance unit (e.g.: 'm' or 'ft').
                            </p>
                            <p>
                                Pressing the button will alternate the tick of the first cable
                                segment for JS_Fiber_8 between '123' and '456' within 1m of the
                                segment, print the return in the console, and focus the map on the
                                cable segment.
                            </p>
                            <Checkbox onChange={e => setSide(e.target.checked)}>"in"</Checkbox>

                            <Button type="primary" onClick={onSetTickMark}>
                                setTickMark
                            </Button>
                        </Space>
                    </div>
                );
            case 'setInTickMark':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                setInTickMark sets the in tick of a cable segment and adjust
                                measured length of all downstream cable segments to next tick
                            </p>
                            <p>
                                Pressing the button will alternate the tick of the first cable
                                segment for JS_Fiber_8 between '123' and '456' within 1m of the
                                segment, print the return in the console, and focus the map on the
                                cable segment.
                            </p>
                            <Checkbox onChange={e => setSide(e.target.checked)}>"in"</Checkbox>

                            <Button type="primary" onClick={onSetInTickMark}>
                                setInTickMark
                            </Button>
                        </Space>
                    </div>
                );
            case 'findDownstreamSegsToTick':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                findDownstreamSegsToTick finds all downstream segments to a tick
                                mark. It receives as parameter the initial cable segment and returns
                                an Object containing all the found segments and the first tick mark
                                found.
                            </p>
                            <p>
                                Pressing the button will call findDownstreamSegsToTick, starting on
                                the first cable segment of JS_Fiber_8, print the return in the
                                console, and focus the map on the cable segment.
                            </p>

                            <Button type="primary" onClick={onFindDownstreamSegsToTick}>
                                findDownstreamSegsToTick
                            </Button>
                        </Space>
                    </div>
                );
            case 'findUpstreamSegsToTick':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                findDownstreamSegsToTick finds all upstream segments to a tick mark.
                                It receives as parameter the initial cable segment and returns an
                                Object containing all the found segments and the first tick mark
                                found.
                            </p>
                            <p>
                                Pressing the button will call findDownstreamSegsToTick, starting on
                                the first cable segment of JS_Fiber_8, print the return in the
                                console, and focus the map on the cable segment.
                            </p>

                            <Button type="primary" onClick={onFindUpstreamSegsToTick}>
                                findUpstreamSegsToTick
                            </Button>
                        </Space>
                    </div>
                );
            case 'cutCableAt':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                cutCableAt cuts a cable at a given position, creating new separate
                                cables if needed. It receives as parameters structure containing the
                                cable, the segment to be cut, a boolean representing if the cable
                                should be cut forward, and the housing (if any) for the new cables.
                            </p>
                            <p>
                                Pressing the button will call cutCableAt for the cable JS_Fiber_9,
                                print the return in the console, and focus the map on the cable
                                segment.
                            </p>

                            <Button type="primary" onClick={onCutCableAt}>
                                cutCableAt
                            </Button>
                        </Space>
                    </div>
                );
            case 'isCable':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                isCable checks if a given feature is a cable. It receives as
                                parameter the feature to be checked and returns true or false.
                            </p>
                            <p>
                                Pressing the button will call isCable for three features, one cable
                                and two non-cables, and will print the output in the console.
                            </p>

                            <Button type="primary" onClick={onIsCable}>
                                isCable
                            </Button>
                        </Space>
                    </div>
                );
            case 'isInternal':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                isInternal checks if a given cable segments are all internal (i.e.:
                                The segments start and end within the same structure). It receives
                                as parameter the cable to be checked and returns true or false.
                            </p>
                            <p>
                                Pressing the button will call isCable for two cables: JS_Fiber_10
                                (not internal) and JS_Fiber_11 (internal), and will print the output
                                in the console (false and true, respectively).
                            </p>

                            <Button type="primary" onClick={onIsInternal}>
                                isInternal
                            </Button>
                        </Space>
                    </div>
                );
            case 'rootHousingUrnOf':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                rootHousingUrnOf returns the URN of the root housing of a cable
                                segment. It receives as parameter the cable.
                            </p>
                            <p>
                                Pressing the button will call rootHousingUrnOf for a random cable,
                                pick a random segment of it, print the return in the console, and
                                focus the map on the cable segment.
                            </p>

                            <Button type="primary" onClick={onRootHousingUrnOf}>
                                rootHousingUrnOf
                            </Button>
                        </Space>
                    </div>
                );
            case 'getLength':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                rootHousingUrnOf returns the URN of the root housing of a cable
                                segment. It receives as parameter the cable.
                            </p>
                            <p>
                                Pressing the button will call rootHousingUrnOf for a random cable,
                                pick a random segment of it, print the return in the console, and
                                focus the map on the cable segment.
                            </p>

                            <Button type="primary" onClick={onGetLength}>
                                getLength
                            </Button>
                        </Space>
                    </div>
                );
            case 'segmentTypeForCable':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                segmentTypeForCable returns the segment types of a cable. It
                                receives as parameter the cable.
                            </p>
                            <p>
                                Pressing the button will call segmentTypeForCable for a random
                                cable, print the return in the console, and focus the map on the
                                cable.
                            </p>

                            <Button type="primary" onClick={onSegmentTypeForCable}>
                                segmentTypeForCable
                            </Button>
                        </Space>
                    </div>
                );
            case 'slackTypeForCable':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                slackTypeForCable returns the slack type of a cable. It receives as
                                parameter the cable.
                            </p>
                            <p>
                                Pressing the button will call slackTypeForCable for a random cable,
                                print the return in the console, and focus the map on the cable.
                            </p>

                            <Button type="primary" onClick={onSlackTypeForCable}>
                                slackTypeForCable
                            </Button>
                        </Space>
                    </div>
                );
            case 'slackTypeForSegment':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                slackTypeForSegment returns the slack type of a cable segment. It
                                receives as parameter the cables segment.
                            </p>
                            <p>
                                Pressing the button will call slackTypeForSegment for a random cable
                                segment, print the return in the console, and focus the map on the
                                cable segment.
                            </p>

                            <Button type="primary" onClick={onSlackTypeForSegment}>
                                slackTypeForSegment
                            </Button>
                        </Space>
                    </div>
                );
        }
    }

    return (
        <DraggableModal
            wrapClassName="equipment-checker-modal"
            open={isOpen}
            title={'Cable Manager Plugin'}
            width={500}
            onCancel={closeWindow}
            footer={[
                <Button key="ok" onClick={closeWindow} type="primary">
                    Close Window
                </Button>
            ]}
        >
            <Space direction="vertical" size="middle">
                <p>
                    This plugin provide functions to manipulate cable by adding and removing slack.
                    To check what features are Equipments you can check the
                    myw.config['mywcom.cables'] array.
                </p>
                <p>Select the function you want to demonstrate at the Dropdown below.</p>

                <Select
                    virtual={false}
                    onChange={value => setPickedFunction(value)}
                    options={menuItems}
                />
                {renderFields()}
            </Space>
            <br />
            <br />
        </DraggableModal>
    );
};
