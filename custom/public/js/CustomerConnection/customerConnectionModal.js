import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Alert } from 'antd';

export const CustomerConnectionModal = ({ open, plugin, builder }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [isOpen, setIsOpen] = useState(open);
    const [pole, setPole] = useState('');
    const [customer, setCustomer] = useState();
    const [wallBox, setWallBox] = useState('');
    const [dropCable, setDropCable] = useState('');
    const [feederFiber, setFeederFiber] = useState(1);
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);

    useEffect(() => {
        const features = db.getFeatureTypes();
        console.log(features);
        setOnFunctions();
        updateFeatures();
        updateWallBoxDropCable();
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

    const updateWallBoxDropCable = async () => {
        const mapCenter = appRef.map.getCenter();
        const features = await appRef.database.getFeaturesAround(['service_area'], mapCenter, 0);

        let serviceAreaId = '';
        // If not in a service area, default prefix of XX
        if (features.length === 0) {
            serviceAreaId = 'XX';
        } else {
            serviceAreaId = features[0].id;
        }

        setWallBox(`${serviceAreaId}-6000`);
        setDropCable(`DROP-6000`);
    };

    const buildConnection = async () => {
        // console.log(customer.geometry.coordinates);
        // const latLng = {
        //     lat: customer.geometry.coordinates[1],
        //     lng: customer.geometry.coordinates[0]
        // };
        // const existingWallBox = await appRef.database.getFeaturesAround(['wall_box'], latLng, 0);
        // console.log('EXISTING WALL BOX');
        // console.log(existingWallBox);

        let closure;
        const closures = await builder.findSpliceClosure(pole);
        if (closures.length === 0) {
            closure = await builder.buildSpliceClosure(pole);
        } else {
            closure = closures[0];
        }
        console.log(closure);
        const splitters = await builder.findSplitters(pole);
        let connPoint = await builder.findConnectionPoint(splitters);
        if (!connPoint) {
            connPoint = await builder.buildSplitter(
                pole,
                feederFiber,
                splitters.length + 1,
                closure
            );
        }

        setFeederFiber(feederFiber + 1);

        const equipProps = {
            wallBox: { name: wallBox },
            dropCable: {
                name: dropCable,
                fiber_count: 4,
                directed: true
            },
            wallBoxName: wallBox,
            dropCableName: dropCable,
            dropCableCount: 4,
            feederFiber: feederFiber
        };
        // Create connection
        await builder.buildConnection(pole, customer.geometry.coordinates, equipProps, connPoint);

        appRef.setCurrentFeature(connPoint.splitter);

        setCustomer(null);

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
            Drop Cable Name:{' '}
            <Input value={dropCable} onChange={e => setDropCable(e.target.value)} />
            Feeder Fiber: <Input value={feederFiber} onChange={handleFeederFiber} />
            <br />
            {isAlertVisible && (
                <div>
                    {/* <Alert message="Connection Created Successfully!" type="success" /> */}
                    <Alert message={alertMessage + ' created successfully!'} type="success" />
                </div>
            )}
        </DraggableModal>
    );
};
