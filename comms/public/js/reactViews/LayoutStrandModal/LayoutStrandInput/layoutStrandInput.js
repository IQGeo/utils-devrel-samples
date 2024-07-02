import React from 'react';
import myw from 'myWorld-client';
import { Input, Form } from 'antd';

export default class LayoutStrandInput extends React.Component {
    constructor(props) {
        super(props);

        this.app = myw.app;
    }

    /**
     * Creates a UnitScale based on fieldDD settings
     * @param {fieldDD} fieldDD
     * @returns {UnitScale}
     */
    _initializeUnitScale = fieldDD => {
        const unitScales = this.app.system.settings['core.units'];
        let scale_config;

        if (fieldDD.unit_scale) {
            scale_config = unitScales[fieldDD.unit_scale];
        } else if (this.hasUnits) {
            scale_config = { units: {}, base_unit: fieldDD.unit };
            scale_config.units[fieldDD.unit] = 1.0;
        } else {
            return undefined;
        }
        return scale_config ? new myw.UnitScale(scale_config) : undefined;
    };

    _convertValueString = valueString => {
        const fieldDD = this.props.fieldDD;
        const unitScale = this._initializeUnitScale(fieldDD);
        let n = unitScale.fromString(valueString, this.displayUnit || fieldDD.display_unit);
        if (n.unit == fieldDD.unit) {
            n = n.value;
        } else {
            n = unitScale.convert(n.value, n.unit, fieldDD.unit);
        }
        return n;
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
                <Input
                    style={{ width: 156, float: 'right' }}
                    disabled={this.props.disabled}
                    className={this.props.class || this.props.name}
                    onChange={value => {
                        this.setState({ value: value });
                        if (this.props.callback) {
                            if (this.props.fieldDD?.unit) {
                                value = this._convertValueString(value.target.value);
                                this.props.callback(value);
                                return;
                            }
                            this.props.callback(value.target.value);
                        }
                    }}
                    type={this.props.unit ? 'number' : null}
                    addonAfter={this.props.unit}
                    key={`input-${this.props.id}-${this.props.label}`}
                />
            </Form.Item>
        );
    }
}
