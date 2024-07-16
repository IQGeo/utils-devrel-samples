import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Radio, Input } from 'myWorld-client/react';
import { Avatar, Cascader, List } from 'antd';
import { useRowStyle } from 'antd/es/grid/style';
import { geometry } from '@turf/turf';
import CompoundedSpace from 'antd/es/space';
import { UserSwitchOutlined } from '@ant-design/icons';

export const StructureCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [buildings, setBuildings] = useState();
    const [routes, setRoutes] = useState();
    const [conduits, setConduits] = useState();
    const [isOpen, setIsOpen] = useState(open);
    const [pluginProp] = useState(plugin);

    useEffect(() => {
        // const dbFeatures = db.getFeatureTypes();
        // console.log(dbFeatures);
        db.getFeatures('myworld/building').then(result => {
            setBuildings(result);
        });

        db.getFeatures('myworld/ug_route').then(result => {
            setRoutes(result);
        });

        db.getFeatures('myworld/conduit').then(result => {
            setConduits(result);
        });
    }, []);

    const handleCancel = () => {
        setIsOpen(false);
    };

    const okButton = () => {
        pluginProp.fireFeatureEvents();
    };

    const onStructContent = () => {
        // pluginProp.isStructure(buildings[0]);
        pluginProp.structContent(buildings[0]).then(result => {
            console.log(result);
        });
    };

    const onGetStructuresAtCoords = () => {
        const coords = [];

        coords.push(
            [buildings[0].getGeometry().coordinates[0], buildings[0].getGeometry().coordinates[1]],
            [buildings[1].getGeometry().coordinates[0], buildings[1].getGeometry().coordinates[1]]
        );
        pluginProp.getStructuresAtCoords(coords).then(result => {
            console.log(result);
        });
    };

    const onGetStructureAt = () => {
        const coords = [];

        coords.push(
            buildings[0].getGeometry().coordinates[0],
            buildings[0].getGeometry().coordinates[1]
        );
        pluginProp.getStructureAt(coords).then(result => {
            console.log(result);
        });
    };

    const onGetStructuresAt = () => {
        const coords = [];

        coords.push(
            buildings[0].getGeometry().coordinates[0],
            buildings[0].getGeometry().coordinates[1]
        );
        pluginProp.getStructuresAt(coords, null, 10).then(result => {
            console.log(result);
        });
    };

    const onRouteContent = () => {
        pluginProp.routeContent(routes[0]).then(result => {
            console.log(result);
        });
    };

    const onValidateRoutesForConduit = () => {
        for (let i = 0; i < conduits.totalCount; i++) {
            if (conduits[i]?.properties)
                console.log(pluginProp.validateRoutesForConduit(routes, conduits[i]));
        }
    };

    const onIsStructure = () => {
        console.log(pluginProp.isStructure(buildings[0]));
        console.log(pluginProp.isStructure(routes[0]));
        console.log(pluginProp.isStructure(conduits[0]));
    };

    const onIsRoute = () => {
        console.log(pluginProp.isRoute(buildings[0]));
        console.log(pluginProp.isRoute(routes[0]));
        console.log(pluginProp.isRoute(conduits[0]));
    };

    return (
        <DraggableModal
            wrapClassName="structure-checker-modal"
            open={isOpen}
            title={'Structure Manager'}
            width={500}
            onCancel={handleCancel}
            footer={[
                <Button key="cancel" onClick={handleCancel}>
                    Cancel
                </Button>,
                <Button key="ok" onClick={okButton} type="primary">
                    OK
                </Button>
            ]}
        >
            <Button onClick={onStructContent}>structContent</Button>
            <br />
            <Button onClick={onGetStructuresAtCoords}>getStructuresAtCoords</Button>
            <br />
            <Button onClick={onGetStructureAt}>getStructureAt</Button>
            <br />
            <Button onClick={onGetStructuresAt}>getStructuresAt</Button>
            <br />
            <Button onClick={onRouteContent}>routeContent</Button>
            <br />
            <Button onClick={onValidateRoutesForConduit}>validateRoutesForConduit</Button>
            <br />
            <Button onClick={onIsStructure}>isStructure</Button>
            <br />
            <Button onClick={onIsRoute}>isRoute</Button>
        </DraggableModal>
    );
};
