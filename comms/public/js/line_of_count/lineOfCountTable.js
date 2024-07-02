// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import { InputNumber, Input, Popover, Select, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import React, { useEffect, useState } from 'react';
import { indexOf } from 'underscore';
import ReorderableTable from './reorderableTable';

const LineOfCountTable = ({
    locManager,
    onChange,
    onRowChange,
    owningFeature,
    side,
    segConfig
}) => {
    const { msg } = myw.react.useLocale('LineOfCountDialog');

    const [rows, setRows] = useState([]);
    const [statusPicklist, setStatusPickList] = useState(null);

    const columns = [
        {
            dataIndex: 'physical_range_header_low',
            title: (
                <Popover placement="right" content={msg('start_strand_for_assignment')}>
                    {msg('start_strand')}
                </Popover>
            )
        },
        {
            dataIndex: 'physical_range_header_high',
            title: (
                <Popover placement="right" content={msg('end_strand_for_assignment')}>
                    {msg('end_strand')}
                </Popover>
            )
        },
        {
            dataIndex: 'name_header',
            title: (
                <Popover placement="right" content={msg('name_of_assignment')}>
                    <div className="loc__assignment-header">{msg('name')}</div>
                </Popover>
            )
        },
        {
            dataIndex: 'logical_range_header_low',
            title: (
                <Popover placement="right" content={msg('start_range_of_assignment')}>
                    {<div className="loc__assignment-header">{msg('low')}</div>}
                </Popover>
            )
        },
        {
            dataIndex: 'logical_range_header_high',
            title: (
                <Popover placement="right" content={msg('end_range_of_assignment')}>
                    <div className="loc__assignment-header">{msg('high')}</div>
                </Popover>
            )
        },
        {
            dataIndex: 'status_header',
            title: (
                <Popover placement="right" content={msg('status_of_assignment')}>
                    <div className="loc__assignment-header">{msg('status')}</div>
                </Popover>
            )
        },
        {
            dataIndex: 'physical_header',
            title: (
                <Popover placement="right" content={msg('physical_header_description')}>
                    <div className="loc__assignment-header">{msg('physical_header')}</div>
                </Popover>
            )
        },
        {
            dataIndex: 'remove_button'
        }
    ];

    useEffect(() => {
        const func = async () => {
            const options = await locManager.statusPicklist();
            options.unshift('');
            setStatusPickList(options);
        };
        func();
    }, []);

    useEffect(() => {
        let pLow = 1;

        const newRows = segConfig?.map((config, index) => {
            const { name, low, high, status } = config;

            const pHigh = pLow + (high - low);

            // Remove Level Button
            const removeButton = (
                <div className="loc-line-delete-btn">
                    <DeleteOutlined
                        onClick={() => {
                            removeCountLevel(config);
                        }}
                    />
                </div>
            );

            const lowPhysical = <div className={'loc-physical-range'}>{pLow}</div>;
            const highPhysical = <div className={'loc-physical-range'}>{pHigh}</div>;

            // Create form element for low range
            const lowInput = (
                <InputNumber
                    className="loc-range-input"
                    min={0}
                    step={1}
                    defaultValue={low}
                    controls={false}
                    value={segConfig[index]['low']}
                    onChange={val => handleChange(index, 'low', parseInt(val, 10))}
                />
            );

            // Create form element for high range
            const highInput = (
                <InputNumber
                    // className="loc-range-input"
                    min={0}
                    step={1}
                    defaultValue={high}
                    controls={false}
                    value={segConfig[index]['high']}
                    onChange={val => handleChange(index, 'high', parseInt(val, 10))}
                />
            );

            // Create form element for count name
            const countInput = (
                <Input
                    value={segConfig[index]['name']}
                    placeholder={msg('count_name')}
                    onChange={e => handleChange(index, 'name', e.target.value)}
                />
            );

            //Create form element for status
            const statusInput = (
                <Select
                    onChange={el => handleChange(index, 'status', el)}
                    value={segConfig[index]['status']}
                    style={{ width: 100 }}
                    options={statusPicklist.map(item => {
                        return {
                            value: item,
                            label: item
                        };
                    })}
                />
            );

            const physicalToggle = (
                <input
                    type="checkbox"
                    checked={segConfig[index]['physical']}
                    className="loc__physical-header"
                    onChange={e => handleChange(index, 'physical', e.target.checked)}
                />
            );

            pLow = pHigh + 1;

            return {
                key: index,
                remove_button: removeButton,
                physical_range_header_low: lowPhysical,
                physical_range_header_high: highPhysical,
                logical_range_header_low: lowInput,
                logical_range_header_high: highInput,
                name_header: countInput,
                status_header: statusInput,
                physical_header: physicalToggle
            };
        });
        // Create a new row for each level in the cable structure
        setRows(newRows);
    }, [segConfig]);

    /**
     *
     * @param {integer} index   Level of bundling
     * @param {string}  type    size or type
     */
    const handleChange = (index, type, val) => {
        const _segConfig = [...segConfig];
        _segConfig[index][type] = val;
        onChange(_segConfig);
    };

    /**
     * Add a new row to line of count table
     *
     */
    const addCountLevel = async () => {
        if (!segConfig) return;
        let high = null;
        if (!segConfig.length) {
            high = await locManager.pinCountFor(owningFeature, side);
        }

        var _segConfig = [...segConfig];
        _segConfig.push({
            name: '',
            low: 1,
            high: high,
            status: '',
            ref: '',
            physical: false,
            origin: owningFeature.getUrn()
        });
        onRowChange(_segConfig);
    };

    /**
     * Remove line of count row
     *
     * @param {Number} level
     */
    const removeCountLevel = level => {
        const _segConfig = [...segConfig].filter(item => item !== level);
        onRowChange(_segConfig);
    };

    const moveCountUpDown = (activeIndex, overIndex) => {
        const _segConfig = [...segConfig];
        const delta = overIndex < activeIndex ? -1 : 1;
        const rowIndex = indexOf(_segConfig, _segConfig[activeIndex]);
        if ((delta == -1 && rowIndex == 0) || (delta == +1 && rowIndex == _segConfig.length))
            return;
        const otherIndex = rowIndex + delta;
        [_segConfig[rowIndex], _segConfig[otherIndex]] = [
            _segConfig[otherIndex],
            _segConfig[rowIndex]
        ];
        onRowChange(_segConfig);
    };

    return (
        <div>
            <ReorderableTable
                columns={columns}
                rows={rows}
                onReorder={(activeIndex, overIndex) => moveCountUpDown(activeIndex, overIndex)}
            />
            <Button
                className={'ui-button loc__add'}
                onClick={() => {
                    addCountLevel();
                }}
            >
                {msg('add_btn')}
            </Button>
        </div>
    );
};

export default LineOfCountTable;
