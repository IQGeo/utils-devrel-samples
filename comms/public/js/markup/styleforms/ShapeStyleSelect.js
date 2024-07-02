// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Select } from 'antd';
import { symbols, svgRenderer } from './StyleUtils';

const Option = Select.Option;

export default class ShapeStyleSelect extends Component {
    /**
     * Renders an antd select that displays all the different icon options as svgs
     */
    render() {
        return (
            <Select
                value={this.props.symbol}
                style={{ width: 150 }}
                onChange={value => this.props.handleChangeOf('symbol', value)}
                className={'dropdown-select-menu linestyle-picker'}
            >
                {Object.keys(symbols).map(symbol => {
                    return (
                        <Option key={symbol} className={'stylepicker-option'} value={symbol}>
                            {this.createSvg(symbol)}
                        </Option>
                    );
                })}
            </Select>
        );
    }

    createSvg(symbol) {
        return (
            <svg
                viewBox={'0 0 100 100'}
                style={{
                    height: '16px',
                    width: '16px',
                    transform: 'rotate(180deg)'
                }}
            >
                {symbol === 'circle' ? (
                    this.createCircle()
                ) : (
                    <path d={svgRenderer.convertPointsToPath(symbols[symbol])}></path>
                )}
            </svg>
        );
    }

    createCircle() {
        const pathObj = svgRenderer.createCirclePath();
        return <circle cx={pathObj.cx} cy={pathObj.cy} r={pathObj.r}></circle>;
    }
}
