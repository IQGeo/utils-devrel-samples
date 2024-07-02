// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { FormBuilder as InputsFromDefs, localise } from 'config-shared';
import { ColourAndTransparencyPicker } from 'config-shared';
/**
 * Form to view and edit the mywcom.previewCableStyles setting
 */
@inject('store')
@localise('settings')
@observer
export class ConflictStyleForm extends Component {
    state = {
        stylePickerVisible: false,
        currentData: {},
        currentName: '',
        currentType: ''
    };
    render() {
        const { form, msg, store, data } = this.props;
        if (!store) return null;

        const formItemLayout = {
            labelCol: { span: 3 },
            wrapperCol: { span: 10 }
        };

        const fields = [
            {
                id: 'change',
                component: (
                    <ColourAndTransparencyPicker
                        color={data.change.color}
                        opacity={data.change.opacity}
                        onChange={this.handleChangeOfChangeColor.bind(this, 'colorAndOpacity')}
                    />
                )
            },
            {
                id: 'conflict',
                component: (
                    <ColourAndTransparencyPicker
                        color={data.conflict.color}
                        opacity={data.conflict.opacity}
                        onChange={this.handleChangeOfConflictColor.bind(this, 'colorAndOpacity')}
                    />
                )
            },
            {
                id: 'proposed',
                component: (
                    <ColourAndTransparencyPicker
                        color={data.proposed.color}
                        disableAlpha={true}
                        onChange={this.handleChangeOfProposedColor.bind(this, 'colorAndOpacity')}
                    />
                )
            }
        ];

        return (
            <div>
                <InputsFromDefs
                    msg={msg}
                    form={form}
                    fields={fields}
                    formItemLayout={formItemLayout}
                />
            </div>
        );
    }

    handleChangeOfChangeColor(name, val) {
        const styleData = { ...this.props.data };
        styleData.change.color = val.color;
        styleData.change.opacity = val.opacity;
        this.props.onChange(styleData);
    }

    handleChangeOfConflictColor(name, val) {
        const styleData = { ...this.props.data };
        styleData.conflict.color = val.color;
        styleData.conflict.opacity = val.opacity;
        this.props.onChange(styleData);
    }

    handleChangeOfProposedColor(name, val) {
        const styleData = { ...this.props.data };
        styleData.proposed.color = val.color;
        this.props.onProposedObjectChange(styleData);
    }
}
