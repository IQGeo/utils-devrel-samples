// Copyright: IQGeo Limited 2010-2023
import React, { Component, Fragment } from 'react';
import { InputNumber, Row, Col } from 'antd';
import { Form, Radio } from 'myWorld-client/react';
import ShapeStyleSelect from './ShapeStyleSelect';
import { ColourAndTransparencyPicker } from './ColourAndTransparencyPicker';

const FormItem = Form.Item;

export default class PointSymbolForm extends Component {
    /**
     * Allows selection of svg symbol for point
     * @param {Object} props
     */
    static getDerivedStateFromProps(props, state) {
        return {
            color: props.color,
            borderColor: props.borderColor,
            size: props.size,
            symbol: props.symbol,
            sizeUnit: props.sizeUnit
        };
    }

    constructor(props) {
        super(props);
        this.state = {};
    }

    render() {
        const { msg } = this.props;
        const { color, borderColor } = this.state;
        return (
            <div>
                <FormItem
                    label={msg('shape')}
                    {...this.props.formItemLayout}
                    validateStatus={this.state.imageValidStatus}
                >
                    <ShapeStyleSelect
                        style={{ width: 220 }}
                        symbol={this.state.symbol}
                        handleChangeOf={this.handleChangeOf}
                    />
                </FormItem>
                <FormItem label={msg('fill_colour')} {...this.props.formItemLayout}>
                    {
                        <Fragment>
                            <ColourAndTransparencyPicker
                                color={color}
                                opacity={1}
                                onChange={val => this.handleChangeOf('colorAndOpacity', val)}
                                disableAlpha={true}
                            />
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('border_colour')} {...this.props.formItemLayout}>
                    {
                        <Fragment>
                            <ColourAndTransparencyPicker
                                color={borderColor}
                                opacity={1}
                                onChange={val => this.handleChangeOf('borderColorAndOpacity', val)}
                                disableAlpha={true}
                            />
                        </Fragment>
                    }
                </FormItem>
                <FormItem label={msg('size')} {...this.props.formItemLayout}>
                    <Row gutter={30}>
                        {
                            <Fragment>
                                <Col span={8}>
                                    <InputNumber
                                        style={{ width: 50, marginRight: 6 }}
                                        min={0}
                                        value={this.state.size}
                                        onChange={val => this.handleChangeOf('size', val)}
                                    />
                                </Col>
                                <Col span={8}>
                                    <Radio.Group
                                        value={this.state.sizeUnit}
                                        onChange={e => this.handleChangeOfRadio('sizeUnit', e)}
                                    >
                                        <Radio value="px">{msg('pixels')}</Radio>
                                        <Radio value="m">{msg('meters')}</Radio>
                                    </Radio.Group>
                                </Col>
                            </Fragment>
                        }
                    </Row>
                </FormItem>
            </div>
        );
    }

    handleChangeOfRadio = (name, e) => {
        this.handleChangeOf(name, e.target.value);
    };

    handleChangeOf = (name, val) => {
        this.props.handleChangeOf(name, val);
        this.setState({ [name]: val });
    };
}
