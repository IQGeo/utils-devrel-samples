import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Alert } from 'antd';
import { drop } from 'underscore';

export const CustomerConnectionModal = ({ open, plugin, builder }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [isOpen, setIsOpen] = useState(open);
    const [pole, setPole] = useState('');
    const [customer, setCustomer] = useState();
    const [wallBox, setWallBox] = useState(`WB-6000`);
    const [dropCable, setDropCable] = useState(`DROP-6000`);
    const [feederFiber, setFeederFiber] = useState(1);
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);

    useEffect(() => {
        const features = db.getFeatureTypes();
        console.log(features);
        setOnFunctions();
        updateFeatures();
    }, []);

    useEffect(() => {
        if (
            pole &&
            pole._myw.title.length > 0 &&
            customer &&
            customer._myw.title.length > 0 &&
            wallBox.length > 0 &&
            dropCable.length > 0
        ) {
            setDisabled(false);
        } else {
            setDisabled(true);
        }
    }, [pole, customer, wallBox, dropCable, feederFiber]);

    const handleCancel = () => {
        setIsOpen(false);
    };

    const handleFeederFiber = e => {
        const regex = /^\d+$/;
        if (regex.test(e.target.value)) {
            setFeederFiber(e.target.value);
        }
    };

    function setOnFunctions() {
        appRef.on('currentFeature-changed currentFeatureSet-changed', updateFeatures);
    }

    function updateFeatures() {
        const feature = appRef.currentFeature;
        if (!feature) return;

        if (feature.getType() === 'pole') {
            setPole(feature);
        }

        if (feature.getType() === 'address') {
            setCustomer(feature);
        }
    }

    const buildConnection = async () => {
        let closure;
        const closures = await builder.findEquipmentIn(pole, 'splice_closure');
        if (closures.length === 0) {
            closure = await builder.buildSpliceClosure(pole);
        } else {
            closure = closures[0];
        }
        const splitters = await builder.findEquipmentIn(pole, 'fiber_splitter');
        let connPoint = await builder.findConnectionPoint(splitters);
        if (!connPoint) {
            connPoint = await builder.buildSplitter(
                pole,
                feederFiber,
                splitters.length + 1,
                closure
            );
        }

        const wallBoxProps = {
            wallBox: { name: wallBox }
        };
        const wallBoxInfo = await builder.buildWallBox(customer.geometry.coordinates, wallBoxProps);

        const routeInfo = await builder.buildRoute(pole, wallBoxInfo.wallbox);

        const dropCableInfo = {
            name: dropCable,
            fiber_count: 16,
            directed: true
        };

        const cableInfo = await builder.buildDropCable(
            routeInfo,
            pole,
            wallBoxInfo.wallbox,
            dropCableInfo
        );

        const cableSegs = await cableInfo.followRelationship('cable_segments');

        await builder.connectDropToSplitter(connPoint.splitter, connPoint.port, cableSegs[0]);
        await builder.connectDropToTerminal(cableSegs[0], wallBoxInfo.ont);

        setCustomer(null);
        setPole(null);

        setAlertMessage(
            (connPoint.splitter.properties.name || 'unnamed splitter') + ' OUT# ' + connPoint.port
        );

        setWallBox(builder.nextName(wallBox));
        setDropCable(builder.nextName(dropCable));

        setIsAlertVisible(true);
        setTimeout(() => {
            setIsAlertVisible(false);
        }, 5000);
    };

    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={'Connect Customer'}
            width={500}
            onCancel={handleCancel}
            footer={[
                <Button key="cancel" onClick={handleCancel}>
                    Cancel
                </Button>,
                <Button disabled={disabled} key="create" onClick={buildConnection} type="primary">
                    Create
                </Button>
            ]}
        >
            Pole: <Input value={pole ? pole._myw.title : ''} disabled />
            Customer: <Input value={customer ? customer._myw.title : ''} disabled />
            Wall Box Name: <Input value={wallBox} onChange={e => setWallBox(e.target.value)} />
            Drop Cable Name:
            <Input value={dropCable} onChange={e => setDropCable(e.target.value)} />
            Feeder Fiber: <Input value={feederFiber} onChange={handleFeederFiber} />
            <br />
            {isAlertVisible && (
                <div>
                    <Alert message={alertMessage + ' created successfully!'} type="success" />
                </div>
            )}
        </DraggableModal>
    );
};
