import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Radio, Input } from 'myWorld-client/react';
import { Avatar, Cascader, List } from 'antd';
import { useRowStyle } from 'antd/es/grid/style';
import { geometry } from '@turf/turf';
import CompoundedSpace from 'antd/es/space';
import { UserSwitchOutlined } from '@ant-design/icons';

export const EquipmentCheckerModal = ({ open, plugin }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [fiberSplitters, setFiberSplitters] = useState();
    const [poles, setPoles] = useState();
    const [spliceTrays, setSpliceTrays] = useState();
    const [isOpen, setIsOpen] = useState(open);
    const [pluginProp] = useState(plugin);

    useEffect(() => {
        const dbFeatures = db.getFeatureTypes();
        console.log(dbFeatures);
        db.getFeatures('myworld/fiber_splitter').then(result => {
            setFiberSplitters(result);
        });
        db.getFeatures('myworld/pole').then(result => {
            setPoles(result);
        });
        db.getFeatures('myworld/fiber_splice_tray').then(result => {
            setSpliceTrays(result);
        });
        // db.getFeatures('myworld/conduit').then(result => {
        //     setConduits(result);
        // });
        // db.getFeatures('myworld/oh_route').then(result => {
        //     setOhRoute(result);
        // });
        // db.getFeatures('myworld/ug_route').then(result => {
        //     setRoutes(result);
        // });
        // db.getFeatures('myworld/conduit').then(result => {
        //     setConduits(result);
        // });
    }, []);

    const handleCancel = () => {
        setIsOpen(false);
    };

    const okButton = () => {
        console.log('EQUIPMENT = ' + myw.config['mywcom.equipment']);
        // console.log(fiberSplitters);
        // console.log(poles);
        console.log(spliceTrays);
        // console.log(conduits);
        // console.log(ohRoute);
        // for (let i = 0; i < fiberSplitters.length; i++) {
        //     console.log(i + ' --- ' + fiberSplitters[i].properties.root_housing);
        // }
        // for (let i = 0; i < poles.length; i++) {
        //     console.log(i + ' --- ' + poles[i]);
        // }
    };

    const onMoveAssembly = () => {
        pluginProp.moveAssembly(fiberSplitters[0], poles[0]).then(result => {
            console.log('SUCCESS');
            console.log(result);
        });
    };

    const onCopyAssembly = () => {
        pluginProp.copyAssembly(fiberSplitters[0], poles[0]).then(result => {
            console.log('SUCCESS');
            console.log(result);
        });
    };

    const onConnectionsIn = () => {
        let connections = [];
        const promises = spliceTrays.map(tray => pluginProp.connectionsIn(tray));
        Promise.all(promises).then(result => {
            console.log('SUCCESS');
            console.log(result);
        });
    };

    const onConnectionsOf = () => {
        pluginProp.connectionsOf(spliceTrays[0]).then(result => {
            console.log('SUCCESS');
            console.log(result);
        });
    };

    return (
        <DraggableModal
            wrapClassName="structure-checker-modal"
            open={isOpen}
            title={'Equipment Manager'}
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
            <Button onClick={onMoveAssembly}>moveAssembly</Button>
            <br />
            <Button onClick={onCopyAssembly}>copyAssembly</Button>
            <br />
            <Button onClick={onConnectionsIn}>connectionsIn</Button>
            <br />
            <Button onClick={onConnectionsOf}>connectionsOf</Button>
            <br />
        </DraggableModal>
    );
};
