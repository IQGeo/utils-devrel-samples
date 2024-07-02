// Copyright: IQGeo Limited 2010-2023
import React, { Component, Fragment } from 'react';
import { message, Collapse, Button } from 'antd';
import { PlusOutlined, MinusOutlined } from '@ant-design/icons';
import { inject, observer } from 'mobx-react';
import { localise, ErrorMsg, withFormForProp, KeyValueView } from 'config-shared';
import { SettingTable } from './SettingTable';
import { CableStyleForm } from './CableStyleForm';
import { ConflictStyleForm } from './ConflictStyleForm';
import NewImportFormatForm from './NewImportFormatForm';
import { DataImportSettingsTable } from './DataImportSettingsTable';
import { SaveCancelButtons } from './SaveCancelButtons';
import { ValidateButton } from './ValidateButton';
import '../public/style/configStyle.scss';
import { RestClient } from '../../../core/config/stores/RestClient';
const { Panel } = Collapse;

/**
 * Component to allow a user to modify Comms related db settings
 * Requires settings to exist in database - only updates, doesn't insert
 */
@withFormForProp('settings') //provides a form where the items' values will obtained from the 'settings' prop
@inject('store') //provides access to the stores (which handle db access)
@localise('settings') //provides 'msg' prop, bound to 'settings' group
@observer
export class SettingForm extends Component {
    constructor(props) {
        super(props);
        this.state = {
            key: 0,
            showInput: false
        };
    }

    render() {
        const { msg, form, store, menuItemId } = this.props;
        if (menuItemId === 'mywcom.previewCableStyles') {
            return (
                <Fragment key={this.state.key}>
                    <h3 style={{ margin: '10px 14px' }}>{msg(menuItemId)}</h3>
                    <div style={{ margin: '10px 14px 20px' }}>{msg(`${menuItemId}_desc`)}</div>
                    <CableStyleForm
                        data={this.props.settings[menuItemId]}
                        form={form}
                        id={menuItemId}
                        store={store.settingsStore}
                        msg={msg}
                        onChange={data => this.onChange(menuItemId, data)}
                        handleSave={() => this.handleSave(menuItemId)}
                    />
                    <h3 style={{ margin: '10px 14px' }}>{msg('mywcom_conflicts')}</h3>
                    <div style={{ margin: '10px 14px 20px' }}>{msg(`mywcom_conflicts_desc`)}</div>
                    <ConflictStyleForm
                        data={{
                            ...this.props.settings['mywcom.conflictStyles'],
                            proposed: this.props.settings['mywcom.proposedObjectStyle']
                        }}
                        form={form}
                        id={'mywcom.conflictStyles'}
                        store={store.settingsStore}
                        msg={msg}
                        onChange={data => this.onConflictStyleChange('mywcom.conflictStyles', data)}
                        onProposedObjectChange={data =>
                            this.onProposedStyleChange('mywcom.proposedObjectStyle', data)
                        }
                    />
                    <div style={{ margin: '10px 14px 20px' }}>
                        <SaveCancelButtons
                            handleSave={() =>
                                this.handleSaves([
                                    'mywcom.previewCableStyles',
                                    'mywcom.conflictStyles',
                                    'mywcom.proposedObjectStyle'
                                ])
                            }
                        />
                    </div>
                </Fragment>
            );
        } else if (menuItemId === 'mywcom.specs' || menuItemId === 'mywcom.laborCosts') {
            return (
                <Fragment key={this.state.key}>
                    <h3 style={{ margin: '10px 14px' }}>{msg(menuItemId)}</h3>
                    <div style={{ margin: '10px 14px 20px' }}>{msg(`${menuItemId}_desc`)}</div>
                    <div className="comms-settings-table" style={{ margin: 10, maxWidth: 700 }}>
                        <div className="spec-key-value-editor">
                            <KeyValueView
                                value={this.props.settings[menuItemId]}
                                args={{
                                    keyTitle: msg('feature_type'),
                                    valueTitle:
                                        menuItemId === 'mywcom.specs'
                                            ? msg('spec_feature_type')
                                            : msg('labor_cost_feature_type'),
                                    isArray: false
                                }}
                                blankAllowed={true}
                                key={this.props.name}
                                onChange={data => this.onChange(menuItemId, data)}
                            />
                        </div>
                        <ValidateButton aspect={menuItemId} />
                        <SaveCancelButtons handleSave={() => this.handleSave(menuItemId)} />
                    </div>
                </Fragment>
            );
        } else if (menuItemId === 'mywcom.import_config') {
            const data = {};
            for (const key of Object.keys(this.props.settings)) {
                if (key.includes(menuItemId)) data[key] = this.props.settings[key];
            }
            return (
                <Fragment key={this.state.key}>
                    <h3 style={{ margin: '10px 14px' }}>{msg(menuItemId)}</h3>
                    <div style={{ margin: '10px 14px 20px' }}>{msg(`${menuItemId}_desc`)}</div>
                    <Collapse className="system-settings-panels" accordion bordered={false}>
                        {Object.keys(data)
                            .sort()
                            .map(key => {
                                const name = data[key].name;
                                return (
                                    <Panel header={<div>{name}</div>} key={key}>
                                        <DataImportSettingsTable
                                            key={key}
                                            data={data[key]}
                                            id={key}
                                            store={store.settingsStore}
                                            rootStore={store}
                                            msg={msg}
                                            onChange={data => this.onChange(key, data)}
                                        />
                                    </Panel>
                                );
                            })}
                    </Collapse>
                    <div style={{ margin: '10px 14px 20px' }}>
                        {this.newImportFormatForm(msg, data, store.settingsStore)}
                        <ValidateButton aspect={menuItemId} settingIds={Object.keys(data)} />
                        <SaveCancelButtons
                            handleSave={async () => this.handleSaves(Object.keys(data))}
                        />
                    </div>
                </Fragment>
            );
        } else {
            return (
                <Fragment key={this.state.key}>
                    <h3 style={{ margin: '10px 14px' }}>{msg(menuItemId)}</h3>
                    <div style={{ margin: '10px 14px 20px' }}>{msg(`${menuItemId}_desc`)}</div>
                    <SettingTable
                        data={this.formatSettingDataFor(menuItemId)}
                        id={menuItemId}
                        store={store.settingsStore}
                        rootStore={store}
                        msg={msg}
                        onChange={data => this.onChange(menuItemId, data)}
                        addItem={data => this.addItemTo(menuItemId, data)}
                        handleSave={() => this.handleSave(menuItemId)}
                    />
                </Fragment>
            );
        }
    }

