// Copyright: IQGeo Limited 2010-2023
import React, { Component, Fragment } from 'react';
import { Form, InputNumber } from 'antd';
import { localise } from 'config-shared';
import { ColourAndTransparencyPicker } from 'config-shared';

const FormItem = Form.Item;

@localise('settings')
export class LinestringStyleForm extends Component {
    state = { colorAndOpacity: { color: '#008000', opacity: 0.4 }, weight: 2 };
    componentDidMount() {
        const { color, opacity, weight } = this.props.data;
        this.setState({
            colorAndOpacity: { color, opacity },
            weight
        });
    }
    render() {
        const { data, msg } = this.props;
        const { color, opacity, weight } = data;
        const formItemLayout = {
            labelCol: { span: 10 },
            wrapperCol: { span: 10 }
        };
        return (
            <Form layout="horizontal">
                <FormItem label={msg('colour_&_transparency')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={color}
                        opacity={opacity}
                        onChange={this.handleChangeOf.bind(this, 'colorAndOpacity')}
                    />
                </FormItem>
                <FormItem label={msg('width')} {...formItemLayout}>
                    {
                        <Fragment>
                            <InputNumber
                                style={{ width: 50, marginRight: 6 }}
                                min={0}
                                value={weight}
                                onChange={this.handleChangeOf.bind(this, 'weight')}
                            />
                            {msg('pixels')}
                        </Fragment>
                    }
                </FormItem>
            </Form>
        );
    }

    handleChangeOf(name, val) {
        const styleData = { ...this.props.data };
        if (name === 'colorAndOpacity') {
            styleData['color'] = val.color;
            styleData['opacity'] = val.opacity;
        } else styleData[name] = val;
        this.props.onChange(styleData);
    }
}
