import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Checkbox } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import CableManagerPlugin from '../../../../comms/public/js/api/cableManagerPlugin';
import { CablePluginFunctionDictionary, MenuItems } from './cablePluginFunctionDictionary';
import { functions } from 'underscore';
import { error } from 'jquery';

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

        plugin
            .highestUsedPinOn(cables[cableIndex])
            .then(result => {
                console.log(
                    'Highest used pin on cable ' + cables[cableIndex]._myw.title + ' is ' + result
                );
            })
            .catch(alert);
    };

    const onConnectionsFor = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));
        console.log('Checking the connections for cable ' + cable.properties.name);
        console.log('splice: ' + splice);
        console.log('sorted: ' + sorted);
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
            appRef.setCurrentFeature(housings[housingIndex], { zoomTo: true });
        });
    };

    const onCreateDetachedInternalSeg = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));
        const pole = poles.find(pole => pole.properties.name.includes('JS_Pole_1'));
        console.log('Creating a detached segment for cable ' + cable.properties.name);
        plugin.createDetachedInternalSeg(pole, cable, pole.getUrn, 10).then(result => {
            console.log(result);
            appRef.setCurrentFeature(cable, { zoomTo: true });
        });
    };

    const onCreateDetachedSlack = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));
        const pole = poles.find(pole => pole.properties.name.includes('JS_Pole_1'));
        console.log('Creating a slack for cable ' + cable.properties.name);
        plugin.createDetachedSlack(cable, pole).then(result => {
            console.log(result);
            appRef.setCurrentFeature(cable, { zoomTo: true });
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
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_6'));

        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/' + cable.properties.id)
        );
        const poleId = Number(segment.properties.in_structure.split('/')[1]);

        const pole = poles.find(pole => pole.id == poleId);
        //     console.log(segment.getUrn());
        plugin
            .createDetSlackAtSide(segment, pole, side)
            .then(result => {
                console.log(result);
                plugin
                    .addSlack(result.type, result, segment.getUrn(), side)
                    .then(result => {
                        console.log(result);
                    })
                    .catch(error => console.log('ERROR: ' + error));
                appRef.setCurrentFeature(result, { zoomTo: true });
            })
            .catch(error => console.log('ERROR: ' + error));
    };

    const onTransferConnections = () => {
        const old_cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));
        const new_cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_7'));

        const old_segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/' + old_cable.properties.id)
        );
        const new_segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/' + new_cable.properties.id)
        );
        plugin
            .transferConnections(old_segment.getUrn(), new_segment.getUrn(), side ? 'in' : 'out')
            .then(result => {
                console.log(result);
            });
    };

    const onConnectionsOf = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));

        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/' + cable.properties.id)
        );

        plugin.connectionsOf(segment.getUrn()).then(result => {
            console.log(result);
            appRef.setCurrentFeature(segment, { zoomTo: true });
        });
    };

    const onSegmentContainment = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));

        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/' + cable.properties.id)
        );
        plugin.segmentContainment(segment, side ? 'in' : 'out').then(result => {
            console.log(result);
            appRef.setCurrentFeature(segment, { zoomTo: true });
        });
    };

    const onSetSegmentContainment = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_7'));

        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/' + cable.properties.id)
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
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_4'));

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
                appRef.setCurrentFeature(segments[0], { zoomTo: true });
            });
    };

    const onFindDownstreamSegsToTick = () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_4'));

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
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_4'));

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
            console.log(cable2.properties.name + ' is internal? ' + result);
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
        console.log('Root Housing is ' + plugin.rootHousingUrnOf(segments[segmentIndex]));
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
        let segments = [];
        let segmentIndex = 0;
        while (segments.length < 1) {
            const cableIndex = Math.floor(Math.random() * cables.length);
            segments = fiberSegments.filter(segment =>
                segment.properties.cable.includes(cables[cableIndex].getUrn())
            );
            segmentIndex = Math.floor(Math.random() * segments.length);
        }

        console.log(
            'Slack type for ' +
                segments[segmentIndex]._myw.title +
                ' is ' +
                plugin.slackTypeForSegment(segments[segmentIndex])
        );
        appRef.setCurrentFeature(segments[segmentIndex], { zoomTo: true });
    };

    const onIsSegment = () => {
        const segment = fiberSegments[Math.floor(Math.random() * fiberSegments.length)];
        const cable = cables[Math.floor(Math.random() * cables.length)];
        const cabinet = cabinets[Math.floor(Math.random() * cabinets.length)];
        console.log(segment._myw.title + ' is a segment? ' + plugin.isSegment(segment.getUrn()));
        console.log(cable._myw.title + ' is a segment? ' + plugin.isSegment(cable.getUrn()));
        console.log(cabinet._myw.title + ' is a segment? ' + plugin.isSegment(cabinet.getUrn()));
    };

    const onSegmentTypes = () => {
        console.log(CableManagerPlugin.segmentTypes());
    };

    const onConnectionTypes = () => {
        console.log(CableManagerPlugin.connectionTypes());
    };

    const onSlackTypes = () => {
        console.log(CableManagerPlugin.slackTypes());
    };

    const onPinCountFor = () => {
        const segment = fiberSegments[Math.floor(Math.random() * fiberSegments.length)];
        console.log('number of pins for ' + segment._myw.title + ':');
        plugin.pinCountFor(segment).then(result => {
            console.log('undefined: ' + result);
            appRef.setCurrentFeature(segment, { zoomTo: true });
        });
        plugin.pinCountFor(segment, 'in').then(result => {
            console.log('in : ' + result);
        });
        plugin.pinCountFor(segment, 'out').then(result => {
            console.log('out : ' + result);
        });
        appRef.setCurrentFeature(segment, { zoomTo: true });
    };

    const onListCables = () => {
        console.log(myw.config['mywcom.cables']);
    };

    function renderFields() {
        if (pickedFunction && pickedFunction !== '') {
            return (
                <div>
                    <Space direction="vertical" size="small">
                        {CablePluginFunctionDictionary[pickedFunction].body}
                        {CablePluginFunctionDictionary[pickedFunction].checkbox && (
                            <>
                                {CablePluginFunctionDictionary[pickedFunction].checkbox.map(
                                    item => (
                                        <Checkbox
                                            key={item.label}
                                            onChange={eval(
                                                'e => set' + item.label + '(e.target.checked)'
                                            )}
                                        >
                                            {item.label}
                                        </Checkbox>
                                    )
                                )}
                            </>
                        )}
                        <Button
                            type="primary"
                            onClick={eval(CablePluginFunctionDictionary[pickedFunction].function)}
                        >
                            {pickedFunction}
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
                    options={MenuItems}
                />
                {renderFields()}
            </Space>
            <br />
            <br />
        </DraggableModal>
    );
};
