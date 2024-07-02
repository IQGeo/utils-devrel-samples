import React from 'react';
import reactViewsRegistry from '../../../base/reactViewsRegistry';
import { Table, List } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import myw from 'myWorld-client';

export default function UserGroupsManagerTable({ groups, onEdit }) {
    const { msg } = myw.react.useLocale('UserGroupsManagerDialog');
    const UserGroupsManagerEdit = reactViewsRegistry.reactViews['UserGroupsManagerEdit'].component;

    const columns = [
        {
            title: '',
            dataIndex: 'id',
            width: 73,
            fixed: 'left',
            render: (_, record) => {
                return <UserGroupsManagerEdit group={record} onEdit={onEdit} />;
            }
        },
        {
            title: msg('group_name'),
            dataIndex: 'name',
            sorter: (a, b) => {
                if (a.name < b.name) return -1;
                else if (a.name > b.name) return 1;
                return 0;
            }
        },
        {
            title: msg('group_description'),
            dataIndex: 'description'
        }
    ];

    return (
        <Table
            rowKey={record => record.id}
            bordered
            size="small"
            dataSource={groups}
            columns={columns}
            expandable={{
                expandedRowRender: record => (
                    <div
                        id="scrollableDiv"
                        style={{
                            maxHeight: 400,
                            overflow: 'auto',
                            padding: '0 16px'
                        }}
                    >
                        <List
                            dataSource={record.members}
                            renderItem={member => (
                                <List.Item>
                                    <UserOutlined />
                                    {' ' + member}
                                </List.Item>
                            )}
                        />
                    </div>
                ),
                rowExpandable: record => record.members.length > 0
            }}
            rowClassName="editable-row"
            scroll={{ x: 'max-content', y: '50vh' }}
        />
    );
}
