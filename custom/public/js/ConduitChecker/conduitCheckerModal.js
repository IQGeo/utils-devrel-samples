import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import { ConduitPluginFunctionDictionary, MenuItems } from './conduitPluginFunctionDictionary';

export const ConduitCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [conduits, setConduits] = useState([]);
    const [housings, setHousings] = useState([]);
    const [cabinets, setCabinets] = useState([]);
    const [blownFiberTubes, setBlownFiberTubes] = useState([]);
    const [pickedFunction, setPickedFunction] = useState('');
    const [isOpen, setIsOpen] = useState(open);

    useEffect(() => {
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
        const housing = housings.find(housing => housing.properties.id === housingId);
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
        if (pickedFunction && pickedFunction !== '') {
            return (
                <div>
                    <Space direction="vertical" size="small">
                        {ConduitPluginFunctionDictionary[pickedFunction].body}
                        <Button
                            type="primary"
                            onClick={eval(ConduitPluginFunctionDictionary[pickedFunction].function)}
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
            wrapClassName="conduit-checker-modal"
            open={isOpen}
            title={'Conduit Manager Plugin'}
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
                    ********** Conduit Manager description **********. To check what features are
                    Structures you can check the myw.config['mywcom.conduits'] array.
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
