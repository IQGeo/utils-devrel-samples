import React, { Component } from 'react';
import '../public/style/components/_editableTable.scss';
import { Button, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { KeyValueView, EditableTable, localise } from 'config-shared';
import { FeatureSelect } from './FeatureSelect';

/**
 * Class to display mapping data for import config
 * Table expands into keyValueView
 */
@localise('settings')
@inject('store')
@observer
export class MappingsEditor extends Component {
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
                            <span>{item.seq}</span>
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
                title: this.props.msg('comms_feature_type'),
                dataIndex: 'feature_type',
                getInput: record => (
                    <FeatureSelect
                        id={this.props.id}
                        text={record.feature_type}
                        store={this.props.store}
                        rootStore={this.props.rootStore}
                        handleChange={data => this.handleChange(record.key, 'feature_type', data)}
                    />
                )
            },
            {
                title: this.props.msg('src_feature_type'),
                dataIndex: 'src_feature_type',
                getInput: record => (
                    <Input
                        className="key_input"
                        key={record.key}
                        onChange={e =>
                            this.handleChange(record.key, 'src_feature_type', e.target.value)
                        }
                    />
                )
            },
            {
                title: this.props.msg('filter'),
                dataIndex: 'filter',
                width: '450px',
                getInput: record => (
                    <Input
                        className="key_input"
                        key={record.key}
                        value={this.state.data[record.key]?.filter}
                        onChange={e => this.handleChange(record.key, 'filter', e.target.value)}
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
     * Renders expanded row which is keyValueView
     */
    expandedRowRender = record => {
        const { msg } = this.props;
        return (
            <KeyValueView
                value={record.field_mappings}
                args={{ keyTitle: msg('target_field'), valueTitle: msg('source_field') }}
                onChange={e => this.onFieldsChange(record.key, e)}
            ></KeyValueView>
        );
    };

    /**
     * Handles change of KeyValueView fields, sets data in store and in state
     * @param {int} key
     * @param {Object} data
     */
    onFieldsChange = (key, data) => {
        const toSet = this.state.data;
        toSet[key].field_mappings = data;
        this.setState({ data: toSet });
        this.triggerChange(toSet);
    };

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
                    className="import-format-editable-table"
                    columns={this.columns}
                    expandedRowRender={this.expandedRowRender}
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
