import React from 'react';
import { Form, Select } from 'antd';

export default class LayoutStrandDropdown extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            value: 0
        };
    }

    getOptions = () => {
        const { Option } = Select;

        let dropdownOptions = [];
        for (const idx in this.props.options) {
            const option = this.props.options[idx];
            dropdownOptions.push(
                <option value={option.externalName} key={`option-${this.props.id}-${idx}`}>
                    {option.externalName}
                </option>
            );
        }
        return dropdownOptions;
    };

    render() {
        return (
            <Form.Item
                label={this.props.label}
                name={this.props.name}
                key={`form-item-${this.props.id}-${this.props.label}`}
                shouldUpdate
                rules={[
                    {
                        required: this.props.required || false,
                        message: this.props.errorMessage || ''
                    }
                ]}
            >
                <select
                    disabled={this.props.disabled}
                    className="strand-dropdown"
                    onChange={e => {
                        this.setState({ value: e.target.value });
                        for (const option in this.props.options) {
                            if (e.target.value === this.props.options[option].externalName) {
                                if (this.props.callback) {
                                    this.props.callback(this.props.options[option].featureName);
                                }
                            }
                        }
                    }}
                    value={this.state.value}
                    key={`select-${this.props.id}-${this.props.label}`}
                >
                    {this.getOptions()}
                </select>
            </Form.Item>
        );
    }
}
