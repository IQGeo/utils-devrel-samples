import React, { useState, useEffect, useContext } from 'react';
import myw from 'myWorld-client';
import { Tree, Alert } from 'antd';

import DraggableModal from '../dragableModal';
import AppContext from '../appContext';

export default function BulkMoveModeModal() {
    const { appRef } = useContext(AppContext);
    const { msg } = myw.react.useLocale('BulkMoveModePlugin');
    const [visible, setVisible] = useState(false);
    const [width] = useState(350);
    const [busy, setBusy] = useState(false);
    const [treeData, setTreeData] = useState([]);
    const [error, setError] = useState();
    const [style] = useState({
        top: 84
    });

    useEffect(() => {
        const callback = async ({ visible, features, handleSave }) => {
            setVisible(visible);
            setBusy(false);
            setError('');
            if (!features) return;

            const featureTreeData = features.map(feature => {
                return {
                    key: feature.getUrn(),
                    title: feature.getTitle()
                };
            });
            setTreeData([
                { key: '', title: `Features (${features.length})`, children: featureTreeData }
            ]);
        };

        appRef.on('bulkMoveModeDialog', callback);
        return () => appRef.off('bulkMoveModeDialog', callback);
    }, []);

    const handleCancel = () => {
        appRef.plugins['bulkMoveMode'].disable();
        setVisible(false);
    };

    const handleOk = async () => {
        setBusy(true);
        try {
            await appRef.plugins['bulkMoveMode'].saveMove();
        } catch (error) {
            setError(msg(error.message));
        }
        setBusy(false);
    };

    const content = (
        <div id="bulk-move-modal" style={{ background: 'white', padding: 12 }}>
            <p>{msg('modal_message')}</p>
            <Tree className={'palette-modal-tree'} treeData={treeData}></Tree>
            {error ? <Alert description={error} type="error" /> : null}
        </div>
    );

    return (
        <DraggableModal
            visible={visible}
            style={style}
            title={msg('modal_title')}
            content={content}
            handleOk={handleOk}
            okText={msg('save')}
            cancelText={msg('cancel')}
            handleCancel={handleCancel}
            destroyOnClose={true}
            width={width}
            busy={busy}
        />
    );
}
