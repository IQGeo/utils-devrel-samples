import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Checkbox } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import {
    ConnectionPluginFunctionDictionary,
    MenuItems
} from './connectionPluginFunctionDictionary';
import { ConsoleSqlOutlined } from '@ant-design/icons';

export const ConnectionCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [cables, setCables] = useState([]);
    const [splitters, setSplitters] = useState([]);
    const [fiberConnection, setFiberConnection] = useState([]);
    const [onts, setOnts] = useState([]);
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

        db.getFeatures('myworld/fiber_splitter').then(result => {
            setSplitters(result);
        });

        db.getFeatures('myworld/fiber_ont').then(result => {
            setOnts(result);
        });

        db.getFeatures('myworld/mywcom_fiber_connection').then(result => {
            setFiberConnection(result);
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
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        plugin.freePinsOn(splitter, 'fiber', side ? 'in' : 'out').then(result => {
            console.log('Free pins on ' + splitter.properties.name + ' are: ');
            console.log(result);
            appRef.setCurrentFeature(splitter);
            appRef.map.zoomTo(splitter);
        });
    };

    const onUsedPinsOn = async () => {
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        plugin.usedPinsOn(splitter, 'fiber', side ? 'in' : 'out').then(result => {
            console.log('Used pins on ' + splitter.properties.name + ' are: ');
            console.log(result);
            appRef.setCurrentFeature(splitter);
            appRef.map.zoomTo(splitter);
        });
    };

    const onHighPinUsedOn = async () => {
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        plugin.highPinUsedOn(splitter, 'fiber', side ? 'in' : 'out').then(result => {
            console.log('Highest pin used on ' + splitter.properties.name + ' is: ');
            console.log(result);
            appRef.setCurrentFeature(splitter);
            appRef.map.zoomTo(splitter);
        });
    };

    const onPinStateFor = async () => {
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        plugin.pinStateFor(splitter, 'fiber', side ? 'in' : 'out').then(result => {
            console.log('Pin states for ' + splitter.properties.name + ' are: ');
            console.log(result);
            appRef.setCurrentFeature(splitter);
            appRef.map.zoomTo(splitter);
        });
    };

    const onPinCountFor = async () => {
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        plugin.pinCountFor(splitter, 'fiber', side ? 'in' : 'out').then(result => {
            console.log('Number of pins in ' + splitter.properties.name + ' is: ' + result);
            appRef.setCurrentFeature(splitter);
            appRef.map.zoomTo(splitter);
        });
    };

    const onTraceOut = async () => {
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        let pinsArray = [];
        plugin.usedPinsOn(splitter, 'fiber', 'out').then(result => {
            if (result.length > 0) {
                pinsArray = result;
                if (pinsArray.length > 0) {
                    const pin = {
                        spec: 'out:' + pinsArray[0]
                    };
                    plugin.traceOut('fiber', splitter, pin, 'downstream').then(result => {
                        console.log(
                            'Trace result for pin ' +
                                pinsArray[0] +
                                ' at ' +
                                splitter.properties.name +
                                ' is: '
                        );
                        console.log(result);
                        appRef.setCurrentFeature(splitter);
                        appRef.map.zoomTo(splitter);
                    });
                } else {
                    console.log('No pins available. Try again.');
                }
            }
        });
    };

    const onConnect = async () => {
        let freePinsStart = [];
        let freePinsEnd = [];
        const splitter = splitters.find(
            splitter => splitter.properties.name === 'JS_FiberSplitter_1'
        );
        const ont = onts.find(ont => ont.properties.name === 'JS_ONT_1');
        plugin.freePinsOn(splitter, 'fiber', 'out').then(result => {
            freePinsStart = result;
            plugin.freePinsOn(ont, 'fiber', 'in').then(result => {
                freePinsEnd = result;
                const pinOut = {
                    spec: 'out:' + freePinsStart[0]
                };
                const pinIn = {
                    spec: 'in:' + freePinsEnd[0]
                };
                plugin.connect('fiber', splitter, pinOut, ont, pinIn, ont).then(result => {
                    console.log('Connection record created!');
                    appRef.setCurrentFeature(ont);
                    appRef.map.zoomTo(ont);
                });
            });
        });
    };

    const onDisconnect = async () => {
        let usedPins = [];
        const ont = onts.find(ont => ont.properties.name === 'JS_ONT_1');
        plugin.usedPinsOn(ont, 'fiber', 'in').then(result => {
            usedPins = result;
            const pin = {
                spec: 'in:' + usedPins[usedPins.length - 1]
            };
            plugin.disconnect('fiber', ont, pin).then(result => {
                console.log(result);
                appRef.setCurrentFeature(ont);
                appRef.map.zoomTo(ont);
            });
        });
    };

    const onMoveConns = async () => {
        const originOnt = onts.find(ont => ont.properties.name === 'XX-ONT-100071');
        const ont = onts.find(ont => ont.properties.name === 'XX-ONT-100070');
        const connections = fiberConnection.filter(
            connection => connection.properties.in_object === originOnt.getUrn()
        );
        const connectionsUrn = connections.map(connection => connection.getUrn());
        plugin.moveConns(connectionsUrn, ont.getUrn(), ont.properties.root_housing).then(result => {
            console.log(result);
            appRef.setCurrentFeature(ont);
            appRef.map.zoomTo(ont);
        });
    };

    const onTechFor = async () => {
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        console.log('Tech for ' + splitter.properties.name + ' is: ' + plugin.techFor(splitter));
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
