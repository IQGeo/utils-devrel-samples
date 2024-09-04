import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';

export const ApiIntroModal = ({
    open,
    structurePlugin,
    equipmentPlugin,
    conduitPlugin,
    cablePlugin,
    connectionPlugin
}) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [rack, setRack] = useState();
    const [fiberShelf, setFiberShelf] = useState();
    const [cabinets, setCabinets] = useState([]);
    const [blownFiberTubes, setBlownFiberTubes] = useState([]);
    const [structures, setStructures] = useState([]);
    const [cables, setCables] = useState([]);
    const [fiberSegments, setFiberSegments] = useState([]);
    const [splitters, setSplitters] = useState([]);
    const [isOpen, setIsOpen] = useState(open);

    useEffect(() => {
        let promises = [];
        for (const structure in myw.config['mywcom.structures']) {
            let query = 'myworld/' + structure;
            promises.push(db.getFeatures(query));
        }
        Promise.all(promises).then(result => {
            setStructures(result.flat());
        });
        db.getFeatures('myworld/rack').then(result => {
            setRack(result);
        });
        db.getFeatures('myworld/fiber_shelf').then(result => {
            setFiberShelf(result);
        });

        db.getFeatures('myworld/cabinet').then(result => {
            setCabinets(result);
        });

        db.getFeatures('myworld/blown_fiber_tube').then(result => {
            setBlownFiberTubes(result);
        });

        db.getFeatures('myworld/fiber_cable').then(result => {
            setCables(result);
        });

        db.getFeatures('myworld/mywcom_fiber_segment').then(result => {
            setFiberSegments(result);
        });

        db.getFeatures('myworld/fiber_splitter').then(result => {
            setSplitters(result);
        });
    }, []);

    const closeWindow = () => {
        setIsOpen(false);
    };

    const onStructContent = () => {
        const index = Math.floor(Math.random() * structures.length);
        structurePlugin.structContent(structures[index]).then(result => {
            console.log('Content of structure: ', structures[index]._myw.title);
            console.log(result);
            appRef.setCurrentFeature(structures[index], { zoomTo: true });
            appRef.map.zoomTo(result);
        });
    };

    const onGetStructuresAt = () => {
        const coords = [];
        const index = Math.floor(Math.random() * structures.length);

        coords.push(
            structures[index].getGeometry().coordinates[0],
            structures[index].getGeometry().coordinates[1]
        );
        structurePlugin.getStructuresAt(coords, null, 100).then(result => {
            console.log('Structures at coords: ' + coords[0] + ' - ' + coords[1]);
            console.log(result);
            appRef.setCurrentFeatureSet(result);
            appRef.map.zoomTo(result[0]);
        });
    };

    const onConnectionsIn = () => {
        const promises = fiberShelf.map(shelf => equipmentPlugin.connectionsIn(shelf));
        Promise.all(promises)
            .then(result => {
                console.log('connectionsIn query successful!');
                console.log(result);
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

        equipmentPlugin
            .copyAssembly(fiberShelf[fiberIndex], rack[rackIndex])
            .then(result => {
                console.log('The rack has been copied successfully!');
                appRef.map.zoomTo(rack[rackIndex]);
            })
            .catch(alert);
    };

    const onConnectConduit = () => {
        const bf_1 = blownFiberTubes.filter(conduit =>
            conduit.properties.name.includes('API_BF_1')
        );
        const bf_2 = blownFiberTubes.filter(conduit =>
            conduit.properties.name.includes('API_BF_2')
        );

        const housing = cabinets.find(cabinet => cabinet.properties.name.includes('XX-C-100004'));

        console.log('Connecting ' + bf_1 + ' and ' + bf_2 + ' into ' + housing.properties.name);
        conduitPlugin
            .connectConduits(housing, bf_1[0].properties.name, bf_2[0].properties.name)
            .then(result => {
                console.log('onConnectConduits successful!');
                console.log(result);
            })
            .catch(result => {
                console.log(result);
            });

        appRef.setCurrentFeature(housing, { zoomTo: true });
    };

    const onDisconnectConduit = () => {
        const conduit = blownFiberTubes.find(conduit =>
            conduit.properties.name.includes('API_BF_1')
        );
        const housing = cabinets.find(cabinet => cabinet.properties.name.includes('XX-C-100004'));
        console.log(conduit.properties.name + ' is housed into ' + housing.properties.name);
        conduitPlugin
            .disconnectConduit(conduit, housing)
            .then(result => {
                console.log('disconnectConduit successful!');
                console.log(result);
            })
            .catch(alert);
        appRef.setCurrentFeature(housing, { zoomTo: true });
    };

    const onHighestUsedPinOn = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);

        cablePlugin
            .highestUsedPinOn(cables[cableIndex])
            .then(result => {
                console.log(
                    'Highest used pin on cable ' + cables[cableIndex]._myw.title + ' is ' + result
                );
                appRef.setCurrentFeature(cables[cableIndex], { zoomTo: true });
                appRef.map.zoomTo(cables[cableIndex]);
            })
            .catch(alert);
    };

    const onConnectionsOf = () => {
        const cableIndex = Math.floor(Math.random() * cables.length);

        const segment = fiberSegments.find(segment =>
            segment.properties.cable.includes('fiber_cable/' + cables[cableIndex].properties.id)
        );

        cablePlugin.connectionsOf(segment.getUrn()).then(result => {
            console.log(result);
            appRef.setCurrentFeature(segment, { zoomTo: true });
        });
    };

    const onFreePinsOn = async () => {
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        connectionPlugin.freePinsOn(splitter, 'fiber', 'in').then(result => {
            console.log('Free pins on ' + splitter.properties.name + ' on the in side are: ');
            console.log(result);
        });
        connectionPlugin.freePinsOn(splitter, 'fiber', 'out').then(result => {
            console.log('Free pins on ' + splitter.properties.name + ' on the out side are: ');
            console.log(result);
            appRef.setCurrentFeature(splitter);
            appRef.map.zoomTo(splitter);
        });
    };

    const onTraceOut = async () => {
        const splitter = splitters[Math.floor(Math.random() * splitters.length)];
        let pinsArray = [];
        connectionPlugin.usedPinsOn(splitter, 'fiber', 'out').then(result => {
            if (result.length > 0) {
                pinsArray = result;
                if (pinsArray.length > 0) {
                    const pin = {
                        spec: 'out:' + pinsArray[0]
                    };
                    connectionPlugin.traceOut('fiber', splitter, pin, 'downstream').then(result => {
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

    return (
        <DraggableModal
            wrapClassName="structure-api-modal"
            open={isOpen}
            title={'API Intro'}
            width={500}
            onCancel={closeWindow}
            footer={[
                <Button key="close" onClick={closeWindow} type="primary">
                    Close Window
                </Button>
            ]}
        >
            <Button key="structContent" onClick={onStructContent} type="primary">
                structContent
            </Button>
            <br />
            <Button key="getStructuresAt" onClick={onGetStructuresAt} type="primary">
                getStructuresAt
            </Button>
            <br />
            <Button key="connectionsIn" onClick={onConnectionsIn} type="primary">
                connectionsIn
            </Button>
            <br />
            <Button key="copyAssembly" onClick={onCopyAssembly} type="primary">
                copyAssembly
            </Button>
            <br />
            <Button key="connectConduit" onClick={onConnectConduit} type="primary">
                connectConduit
            </Button>
            <br />
            <Button key="disconnectConduit" onClick={onDisconnectConduit} type="primary">
                disconnectConduit
            </Button>
            <br />
            <Button key="highestUsedPinOn" onClick={onHighestUsedPinOn} type="primary">
                highestUsedPinOn
            </Button>
            <br />
            <Button key="connectionsOf" onClick={onConnectionsOf} type="primary">
                connectionsOf
            </Button>
            <br />
            <Button key="freePinsOn" onClick={onFreePinsOn} type="primary">
                freePinsOn
            </Button>
            <br />
            <Button key="traceOut" onClick={onTraceOut} type="primary">
                traceOut
            </Button>
        </DraggableModal>
    );
};
