// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { Button } from 'antd';
import { localise } from 'config-shared';
import { HelpButton } from './HelpButton';
import { SaveOutlined, CloseOutlined } from '@ant-design/icons';

@inject('store')
@localise('settings')
@observer
export class SaveCancelButtons extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasManagePerm: false
        };
    }

    async componentDidMount() {
        const hasPerm = await this.props.store.permissionStore.userHasPermission('settings');
        this.setState({ hasManagePerm: hasPerm });
    }

    render() {
        const { isLoading } = this.props.store.settingsStore;
        const { msg, saving, handleSave } = this.props;
        return (
            <div style={{ margin: '30px 0' }}>
                <Button
                    icon={<SaveOutlined />}
                    style={{ marginRight: 10 }}
                    loading={isLoading || saving}
                    onClick={handleSave.bind(this)}
                    type="primary"
                    disabled={!this.state.hasManagePerm}
                >
                    {msg('save_btn')}
                </Button>
                <Button icon={<CloseOutlined />} onClick={this.handleCancel}>
                    {msg('cancel_btn')}
                </Button>
                <HelpButton />
            </div>
        );
    }

    handleCancel = async () => {
        await this.props.store.settingsStore.getAll();
    };
}
