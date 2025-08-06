import React, { useState, useEffect, useRef } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Alert, Space, Select } from 'antd';
import { useLocale } from 'myWorld-client/react';
import { Classes } from './classes_dictionary';

export const LiveDocsModal = ({ open }) => {
    const { msg } = useLocale('LiveDocsPlugin');
    const [showIntro, setShowIntro] = useState(true);
    const [appRef] = useState(myw.app);
    const [isOpen, setIsOpen] = useState(open);
    const [pickedClass, setPickedClass] = useState('');
    const [pickedFunction, setPickedFunction] = useState('');

    useEffect(() => {
        setOnFunctions();
        updateFeatures();
    }, []);

    useEffect(() => {}, []);

    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    function setOnFunctions() {
        appRef.on('currentFeature-changed currentFeatureSet-changed', updateFeatures);
    }

    function updateFeatures() {}

    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={msg('LiveDocsTitle')}
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
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
                <div>
                    {' '}
                    <Space direction="vertical" size="middle">
                        <p>{msg('classSelection')} </p>
                        <Select
                            virtual={false}
                            onChange={value => setPickedClass(value)}
                            options={Classes}
                        />
                    </Space>
                </div>
            )}
        </DraggableModal>
    );
};
