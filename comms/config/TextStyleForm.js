// Copyright: IQGeo Limited 2010-2023
import React, { Component, Fragment } from 'react';
import { Form, Input, InputNumber, Select } from 'antd';
import { localise, ColourAndTransparencyPicker } from 'config-shared';

const FormItem = Form.Item;
const { Option } = Select;

@localise('settings')
export class TextStyleForm extends Component {
    state = {
        outlineColorAndOpacity: { color: '#008000', opacity: 0.4 },
        fillColorAndOpacity: { color: '#008000', opacity: 0.25 },
        weight: 2
    };
    componentDidMount() {
        const { color, opacity, weight, fillColor, fillOpacity } = this.props.data;
        this.setState({
            outlineColorAndOpacity: { color, opacity },
            fillColorAndOpacity: { color: fillColor, opacity: fillOpacity },
            weight
        });
    }
    render() {
        const { data, msg } = this.props;
        const formItemLayout = {
            labelCol: {
                xs: { span: 24 },
                sm: { span: 8 }
            },
            wrapperCol: {
                xs: { span: 24 },
                sm: { span: 16 }
            }
        };
        return (
            <Form layout="horizontal">
                <FormItem label={msg('fieldName')} {...formItemLayout}>
                    <Input
                        style={{ width: 180 }}
                        value={data.fieldName}
                        onChange={e => this.handleChangeOf('fieldName', e.target.value)}
                    />
                </FormItem>
                <FormItem label={msg('fontColor')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={data.fontColor}
                        opacity={1}
                        disableAlpha={true}
                        onChange={data => this.handleChangeOf('fontColor', data.color)}
                    />
                </FormItem>
                <FormItem label={msg('fontSize')} {...formItemLayout}>
                    {
                        <Fragment>
                            <InputNumber
                                style={{ width: 50, marginRight: 6 }}
                                min={0}
                                value={data.fontSize}
                                onChange={this.handleChangeOf.bind(this, 'fontSize')}
                            />
                            {msg('pixels')}
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('bcolor')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={data.bcolor}
                        opacity={1}
                        disableAlpha={true}
                        onChange={data => this.handleChangeOf('bcolor', data.color)}
                    />
                </FormItem>
                <FormItem label={msg('outline_width')} {...formItemLayout}>
                    {
                        <Fragment>
                            <InputNumber
                                style={{ width: 50, marginRight: 6 }}
                                min={0}
                                value={data.border}
                                onChange={this.handleChangeOf.bind(this, 'border')}
                            />
                            {msg('pixels')}
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('v_justification')} {...formItemLayout}>
                    {
                        <Fragment>
                            <Select
                                defaultValue="top"
                                value={data.valign}
                                onChange={this.handleChangeOf.bind(this, 'valign')}
                                style={{ width: 120 }}
                            >
                                <Option value="top">{msg('top')}</Option>
                                <Option value="middle">{msg('middle')}</Option>
                                <Option value="bottom">{msg('bottom')}</Option>
                            </Select>
                            <span style={{ display: 'inline-block', margin: '0 5px 0 20px' }}>
                                {msg('offset')}
                            </span>
                            <InputNumber
                                style={{ width: 50, marginRight: 6 }}
                                value={data.vOffset}
                                onChange={this.handleChangeOf.bind(this, 'vOffset')}
                            />
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('h_justification')} {...formItemLayout}>
                    {
                        <Fragment>
                            <Select
                                defaultValue="left"
                                value={data.halign}
                                onChange={this.handleChangeOf.bind(this, 'halign')}
                                style={{ width: 120 }}
                            >
                                <Option value="left">{msg('left')}</Option>
                                <Option value="center">{msg('center')}</Option>
                                <Option value="right">{msg('right')}</Option>
                            </Select>
                            <span style={{ display: 'inline-block', margin: '0 5px 0 20px' }}>
                                {msg('offset')}
                            </span>
                            <InputNumber
                                style={{ width: 50, marginRight: 6 }}
                                value={data.hOffset}
                                onChange={this.handleChangeOf.bind(this, 'hOffset')}
                            />
                        </Fragment>
                    }
                </FormItem>
            </Form>
        );
    }

    handleChangeOf(name, val) {
        const styleData = { ...this.props.data };
        styleData[name] = val;
        this.props.onChange(styleData);
    }
}
