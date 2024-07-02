import React from 'react';
import { Form, Checkbox } from 'antd';

export default class LayoutStrandCheckbox extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            value: false
        };
    }

    render() {
        return (
            <Form.Item
                label={this.props.label}
                name={this.props.name}
                key={`form-item-${this.props.id}-${this.props.label}`}
            >
                <input
                    type="checkbox"
                    className="strand-checkbox"
                    onChange={value => {
                        this.setState({ value: value.target.checked });
                        if (this.props.callback) {
                            this.props.callback(value.target.checked);
                        }
                    }}
                    disabled={this.props.disabled}
                    checked={this.state.value}
                    key={`select-${this.props.id}-${this.props.label}`}
                />
            </Form.Item>
        );
    }
}
