import React, { useContext } from 'react';
import reactViewsRegistry from '../../../base/reactViewsRegistry';

import { Button } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import AppContext from '../../appContext';

export default function UserGroupsManagerEdit({ group, onEdit }) {
    const { appRef } = useContext(AppContext);

    const { showEditDialog } = reactViewsRegistry.reactViews.UserGroupsManagerEdit.functions;

    return (
        <Button
            type="link"
            onClick={() => showEditDialog(group, onEdit, appRef.system)}
            icon={<EditOutlined />}
        />
    );
}
