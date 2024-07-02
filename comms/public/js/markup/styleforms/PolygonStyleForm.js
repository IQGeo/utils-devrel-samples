// Copyright: IQGeo Limited 2010-2023
import React, { Component, Fragment } from 'react';
import myw from 'myWorld-client';
import { Form, Radio } from 'myWorld-client/react';
import { InputNumber, Row, Col } from 'antd';
import { ColourAndTransparencyPicker } from './ColourAndTransparencyPicker';
import { colorNameToHex } from './StyleUtils';
import DashStyleSelect from './DashStyleSelect';

const FormItem = Form.Item;

//@localise('StylePicker')
export default class PolygonStyleForm extends Component {
    /**
     * Renders a form to configure the style options for a polygon
     * @param {Object} props
     */
    static getDerivedStateFromProps(props, state) {
        if (!props.data.line)
            return {
                outlineColor: 'green',
                fillColor: 'green'
            };
        const { fill, line } = props.data;
        const { width, widthUnit } = line;
        return {
            outlineColor: colorNameToHex(line.color || fill.color || 'green'),
            fillColor: colorNameToHex(fill.color || 'green'),
            fillOpacity: fill.opacity,
            width,
            widthUnit,
            lineStyle: line.lineStyle
        };
    }

    constructor(props) {
        super(props);
        this.state = {
            outlineColor: null,
            fillColor: null,
            fillOpacity: null,
            width: null,
            widthUnit: null
        };
    }

    render() {
        const { msg } = myw.react.useLocale('StylePicker');
        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };
        return (
            <Form layout="horizontal" className={'polygon-style-form'}>
                <FormItem label={msg('fill_colour')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={this.state.fillColor}
                        opacity={this.state.fillOpacity}
                        onChange={val =>
                            this.handleChangeOfColorAndOpacity('fillColorAndOpacity', val)
                        }
                    />
                </FormItem>
                <FormItem label={msg('dash_style')} {...formItemLayout}>
                    {
                        <Fragment>
                            <DashStyleSelect
                                lineStyle={this.state.lineStyle}
                                handleChangeOf={this.handleChangeOf}
                                isBorder={true}
                            ></DashStyleSelect>
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('outline_colour')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={this.state.outlineColor}
                        opacity={this.state.outlineOpacity}
                        onChange={val =>
                            this.handleChangeOfColorAndOpacity('outlineColorAndOpacity', val)
                        }
                        disallowTransparent={true}
                        disableAlpha={true}
                    />
                </FormItem>
                <FormItem label={msg('outline_width')} {...formItemLayout}>
                    <Row gutter={30}>
                        {
                            <Fragment>
                                <Col span={8}>
                                    <InputNumber
                                        style={{ width: 50, marginRight: 6 }}
                                        min={0}
                                        value={this.state.width}
                                        onChange={val => this.handleChangeOf('width', val)}
                                    />
                                </Col>
                                <Col span={8}>
                                    <Radio.Group
                                        value={this.state.widthUnit}
                                        onChange={e => this.handleChangeOfRadio('widthUnit', e)}
                                    >
                                        <Radio value="px">{msg('pixels')}</Radio>
                                        <Radio value="m">{msg('meters')}</Radio>
                                    </Radio.Group>
                                </Col>
                            </Fragment>
                        }
                    </Row>
                </FormItem>
            </Form>
        );
    }

    handleChangeOfColorAndOpacity = (name, val) => {
        const { color, opacity } = val;
        const stateObj = { ...this.state };
        if (name === 'fillColorAndOpacity') {
            stateObj['fillColor'] = color;
            stateObj['fillOpacity'] = opacity;
        } else {
            stateObj['color'] = color;
        }
        this.setState(stateObj);
        this._onChange(stateObj);
    };

    handleChangeOfRadio = (name, e) => {
        this.handleChangeOf(name, e.target.value);
    };

    handleChangeOf = (name, val) => {
        const stateObj = { ...this.state };
        stateObj[name] = val;
        this.setState(stateObj);
        this._onChange(stateObj);
    };

    _onChange(stateObj) {
        const { color, outlineColor, fillColor, fillOpacity, width, widthUnit, lineStyle } =
            stateObj;
        const data = {
            line: {
                color: color || outlineColor,
                width,
                widthUnit,
                lineStyle
            },
            fill: {
                color: fillColor,
                opacity: fillOpacity
            }
        };
        this.props.onChange(data);
    }
}