    /**
     * Returns an array of objects with the key added in as the name property
     * @returns {array}
     */
    formatSettingDataFor(name) {
        const setting = this.props.settings[name];
        const data = [];

        //Set data format
        Object.keys(setting).forEach((name, index) => {
            const item = setting[name];
            item['name'] = name;
            item['key'] = index;
            data.push(item);
        });

        return data;
    }

    /**
     * Removes the extra key and name props
     * and returns the data as an object
     * @param {array} data
     */
    unformatData(data) {
        let jsonData = {};
        data.forEach(item => {
            let { key, name, ...restOfItem } = item; // eslint-disable-line
            jsonData[item.name] = restOfItem;
        });

        return jsonData;
    }

    newImportFormatForm = (msg, data, store) => {
        const showInput = this.state.showInput;
        return (
            <>
                <Button
                    icon={showInput ? <MinusOutlined /> : <PlusOutlined />}
                    title={showInput ? msg('cancel') : msg('new_format')}
                    onClick={this.changeInputState}
                >
                    {showInput ? msg('cancel') : msg('new_format')}
                </Button>
                {showInput ? (
                    <NewImportFormatForm
                        msg={msg}
                        data={data}
                        settingsStore={store}
                        changeInputState={this.changeInputState}
                    />
                ) : null}
            </>
        );
    };

    changeInputState = () => {
        this.setState({ showInput: !this.state.showInput });
    };

    /**
     * Handles saving array of ids
     * @param {Array} ids
     */
    async handleSaves(ids) {
        const settingsStore = this.props.store.settingsStore;
        const { msg } = this.props;
        const savesPromise = ids.map(id => {
            settingsStore.update(id, settingsStore.store[id]);
        });
        await Promise.all(savesPromise)
            .catch(error => {
                message.error(ErrorMsg.getMsgFor(error, true, msg));
            })
            .then(async () => {
                /*eslint-disable no-promise-executor-return*/
                await new Promise(resolve => setTimeout(resolve, 100)); // TBR: Hack to workaround core bug where stores were not updated correctly, ENH: remove
                /*eslint-enable no-promise-executor-return*/
                message.success(msg('saved'));
                await settingsStore.getAll();
                this.setState({ updated: true });
            });
    }

