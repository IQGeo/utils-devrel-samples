import React, { useState, useEffect, useContext } from 'react';
import reactViewsRegistry from '../../base/reactViewsRegistry';
import myw from 'myWorld-client';
import DraggableModal from '../dragableModal';
import AppContext from '../appContext';

export default function UserGroupsManagerModal() {
    const { msg } = myw.react.useLocale('UserGroupsManagerDialog');
    const { appRef } = useContext(AppContext);
    const [visible, setVisible] = useState(false);
    const UserGroupsManager = reactViewsRegistry.reactViews['UserGroupsManager'].component;

    useEffect(() => {
        const callback = async ({ visible }) => {
            setVisible(visible);
        };

        appRef.on('toggleUserGroupManager', callback);
        return () => appRef.off('toggleUserGroupManager', callback);
    }, []);

    return (
        <DraggableModal
            visible={visible}
            style={{}}
            title={msg('manager_dialog_title')}
            content={<UserGroupsManager />}
            handleOk={() => {}}
            handleCancel={() => setVisible(false)}
            destroyOnClose={true}
            width={800}
            nullFooter
        />
    );
}
