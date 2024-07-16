import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Radio, Input } from 'myWorld-client/react';
import { Avatar, Cascader, List } from 'antd';
import { useRowStyle } from 'antd/es/grid/style';

export const StructureCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [buildings, setBuildings] = useState();
    const [isOpen, setIsOpen] = useState(open);
    const [pluginProp] = useState(plugin);

    useEffect(() => {
        db.getFeatures('myworld/building').then(result => {
            setBuildings(result);
            // for (const b in result) {
            //     if (result[b]?.properties) {
            //         console.log('FROM PLUGIN = ' + pluginProp.isStructure(result[b]));
            //     }
            // }
        });
        // setFeatures(dbFeatures);
    }, []);

    const handleCancel = () => {
        setIsOpen(false);
    };

    const okButton = () => {
        // console.log(appRef);
        // console.log(appRef.plugins);
        // console.log(appRef.plugins.structureManager);
        // console.log(appRef.plugins.structureManager.isStructure());
        console.log(pluginProp);
        console.log(pluginProp.upperFunc());
        // appRef.plugins.structureManagerPlugin.isStructure(null);
    };

    const onStructContent = () => {
        // pluginProp.isStructure(buildings[0]);
        pluginProp.structContent(buildings[0]).then(result => {
            console.log(result);
        });
        // pluginProp.structContent(buildings[0]).then(result => {
        //     console.log(result);
        // });
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
        </DraggableModal>
    );
};
