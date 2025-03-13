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
    const [coords_x, setCoords_x] = useState('');
    const [coords_y, setCoords_y] = useState('');
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);
    const [alertType, setAlertType] = useState('');

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
        if (design) {
            setDisabled(false);
        } else {
            setDisabled(true);
        }
    }, [design]);

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
        if (!feature || feature.getType() !== 'design') {
            setDesign('');
            return;
        } else {
            setDesign('design/' + feature.properties.name);
            setCoords_x(feature.geometry.coordinates[0][0][0]);
            setCoords_y(feature.geometry.coordinates[0][0][1]);
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

    const onBuildConnectionsLRT = async () => {
        const params = { design: design, coords_x: coords_x, coords_y: coords_y };
        console.log('Calling LRT');
        try {
            const task = await appRef.system.enqueueTask('lrt_task', params);
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
                          <Button
                              disabled={disabled}
                              key="create"
                              onClick={onBuildConnectionsLRT}
                              type="primary"
                          >
                              Create Connections using LRT
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
                <div>
                    Design: <Input value={design ? design : ''} disabled />
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
