// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Select } from 'antd';
import arrowedImg from '../../../../../../core/config/images/stylepicker/arrowed.svg';
import dashImg from '../../../../../../core/config/images/stylepicker/dash.svg';
import dotImg from '../../../../../../core/config/images/stylepicker/dot.svg';
import longdashImg from '../../../../../../core/config/images/stylepicker/longdash.svg';
import longdashdotImg from '../../../../../../core/config/images/stylepicker/longdashdot.svg';
import shortdashImg from '../../../../../../core/config/images/stylepicker/shortdash.svg';
import solidImg from '../../../../../../core/config/images/stylepicker/solid.svg';

const Option = Select.Option;

export default class DashStyleSelect extends Component {
    /**
     * Renders an antd select that displays all the different line style options as svgs
     */
    render() {
        const { lineStyle, isBorder, handleChangeOf } = this.props;
        let arrowedLine = '';
        if (!isBorder) {
            arrowedLine = (
                <Option className={'stylepicker-option'} value="arrowed">
                    <img width={'100px'} height={'12px'} alt="View" src={arrowedImg} />
                </Option>
            );
        }
        return (
            <Select
                value={lineStyle}
                style={{ width: 150 }}
                onChange={value => handleChangeOf('lineStyle', value)}
                className={'dropdown-select-menu linestyle-picker'}
            >
                <Option className={'stylepicker-option'} value="dot">
                    <img width={'100px'} height={'2px'} alt="View" src={dotImg} />
                </Option>
                <Option className={'stylepicker-option'} value="shortdash">
                    <img width={'100px'} alt="View" src={shortdashImg} />
                </Option>
                <Option className={'stylepicker-option'} value="dash">
                    <img width={'100px'} alt="View" src={dashImg} />
                </Option>
                <Option className={'stylepicker-option'} value="longdash">
                    <img width={'100px'} alt="View" src={longdashImg} />
                </Option>
                <Option className={'stylepicker-option'} value="longdashdot">
                    <img width={'100px'} alt="View" src={longdashdotImg} />
                </Option>
                {arrowedLine}
                <Option className={'stylepicker-option'} value="solid">
                    <img width={'100px'} alt="View" src={solidImg} />
                </Option>
            </Select>
        );
    }
}
