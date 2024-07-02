import React, { useContext } from 'react';
import reactViewsRegistry from '../../../base/reactViewsRegistry';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import AppContext from '../../appContext';
import myw from 'myWorld-client';

export default function UserGroupsManagerCreate({ onCreate }) {
    const { msg } = myw.react.useLocale('UserGroupsManagerDialog');
    const { appRef } = useContext(AppContext);
    const { showCreateDialog } = reactViewsRegistry.reactViews.UserGroupsManagerCreate.functions;

    return (
        <Button onClick={() => showCreateDialog(onCreate, appRef.system)} icon={<PlusOutlined />}>
            {msg('add')}
        </Button>
    );
}
