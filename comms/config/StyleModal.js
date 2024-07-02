// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Modal, Button } from 'antd';
import { inject, observer } from 'mobx-react';
import { localise } from 'config-shared';
import { LinestringStyleForm } from './LinestringStyleForm';
import { PointStyleForm } from './PointStyleForm';
import { TextStyleForm } from './TextStyleForm';
@inject('store')
@localise('settings')
@observer
export class StyleModal extends Component {
    state = {
        visible: true
    };

    componentDidMount() {
        this.setState({
            style: this.props.data.settingVal
        });
    }

    handleOk = () => {
        this.setState({ loading: true });
        this.props.onOk(this.props.data.settingName, this.state.style);
        setTimeout(() => {
            this.setState({ loading: false, visible: false });
        }, 3000);
    };

    handleCancel = () => {
        this.props.onCancel();
    };

    saveFormRef = formRef => {
        this.formRef = formRef;
    };

    render() {
        const { visible, data, title, msg, onCancel, key, type } = this.props;
        let StyleForm;
        switch (type) {
            case 'linestring':
                StyleForm = LinestringStyleForm;
                break;
            case 'text':
                StyleForm = TextStyleForm;
                break;
            default:
                StyleForm = PointStyleForm;
        }
        return (
            <Modal
                className={'style-form'}
                visible={visible}
                title={msg(title)}
                onOk={this.handleOk}
                onCancel={onCancel}
                footer={[
                    <Button key="OK" type="primary" onClick={this.handleOk.bind(this, data)}>
                        {msg('ok_btn')}
                    </Button>,
                    <Button key="cancel" onClick={onCancel}>
                        {msg('cancel_btn')}
                    </Button>
                ]}
            >
                {
                    <StyleForm
                        wrappedComponentRef={this.saveFormRef}
                        data={data}
                        onChange={this.onChange}
                        key={key}
                    />
                }
            </Modal>
        );
    }

    onChange = data => {
        this.props.onChange(data);
    };
}
