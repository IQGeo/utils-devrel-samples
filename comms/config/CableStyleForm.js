// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { FormBuilder as InputsFromDefs, localise } from 'config-shared';
import { StyleModal } from './StyleModal';
/**
 * Form to view and edit the mywcom.previewCableStyles setting
 */
@inject('store')
@localise('settings')
@observer
export class CableStyleForm extends Component {
    state = {
        stylePickerVisible: false,
        currentData: {},
        currentName: '',
        currentType: ''
    };
    render() {
        const { form, msg, store, data } = this.props;
        const { stylePickerVisible, currentData, currentName, currentType } = this.state;
        if (!store) return null;

        const formItemLayout = {
            labelCol: { span: 3 },
            wrapperCol: { span: 10 }
        };

        const LineStylePicker = props => {
            const data = props.data[props.id];
            return (
                <span
                    className="flex"
                    onClick={this.openStyleDialog.bind(this, data, props.id, 'linestring')}
                    style={{ margin: '5px 0' }}
                >
                    <span className="emulate-input">
                        <span className="in-emulate-input">
                            <span
                                className="solid-line"
                                style={{
                                    borderBottomColor: data.color,
                                    opacity: data.opacity
                                }}
                            />
                        </span>
                    </span>
                    <span className="emulate-input-addon icon-pencil" />
                </span>
            );
        };

        const TextStyleEditor = props => {
            const { data } = props;
            const hasBorder = data.border > 0;
            return (
                <span
                    className="flex"
                    onClick={this.openStyleDialog.bind(this, data, props.id, 'text')}
                    style={{ margin: '5px 0' }}
                >
                    <span className="emulate-input">
                        <span
                            className="in-emulate-input"
                            style={{
                                padding: '0 4px',
                                color: data.fontColor,
                                backgroundColor: data.bcolor,
                                border: hasBorder && '1px solid'
                            }}
                        >
                            {data.fieldName}
                        </span>
                    </span>
                    <span className="emulate-input-addon icon-pencil" />
                </span>
            );
        };

        const IconStylePicker = props => {
            const { data } = props;
            return (
                <span
                    className="flex"
                    onClick={this.openStyleDialog.bind(this, data, props.id, 'point')}
                    style={{ margin: '5px 0' }}
                >
                    <span className="emulate-input">
                        <span className="style-input">
                            <span className="in-emulate-input">{data.iconUrl}</span>
                        </span>
                    </span>
                    <span className="emulate-input-addon icon-pencil" />
                </span>
            );
        };

        const fields = [
            {
                id: 'insert',
                component: <LineStylePicker data={data} />
            },
            {
                id: 'delete',
                component: <LineStylePicker data={data} />
            },
            {
                id: 'keep',
                component: <LineStylePicker data={data} />
            },
            {
                id: 'affected_structure_text',
                component: <TextStyleEditor data={data['affected_structure']['text']} />
            },
            {
                id: 'affected_structure_icon',
                component: <IconStylePicker data={data['affected_structure']['icon']} />
            }
        ];

        return (
            <div style={{ margin: '0 0 10px 0px' }}>
                <InputsFromDefs
                    msg={msg}
                    form={form}
                    fields={fields}
                    formItemLayout={formItemLayout}
                />
                <StyleModal
                    visible={stylePickerVisible}
                    type={currentType}
                    title={`${currentName}_style_title`}
                    data={currentData}
                    onCancel={this.closeModal}
                    onOk={this.saveStyle}
                    key={currentName}
                    onChange={data => this.handleChange(currentName, data)}
                />
            </div>
        );
    }

    openStyleDialog(data, key, type) {
        this.setState({
            stylePickerVisible: true,
            currentData: data,
            currentName: key,
            currentType: type
        });
    }

    closeModal = () => {
        this.setState({ stylePickerVisible: false });
    };

    saveStyle = (name, style) => {
        this.closeModal();
        // this.props.store.settingsStore.setValue(name, style);
        // this.props.onChange(name);
    };

    /**
     * Handles change to input field in table
     * @param {int} id
     * @param {string} key
     * @param {string} value
     */
    handleChange(id, data) {
        this.setState({
            currentData: data
        });
        let values = this.props.data;
        if (id === 'affected_structure_icon') values['affected_structure']['icon'] = data;
        else if (id === 'affected_structure_text') values['affected_structure']['text'] = data;
        else values[id] = data;

        this.props.onChange(values);
    }
}
