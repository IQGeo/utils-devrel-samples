import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Checkbox } from 'myWorld-client/react';
import { Select, Space } from 'antd';

export const CableCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [pickedFunction, setPickedFunction] = useState('');
    const [cables, setCables] = useState([]);
    const [housings, setHousings] = useState([]);
    const [sorted, setSorted] = useState(false);
    const [splice, setSplice] = useState(false);
    const [isOpen, setIsOpen] = useState(open);
    const [pluginProp] = useState(plugin);

    const menuItems = [
        {
            value: 'listCables',
            label: 'List Cables'
        },
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
        }
    ];

    useEffect(() => {
        // const dbFeatures = db.getFeatureTypes();
        // console.log(dbFeatures);
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
    }, []);

    const closeWindow = () => {
        console.log(housings);
        setIsOpen(false);
    };

    const onHighestUsedPinOn = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);
        console.log('Calling the function for cable ' + cables[cableIndex].properties.name);

        pluginProp
            .highestUsedPinOn(cables[cableIndex])
            .then(result => {
                console.log(result);
            })
            .catch(alert);
    };

    const onConnectionsFor = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);
        console.log('Calling the function for cable ' + cables[cableIndex].properties.name);

        pluginProp.connectionsFor(cables[cableIndex], splice, sorted).then(result => {
            console.log(result);
        });
    };

    const onInternalSegments = () => {
        const housingIndex = Math.floor(Math.random() * housings.length);
        console.log('Calling the function for housing ' + housings[housingIndex].properties.name);

        pluginProp.internalSegments(housings[housingIndex], false).then(result => {
            console.log(result);
        });
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
                                Pressing the button will select a random cable and call the
                                connectionsFor function. You can also set the splice and sorted
                                parameters using the checkboxes.
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

                <Select onChange={value => setPickedFunction(value)} options={menuItems} />
                {renderFields()}
            </Space>
            <br />
            <br />
        </DraggableModal>
    );
};
