import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Select, Space } from 'antd';

export const EquipmentCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [pickedFunction, setPickedFunction] = useState('');
    const [rack, setRack] = useState();
    const [fiberShelf, setFiberShelf] = useState();
    const [cabinets, setCabinets] = useState();
    const [isOpen, setIsOpen] = useState(open);
    const [pluginProp] = useState(plugin);

    const menuItems = [
        {
            value: 'listEquipments',
            label: 'List Equipments'
        },
        {
            value: 'moveAssembly',
            label: 'moveAssembly'
        },
        {
            value: 'copyAssembly',
            label: 'copyAssembly'
        },
        {
            value: 'connectionsIn',
            label: 'connectionsIn'
        },
        {
            value: 'connectionsOf',
            label: 'connectionsOf'
        }
    ];

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

    const onListEquipments = () => {
        console.log(myw.config['mywcom.equipment']);
    };

    function renderFields() {
        switch (pickedFunction) {
            case 'listEquipments':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                Pressing the button will list all features that are configured as a
                                equipment in the myw.config['mywcom.equipment'] array.
                            </p>
                            <Button type="primary" onClick={onListEquipments}>
                                List Equipment
                            </Button>
                        </Space>
                    </div>
                );
            case 'moveAssembly':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                moveAssembly receives two parameters, the first one is the equipment
                                to be moved and the second is the new housing. The equipment and all
                                its children are moved. The only return is the successful
                                fulfillment of the Promise.
                            </p>
                            <p>
                                Pressing the button will take a fiber shelf and move it to a
                                different rack. Once the rack is moved a success message will appear
                                in the console, after that you can search for the fiber shelf on the
                                map and the Housing will be updated.
                            </p>
                            <Button type="primary" onClick={onMoveAssembly}>
                                moveAssembly
                            </Button>
                        </Space>
                    </div>
                );
            case 'copyAssembly':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                copyAssembly receives two parameters, the first one is the equipment
                                to be copied and the second is the housing that will receive the
                                copy. The only return is the successful fulfillment of the Promise.
                            </p>
                            <p>
                                Pressing the button will take a fiber shelf and copy it to a
                                different rack. The new equipment is created with a generic name
                                finishing with a number starting at 10000. You can rename it by
                                editing the feature.
                            </p>
                            <Button type="primary" onClick={onCopyAssembly}>
                                copyAssembly
                            </Button>
                        </Space>
                    </div>
                );
            case 'connectionsIn':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                connectionsIn receives an equipment or housing and returns an array
                                containing all connections in the given input.
                            </p>
                            <p>
                                Pressing the button will print on the console the return array for
                                connectionsIn calls for all the fiber shelves. If a given equipment
                                or housing has no connections the return will be an empty array.
                            </p>
                            <Button type="primary" onClick={onConnectionsIn}>
                                connectionsIn
                            </Button>
                        </Space>
                    </div>
                );
            case 'connectionsOf':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                connectionsOf receives an equipment or housing and returns an array
                                containing all connections for the given input.
                            </p>
                            <p>
                                Pressing the button will print on the console the return array for
                                connectionsOf calls for all the fiber shelves. If a given equipment
                                or housing has no connections the return will be an empty array.
                            </p>
                            <Button type="primary" onClick={onConnectionsOf}>
                                connectionsOf
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

                <Select onChange={value => setPickedFunction(value)} options={menuItems} />
                {renderFields()}
            </Space>

            <br />
            <br />
        </DraggableModal>
    );
};
