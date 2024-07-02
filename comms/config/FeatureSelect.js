// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Select } from 'antd';
import { observer } from 'mobx-react';
import { localise } from 'config-shared';
const Option = Select.Option;

/**
 * Class to display the features a user can choose from (all myworld features that are not already assigned to a category)
 */
@localise('settings')
@observer
export class FeatureSelect extends Component {
    constructor(props) {
        super(props);
        this.state = {
            originalSetting: props.store.getConverted(props.id)
        };
        this.props.rootStore.ddStore.getDD('myworld');
    }

    async componentDidMount() {
        const store = this.props.rootStore;
        await store.myWorldStore.getFeatureTypes();
        this.setState({
            myWorldFeatures: store.myWorldStore.featureTypes
        });
        this.mounted = true;
    }

    componentWillUnmount() {
        this.mounted = false;
    }

    render() {
        if (!this.state.myWorldFeatures) return null;

        //Get all features already assigned
        //ENH: Consider specs
        const store = this.props.store;
        const structs = Object.keys(store.getConverted('mywcom.structures'));
        const routes = Object.keys(store.getConverted('mywcom.routes'));
        const equips = Object.keys(store.getConverted('mywcom.equipment'));
        const conduits = Object.keys(store.getConverted('mywcom.conduits'));
        const cables = Object.keys(store.getConverted('mywcom.cables'));
        const circuits = Object.keys(store.getConverted('mywcom.circuits'));
        const designs = Object.keys(store.getConverted('mywcom.designs'));

        const commsFeatures = [
            ...structs,
            ...routes,
            ...equips,
            ...conduits,
            ...cables,
            ...circuits,
            ...designs
        ];

        //Filter features by desired geometry type
        let filterProc = feature => !commsFeatures.includes(feature.name);
        if (this.props.id.includes('import_config')) {
            // Include all features
            filterProc = () => {
                return true;
            };
        } else if (this.props.id == 'mywcom.equipment' || this.props.id == 'mywcom.structures') {
            filterProc = feature =>
                !commsFeatures.includes(feature.name) && feature.geometry_type == 'point';
        } else if (
            this.props.id == 'mywcom.routes' ||
            this.props.id == 'mywcom.conduits' ||
            this.props.id == 'mywcom.cables' ||
            this.props.id == 'mywcom.circuits'
        ) {
            filterProc = feature =>
                !commsFeatures.includes(feature.name) && feature.geometry_type == 'linestring';
        }

        //Filter out comms features that are already assigned and sort alphabetically
        const features = this.state.myWorldFeatures.filter(filterProc).sort();
        const selectedFeature = this.state.myWorldFeatures.find(
            feature => feature.name == this.props.text
        );

        const alreadyInSetting = selectedFeature?.name in this.state.originalSetting;
        return (
            <Select
                value={selectedFeature?.name || ''}
                onChange={this.props.handleChange}
                style={{ width: 180 }}
                disabled={alreadyInSetting}
            >
                {features.map((feature, i) => {
                    return (
                        <Option key={i} value={feature.name}>
                            {feature.name}
                        </Option>
                    );
                })}
            </Select>
        );
    }
}
