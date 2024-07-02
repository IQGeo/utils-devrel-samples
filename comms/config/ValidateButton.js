// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { Button, Popover, Alert } from 'antd';
import { localise } from 'config-shared';
import { RestClient } from '../../../core/config/stores/RestClient';

@inject('store')
@localise('settings')
@observer
export class ValidateButton extends Component {
    constructor(props) {
        super(props);
        this.state = {
            hasManagePerm: false,
            isLoading: false,
            showWarnings: false,
            errorMessages: [],
            warningMessages: [],
            isPopoverVisible: false
        };
    }

    async componentDidMount() {
        const hasPerm = await this.props.store.permissionStore.userHasPermission('settings');
        this.setState({ hasManagePerm: hasPerm });
    }

    validateConfig = async () => {
        try {
            this.setState({ isLoading: true });
            const response = await this.validateConfigAPICall();
            this.handleResponseData(response);
            this.setState({ isLoading: false, isPopoverVisible: true });
        } catch (error) {
            console.log('Error: ', new Error(error));
            this.setState({ isLoading: false });
        }
    };

    handleCancel = () => {
        this.props.store.settingsStore.getAll();
    };

    validateConfigAPICall = () => {
        const { aspect, settingIds } = this.props;

        const data = this.getData(aspect, settingIds);
        const url = `modules/comms/config/validate/${aspect.split('.')[1]}`;
        const response = RestClient.post(url, data);
        return response;
    };

    getData = (aspect, settingIds) => {
        let aspectSettings = {};
        if (aspect == 'mywcom.import_config' && settingIds) {
            for (const id of settingIds) {
                const settingsStore = this.props.store.settingsStore;
                const setting = JSON.parse(settingsStore.store[id].value);
                aspectSettings[id] = setting;
            }
        } else {
            const settingsStore = this.props.store.settingsStore;
            aspectSettings = JSON.parse(settingsStore.store[aspect].value);
        }

        return { config: aspectSettings };
    };

    handleResponseData = response => {
        if (Object.keys(response.data.errors).length !== 0) {
            this.saveResponseToState(response.data.errors);
        } else {
            this.setState({ warningMessages: [], errorMessages: [] });
        }
    };

    saveResponseToState = errors => {
        const { aspect } = this.props;
        if (errors[aspect].errors) {
            const errorMessages = errors[aspect].errors;
            this.setState({ errorMessages });
        } else {
            this.setState({ errorMessages: [] });
        }
        if (errors[aspect].warnings) {
            const warningMessages = errors[aspect].warnings;
            this.setState({ warningMessages });
        } else {
            this.setState({ warningMessages: [] });
        }
    };

    handleVisibleChange = isPopoverVisible => {
        if (!isPopoverVisible) {
            this.setState({ isPopoverVisible });
        }
    };

    toggleWarningsVisibility = () => {
        this.setState({ showWarnings: !this.state.showWarnings });
    };

    renderValidateButton = (msg, aspect) => {
        return (
            <Button
                onClick={this.validateConfig}
                loading={this.state.isLoading}
                style={{ marginRight: 10 }}
                title={`${msg('validate_btn_title')} ${msg(aspect)}`}
            >
                {msg('validate_btn')}
            </Button>
        );
    };

    renderErrorAlerts = (msg, errorMessages) => {
        if (errorMessages.length === 0) return;
        const errorText = errorMessages.map((errorMessage, index) => {
            const message = errorMessage.split(',')[0];
            const vars = errorMessage.split(',').slice(1);
            let jsonVars;
            if (vars.length > 0) {
                jsonVars = JSON.parse(vars);
            }
            return <p key={index}>{msg(message, jsonVars)}</p>;
        });
        return (
            <Alert
                type="error"
                message={msg('errors')}
                description={errorText}
                showIcon
                style={{ margin: '10px 0 10px 0' }}
            />
        );
    };

    renderWarningAlerts = (msg, warningMessages) => {
        if (warningMessages.length === 0) return;
        if (!this.state.showWarnings) return;
        const warningText = warningMessages.map((warningMessage, index) => {
            const message = warningMessage.split(',')[0];
            const vars = warningMessage.split(',').slice(1);
            let jsonVars;
            if (vars.length > 0) {
                jsonVars = JSON.parse(vars);
            }
            return <p key={index}>{msg(message, jsonVars)}</p>;
        });
        return (
            <Alert
                type="warning"
                message={msg('warnings')}
                description={warningText}
                showIcon
                style={{ margin: '10px 0 10px 0' }}
            />
        );
    };

    renderSuccessAlert = (msg, errorMessages) => {
        if (errorMessages.length > 0) return;
        return (
            <Alert
                type="success"
                message={msg('no_error')}
                discription=""
                showIcon
                style={{ margin: '10px 0 10px 0' }}
            />
        );
    };

    renderToggleWarningsAnchor = (msg, warningMessages) => {
        if (warningMessages.length === 0) return;
        const toggleWarningText = this.state.showWarnings
            ? msg('hide_warnings')
            : msg('show_warnings');
        return <a onClick={this.toggleWarningsVisibility}>{toggleWarningText}</a>;
    };

    renderPopupContent = msg => {
        const { errorMessages, warningMessages } = this.state;

        return (
            <div>
                {this.renderErrorAlerts(msg, errorMessages)}
                {this.renderSuccessAlert(msg, errorMessages)}
                {this.renderWarningAlerts(msg, warningMessages)}
                {this.renderToggleWarningsAnchor(msg, warningMessages)}
            </div>
        );
    };

    render() {
        const { msg, aspect } = this.props;

        return (
            <Popover
                placement="rightBottom"
                trigger="click"
                content={this.renderPopupContent(msg)}
                visible={this.state.isPopoverVisible}
                onVisibleChange={this.handleVisibleChange}
            >
                {this.renderValidateButton(msg, aspect)}
            </Popover>
        );
    }
}
