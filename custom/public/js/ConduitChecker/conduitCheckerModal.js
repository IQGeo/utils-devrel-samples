import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Select, Space } from 'antd';

export const ConduitCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [conduits, setConduits] = useState([]);
    const [housings, setHousings] = useState([]);
    const [ugRoutes, setUgRoutes] = useState([]);
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
            db.getFeatures('myworld/oh_route'),
            db.getFeatures('myworld/conduit'),
            db.getFeatures('myworld/building'),
            db.getFeatures('myworld/mdu')
        ];

        Promise.all(housingPromises).then(results => {
            setHousings(results.flat());
        });
        // db.getFeatures('myworld/ug_route').then(result => {
        //     setUgRoutes(result);
        // });
    }, []);

    const closeWindow = () => {
        setIsOpen(false);
    };

    const okButton = () => {
        for (const c in conduits) {
            console.log(conduits[c]);
            console.log(conduits[c]._myw.title);
        }
        for (const r in ugRoutes) {
            console.log(ugRoutes[r]);
        }
    };

    const onDisconnectConduit = () => {
        const index = Math.floor(Math.random() * conduits.length);
        const housingId = parseInt(conduits[index].properties.housing.split('/')[1]);
        const housing = housings.find(item => item.id === housingId);
        console.log(conduits[index]._myw.title + ' is housed into ' + housing._myw.title);
        plugin
            .disconnectConduit(conduits[index], housing)
            .then(result => {
                console.log('disconnectConduit successful!');
                console.log(result);
            })
            .catch(alert);
    };

    const onConnectConduits = () => {
        const conduit1index = Math.floor(Math.random() * conduits.length);
        const conduit2index = Math.floor(Math.random() * conduits.length);
        const housingId = parseInt(conduits[conduit1index].properties.housing.split('/')[1]);
        const housing = housings.find(item => item.id === housingId);
        // console.log(conduits[index]._myw.title + ' is housed into ' + housing.properties.name);
        console.log(
            'Connecting ' +
                conduits[conduit1index]._myw.title +
                ' and ' +
                conduits[conduit2index]._myw.title +
                ' into ' +
                housing._myw.title
        );
        plugin
            .connectConduits(housing, conduits[conduit1index], conduits[conduit2index])
            .then(result => {
                console.log('onConnectConduits successful!');
                console.log(result);
            })
            .catch(alert);
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
                                disconnectConduit disconnects the conduit from its housing. The
                                conduit's housing is stored in the root_housing property of the
                                conduit.
                            </p>
                            <p>
                                Pressing the button will randomly pick a conduit and disconnect it
                                from its housing, the operation information is shown in the
                                development console. Returns true if the operation was successful.
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
                                connectConduits a housing and two conduits, and connects the
                                conduits into the housing.
                            </p>
                            <p>
                                Pressing the button will randomly pick two conduits and connect them
                                within the housing of one of them. Returns true if the operation was
                                successful.
                            </p>
                            <Button type="primary" onClick={onConnectConduits}>
                                connectConduits
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
