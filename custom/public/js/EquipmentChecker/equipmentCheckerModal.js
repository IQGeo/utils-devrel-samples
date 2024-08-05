import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import { MenuItems, EquipmentPluginFunctionDictionary } from './equipmentPluginFunctionDictionary';

export const EquipmentCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [pickedFunction, setPickedFunction] = useState('');
    const [rack, setRack] = useState();
    const [fiberShelf, setFiberShelf] = useState();
    const [isOpen, setIsOpen] = useState(open);
    const [pluginProp] = useState(plugin);

    useEffect(() => {
        const dbFeatures = db.getFeatureTypes();
        console.log(dbFeatures);
        db.getFeatures('myworld/rack').then(result => {
            setRack(result);
        });
        db.getFeatures('myworld/fiber_shelf').then(result => {
            setFiberShelf(result);
        });
    }, []);

    const closeWindow = () => {
        setIsOpen(false);
    };

    const onMoveAssembly = () => {
        const fiberIndex = Math.floor(Math.random() * fiberShelf.length);
        const housingId = fiberShelf[fiberIndex].properties.housing.split('/')[1];
        const housingIdNum = parseInt(housingId, 10);
        const originalHousing = rack.find(obj => obj.id === housingIdNum);
        const rackIndex = Math.floor(Math.random() * rack.length);
        console.log(
            'The current rack for fiber shelf ' +
                fiberShelf[fiberIndex].properties.name +
                ' is ' +
                originalHousing.properties.name +
                ' and it will be moved to ' +
                rack[rackIndex].properties.name
        );

        pluginProp
            .moveAssembly(fiberShelf[fiberIndex], rack[rackIndex])
            .then(result => {
                console.log('The rack has been moved successfully!');
            })
            .catch(alert);
    };

    const onCopyAssembly = () => {
        const fiberIndex = Math.floor(Math.random() * fiberShelf.length);
        const housingId = fiberShelf[fiberIndex].properties.housing.split('/')[1];
        const housingIdNum = parseInt(housingId, 10);
        const originalHousing = rack.find(obj => obj.id === housingIdNum);
        const rackIndex = Math.floor(Math.random() * rack.length);

        console.log(
            'Fiber shelf ' +
                fiberShelf[fiberIndex].properties.name +
                ' is on rack ' +
                originalHousing.properties.name +
                ' and a copy of it will be created at the rack ' +
                rack[rackIndex].properties.name
        );

        pluginProp
            .copyAssembly(fiberShelf[fiberIndex], rack[rackIndex])
            .then(result => {
                console.log('The rack has been copied successfully!');
            })
            .catch(alert);
    };

    const onConnectionsIn = () => {
        const promises = fiberShelf.map(shelf => pluginProp.connectionsIn(shelf));
        Promise.all(promises)
            .then(result => {
                console.log('connectionsIn query successful!');
                console.log(result);
            })
            .catch(alert);
    };

    const onConnectionsOf = () => {
        const promises = fiberShelf.map(shelf => pluginProp.connectionsOf(shelf));
        Promise.all(promises)
            .then(result => {
                console.log('connectionsOf query successful!');
                console.log(result);
            })
            .catch(alert);
    };

    const onListEquipment = () => {
        console.log(myw.config['mywcom.equipment']);
    };

    function renderFields() {
        if (pickedFunction && pickedFunction !== '') {
            return (
                <div>
                    <Space direction="vertical" size="small">
                        {EquipmentPluginFunctionDictionary[pickedFunction].body}
                        <Button
                            type="primary"
                            onClick={eval(
                                EquipmentPluginFunctionDictionary[pickedFunction].function
                            )}
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
            title={'Equipment Manager Plugin'}
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
                    This plugin provide functions to manipulate equipment. To check what features
                    are Equipments you can check the myw.config['mywcom.equipment'] array.
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