    /**
     * Saves setting using comms API call if required, else updates setting using core call
     * @param {String} id
     */
    handleSave(id) {
        const settingsStore = this.props.store.settingsStore;
        const { msg } = this.props;

        const category = id.split('.')[1];
        if (
            category == 'fiberColorSchemes' ||
            category == 'fiberColors' ||
            category == 'designs' ||
            category == 'specs' ||
            category == 'laborCosts'
        ) {
            //Update setting using core call
            settingsStore
                .update(id, settingsStore.store[id])
                .then(async () => {
                    message.success(msg('saved'));
                    await settingsStore.getAll();
                    this.setState({ updated: true });
                })
                .catch(error => {
                    message.error(ErrorMsg.getMsgFor(error, true, msg, id, false));
                });
        } else {
            //Use comms API call
            this.saveConfigAPICall(id)
                .then(async res => {
                    this.displaySettingMessage(res);

                    await settingsStore.getAll();
                    this.setState({ updated: true });
                })
                .catch(error => {
                    message.error(ErrorMsg.getMsgFor(error, true, msg, id, false));
                });
        }
    }

    /**
     * Update a category definition setting (and make associated feature modifications)
     */
    saveConfigAPICall = id => {
        const settingsStore = this.props.store.settingsStore;
        const aspectSettings = JSON.parse(settingsStore.store[id].value);
        const data = { config: aspectSettings };
        const url = `modules/comms/config/update/${id.split('.')[1]}`;
        const response = RestClient.put(url, data);
        return response;
    };

    /**
     * Displays messages based on info returned from API call
     */
    displaySettingMessage(res) {
        const { msg } = this.props;

        const field_updated_info = res.data.info.filter(item => item.field_updated);
        const field_removed_info = res.data.info.filter(item => item.field_removed);

        //feature type added to field (for routes, conduits and equipment)
        if (field_updated_info.length) {
            const field = field_updated_info[0].field_updated;
            let feature_updated = field_updated_info[0].feature_updated;
            let feature_type;
            if (field == 'equipment' || field == 'conduits') {
                feature_updated = 'housings';
                const feature_added = field_updated_info.find(info => info.added_to_setting);
                if (feature_added) feature_type = feature_added.feature_type;
                else feature_type = field;
            } else {
                feature_type = field_updated_info.map(info => info.feature_type).join(',');
            }

            message.success(msg('field_updated', { field, feature_updated, feature_type }));
        }

        //Feature type removed from field (for routes, conduits and equipment)
        if (field_removed_info.length) {
            const field = field_removed_info[0].field_removed;
            let feature_updated = field_removed_info[0].feature_updated;
            if (field == 'equipment') feature_updated = msg('structures_and_equipment');
            const feature_type = field_removed_info.map(info => info.feature_type).join(',');
            message.success(msg('field_removed', { field, feature_updated, feature_type }));
        }

        if (!field_updated_info.length && !field_removed_info.length) {
            message.success(msg('saved'));
        }
    }

    /**
     * Updates the store
     * @param {string} id  setting's name
     * @param {array} data datasource used for the SettingTable
     */
    onChange(id, data) {
        let settingJSON = data;

        const correctFormat =
            id.includes('mywcom.import_config') ||
            ['mywcom.previewCableStyles', 'mywcom.specs', 'mywcom.laborCosts'].includes(id);
        if (!correctFormat) {
            settingJSON = this.unformatData(data);
        }

        this.props.store.settingsStore.setValue(id, settingJSON);
    }

    onConflictStyleChange(id, data) {
        const settingJSON = !['mywcom.conflictStyles'].includes(id)
            ? this.unformatData(data)
            : data;
        this.props.store.settingsStore.setValue(id, settingJSON);
    }

    onProposedStyleChange(id, data) {
        this.props.store.settingsStore.setValue(id, data.proposed);
    }

    /**
     * Adds an item to the setting
     * @param {string} id  setting's name
     * @param {array} data datasource used for the SettingTable
     */
    addItemTo(id, data) {
        let values = [...data];
        let newItem = { key: values.length, name: '' };
        if (!['mywcom.fiberColors', 'mywcom.fiberColorSchemes', 'mywcom.designs'].includes(id))
            newItem = { ...newItem, ...{ palette: false, image: '' } };
        if (id === 'mywcom.equipment' || id === 'mywcom.cables' || id === 'mywcom.conduits')
            newItem['housings'] = [];

        if (id === 'mywcom.designs') newItem['userGroup'] = '';

        if (id === 'mywcom.circuits') {
            newItem['inEquips'] = [];
            newItem['outEquips'] = [];
        }
        if (id === 'mywcom.fiberColorSchemes') newItem['colors'] = [];
        values.push(newItem);
        return values;
    }
}
