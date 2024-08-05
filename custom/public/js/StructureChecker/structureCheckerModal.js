import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import { StructurePluginFunctionDictionary, MenuItems } from './structurePluginFunctionDictionary';

export const StructureCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [pickedFunction, setPickedFunction] = useState('');
    const [structures, setStructures] = useState([]);
    const [routes, setRoutes] = useState();
    const [conduits, setConduits] = useState();
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

        db.getFeatures('myworld/ug_route').then(result => {
            setRoutes(result);
        });

        db.getFeatures('myworld/conduit').then(result => {
            setConduits(result);
        });
    }, []);

    const closeWindow = () => {
        setIsOpen(false);
    };

    const onStructContent = () => {
        const index = Math.floor(Math.random() * structures.length);
        plugin.structContent(structures[index]).then(result => {
            console.log('Content of structure: ', structures[index]._myw.title);
            console.log(result);
            appRef.setCurrentFeature(structures[index], { zoomTo: true });
        });
    };

    const onGetStructuresAtCoords = () => {
        const coords = [];
        for (let i = 0; i < 3; i++) {
            const index = Math.floor(Math.random() * structures.length);
            coords.push([
                structures[index].getGeometry().coordinates[0],
                structures[index].getGeometry().coordinates[1]
            ]);
        }
        plugin.getStructuresAtCoords(coords).then(result => {
            plugin.getStructuresAtCoords(coords).then(result => {
                console.log('Structures at coords:');
                coords.forEach(element => {
                    console.log(element);
                });
            });
            console.log(result);
            appRef.setCurrentFeatureSet(result);
        });
    };

    const onGetStructureAt = () => {
        const coords = [];
        const index = Math.floor(Math.random() * structures.length);

        coords.push(
            structures[index].getGeometry().coordinates[0],
            structures[index].getGeometry().coordinates[1]
        );
        plugin.getStructureAt(coords).then(result => {
            console.log('Structure at coords: ' + coords[0] + ' - ' + coords[1]);
            console.log(result);
            appRef.setCurrentFeature(structures[index], { zoomTo: true });
        });
    };

    const onGetStructuresAt = () => {
        const coords = [];
        const index = Math.floor(Math.random() * structures.length);

        coords.push(
            structures[index].getGeometry().coordinates[0],
            structures[index].getGeometry().coordinates[1]
        );
        plugin.getStructuresAt(coords, null, 10).then(result => {
            console.log('Structures at coords: ' + coords[0] + ' - ' + coords[1]);
            console.log(result);
            appRef.setCurrentFeatureSet(result);
            appRef.map.zoomTo(result[0]);
        });
    };

    const onRouteContent = () => {
        const index = Math.floor(Math.random() * routes.length);
        plugin.routeContent(routes[index]).then(result => {
            console.log('Content of route: ', routes[index]._myw.title);
            console.log(result);
            appRef.map.zoomTo(result.route);
            appRef.setCurrentFeature(result.route, { zoomTo: true });
        });
    };

    const onValidateRoutesForConduit = () => {
        const index = Math.floor(Math.random() * conduits.length);
        console.log('Checking the route for conduit: ', conduits[index]._myw.title);
        console.log(plugin.validateRoutesForConduit(routes, conduits[index]));
        appRef.setCurrentFeature(conduits[index], { zoomTo: true });
    };

    const onIsStructure = () => {
        console.log(
            'Is ' + structures[0]._myw.title + ' a structure? ' + plugin.isStructure(structures[0])
        );
        console.log(
            'Is ' + routes[0]._myw.title + ' a structure? ' + plugin.isStructure(routes[0])
        );
        console.log(
            'Is ' + conduits[0]._myw.title + ' a structure? ' + plugin.isStructure(conduits[0])
        );
    };

    const onIsRoute = () => {
        console.log(
            'Is ' + structures[0]._myw.title + ' a route? ' + plugin.isRoute(structures[0])
        );
        console.log('Is ' + routes[0]._myw.title + ' a route? ' + plugin.isRoute(routes[0]));
        console.log('Is ' + conduits[0]._myw.title + ' a route? ' + plugin.isRoute(conduits[0]));
    };

    const onListStructures = () => {
        console.log(myw.config['mywcom.structures']);
    };

    function renderFields() {
        if (pickedFunction && pickedFunction !== '') {
            return (
                <div>
                    <Space direction="vertical" size="small">
                        {StructurePluginFunctionDictionary[pickedFunction].body}
                        <Button
                            type="primary"
                            onClick={eval(
                                StructurePluginFunctionDictionary[pickedFunction].function
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
            wrapClassName="structure-checker-modal"
            open={isOpen}
            title={'Structure Manager Plugin'}
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
                    API containing functions related to structures. To check what features are
                    Structures, select the "List Structures" options below or check the
                    myw.config['mywcom.structures'] array. ()
                </p>
                <p>Select in the Dropdown below the function you want to demonstrate.</p>

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
