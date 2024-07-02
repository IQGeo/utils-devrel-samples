// Copyright: IQGeo Limited 2010-2023
import React, { Component } from 'react';
import { Button, Modal, Select } from 'antd';
import { observer } from 'mobx-react';
import { localise, EditableTable } from 'config-shared';
import { SaveCancelButtons } from './SaveCancelButtons';
import { ValidateButton } from './ValidateButton';
import { ColourAndTransparencyPicker, FeatureTypeSelect } from 'config-shared';
import { FeatureSelect } from './FeatureSelect';
import { HousingFeatureSelect } from './HousingFeatureSelect';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { FiberColorSchemeEditor } from './FiberColorSchemeEditor';

const Option = Select.Option;

/**
 * Class to display the setting JSON in an editable table
 */
@localise('settings')
@observer
export class SettingTable extends Component {
    constructor(props) {
        super(props);
        this.state = {
            // Used for the housings modal
            housingsModalVisible: false,
            currentRec: {},
            modalKey: ''
        };
    }

    render() {
        const data = this.props.data || [];
        const { id, msg, handleSave } = this.props;
        const { currentRec, modalKey } = this.state;
        const recForModal = data.find(item => item.name === currentRec.name) || {};

        let tableProps = {
            size: 'small',
            className: 'myw-nested-table input-container editable-table',
            columns: this._getColumns(),
            dataSource: data,
            pagination: { pageSize: 9999, hideOnSinglePage: true },
            rowKey: rec => `${id}_${rec.key}`,
            onFieldsChange: (id, rec, key, data) => this.handleChange(rec.key, key, data),
            shouldCellUpdate: _ => true
        };

        const housingData = recForModal?.[this.state.modalKey]?.map((data, key) => {
            return { housing: data, key };
        });
        const housingTableProps = {
            size: 'small',
            className: 'myw-nested-table input-container editable-table',
            columns: this._getHousingColumns(),
            dataSource: housingData,
            pagination: { pageSize: 9999, hideOnSinglePage: true },
            rowKey: rec => `${id}_${rec.key}`,
            onFieldsChange: (id, rec, key, data) => this.handleChange(id, key, data)
        };

        return (
            <div className="comms-settings-table" style={{ margin: 10 }}>
                <EditableTable {...tableProps} />
                <div className={'controls-container'} style={{ padding: '10px 0' }}>
                    <Button icon={<PlusOutlined />} onClick={this.addItem} title={msg('add')}>
                        {msg('add')}
                    </Button>
                </div>
                <ValidateButton aspect={id} />
                <SaveCancelButtons handleSave={handleSave} aspect={id} />
                {/* Modal to display the editor for housings */}
                <Modal
                    width={548}
                    style={{ top: 20 }}
                    open={this.state.housingsModalVisible}
                    title={msg(`${modalKey}_for_name`, {
                        name: currentRec.name
                    })}
                    onCancel={this.closeModal}
                    footer={[
                        <Button key="OK" type="primary" onClick={this.closeModal}>
                            {msg('ok_btn')}
                        </Button>
                    ]}
                >
                    {this._getModalTable(housingTableProps, recForModal, currentRec, modalKey)}
                </Modal>
            </div>
        );
    }

    formatValues(values) {
        if (!values) return [];
        const formattedArray = [];
        values.forEach(item => {
            formattedArray.push({ value: item });
        });
        return formattedArray;
    }

    mapValue(value) {
        return value.value;
    }

