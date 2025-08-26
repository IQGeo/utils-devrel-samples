import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Input, Button, useLocale } from 'myWorld-client/react';
import { Alert } from 'antd';

export const BFTubeRenameModal = ({ open, plugin, builder }) => {
    const { msg } = useLocale('bfTubeRenamePlugin');
    const appRef = myw.app;
    const db = appRef.database;
    const [isOpen, setIsOpen] = useState(open);
    const [bf_bundle, setBf_bundle] = useState(null);
    const [disabled, setDisabled] = useState(true);
    const [alertMessage, setAlertMessage] = useState('');
    const [isAlertVisible, setIsAlertVisible] = React.useState(false);
    const [showIntro, setShowIntro] = useState(true);

    useEffect(() => {
        setOnFunctions();
        setFeature();
    }, []);

    function setOnFunctions() {
        appRef.on('currentFeature-changed currentFeatureSet-changed', setFeature);
    }

    async function setFeature() {
        if (!appRef.currentFeature) return;
        const feature = appRef.currentFeature;
        if (feature.getType() === 'blown_fiber_tube') {
            const bundle = await db.getFeatureByUrn(feature.properties.housing);
            setBf_bundle(bundle);
            setDisabled(false);
        }
    }

    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    const renameTubes = async () => {
        var t = db.transaction();
        bf_bundle.followRelationship('conduits').then(async tubes => {
            const colors = msg('colors').split('|');
            let color_index = 0;
            // Reorder tubes based on the number at the end of tube.properties.name
            tubes.sort((a, b) => {
                const numA = parseInt(a.properties.name.match(/\d+$/)[0], 10);
                const numB = parseInt(b.properties.name.match(/\d+$/)[0], 10);
                return numA - numB;
            });
            console.log(tubes);
            tubes.forEach(tube => {
                const tubeColor = colors[color_index];
                tube.properties.name += ` - ${tubeColor}`;
                color_index++;
                if (color_index >= colors.length) {
                    color_index = 0;
                }
                t.addUpdate('blown_fiber_tube', tube);
            });

            await t.run().then(() => {
                setAlertMessage('TRANSACTION Tubes renamed successfully!');
                setIsAlertVisible(true);
                setTimeout(() => {
                    setIsAlertVisible(false);
                }, 5000);
            });
        });
    };

    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={msg('bf_tube_rename_title')}
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
                              onClick={renameTubes}
                              type="primary"
                          >
                              Rename
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
                <div>
                    BF Bundle: <Input value={bf_bundle ? bf_bundle._myw.title : ''} disabled />
                    <br />
                    {isAlertVisible && (
                        <div>
                            <Alert message={alertMessage} type="success" />
                        </div>
                    )}
                </div>
            )}
        </DraggableModal>
    );
};
