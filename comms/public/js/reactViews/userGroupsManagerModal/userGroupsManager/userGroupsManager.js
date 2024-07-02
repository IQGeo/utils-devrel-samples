import React, { useState, useContext } from 'react';
import reactViewsRegistry from '../../../base/reactViewsRegistry';
import AppContext from '../../appContext';
import { Row, Col, Input } from 'antd';

export default function UserGroupsManager() {
    const { Search } = Input;

    const UserGroupsManagerUpload =
        reactViewsRegistry.reactViews['UserGroupsManagerUpload'].component;
    const UserGroupsManagerCreate =
        reactViewsRegistry.reactViews['UserGroupsManagerCreate'].component;
    const UserGroupsManagerTable =
        reactViewsRegistry.reactViews['UserGroupsManagerTable'].component;

    const { loadUserGroups } = reactViewsRegistry.reactViews.UserGroupsManager.functions;
    const { useUserGroups } = reactViewsRegistry.reactViews.UserGroupsManager.hooks;

    const [searchValue, setSearchValue] = useState('');
    const { userGroups, filteredUserGroups, setUserGroups } = useUserGroups({ searchValue });
    const { appRef } = useContext(AppContext);
    const userGroupManager = appRef.plugins['userGroupManager'];

    return (
        <div id="user-groups-manager" style={{ background: 'white', padding: 12 }}>
            <Row justify="end" style={{ paddingBottom: 6 }}>
                <Col>
                    <Search
                        type="search"
                        placeholder={'search'}
                        onChange={e => {
                            e.preventDefault();
                            setSearchValue(e.target.value);
                        }}
                        value={searchValue}
                        style={{ maxWidth: 350, padding: '0 8px 4px 0' }}
                        onSearch={value => {
                            setSearchValue(value);
                        }}
                    ></Search>
                </Col>
            </Row>
            <UserGroupsManagerTable
                groups={filteredUserGroups}
                onEdit={() => loadUserGroups(setUserGroups, userGroupManager)}
            />
            <Row justify="start" align="middle" style={{ paddingBottom: 6 }}>
                <Col>
                    <UserGroupsManagerUpload
                        userGroups={userGroups}
                        onUpload={() => loadUserGroups(setUserGroups, userGroupManager)}
                    />
                    <UserGroupsManagerCreate
                        onCreate={() => loadUserGroups(setUserGroups, userGroupManager)}
                    />
                </Col>
            </Row>
        </div>
    );
}
