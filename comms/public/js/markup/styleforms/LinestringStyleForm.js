// Copyright: IQGeo Limited 2010-2023
import React, { Component, Fragment } from 'react';
import myw from 'myWorld-client';
import { Form, Radio, Select } from 'myWorld-client/react';
import { ColourAndTransparencyPicker } from './ColourAndTransparencyPicker';
import { colorNameToHex } from './StyleUtils';
import { InputNumber, Row, Col } from 'antd';

import DashStyleSelect from './DashStyleSelect';
import arrowBeginImg from '../../../../../../core/config/images/stylepicker/arrow-begin.svg';
import arrowEndImg from '../../../../../../core/config/images/stylepicker/arrow-end.svg';
import solidImg from '../../../../../../core/config/images/stylepicker/solid.svg';

const FormItem = Form.Item;
const Option = Select.Option;

export default class LinestringStyleForm extends Component {
    /**
     * Renders a form for choosing the style of a linestring
     * @param {Object} props
     */
    static getDerivedStateFromProps(props, state) {
        const { color, opacity, width, widthUnit, lineStyle, startStyle, endStyle } = props.data;

        const data = {
            color,
            opacity,
            width,
            widthUnit,
            lineStyle,
            startStyle,
            endStyle
        };
        return { data };
    }

    constructor(props) {
        super(props);
        this.handleChangeOf = this.handleChangeOf.bind(this);
        this.state = {
            data: {
                color: null,
                opacity: null,
                width: null,
                widthUnit: null,
                lineStyle: null,
                startStyle: null,
                endStyle: null
            },
            msg: props.msg
        };
    }

    render() {
        const { data } = this.state;
        const { msg } = myw.react.useLocale('StylePicker');
        const color = colorNameToHex(data.color);
        const formItemLayout = {
            labelCol: { span: 6 },
            wrapperCol: { span: 10 }
        };
        return (
            <Form layout="horizontal" className={'linestring-style-form'}>
                <FormItem label={msg('dash_style')} {...formItemLayout}>
                    {
                        <Fragment>
                            <DashStyleSelect
                                lineStyle={data.lineStyle}
                                handleChangeOf={this.handleChangeOf}
                            ></DashStyleSelect>
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('colour')} {...formItemLayout}>
                    <ColourAndTransparencyPicker
                        color={color}
                        opacity={data.opacity}
                        onChange={val => this.handleChangeOfColorAndOpacity('colorAndOpacity', val)}
                        disableAlpha={true}
                    />
                </FormItem>
                <FormItem label={msg('width')} {...formItemLayout}>
                    <Row gutter={30}>
                        {
                            <Fragment>
                                <Col span={8}>
                                    <InputNumber
                                        style={{ width: 50, marginRight: 6 }}
                                        min={0}
                                        value={data.width}
                                        onChange={val => this.handleChangeOf('width', val)}
                                    />
                                </Col>
                                <Col span={8}>
                                    <Radio.Group
                                        value={data.widthUnit}
                                        onChange={val => this.handleChangeOfRadio('widthUnit', val)}
                                    >
                                        <Radio value="px">{msg('pixels')}</Radio>
                                        <Radio value="m">{msg('meters')}</Radio>
                                    </Radio.Group>
                                </Col>
                            </Fragment>
                        }
                    </Row>
                </FormItem>
                <FormItem label={msg('begin_style')} {...formItemLayout}>
                    {
                        <Fragment>
                            <Select
                                value={data.startStyle}
                                style={{ width: 150 }}
                                onChange={val => this.handleChangeOf('startStyle', val)}
                                className={'dropdown-select-menu linestyle-picker'}
                            >
                                <Option className={'stylepicker-option'} value="">
                                    <img width={'100px'} alt="View" src={solidImg} />
                                </Option>
                                <Option className={'stylepicker-option'} value="arrow">
                                    <img
                                        width={'100px'}
                                        height={'12px'}
                                        alt="View"
                                        src={arrowBeginImg}
                                    />
                                </Option>
                            </Select>
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('end_style')} {...formItemLayout}>
                    {
                        <Fragment>
                            <Select
                                value={data.endStyle}
                                style={{ width: 150 }}
                                onChange={val => this.handleChangeOf('endStyle', val)}
                                className={'dropdown-select-menu linestyle-picker'}
                            >
                                <Option className={'stylepicker-option'} value="">
                                    <img width={'100px'} alt="View" src={solidImg} />
                                </Option>
                                <Option className={'stylepicker-option'} value="arrow">
                                    <img
                                        width={'100px'}
                                        height={'12px'}
                                        alt="View"
                                        src={arrowEndImg}
                                    />
                                </Option>
                            </Select>
                        </Fragment>
                    }
                </FormItem>
            </Form>
        );
    }

    handleChangeOfColorAndOpacity(name, val) {
        const { color, opacity } = val;
        const stateObj = { ...this.state.data };
        stateObj['color'] = color;
        stateObj['opacity'] = opacity;
        this.setState({ data: stateObj });
        this.props.onChange(stateObj);
    }

    handleChangeOfRadio(name, e) {
        this.handleChangeOf(name, e.target.value);
    }

    handleChangeOf = (name, val) => {
        const stateObj = { ...this.state.data };
        stateObj[name] = val;
        this.setState({ data: stateObj });
        this.props.onChange(stateObj);
    };
}