    // The columns to show for this.props.id
    // ENH: Replace by components
    _getColumns() {
        const { msg, id } = this.props;
        // Disabled input with an edit button
        // Clicking on it will open up the array editor modal
        const ArrayField = props => (
            <span
                className="flex"
                id={props.dataIndex}
                onClick={e => {
                    e.persist();
                    this.openHousingsEditor(props.rec, e);
                }}
            >
                <span className="emulate-input">{`${props.text.length} ${msg('items')}`}</span>
                <span className="emulate-input-addon icon-pencil" />
            </span>
        );

        let columns = [
            {
                title: '',
                dataIndex: 'key',
                width: 35,
                className: 'text-center',
                render: (text, item) => {
                    const preventedFromRemoving = ['mywcom_route_junction', 'mywcom_fiber_slack'];
                    if (preventedFromRemoving.includes(item.name)) return null; //Prevent removing comms features from setting
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
                title: msg('name'),
                dataIndex: 'name',
                width: 200,
                render: (text, rec) => {
                    return (
                        <FeatureSelect
                            id={this.props.id}
                            text={text}
                            rec={rec}
                            handleChange={data => this.handleChange(rec.key, 'name', data)}
                            store={this.props.store}
                            rootStore={this.props.rootStore}
                        />
                    );
                }
            },
            {
                title: msg('image'),
                dataIndex: 'image',
                inputType: 'string',
                width: 360
            },
            {
                title: msg('in_palette'),
                dataIndex: 'palette',
                inputType: 'checkbox',
                className: 'in-palette-col' //Adds a left padding
            }
        ];

        if (id === 'mywcom.equipment') {
            columns.splice(
                3,
                0,
                {
                    title: msg('function'),
                    dataIndex: 'function',
                    width: 200,
                    render: (text, rec) => {
                        return (
                            <Select
                                value={text}
                                onChange={data => this.handleChange(rec.key, 'function', data)}
                                style={{ width: 180 }}
                            >
                                <Option key={0} value={'splitter'}>
                                    {'splitter'}
                                </Option>
                                <Option key={1} value={'mux'}>
                                    {'mux'}
                                </Option>
                                <Option key={2} value={'cross_connect'}>
                                    {'cross_connect'}
                                </Option>
                                <Option key={3} value={'connector'}>
                                    {'connector'}
                                </Option>
                                <Option key={4} value={'terminal'}>
                                    {'terminal'}
                                </Option>
                                <Option key={5} value={'enclosure'}>
                                    {'enclosure'}
                                </Option>
                                <Option key={6} value={'slack'}>
                                    {'slack'}
                                </Option>
                                <Option key={7} value={'bridge_tap'}>
                                    {'bridge_tap'}
                                </Option>
                            </Select>
                        );
                    }
                },
                {
                    title: msg('housings'),
                    dataIndex: 'housings',
                    width: 200,
                    render: (text, rec) => {
                        return ArrayField({ text, rec, dataIndex: 'housings' });
                    }
                }
            );
            const technologies = ['fiber', 'copper', 'coax', 'mixed'];
            columns.push({
                title: msg('technology'),
                dataIndex: 'tech',
                width: 200,
                render: (text, rec) => {
                    return (
                        <Select
                            value={rec.tech || ''}
                            onChange={data => this.handleChange(rec.key, 'tech', data)}
                            style={{ width: 180 }}
                        >
                            {technologies.map((tech, i) => {
                                return (
                                    <Option key={i} value={tech}>
                                        {tech}
                                    </Option>
                                );
                            })}
                        </Select>
                    );
                }
            });
        } else if (id === 'mywcom.conduits') {
            columns.splice(
                3,
                0,
                {
                    title: msg('structure_palette_image'),
                    dataIndex: 'structurePaletteImage',
                    inputType: 'string',
                    width: 360
                },
                {
                    title: msg('housings'),
                    dataIndex: 'housings',
                    width: 200,
                    render: (text, rec) => {
                        return ArrayField({ text, rec, dataIndex: 'housings' });
                    }
                },
                {
                    title: msg('bundle_type'),
                    dataIndex: 'bundle_type',
                    render: (text = [], rec) => {
                        return (
                            <Select
                                value={rec.bundle_type || ''}
                                onChange={data => this.handleChange(rec.key, 'bundle_type', data)}
                                style={{ width: 180 }}
                            >
                                {Object.keys(this.props.store.getConverted('mywcom.conduits')).map(
                                    (featureType, i) => {
                                        return (
                                            <Option key={i} value={featureType}>
                                                {featureType}
                                            </Option>
                                        );
                                    }
                                )}
                            </Select>
                        );
                    }
                },
                {
                    title: msg('continuous'),
                    dataIndex: 'continuous',
                    inputType: 'checkbox',
                    className: 'continuous-col' //Adds a left padding
                }
            );
        }

        if (id === 'mywcom.cables') {
            columns.splice(3, 0, {
                title: msg('housings'),
                dataIndex: 'housings',
                width: 200,
                render: (text, rec) => {
                    return ArrayField({ text, rec, dataIndex: 'housings' });
                }
            });
            const technologies = ['fiber', 'copper', 'coax'];
            columns.push({
                title: msg('technology'),
                dataIndex: 'tech',
                width: 200,
                render: (text, rec) => {
                    return (
                        <Select
                            value={rec.tech || ''}
                            onChange={data => this.handleChange(rec.key, 'tech', data)}
                            style={{ width: 180 }}
                        >
                            {technologies.map((tech, i) => {
                                return (
                                    <Option key={i} value={tech}>
                                        {tech}
                                    </Option>
                                );
                            })}
                        </Select>
                    );
                }
            });
        }

        if (id === 'mywcom.circuits') {
            columns.splice(
                3,
                1, // No palette
                {
                    title: msg('in_equips'),
                    dataIndex: 'inEquips',
                    width: 200,
                    render: (text = [], rec) => {
                        return ArrayField({ text, rec, dataIndex: 'inEquips' });
                    }
                },
                {
                    title: msg('out_equips'),
                    dataIndex: 'outEquips',
                    width: 200,
                    render: (text = [], rec) => {
                        return ArrayField({
                            text,
                            rec,
                            dataIndex: 'outEquips'
                        });
                    }
                }
            );
        }

        if (id === 'mywcom.fiberColors') {
            columns = [
                {
                    title: '',
                    dataIndex: 'key',
                    width: 35,
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
                    title: msg('name'),
                    dataIndex: 'name',
                    inputType: 'string',
                    width: 160,
                    className: 'color_name'
                },
                {
                    title: msg('color'),
                    dataIndex: 'color',
                    render: (text, rec) => {
                        return (
                            <ColourAndTransparencyPicker
                                color={rec.color}
                                disableAlpha={true}
                                opacity={1}
                                onChange={data => this.handleChange(rec.key, 'color', data.color)}
                            />
                        );
                    },
                    width: 100
                },
                {
                    title: msg('abbr'),
                    dataIndex: 'abbr',
                    inputType: 'string',
                    width: 80
                },
                {
                    title: msg('label'),
                    dataIndex: 'label',
                    inputType: 'string',
                    className: 'input-small'
                }
            ];
        }

        if (id === 'mywcom.fiberColorSchemes') {
            columns = [
                {
                    title: '',
                    dataIndex: 'key',
                    width: 35,
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
                    title: msg('name'),
                    dataIndex: 'name',
                    inputType: 'string',
                    width: 160
                },
                {
                    title: msg('description'),
                    dataIndex: 'description',
                    inputType: 'string',
                    width: 360
                },
                {
                    title: msg('colors'),
                    dataIndex: 'colors',
                    render: (text, rec) => {
                        return ArrayField({ text, rec, dataIndex: 'colors' });
                    }
                }
            ];
        }

        if (id === 'mywcom.designs') {
            columns.splice(
                1,
                3,
                {
                    title: msg('name'),
                    dataIndex: 'type',
                    key: 'type',
                    width: 300,
                    //sorter: (a, b) => compareByAlph(a.name, b.name), TODO: get sorter sorted
                    render: (text, rec) => (
                        <FeatureTypeSelect
                            value={rec.name}
                            rec={rec}
                            onChange={data => this.handleChange(rec.key, 'name', data)}
                            filterItems={this.filterUsedDesignFeatures}
                        />
                    )
                },
                {
                    title: msg('user_group'),
                    dataIndex: 'userGroup',
                    inputType: 'string',
                    className: 'input-small'
                }
            );
        }

        return columns;
    }

    /**
     * Opens the housing editor for the record provided
     * @param {*} text
     * @param {*} rec
     */
    openHousingsEditor = (record, e) => {
        this.setState({
            housingsModalVisible: true,
            currentRec: record,
            modalKey: e.target.parentElement.id
        });
    };

    /**
     * Get columns for housing table
     * Has 2 columns, delete and housing
     */
    _getHousingColumns() {
        let columns = [
            {
                title: '',
                dataIndex: 'key',
                width: 35,
                className: 'text-center',
                render: (text, item, test) => {
                    return (
                        <div className="seq-cell">
                            <span>{item.seq}</span>
                            <span
                                className="delete-row-btn-nested hidden"
                                onClick={() => this.removeHousingItem(item)}
                            >
                                <DeleteOutlined />
                            </span>
                        </div>
                    );
                }
            },
            {
                title: '',
                dataIndex: 'housing',
                width: 200,
                render: (text, rec) => {
                    return (
                        <HousingFeatureSelect
                            id={this.props.id}
                            text={text}
                            rec={rec}
                            handleChange={data =>
                                this.handleChangeOfHousing(rec.key, 'housing', data)
                            }
                            store={this.props.store}
                            rootStore={this.props.rootStore}
                        />
                    );
                }
            }
        ];

        return columns;
    }

    _getModalTable(housingTableProps, recForModal, currentRec, modalKey) {
        const { msg } = this.props;
        if (this.props.id == 'mywcom.fiberColorSchemes') {
            return (
                <FiberColorSchemeEditor
                    style={{ width: 500 }}
                    data={this.formatColorsData(currentRec.colors || [])}
                    onChange={e => this.handleColorChange(currentRec.key, e)}
                    id={this.props.id}
                    store={this.props.store}
                    rootStore={this.props.rootStore}
                    args={{
                        keyTitle: msg('color'),
                        valueTitle: msg('stripes'),
                        isArray: true
                    }}
                />
            );
        }

        return (
            <div>
                <EditableTable {...housingTableProps} />
                <div className={'controls-container'} style={{ padding: '10px 0' }}>
                    <Button icon={<PlusOutlined />} onClick={this.addHousing} title={msg('add')}>
                        {msg('add')}
                    </Button>
                </div>
            </div>
        );
    }

    /**
     * Add key to each row of color data
     * @param {Array} colors
     */
    formatColorsData(colors) {
        colors.forEach((row, i) => {
            row.key = i;
        });
        return colors;
    }

    /**
     * Remove key from each row of color data
     * @param {Array} data
     */
    unformatColorData(data) {
        const colors = [];
        data.forEach(row => {
            const color = {
                color: row.color,
                stripes: row.stripes
            };
            colors.push(color);
        });
        return colors;
    }

    /**
     * Send color data to database
     * @param {integer} key
     * @param {Object} data
     */
    handleColorChange(key, data) {
        const toSet = this.props.data;
        const unformatedData = this.unformatColorData(data);
        const currentRec = { ...this.state.currentRec };
        currentRec.colors = unformatedData;
        this.setState({ currentRec });
        toSet[key] = currentRec;
        this.triggerChange(toSet);
    }

    /**
     * Filters features that can be used to be delta owners.
     * Returns features that are not currently delta owners and are non-versioned
     * @param {*} features
     * @returns {Array} features
     */
    filterUsedDesignFeatures = features => {
        const store = this.props.store;
        const usedFeatures = Object.keys(store.getConverted('mywcom.designs'));
        return (
            features &&
            features.filter(i => {
                return !i.versioned && !usedFeatures.includes(i.name);
            })
        );
    };

    closeModal = () => {
        this.setState({ housingsModalVisible: false });
    };

    /**
     * Adds item to table, sets it in store
     */
    addItem = () => {
        const values = this.props.addItem(this.props.data);
        this.triggerChange(values);
    };

    addHousing = () => {
        const data = this.props.data || [];
        const { currentRec } = this.state;
        const recForModal = data.find(item => item.name === currentRec.name) || {};
        recForModal[this.state.modalKey].push('');

        this.setState({ currentRec: recForModal });
        this.triggerChange(data);
    };

    /**
     * Removes item from values object
     * @param {Object} item
     */
    removeItem(item) {
        let values = [...this.props.data];
        values = values.filter((val, i) => i !== item.key);
        values = this.addKeysToData(values); //resequence keys
        this.triggerChange(values);
    }

    /**
     * Removes item from list of housings
     * @param {Object} item
     */
    removeHousingItem(item) {
        //Filter out housing
        const housings = [...this.state.currentRec[this.state.modalKey]];
        housings.splice(item.key, 1);

        //Add to rec
        const rec = this.props.data.find(rec => rec.name == this.state.currentRec.name);
        rec[this.state.modalKey] = housings;
        this.setState({ currentRec: rec });
        this.triggerChange(this.props.data);
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
     * Handles change to input field in table
     * @param {int} id
     * @param {string} key
     * @param {string} value
     */
    handleChange(id, key, value) {
        let values = [...this.props.data];
        values[id][key] = value;
        this.triggerChange(values);
    }

    /**
     * Handles change to dropdown field of housing table
     */
    handleChangeOfHousing(id, key, value) {
        let values = [...this.state.currentRec[this.state.modalKey]];
        values[id] = value;
        const rec = this.props.data.find(rec => rec.name == this.state.currentRec.name);

        rec[this.state.modalKey] = values;
        this.setState({ currentRec: rec });
        this.triggerChange(this.props.data);
    }

    /**
     * Sets data in store
     * @param {Array} data
     */
    triggerChange(data) {
        this.props.onChange(data);
    }
}
