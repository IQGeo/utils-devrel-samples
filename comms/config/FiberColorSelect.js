// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Select } from 'antd';
import { observer } from 'mobx-react';
import { localise } from 'config-shared';
const Option = Select.Option;

/**
 * Class to display colors a user can select
 */
@localise('settings')
@observer
export class FiberColorSelect extends Component {
    render() {
        const store = this.props.store;
        const colors = Object.keys(store.getConverted('mywcom.fiberColors'));

        let value = this.props.value || '';
        if (this.props.mode == 'multiple') {
            if (!this.props.value) value = [];
            else value = this.props.value;
        }
        return (
            <Select
                mode={this.props.mode || ''}
                value={value}
                onChange={this.props.handleChange}
                style={{ width: 180 }}
                size={'small'}
            >
                {colors.map((color, i) => {
                    return (
                        <Option key={i} value={color}>
                            {color}
                        </Option>
                    );
                })}
            </Select>
        );
    }
}
