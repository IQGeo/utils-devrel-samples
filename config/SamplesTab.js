// Copyright: IQGeo Limited 2010-2024
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
// import { SettingForm } from './SettingForm';
import { Menu } from 'antd';
import {
    ApartmentOutlined,
    BorderOuterOutlined,
    BranchesOutlined,
    SlidersOutlined,
    LineOutlined,
    RiseOutlined,
    FolderOutlined,
    UnorderedListOutlined,
    TableOutlined,
    BgColorsOutlined,
    MonitorOutlined,
    UploadOutlined
} from '@ant-design/icons';
import { localise } from 'config-shared';
import { Layout } from 'antd';

const { Sider, Content } = Layout;

@inject('store')
@localise('utils_devrel_samples') //provides 'msg' prop, bound to 'nmt_samples' group
@observer
export class SamplesTab extends Component {
    state = {
        menuItemId: 'mywcom.structures' //Current sidebar menu item
    };
    render() {
        const store = this.props.store.settingsStore;
        const settings = store.getAllConverted();
        const { msg } = this.props;

        return (
            <Layout>
                <Sider>
                    <Menu
                        onClick={this.handleClick}
                        mode="inline"
                        selectedKeys={[this.state.menuItemId]}
                    >
                        <Menu.Item key="mywcom.structures">
                            <BorderOuterOutlined />
                            <span>{msg('mywcom.structures')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.routes">
                            <BranchesOutlined type="branches" />
                            <span>{msg('mywcom.routes')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.equipment">
                            <ApartmentOutlined type="apartment" />
                            <span>{msg('mywcom.equipment')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.conduits">
                            <SlidersOutlined />
                            <span>{msg('mywcom.conduits')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.cables">
                            <LineOutlined />
                            <span>{msg('mywcom.cables')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.circuits">
                            <RiseOutlined />
                            <span>{msg('mywcom.circuits')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.designs">
                            <FolderOutlined />
                            <span>{msg('mywcom.designs')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.specs">
                            <UnorderedListOutlined />
                            <span>{msg('mywcom.specs')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.laborCosts">
                            <UnorderedListOutlined />
                            <span>{msg('mywcom.laborCosts')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.fiberColorSchemes">
                            <TableOutlined />
                            <span>{msg('mywcom.fiberColorSchemes')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.fiberColors">
                            <BgColorsOutlined />
                            <span>{msg('mywcom.fiberColors')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.previewCableStyles">
                            <MonitorOutlined />
                            <span>{msg('mywcom.previewCableStyles')}</span>
                        </Menu.Item>
                        <Menu.Item key="mywcom.import_config">
                            <UploadOutlined />
                            <span>{msg('mywcom.import_config')}</span>
                        </Menu.Item>
                    </Menu>
                </Sider>
            </Layout>
        );
    }

    /**
     * Updates the sidebar menu selection
     */
    handleClick = e => {
        this.setState({ menuItemId: e.key });
    };
}
