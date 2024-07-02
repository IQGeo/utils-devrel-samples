import React, { Component } from 'react';
import { Button } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { EditableTable, localise } from 'config-shared';
import { FiberColorSelect } from './FiberColorSelect';

/**
 * Class to display Fiber color data for the fiber color scheme
 */
@localise('settings')
@inject('store')
@observer
export class FiberColorSchemeEditor extends Component {
    static getDerivedStateFromProps(props, state) {
        if (state.data.length != 0 && JSON.stringify(props.data) == JSON.stringify(state.data))
            return {};
        return {
            data: props.data
        };
    }

    constructor(props) {
        super(props);
        this.state = { data: [], expandedData: [] };

        this.columns = [
            {
                title: '',
                dataIndex: 'key',
                width: '35px',
                className: 'text-center',
                render: (text, item) => {
                    return (
                        <div className="seq-cell">
                            <span>{item.key + 1}</span>
                            <span
                                className="delete-row-btn-nested hidden"
                                onClick={() => this.removeItem(item)}
                            >
                                <DeleteOutlined />
                            </span>
                        </div>
                    );
                }
            },
            {
                title: this.props.msg('color'),
                dataIndex: 'color',
                getInput: record => (
                    <FiberColorSelect
                        className="key_input"
                        key={record.key}
                        store={this.props.store}
                        handleChange={value => this.handleChange(record.key, 'color', value)}
                    />
                )
            },
            {
                title: this.props.msg('stripes'),
                dataIndex: 'stripes',
                getInput: record => (
                    <FiberColorSelect
                        className="value_input"
                        key={record.key}
                        store={this.props.store}
                        handleChange={value => this.handleChange(record.key, 'stripes', value)}
                        mode={'multiple'}
                    />
                )
            }
        ];
    }

    /**
     * Handles change to input field in table
     * Sets state and calls triggerChange
     * @param {int} id
     * @param {string} key
     * @param {string} value
     */
    handleChange(id, key, value) {
        let values = [...this.state.data];
        values[id][key] = value;
        this.setState({ data: values });
        this.triggerChange(values);
    }

    /**
     * Adds item to table, sets state and store
     */
    addItem() {
        let values = [...this.state.data];
        values.push({
            key: values.length,
            feature_type: '',
            src_feature_type: '',
            field_mappings: {}
        });
        this.setState({ data: values });
        this.triggerChange(values);
    }

    /**
     * Removes item from values object
     * @param {Object} item
     */
    removeItem(item) {
        let values = [...this.state.data];
        values = values.filter((val, i) => i !== item.key);
        values = this.addKeysToData(values); //resequence keys
        this.setState({ data: values });
        this.triggerChange(values);
    }

    /**
     * Resequence keys when a row is removed
     * @param {Object} data
     */
    addKeysToData(data) {
        data.forEach((row, i) => {
            row.key = i;
        });
        return data;
    }

    /**
     * Sets data in store
     * @param {Array} data
     */
    triggerChange(data) {
        this.props.onChange(data);
    }

    render() {
        const data = this.state.data;
        const { msg } = this.props;

        return (
            <div>
                <EditableTable
                    size="small"
                    className="myw-nested-table input-container editable-table fiber-color-scheme-editor"
                    columns={this.columns}
                    dataSource={data}
                    pagination={{ pageSize: 9999, hideOnSinglePage: true }}
                    rowKey={'key'}
                />
                <div className="controls-container" style={{ padding: 10 }}>
                    <Button
                        icon={<PlusOutlined />}
                        onClick={this.addItem.bind(this)}
                        title={msg('add_value_btn')}
                    >
                        {msg('add_value_btn')}
                    </Button>
                </div>
            </div>
        );
    }
}
