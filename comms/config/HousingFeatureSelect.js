// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Select } from 'antd';
import { observer } from 'mobx-react';
import { localise } from 'config-shared';
const Option = Select.Option;

/**
 * Class to display the features a user can choose from for housing: structures, routes, equipment, conduits
 */
@localise('settings')
@observer
export class HousingFeatureSelect extends Component {
    render() {
        //Get structures, routes, equipments and conduits
        const store = this.props.store;
        const structs = Object.keys(store.getConverted('mywcom.structures'));
        const routes = Object.keys(store.getConverted('mywcom.routes'));
        const equips = Object.keys(store.getConverted('mywcom.equipment'));
        const conduits = Object.keys(store.getConverted('mywcom.conduits'));
        let features = [...structs, ...routes, ...equips, ...conduits];

        switch (this.props.id) {
            case 'mywcom.equipment':
                features = [...structs, ...equips];
                break;
            case 'mywcom.conduits':
                features = [...routes, ...conduits];
                break;
            case 'mywcom.circuits':
                features = [...equips];
                break;
            case 'mywcom.cables':
                features = [...structs, ...routes, ...conduits];
        }

        //Filter out currently selected and sort
        const commsFeatures = features.filter(feature => feature != this.props.rec.housing).sort();

        return (
            <Select
                value={this.props.rec?.housing || ''}
                onChange={this.props.handleChange}
                style={{ width: 180 }}
            >
                {commsFeatures.map((feature, i) => {
                    return (
                        <Option key={i} value={feature}>
                            {feature}
                        </Option>
                    );
                })}
            </Select>
        );
    }
}
