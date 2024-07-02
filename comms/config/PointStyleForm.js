// Copyright: IQGeo Limited 2010-2023
import React, { Component, Fragment } from 'react';
import { Form, Input, InputNumber } from 'antd';
import { localise } from 'config-shared';

const FormItem = Form.Item;

@localise('settings')
export class PointStyleForm extends Component {
    state = {};
    componentDidMount() {
        const { iconUrl, iconAnchor, orientiation } = this.props.data;
        this.setState({
            iconUrl,
            iconAnchorX: iconAnchor && iconAnchor[0],
            iconAnchorY: iconAnchor && iconAnchor[1],
            orientiation
        });
    }
    render() {
        const { msg, data } = this.props;
        const formItemLayout = {
            labelCol: { span: 8 },
            wrapperCol: { span: 14 }
        };

        return (
            <Form layout="horizontal">
                <FormItem label={msg('location')} {...formItemLayout}>
                    <Input
                        style={{ width: 220 }}
                        value={data.iconUrl}
                        onChange={e => this.handleChangeOf('iconUrl', e.target.value)}
                    />
                </FormItem>
                <FormItem label={msg('anchor')} {...formItemLayout}>
                    {
                        <Fragment>
                            X{' '}
                            <InputNumber
                                style={{ width: 55, marginLeft: 5, marginRight: 10 }}
                                value={data.iconAnchor && data.iconAnchor[0]}
                                onChange={this.handleChangeOf.bind(this, 'iconAnchorX')}
                            />{' '}
                            Y
                            <InputNumber
                                style={{ width: 55, marginLeft: 5 }}
                                value={data.iconAnchor && data.iconAnchor[1]}
                                onChange={this.handleChangeOf.bind(this, 'iconAnchorY')}
                            />
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('orientiation')} {...formItemLayout}>
                    <InputNumber
                        style={{ width: 55 }}
                        value={data.orientiation}
                        onChange={this.handleChangeOf.bind(this, 'orientiation')}
                    />
                </FormItem>
            </Form>
        );
    }

    handleChangeOf(name, val) {
        const styleData = { ...this.props.data };

        if (name === 'iconAnchorX') {
            styleData['iconAnchor'] = [val, styleData['iconAnchor'][1]];
        } else if (name === 'iconAnchorY') {
            styleData['iconAnchor'] = [styleData['iconAnchor'][0], val];
        } else styleData[name] = val;

        this.props.onChange(styleData);
    }
}
