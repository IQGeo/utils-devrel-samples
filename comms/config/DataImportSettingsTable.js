// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import '../public/style/components/_dataImportSettingsTable.scss';
import { inject, observer } from 'mobx-react';
import { localise, SelectWithInput } from 'config-shared';
import { Form, Input } from 'antd';
import { MappingsEditor } from './MappingsEditor';
const FormItem = Form.Item;

/**
 * Form to view and edit the mywcom.import_config setting
 */
@inject('store')
@localise('settings')
@observer
export class DataImportSettingsTable extends Component {
    state = {
        mappingsData: [],
        data: {}
    };

    static getDerivedStateFromProps(props, state) {
        return {
            mappingsData: props.data.mappings,
            data: props.data
        };
    }

    onChange = data => {
        const currentData = this.state.data;
        currentData.mappings = this.unformatData(data);
        this.setState({ mappingsData: data });
        this.props.onChange(currentData);
    };

    formatMappingsData(mappings) {
        mappings.forEach((row, i) => {
            row.key = i;
        });
        return mappings;
    }

    handleChangeOf = (name, val) => {
        const data = this.state.data;
        data[name] = val;
        this.setState({ data });
        this.props.onChange(data);
    };

    unformatData(data) {
        return this.removeKey(data);
    }

    /**
     * Deletes 'key' property from each element of array
     */
    removeKey(arr) {
        arr.forEach(obj => {
            delete obj['key'];
        });
        return arr;
    }

    render() {
        const { msg, store } = this.props;
        const { data } = this.state;
        if (!store) return null;

        const formItemLayout = {
            labelCol: { span: 3 },
            wrapperCol: { span: 10 }
        };

        return (
            <Form layout="horizontal">
                <FormItem label={msg('name')} {...formItemLayout}>
                    <Input
                        style={{ width: 900 }}
                        value={data.name}
                        onChange={e => this.handleChangeOf('name', e.target.value)}
                    />
                </FormItem>
                <FormItem label={msg('description')} {...formItemLayout}>
                    <Input
                        style={{ width: 900 }}
                        value={data.description}
                        onChange={e => this.handleChangeOf('description', e.target.value)}
                    />
                </FormItem>
                <FormItem label={msg('engine')} {...formItemLayout}>
                    <Input
                        style={{ width: 900 }}
                        value={data.engine}
                        onChange={e => this.handleChangeOf('engine', e.target.value)}
                    />
                </FormItem>
                <FormItem label={msg('file_specs')} {...formItemLayout}>
                    <SelectWithInput
                        className="file-specs"
                        value={data.file_specs}
                        onChange={value => this.handleChangeOf('file_specs', value.split(','))}
                    />
                </FormItem>
                <FormItem label={msg('mappings')} {...formItemLayout}>
                    <MappingsEditor
                        data={this.formatMappingsData(this.state.mappingsData)}
                        onChange={this.onChange}
                        id={this.props.id}
                        store={store}
                        rootStore={this.props.rootStore}
                    />
                </FormItem>
            </Form>
        );
    }
}
