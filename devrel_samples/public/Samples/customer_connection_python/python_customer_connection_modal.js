import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Input, useLocale } from 'myWorld-client/react';
import { Alert } from 'antd';

export const PythonCustomerConnectionModal = ({ open, datasource }) => {
    const { msg } = useLocale('pythonCustomerConnectionPlugin');
    const [appRef] = useState(myw.app);
    const [isOpen, setIsOpen] = useState(open);
    const [pole, setPole] = useState('');
    const [poleId, setPoleId] = useState('');
    const [designId, setDesignId] = useState('');
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);
    const [alertType, setAlertType] = useState('');

    useEffect(() => {
        setOnFunctions();
        updateFeatures();
    }, []);

    useEffect(() => {
        if (pole) {
            setDisabled(false);
        } else {
            setDisabled(true);
        }
    }, [pole]);

    function setOnFunctions() {
        appRef.on('currentFeature-changed currentFeatureSet-changed', updateFeatures);
    }

    function updateFeatures() {
        const feature = appRef.currentFeature;
        if (!feature) {
            setPole(null);
            return;
        }

        if (feature.getType() === 'pole') {
            if (feature._myw.delta !== undefined) {
                setPole(feature);
                setPoleId(feature.id);
                setDesignId(feature._myw.delta);
            } else {
                showAlert('error', 'This pole must be part of a design!');
                setPole(null);
            }
        }
    }

    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    function showAlert(type, message) {
        setAlertMessage(message);
        setAlertType(type);
        setIsAlertVisible(true);
        setTimeout(() => {
            setIsAlertVisible(false);
        }, 5000);
    }

    const callController = () => {
        console.log('Calling controller');
        datasource
            .moduleGet(`modules/custom/customerconnection/` + poleId + '/' + designId.split('/')[1])
            .then(res => {
                console.log(res);
                showAlert('success', 'Connections created successfully!');
            });
    };

    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={'Python Connect Customer'}
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
                              onClick={callController}
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
                    <br />
                    {isAlertVisible && (
                        <div>
                            <Alert message={alertMessage} type={alertType} />
                        </div>
                    )}
                </div>
            )}
        </DraggableModal>
    );
};
