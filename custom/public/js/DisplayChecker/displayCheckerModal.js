import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Checkbox } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import { DisplayPluginFunctionDictionary, MenuItems } from './displayPluginFunctionDictionary';

export const DisplayCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [cables, setCables] = useState([]);
    const [proposed, setProposed] = useState(false);
    const [pickedFunction, setPickedFunction] = useState('');
    const [isOpen, setIsOpen] = useState(open);

    useEffect(() => {
        const dbFeatures = db.getFeatureTypes();
        console.log(dbFeatures);

        db.getFeatures('myworld/fiber_cable').then(result => {
            setCables(result);
        });

        // console.log(myw.config['mywcom.cables']);
        // const housingPromises = [
        //     db.getFeatures('myworld/ug_route'),
        //     db.getFeatures('myworld/oh_route'),
        //     db.getFeatures('myworld/conduit'),
        //     db.getFeatures('myworld/building'),
        //     db.getFeatures('myworld/mdu')
        // ];

        // const cablePromises = [
        //     db.getFeatures('myworld/coax_cable'),
        //     db.getFeatures('myworld/copper_cable'),
        //     db.getFeatures('myworld/fiber_cable')
        // ];

        // Promise.all(cablePromises).then(results => {
        //     setCables(results.flat());
        // });

        // Promise.all(housingPromises).then(results => {
        //     setHousings(results.flat());
        // });

        // db.getFeatures('myworld/pole').then(result => {
        //     setPoles(result);
        // });

        // db.getFeatures('myworld/cabinet').then(result => {
        //     setCabinets(result);
        // });

        // db.getFeatures('myworld/mywcom_fiber_slack').then(result => {
        //     setSlacks(result);
        // });

        // db.getFeatures('myworld/mywcom_fiber_segment').then(result => {
        //     setFiberSegments(result);
        // });

        // db.getFeatures('myworld/fiber_splitter').then(result => {
        //     setFiberSplitters(result);
        // });
    }, []);

    const closeWindow = () => {
        setIsOpen(false);
    };

    function renderFields() {
        if (pickedFunction && pickedFunction !== '') {
            return (
                <div>
                    <Space direction="vertical" size="small">
                        {DisplayPluginFunctionDictionary[pickedFunction].body}
                        {DisplayPluginFunctionDictionary[pickedFunction].checkbox && (
                            <>
                                {DisplayPluginFunctionDictionary[pickedFunction].checkbox.map(
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
                            onClick={eval(DisplayPluginFunctionDictionary[pickedFunction].function)}
                        >
                            {pickedFunction}
                        </Button>
                    </Space>
                </div>
            );
        }
    }

    const onGetState = () => {
        console.log(plugin.getState());
    };

    const onSpecManager = () => {
        console.log(plugin.specManager());
    };

    const onPinLabel = () => {
        const cable = cables[Math.floor(Math.random() * cables.length)];
        console.log('Pin label string for pin 1 of cable ' + cable.properties.name + ':');
        console.log(plugin.pinLabel(cable, 1));
        appRef.setCurrentFeature(cable);
        appRef.map.zoomTo(cable);
    };

    const onConnLabel = () => {
        const cable = cables[Math.floor(Math.random() * cables.length)];
        cable.connections().then(connections => {
            if (connections.length > 0) {
                plugin.connLabel(1, connections[0]);
                appRef.setCurrentFeature(cable);
                appRef.map.zoomTo(cable);
            } else {
                console.log(
                    'No connections found for cable ' + cable.properties.name + '. Try again.'
                );
            }
        });
    };

    const onCircuitCount = () => {
        console.log(plugin.circuitCount(1, proposed ? 'true' : 'false'));
    };

    const onFeatureLabel = () => {
        const cable = cables[Math.floor(Math.random() * cables.length)];
        console.log(plugin.featureLabel(cable));
        appRef.setCurrentFeature(cable);
        appRef.map.zoomTo(cable);
    };

    return (
        <DraggableModal
            wrapClassName="equipment-checker-modal"
            open={isOpen}
            title={'Display Manager Plugin'}
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
                    This plugin provide functions to manipulate and check several display features.
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
