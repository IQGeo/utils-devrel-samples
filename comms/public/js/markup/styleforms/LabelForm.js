// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Form, InputNumber, Checkbox } from 'antd';
import myw from 'myWorld-client';
import { ColourAndTransparencyPicker } from './ColourAndTransparencyPicker';
import { colorNameToHex } from './StyleUtils';

const FormItem = Form.Item;

export default class LabelForm extends Component {
    /**
     * Renders a form for choosing the style of a feature label
     * @param {Object} props
     */
    static getDerivedStateFromProps(props, state) {
        const data = { ...props.data };
        data.backgroundColor = colorNameToHex(data.backgroundColor);
        data.color = colorNameToHex(data.color);

        const newData = Object.assign(state, data);
        return newData;
    }

    constructor(props) {
        super(props);
        this.state = {
            size: 12,
            vAlign: 'top',
            hAlign: 'center',
            rotate: !!props.data.orientationProp
        };
    }

    render() {
        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };

        const { rotate, size, color, backgroundColor, borderWidth } = this.state;

        const { orientationProp } = this.props;
        const enableRotation = !!orientationProp;
        const { msg } = myw.react.useLocale('StylePicker');
        return (
            <Form layout="horizontal" className={'label-picker-form'}>
                <FormItem label={msg('colour')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={color}
                        disableAlpha={true}
                        onChange={colorAndOpacity =>
                            this.handleChangeOf('color', colorAndOpacity.color)
                        }
                    />
                </FormItem>
                <FormItem label={msg('text_size')} {...formItemLayout}>
                    <InputNumber
                        style={{ width: 50, marginRight: 6 }}
                        min={0}
                        value={size}
                        onChange={this.handleChangeOf.bind(this, 'size')}
                    />
                    {msg('pixels')}
                </FormItem>
                <FormItem label={msg('background')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={backgroundColor}
                        disableAlpha={true}
                        onChange={colorAndOpacity =>
                            this.handleChangeOf('backgroundColor', colorAndOpacity.color)
                        }
                    />
                </FormItem>
                <FormItem label={msg('outline_width')} {...formItemLayout}>
                    <InputNumber
                        style={{ width: 50, marginRight: 6 }}
                        min={-1000}
                        value={parseInt(borderWidth) || ''}
                        onChange={this.handleChangeOf.bind(this, 'borderWidth')}
                    />
                    {msg('pixels')}
                </FormItem>
                {enableRotation ? (
                    <FormItem label={msg('rotate')} {...formItemLayout}>
                        <Checkbox
                            checked={rotate}
                            onChange={this.handleChangeOfRotate.bind(this)}
                        />
                    </FormItem>
                ) : null}
            </Form>
        );
    }

    handleChangeOfRadio(name, e) {
        this.handleChangeOf(name, e.target.value);
    }

    handleChangeOf(name, e) {
        const obj = {};
        obj[name] = e;
        this.handleChangeOfValue(obj);
    }

    handleChangeOfValue = obj => {
        const stateObj = { ...this.state, ...obj };
        this.setState(stateObj);
        this.props.onChange(stateObj);
    };

    handleChangeOfRotate(e) {
        this.handleChangeOfValue({
            rotate: e.target.checked,
            orientationProp: e.target.checked ? this.props.orientationProp : null
        });
    }
}
