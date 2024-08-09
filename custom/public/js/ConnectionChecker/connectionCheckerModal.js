import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Checkbox } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import {
    ConnectionPluginFunctionDictionary,
    MenuItems
} from './connectionPluginFunctionDictionary';

export const ConnectionCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [cables, setCables] = useState([]);
    const [pickedFunction, setPickedFunction] = useState('');
    const [side, setSide] = useState(false);
    const [isOpen, setIsOpen] = useState(open);

    useEffect(() => {
        const features = db.getFeatureTypes();
        console.log(features);

        const cablePromises = [
            db.getFeatures('myworld/coax_cable'),
            db.getFeatures('myworld/copper_cable'),
            db.getFeatures('myworld/fiber_cable')
        ];

        Promise.all(cablePromises).then(results => {
            setCables(results.flat());
        });

        // const housingPromises = [
        //     db.getFeatures('myworld/ug_route'),
        //     db.getFeatures('myworld/conduit'),
        //     db.getFeatures('myworld/building'),
        //     db.getFeatures('myworld/mdu')
        // ];

        // Promise.all(housingPromises).then(results => {
        //     setHousings(results.flat());
        // });
        // db.getFeatures('myworld/manhole').then(result => {
        //     setManholes(result);
        // });

        // db.getFeatures('myworld/cabinet').then(result => {
        //     setCabinets(result);
        // });

        // db.getFeatures('myworld/blown_fiber_tube').then(result => {
        //     setBlownFiberTubes(result);
        // });
    }, []);

    const closeWindow = () => {
        setIsOpen(false);
    };

    const onFreePinsOn = async () => {
        const cable = cables.find(cable => cable.properties.name.includes('JS_Fiber_1'));
        plugin.freePinsOn(cable, cable.getType(), side ? 'in' : 'out').then(result => {
            console.log(result);
        });
        // async freePinsOn(feature, tech, side) {
        // side ? 'in' : 'out'
    };

    function renderFields() {
        if (pickedFunction && pickedFunction !== '') {
            return (
                <div>
                    <Space direction="vertical" size="small">
                        {ConnectionPluginFunctionDictionary[pickedFunction].body}
                        {ConnectionPluginFunctionDictionary[pickedFunction].checkbox && (
                            <>
                                {ConnectionPluginFunctionDictionary[pickedFunction].checkbox.map(
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
                            onClick={eval(
                                ConnectionPluginFunctionDictionary[pickedFunction].function
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
            wrapClassName="connection-checker-modal"
            open={isOpen}
            title={'Connection Manager Plugin'}
            width={500}
            onCancel={closeWindow}
            footer={[
                <Button key="ok" onClick={closeWindow} type="primary">
                    Close Window
                </Button>
            ]}
        >
            <Space direction="vertical" size="middle">
                <p>API for connecting and disconnecting signal carriers (ports and cables)</p>
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
