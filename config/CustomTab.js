// Copyright: IQGeo Limited 2010-2024
import React, { Component } from 'react';
import { inject, observer } from 'mobx-react';
import { CustomTabForm } from './CustomTabForm';

@inject('store') // injects the MobX store into the component
@observer // makes the component observe changes in the MobX store
export class CustomTab extends Component {
    render() {
        const store = this.props.store.settingsStore;
        const settings = store.getAllConverted();
        return <CustomTabForm settings={settings} settingsStore={store} />;
    }
}
