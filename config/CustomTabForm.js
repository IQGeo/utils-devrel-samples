// Copyright: IQGeo Limited 2010-2024
import React, { Component } from 'react';
import { Select } from 'antd';
import { localise } from 'config-shared';
import { Layout } from 'antd';

const { Content } = Layout;

const contentStyle = {
    textAlign: 'center',
    minHeight: 120,
    lineHeight: '30px',
    margin: '10px 10px'
};

const layoutStyle = {
    borderRadius: 8,
    overflow: 'hidden',
    width: 'calc(50% - 8px)',
    maxWidth: 'calc(50% - 8px)'
};

@localise('settings')
export class CustomTabForm extends Component {
    db = null;
    constructor(props) {
        super(props);
    }

    handleChange = value => {
        const update = {
            name: 'custom.feature',
            type: 'STRING',
            value: value
        };
        this.props.settingsStore.update('custom.feature', update).then(() => {
            console.log('Setting updated successfully!');
        });
    };

    render() {
        // const { msg, settings, form } = this.props;
        return (
            <div>
                <Layout style={layoutStyle}>
                    <Content style={contentStyle}>
                        Select a Structure
                        <br></br>
                        <Select
                            defaultValue={this.props.settings['custom.feature'] || 'pole'}
                            style={{ width: 120 }}
                            onChange={this.handleChange}
                            options={[
                                { value: 'pole', label: 'Pole' },
                                { value: 'manhole', label: 'Manhole' },
                                { value: 'cabinet', label: 'Cabinet' },
                                { value: 'wall_box', label: 'Wall Box' },
                                { value: 'building', label: 'Building' }
                            ]}
                        />
                    </Content>
                </Layout>
            </div>
        );
    }
}
