import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import { merge } from 'jquery';

export const ConduitCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [conduits, setConduits] = useState([]);
    const [housings, setHousings] = useState([]);
    const [ugRoutes, setUgRoutes] = useState([]);
    const [manholes, setManholes] = useState([]);
    const [cabinets, setCabinets] = useState([]);
    const [blownFiberTubes, setBlownFiberTubes] = useState([]);
    const [pickedFunction, setPickedFunction] = useState('');
    const [isOpen, setIsOpen] = useState(open);

    const menuItems = [
        {
            value: 'listConduits',
            label: 'List Conduits'
        },
        {
            value: 'disconnectConduit',
            label: 'disconnectConduit'
        },
        {
            value: 'connectConduits',
            label: 'connectConduits'
        },
        {
            value: 'moveInto',
            label: 'moveInto'
        },
        {
            value: 'isContinuousConduitType',
            label: 'isContinuousConduitType'
        }
    ];

    useEffect(() => {
        // console.log('CONDUITS = ' + myw.config['mywcom.conduits']);
        // for (const c in myw.config['mywcom.conduits']) {
        //     console.log(myw.config['mywcom.conduits'][c]);
        // }
        const dbFeatures = db.getFeatureTypes();
        console.log(dbFeatures);
        db.getFeatures('myworld/conduit').then(result => {
            setConduits(result);
        });

        const housingPromises = [
            db.getFeatures('myworld/ug_route'),
            db.getFeatures('myworld/conduit'),
            db.getFeatures('myworld/building'),
            db.getFeatures('myworld/mdu')
        ];

        Promise.all(housingPromises).then(results => {
            setHousings(results.flat());
        });
        db.getFeatures('myworld/manhole').then(result => {
            setManholes(result);
        });

        db.getFeatures('myworld/cabinet').then(result => {
            setCabinets(result);
        });

        db.getFeatures('myworld/blown_fiber_tube').then(result => {
            setBlownFiberTubes(result);
        });
    }, []);

    const closeWindow = () => {
        setIsOpen(false);
    };

    const okButton = () => {
        for (const r in manholes) {
            console.log(manholes[r]);
        }
    };

    const onDisconnectConduit = () => {
        const conduit = blownFiberTubes.find(conduit =>
            conduit.properties.name.includes('JS_BF_2')
        );
        const housing = cabinets.find(cabinet => cabinet.properties.name.includes('JS_CAB_2'));
        console.log(conduit.properties.name + ' is housed into ' + housing.properties.name);
        plugin
            .disconnectConduit(conduit, housing)
            .then(result => {
                console.log('disconnectConduit successful!');
                console.log(result);
            })
            .catch(alert);
        appRef.setCurrentFeature(housing, { zoomTo: true });
    };

    const onConnectConduits = () => {
        const disconnectedBlownFiberTubes = blownFiberTubes.filter(conduit =>
            conduit.properties.name.includes('JS_BF_2')
        );

        const housing = cabinets.find(cabinet => cabinet.properties.name.includes('JS_CAB_2'));

        console.log(
            'Connecting ' +
                disconnectedBlownFiberTubes[0].properties.name +
                ' and ' +
                disconnectedBlownFiberTubes[1].properties.name +
                ' into ' +
                housing.properties.name
        );
        plugin
            .connectConduits(
                housing,
                disconnectedBlownFiberTubes[0],
                disconnectedBlownFiberTubes[1]
            )
            .then(result => {
                console.log('onConnectConduits successful!');
                console.log(result);
            })
            .catch(result => {
                console.log(result);
            });

        appRef.setCurrentFeature(housing, { zoomTo: true });
    };

    const onMoveInto = () => {
        const subConduit = conduits.find(conduit =>
            conduit.properties.name.includes('JS_SUBCND_1')
        );
        const housingId = Number(subConduit.properties.housing.split('/')[1]);
        let destinationHousing;
        console.log(subConduit);
        console.log(housingId);
        const housing = housings.find(housing => housing.properties.id === housingId);
        console.log(housing);
        if (housing.properties.name === 'JS_CND_1')
            destinationHousing = housings.find(housing => housing.properties.name === 'JS_CND_5');
        else destinationHousing = housings.find(housing => housing.properties.name === 'JS_CND_1');
        console.log(
            subConduit.properties.name +
                ' is currently housed into ' +
                housing.properties.name +
                ' and will be moved to ' +
                destinationHousing.properties.name
        );
        plugin.moveInto(subConduit, destinationHousing).then(result => {
            console.log('moveInto successful!');
            console.log(result);
        });
        appRef.setCurrentFeature(destinationHousing, { zoomTo: true });
    };

    const onIsContinuousConduitType = () => {
        const mergedConduits = conduits.concat(blownFiberTubes);
        const randomConduit = mergedConduits[Math.floor(Math.random() * mergedConduits.length)];

        if (plugin.isContinuousConduitType(randomConduit)) {
            console.log('Conduit ' + randomConduit.properties.name + ' is continuous');
        } else {
            console.log('Conduit ' + randomConduit.properties.name + ' is NOT continuous');
        }
    };

    const onListConduits = () => {
        console.log(myw.config['mywcom.conduits']);
    };

    function renderFields() {
        switch (pickedFunction) {
            case 'listConduits':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                Pressing the button will list all features that are configured as a
                                conduit in the myw.config['mywcom.conduits'] array.
                            </p>
                            <Button type="primary" onClick={onListConduits}>
                                List Conduits
                            </Button>
                        </Space>
                    </div>
                );
            case 'disconnectConduit':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                IMPORTANT: disconnectConduit only works on Continuous conduits
                                (e.g.: Blown Fiber Tubes)
                            </p>
                            <p>
                                disconnectConduit disconnects the conduit from its housing. The
                                conduit's housing is stored in the root_housing property of the
                                conduit.
                            </p>
                            <p>
                                Pressing the button will disconnect conduit JB_BFT_2 in the housing
                                JS_CAB_2, focus the map on the cabinet and show the cabinet status
                                on the details.
                            </p>
                            <Button type="primary" onClick={onDisconnectConduit}>
                                disconnectConduit
                            </Button>
                        </Space>
                    </div>
                );
            case 'connectConduits':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                IMPORTANT: connectConduits only works on Continuous conduits (e.g.:
                                Blown Fiber Tubes)
                            </p>
                            <p>
                                connectConduit connects two conduits arriving in a housing. The
                                conduit's housing is stored in the root_housing property of the
                                conduit.
                            </p>
                            <p>
                                Pressing the button will connect the two sections of conduit
                                JB_BFT_2 in the housing JS_CAB_2, focus the map on the cabinet and
                                show the cabinet status on the details. Trying to connect the
                                conduits when they are already connected will make the promise throw
                                an error that will be printed in the console.
                            </p>
                            <Button type="primary" onClick={onConnectConduits}>
                                connectConduits
                            </Button>
                        </Space>
                    </div>
                );
            case 'moveInto':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                moveInto moves a cable segment or conduit to a new housing in same
                                route
                            </p>
                            <p>
                                Pressing the button will move JS_SUBCND_1 between JS_CND_1 to the
                                conduit JS_CND_5 (i.e.: If it is currently housed into JS_CND_1 it
                                will move it to JS_CND_5 and vice-versa), focus the map on the
                                cabinet and show the route the conduit information in the details
                                tab.
                            </p>
                            <Button type="primary" onClick={onMoveInto}>
                                moveInto
                            </Button>
                        </Space>
                    </div>
                );
            case 'isContinuousConduitType':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                isContinuousConduitType will return true if the feature is a
                                continuous conduit (e.g.: Blown Fiber Tubes).
                            </p>
                            <p>
                                Pressing the button will randomly pick a conduit and check if it is
                                continuous or not.
                            </p>
                            <Button type="primary" onClick={onIsContinuousConduitType}>
                                isContinuousConduitType
                            </Button>
                        </Space>
                    </div>
                );
        }
    }

    return (
        <DraggableModal
            wrapClassName="conduit-checker-modal"
            open={isOpen}
            title={'Conduit Manager Plugin'}
            width={500}
            onCancel={closeWindow}
            footer={[
                <Button key="ok" onClick={okButton} type="primary">
                    Close Window
                </Button>
            ]}
        >
            <Space direction="vertical" size="middle">
                <p>
                    ********** Conduit Manager description **********. To check what features are
                    Structures you can check the myw.config['mywcom.conduits'] array.
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
