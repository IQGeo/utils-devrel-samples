import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Input, useLocale } from 'myWorld-client/react';
import { Alert } from 'antd';

export const CustomerConnectionModal = ({ open, plugin, builder }) => {
    const { msg } = useLocale('customerConnectionPlugin');
    const [appRef] = useState(myw.app);
    const [isOpen, setIsOpen] = useState(open);
    const [pole, setPole] = useState('');
    const [customer, setCustomer] = useState();
    const [dropCable, setDropCable] = useState('DROP-6000');
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);

    useEffect(() => {
        setOnFunctions();
        updateFeatures();
    }, []);

    useEffect(() => {
        if (
            pole &&
            pole._myw.title.length > 0 &&
            customer &&
            customer._myw.title.length > 0 &&
            dropCable.length > 0
        ) {
            setDisabled(false);
        } else {
            setDisabled(true);
        }
    }, [pole, customer, dropCable]);

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

    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

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
            connPoint = await builder.buildSplitter(pole, splitters.length + 1, closure);
        }

        let box = await builder.findWallBox(customer.geometry.coordinates);

        let ont = await builder.findOnt(customer.geometry.coordinates, box);

        const routeInfo = await builder.buildRoute(pole, box);

        const cableInfo = await builder.buildDropCable(routeInfo, pole, box, dropCable);

        const cableSegs = await cableInfo.followRelationship('cable_segments');

        await builder.connectDropToSplitter(connPoint.splitter, connPoint.port, cableSegs[0]);
        await builder.connectDropToTerminal(cableSegs[0], ont);

        setCustomer(null);

        setAlertMessage(
            (connPoint.splitter.properties.name || 'unnamed splitter') + ' OUT# ' + connPoint.port
        );
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
            title={msg('title')}
            width={500}
            onCancel={handleCancel}
            footer={
                showIntro
                    ? [
                          <Button key="ok" onClick={hideIntro} type="primary">
                              OK
                          </Button>
                      ]
                    : [
                          <Button key="cancel" onClick={handleCancel}>
                              Cancel
                          </Button>,
                          <Button
                              disabled={disabled}
                              key="create"
                              onClick={buildConnection}
                              type="primary"
                          >
                              Create
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
                <div>
                    Pole: <Input value={pole ? pole._myw.title : ''} disabled />
                    Customer: <Input value={customer ? customer._myw.title : ''} disabled />
                    Drop Cable Name:{' '}
                    <Input value={dropCable} onChange={e => setDropCable(e.target.value)} />
                    <br />
                    {isAlertVisible && (
                        <div>
                            <Alert
                                message={alertMessage + ' created successfully!'}
                                type="success"
                            />
                        </div>
                    )}
                </div>
            )}
        </DraggableModal>
    );
};
