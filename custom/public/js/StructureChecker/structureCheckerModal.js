import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Select, Space } from 'antd';
import { pick, result } from 'underscore';

export const StructureCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [pickedFunction, setPickedFunction] = useState('');
    const [structures, setStructures] = useState([]);
    const [buildings, setBuildings] = useState();
    const [routes, setRoutes] = useState();
    const [conduits, setConduits] = useState();
    const [isOpen, setIsOpen] = useState(open);
    const [pluginProp] = useState(plugin);

    const menuItems = [
        {
            value: 'listStructures',
            label: 'List Structures'
        },
        {
            value: 'structContent',
            label: 'structContent'
        },
        {
            value: 'getStructuresAtCoords',
            label: 'getStructuresAtCoords'
        },
        {
            value: 'getStructureAt',
            label: 'getStructureAt'
        },
        {
            value: 'getStructuresAt',
            label: 'getStructuresAt'
        },
        {
            value: 'routeContent',
            label: 'routeContent'
        },
        {
            value: 'validateRoutesForConduit',
            label: 'validateRoutesForConduit'
        },
        {
            value: 'isStructure',
            label: 'isStructure'
        },
        {
            value: 'isRoute',
            label: 'isRoute'
        }
    ];

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
        pluginProp.structContent(structures[index]).then(result => {
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
        pluginProp.getStructuresAtCoords(coords).then(result => {
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
        pluginProp.getStructureAt(coords).then(result => {
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
        pluginProp.getStructuresAt(coords, null, 10).then(result => {
            console.log(result);
            appRef.setCurrentFeatureSet(result);
            appRef.map.zoomTo(result[0]);
        });
    };

    const onRouteContent = () => {
        const index = Math.floor(Math.random() * routes.length);
        pluginProp.routeContent(routes[index]).then(result => {
            console.log(result);
            appRef.map.zoomTo(result.route);
            appRef.setCurrentFeature(result.route, { zoomTo: true });
        });
    };

    const onValidateRoutesForConduit = () => {
        const index = Math.floor(Math.random() * conduits.length);
        console.log(pluginProp.validateRoutesForConduit(routes, conduits[index]));
    };

    const onIsStructure = () => {
        console.log(pluginProp.isStructure(structures[0]));
        console.log(pluginProp.isStructure(routes[0]));
        console.log(pluginProp.isStructure(conduits[0]));
    };

    const onIsRoute = () => {
        console.log(pluginProp.isRoute(structures[0]));
        console.log(pluginProp.isRoute(routes[0]));
        console.log(pluginProp.isRoute(conduits[0]));
    };

    const onListStructures = () => {
        console.log(myw.config['mywcom.structures']);
    };

    function renderFields() {
        switch (pickedFunction) {
            case 'listStructures':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                Pressing the button will list all features that are configured as a
                                building in the myw.config['mywcom.structures'] array.
                            </p>
                            <Button type="primary" onClick={onListStructures}>
                                List Structures
                            </Button>
                        </Space>
                    </div>
                );
            case 'structContent':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                structContent receives a Structure and returns the equipment,
                                cables, etc housed within (or connected to) it. Returns a
                                StructContent.
                            </p>
                            <p>
                                Pressing the button will pick a random structure and print on the
                                console the contents of the StructContent. Also the map will focus
                                on the structure and show its details in the "Details" tab.
                            </p>
                            <Button type="primary" onClick={onStructContent}>
                                structContent
                            </Button>
                        </Space>
                    </div>
                );
            case 'getStructuresAtCoords':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                getStructuresAtCoords receives an array of coordinates and returns
                                an array containing the structure (if any) at each given coordinate.
                            </p>
                            <p>
                                Pressing the button will pick three random structures and use their
                                coordinates as input, then print on the console the returning array,
                                as well as populate the "Details" tab with the structures
                                informations.
                            </p>
                            <Button type="primary" onClick={onGetStructuresAtCoords}>
                                getStructuresAtCoords
                            </Button>
                        </Space>
                    </div>
                );
            case 'getStructureAt':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                getStructureAt receives a coordinate and returns the structure
                                found. If no structures are found it returns null. If multiple
                                structures are found it returns a random structure
                            </p>
                            <p>
                                Pressing the button will pick a random structures and use its
                                coordinates as input, then print on the console the returning array.
                                As well as populate the "Details" tab with the structures
                                informations.
                            </p>
                            <Button type="primary" onClick={onGetStructureAt}>
                                getStructureAt
                            </Button>
                        </Space>
                    </div>
                );
            case 'getStructuresAt':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>getStructuresAt receives:</p>
                            <p>- A coordinate</p>
                            <p>- A list of feature types</p>
                            <p>- A tolerance value (in meters)</p>
                            And returns an array of structures.
                            <p>
                                Pressing the button will pick a random structure and use its
                                coordinates as input, it will search for any type of feature in a
                                10m radius, then print on the console the returning structure. Also
                                the map will focus on the first structure in the return array and
                                show a list of all structures returned in the "Details" tab.
                            </p>
                            <Button type="primary" onClick={onGetStructuresAt}>
                                getStructureAt
                            </Button>
                        </Space>
                    </div>
                );
            case 'routeContent':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                routeContent receives a route and an option boolean flagging if
                                proposed cables and conduits should be included. It returns a
                                RouteContent structure containing the cables and conduits housed in
                                the route.
                            </p>
                            <p>
                                Pressing the button will pick a random route and then print on the
                                console the returning RouteContent structure. Also the map will
                                focus on the route, as well as populate the "Details" tab with the
                                route informations.
                            </p>
                            <Button type="primary" onClick={onRouteContent}>
                                routeContent
                            </Button>
                        </Space>
                    </div>
                );
            case 'validateRoutesForConduit':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                validateRoutesForConduit receives an array of routes and conduit
                                feature and check if the routes within the array can receive the
                                conduit. Returns false if all routes can receive the conduit and
                                true otherwise.
                            </p>
                            <p>
                                Pressing the button will pick a random conduit and print on the
                                console the result of the function, either "true" or "false".
                            </p>
                            <Button type="primary" onClick={onValidateRoutesForConduit}>
                                validateRoutesForConduit
                            </Button>
                        </Space>
                    </div>
                );
            case 'isStructure':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                isStructure receives a feature and checks if it is a structure based
                                on the myw.config['mywcom.structures'] array. Returns false if all
                                routes can receive the conduit and true otherwise.
                            </p>
                            <p>
                                Pressing the button will call the function three times passing a
                                build, route, and conduit respectively and print on the console the
                                return for each of the calls (true, false, false).
                            </p>
                            <Button type="primary" onClick={onIsStructure}>
                                isStructure
                            </Button>
                        </Space>
                    </div>
                );
            case 'isRoute':
                return (
                    <div>
                        <Space direction="vertical" size="small">
                            <p>
                                isRoute receives a feature and checks if it is a route based on the
                                myw.config['mywcom.routes'] array. Returns false if all routes can
                                receive the conduit and true otherwise.
                            </p>
                            <p>
                                Pressing the button will call the function three times passing a
                                build, route, and conduit respectively and print on the console the
                                return for each of the calls (false, true, false).
                            </p>
                            <Button type="primary" onClick={onIsRoute}>
                                isRoute
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
                    Find structures at point, trace through route network. To check what features
                    are Structures you can check the myw.config['mywcom.structures'] array.
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
