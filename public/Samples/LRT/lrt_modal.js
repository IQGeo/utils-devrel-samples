import myw, { TaskManager } from 'myWorld-client';
import React, { useState, useEffect, useRef } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Alert } from 'antd';
import { useLocale } from 'myWorld-client/react';

export const LrtModal = ({ open }) => {
    const { msg } = useLocale('LRT');
    const [appRef] = useState(myw.app);
    const [isOpen, setIsOpen] = useState(open);
    const [design, setDesign] = useState('');
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);
    const [alertType, setAlertType] = useState('');
    const [pole, setPole] = useState('');
    const [pole_lat, setPoleLat] = useState('');
    const [pole_lng, setPoleLng] = useState('');
    const [poleId, setPoleId] = useState('');

    const progressStreamControlsRef = useRef({ close() {} });
    const [task, setTask] = useState(null);
    const defaultProgress = {
        percent: 0,
        message: '0 / 2000 adresses connected',
        status: 'Not running'
    };
    const [progress, setProgress] = useState(defaultProgress);
    const [isTaskRunning, setIsTaskRunning] = useState(false);

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

    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

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
                setPoleLng(feature.geometry.coordinates[0]);
                setPoleLat(feature.geometry.coordinates[1]);
                setDesign(feature._myw.delta);
                setPoleId(feature.id);
            } else {
                showAlert('error', 'This pole must be part of a design!');
                setPole(null);
            }
        }
    }

    function showAlert(type, message, time) {
        setAlertMessage(message);
        setAlertType(type);
        setIsAlertVisible(true);
        setTimeout(() => {
            setIsAlertVisible(false);
        }, time);
    }

    const callLRT = async () => {
        const params = { design: design, lng: pole_lng, lat: pole_lat, pole_id: poleId };
        console.log('Calling LRT');
        try {
            const task = await appRef.system.enqueueTask('customer_connection_task', params);
            setTask(task);
            setIsTaskRunning(true);

            console.log(`Task with id=${task.id} started...`);

            startStreamingProgress(task);
        } catch (errorInfo) {
            console.log('Failed:', errorInfo);
        }
    };

    const startStreamingProgress = task => {
        progressStreamControlsRef.current = appRef.system.streamTaskProgress(task.id, {
            onProgress: progress => {
                console.log('Progress:', progress);
                console.log('Task progress:', progress.percent);
                setProgress(progress);
            },
            onEnd: () => {
                console.log('Task ended');
                setIsTaskRunning(false);
            },
            onFailure: error => {
                console.log('Task failed:', error);
                setIsTaskRunning(false);
            },
            onSuccess: result => {
                const prog = {
                    percent: 0,
                    message: '0 / 2000 adresses connected',
                    status: 'Not running'
                };
                setProgress(prog);
                console.log('Task succeeded:', result);
                setIsTaskRunning(false);
                showAlert('success', 'Long Running Task complete successfully!', 5000);
            }
        });
    };

    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={msg('LRT_title')}
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
                          <Button disabled={disabled} key="create" onClick={callLRT} type="primary">
                              Create Connections using LRT
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
                    <br />
                    Task Status = {progress.status}
                    {isTaskRunning ? (
                        <div>
                            <br />
                            <br />
                            Task Progress = {progress.message}
                            <br />
                            Task Completion % = {progress.percent}%
                        </div>
                    ) : null}
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
