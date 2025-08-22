import myw from 'myWorld-client';
import React, { useState, useEffect, useRef } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Alert, Space, Select } from 'antd';
import { useLocale } from 'myWorld-client/react';
import {
    Classes,
    ConduitMenu,
    EquipmentMenu,
    StructuresMenu,
    CableMenu,
    ConnectionMenu,
    CircuitMenu,
    StructuresDescriptions
} from './classes_dictionary';
import PinRange from 'modules/comms/js/api/pinRange';


export const LiveDocsModal = ({ open, plugin }) => {
    const { msg } = useLocale('LiveDocsPlugin');
    const [showIntro, setShowIntro] = useState(true);
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [isOpen, setIsOpen] = useState(open);
    const [pickedClass, setPickedClass] = useState('');
    const [pickedFunction, setPickedFunction] = useState('');
    const [paramValues, setParamValues] = useState({});
    const [activeParam, setActiveParam] = useState(null);
    const [rawInput, setRawInput] = useState({});

    const ApiFunctionMenus = {
        structuresApi: StructuresMenu,
        equipmentApi: EquipmentMenu,
        conduitApi: ConduitMenu,
        cableApi: CableMenu,
        connectionApi: ConnectionMenu,
        circuitApi: CircuitMenu
        // TODO: Add others
    };
    const apiInstances = {
        structuresApi: plugin.structuresApi,
        equipmentApi: plugin.equipmentApi,
        conduitApi: plugin.conduitApi,
        cableApi: plugin.cableApi,
        connectionApi: plugin.connectionApi,
        circuitApi: plugin.circuitApi
        // TODO: Add others
    };
    const ApiFunctionDictionaries = {
        structuresApi: StructuresDescriptions
        // TODO: Add others
    };

    const transactionMessage = "Transaction parameter is automatically created for you. It will be committed after the function execution.";

    const getSelectedFunctionParams = () => {
        if (!pickedClass || !pickedFunction) return [];

        const menu = ApiFunctionMenus[pickedClass];
        if (!menu) return [];

        for (const group of menu) {
            const found = group.options.find(opt => opt.value === pickedFunction);
            if (found && found.params) {
                return found.params;
            }
        }
        return [];
    };

    const allParamsFilled = React.useMemo(() => {
        if (!pickedFunction || !pickedClass) return false;
        const paramMeta = getSelectedFunctionParams();
        return paramMeta.every(
            ({ name }) => paramValues[name] !== undefined && paramValues[name] !== ''
        );
    }, [pickedFunction, pickedClass, paramValues]);

    useEffect(() => {
        function listener() {
            const feature = appRef.currentFeature;
            if (feature && activeParam) {
                const paramMeta = getSelectedFunctionParams().find(p => p.name === activeParam);
                const isArrayMywFeature =
                    paramMeta && paramMeta.type.toLowerCase() === 'array<myworldfeature>';

                setParamValues(prev => {
                    if (isArrayMywFeature) {
                        const current = Array.isArray(prev[activeParam]) ? prev[activeParam] : [];
                        const alreadyExists = current.some(f => f.id === feature.id);
                        return alreadyExists
                            ? prev
                            : { ...prev, [activeParam]: [...current, feature] };
                    } else {
                        return { ...prev, [activeParam]: feature };
                    }
                });
            }
        }

        appRef.on('currentFeature-changed', listener);
        appRef.on('currentFeatureSet-changed', listener);

        return () => {
            appRef.off('currentFeature-changed', listener);
            appRef.off('currentFeatureSet-changed', listener);
        };
    }, [activeParam]);

    useEffect(() => {
        if (pickedFunction) {
            const paramMeta = getSelectedFunctionParams();
            paramMeta.forEach(({ name, type }) => {
                if (type.toLowerCase() === 'transaction' && !paramValues[name]) {
                    try {
                        const trans = new myw.Transaction(db);
                        setParamValues(prev => ({ ...prev, [name]: trans }));
                    } catch (err) {
                        console.error('Failed to create transaction:', err);
                    }
                }
            });
        }
    }, [pickedFunction, paramValues, db]);

    const handleParamChange = (paramName, value) => {
        setParamValues(prev => ({ ...prev, [paramName]: value }));
    };

    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    const executeFunction = () => {
        console.log('Executing function:', pickedFunction, 'from class:', pickedClass);

        if (pickedFunction.startsWith('list')){
            const feature = pickedFunction.slice(4);
            console.log(myw.config[`mywcom.${feature.toLowerCase()}`]);
            return;
        }
        // const feature = pickedClass.slice(0,-3);
        // console.log ("picked class", feature);
        // const allowedFeatureTypes = myw.config[`mywcom.${feature.toLowerCase()}`];
        // console.log("allowed feature", allowedFeatureTypes);
        const paramMeta = getSelectedFunctionParams();

        // // 3. Validate all MyWorldFeature params
        // const invalidParam = paramMeta.find(({ name, type }) => {
        //     if (type.toLowerCase() === 'myworldfeature') {
        //         const feature = paramValues[name];
        //         return !feature || !allowedFeatureTypes.includes(feature.getType());
        //     }
        //     return false;
        // });

        // if (invalidParam) {
        //     alert(`Selected feature type for "${invalidParam.name}" is not allowed for function "${pickedFunction}"`);
        //     return;
        // }

        if (!pickedClass || !pickedFunction) return;

        const apiInstance = apiInstances[pickedClass];
        if (!apiInstance) {
            console.warn(`No API instance found for ${pickedClass}`);
            return;
        }

        

        const params = paramMeta.map(({ name }) => paramValues[name]);
        console.log('Executing function:', pickedFunction, 'with params:', params);

        const fn = apiInstance[pickedFunction];

        if (typeof fn !== 'function') {
            console.warn(`${pickedFunction} is not a function on ${pickedClass}`);
            return;
        }

        const result = fn.apply(apiInstance, params);

        if (result && typeof result.then === 'function') {
            result.then(res => {
                console.log('Function result:', res);
            });
        } else {
            console.log('Function result:', result);
        }
    };

    const parseNestedArray = input => {
        if (!input || typeof input !== 'string') return [];

        const safeInput = `[${input}]`;
        try {
            const parsed = JSON.parse(safeInput);
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (err) {
            console.error('Invalid nested array format:', err);
        }
        return [];
    };
    
    const currentDictionary = pickedClass ? ApiFunctionDictionaries[pickedClass] : null;
    const currentDescription =
    pickedFunction && currentDictionary && currentDictionary[pickedFunction]
        ? currentDictionary[pickedFunction].body
        : null;

    return (
        <DraggableModal
            wrapClassName="customer-connection-modal"
            open={isOpen}
            title={msg('LiveDocsTitle')}
            width={500}
            onCancel={handleCancel}
            footer={
                showIntro
                    ? [
                          <Button key="ok" onClick={hideIntro} type="primary">
                              OK
                          </Button>
                      ]
                    : [
                          <Button key="cancel" onClick={handleCancel}>
                              Cancel
                          </Button>,
                          <Button
                              key="execute"
                              onClick={executeFunction}
                              type="primary"
                              disabled={!allParamsFilled}
                          >
                              Execute
                          </Button>
                      ]
            }
        >
            {showIntro ? (
                <div style={{ whiteSpace: 'pre-wrap' }}>{msg('description')}</div>
            ) : (
                <div>
                    {' '}
                    <Space direction="vertical" size="middle">
                        <p> {msg('classSelection')} </p>
                        <Select
                            virtual={false}
                            onChange={value => {
                                setPickedClass(value);
                                setPickedFunction('');
                                setParamValues({});
                            }}
                            options={Classes}
                        />
                        {pickedClass && ApiFunctionMenus[pickedClass] && (
                            <Select
                                value={pickedFunction}
                                virtual={false}
                                onChange={value => {
                                    setPickedFunction(value);
                                    setParamValues({});
                                }}
                                options={ApiFunctionMenus[pickedClass].flatMap(
                                    group => group.options
                                )}
                            />
                        )}
                        {currentDescription && (
                            <p style={{ whiteSpace: "pre-wrap" }}>
                            {currentDescription}
                            </p>
                        )}
                        {pickedFunction &&
                            getSelectedFunctionParams().map(({ name, type }) => {
                                console.log('paramValues', paramValues);
                                if (type.toLowerCase() === 'myworldfeature') {
                                    return (
                                        <Input
                                            key={name}
                                            placeholder={`${name} (select on map)`}
                                            value={
                                                paramValues[name]?.properties.name ||
                                                paramValues[name]?.id ||
                                                ''
                                            }
                                            readOnly
                                            onFocus={() => setActiveParam(name)}
                                        />
                                    );
                                }
                                if (type.toLowerCase() === 'boolean') {
                                    return (
                                        <Select
                                            key={name}
                                            value={paramValues[name]}
                                            onChange={val => handleParamChange(name, val)}
                                            options={[
                                                { value: true, label: 'True' },
                                                { value: false, label: 'False' }
                                            ]}
                                            placeholder={`${name} (select on dropdown)`}
                                            style={{ width: '100%' }}
                                        />
                                    );
                                }
                                if (type.toLowerCase() === 'number') {
                                    return (
                                        <Input
                                            key={name}
                                            type="number"
                                            placeholder={`${name} (enter number)`}
                                            value={paramValues[name] || ''}
                                            onChange={e => handleParamChange(name, e.target.value)}
                                        />
                                    );
                                }
                                if (type.toLowerCase() === 'string') {
                                    return (
                                        <Input
                                            key={name}
                                            placeholder={`${name} (enter string)`}
                                            value={paramValues[name] || ''}
                                            onChange={e => handleParamChange(name, e.target.value)}
                                        />
                                    );
                                }
                                if (
                                    type.toLowerCase() === 'array<string>' ||
                                    type.toLowerCase() === 'array<number>'
                                ) {
                                    return (
                                        <Input
                                            key={name}
                                            placeholder={`${name} (enter items separated by commas)`}
                                            value={
                                                rawInput[name] ??
                                                (paramValues[name] || []).join(', ')
                                            }
                                            onChange={e => {
                                                const value = e.target.value;
                                                setRawInput(prev => ({ ...prev, [name]: value }));
                                                const arrayValue = value
                                                    .split(',')
                                                    .map(item => item.trim())
                                                    .filter(Boolean);
                                                handleParamChange(name, arrayValue);
                                            }}
                                        />
                                    );
                                }
                                if (type.toLowerCase() === 'array<myworldfeature>') {
                                    const features = Array.isArray(paramValues[name])
                                        ? paramValues[name]
                                        : [];
                                    return (
                                        <Input
                                            key={name}
                                            placeholder={`${name} (select multiple features on map)`}
                                            value={features.map(f => f.id).join(', ')}
                                            readOnly
                                            onFocus={() => setActiveParam(name)}
                                        />
                                    );
                                }
                                if (type.toLowerCase().includes('array<array')) {
                                    return (
                                        <Input
                                            key={name}
                                            placeholder={`${name} (paste json nested array '[[1,2],[3,4]]')`}
                                            value={
                                                Array.isArray(paramValues[name])
                                                    ? paramValues[name]
                                                          .map(a => JSON.stringify(a))
                                                          .join(', ')
                                                    : ''
                                            }
                                            onChange={e => {
                                                const raw = e.target.value;
                                                const nestedArray = parseNestedArray(raw);
                                                handleParamChange(name, nestedArray);
                                            }}
                                        />
                                    );
                                }
                                if (
                                    type.toLowerCase() === 'object' ||
                                    type.toLowerCase() === 'array<object>' ||
                                    type.toLowerCase() === 'array<geojson>'
                                ) {
                                    const raw =
                                        rawInput[name] ??
                                        JSON.stringify(paramValues[name] || {}, null, 2);

                                    return (
                                        <div key={name} className="mb-4">
                                            <label className="block text-sm font-medium mb-1">
                                                {name}
                                            </label>
                                            <Input.TextArea
                                                placeholder={`enter JSON for ${name}`}
                                                value={raw}
                                                onChange={e => {
                                                    const value = e.target.value;
                                                    setRawInput(prev => ({
                                                        ...prev,
                                                        [name]: value
                                                    }));

                                                    try {
                                                        const parsed = JSON.parse(value);
                                                        handleParamChange(name, parsed);
                                                    } catch (err) {
                                                        console.error(
                                                            'Failed to read object:',
                                                            err
                                                        );
                                                    }
                                                }}
                                                autoSize={{ minRows: 6, maxRows: 12 }}
                                            />
                                        </div>
                                    );
                                }
                                if (type.toLowerCase() === 'transaction') {
                                    return (
                                        <div key={name} className="mb-4">
                                            <p>{transactionMessage}</p>
                                        
                                        </div>
                                    );
                                }
                                if (type.toLowerCase() === 'pinrange') {
                                    const pinRange = paramValues[name] || new PinRange('in', 1, 1);

                                    const update = (field, newValue) => {
                                        const updated = {
                                            side: pinRange.side,
                                            low: pinRange.low,
                                            high: pinRange.high,
                                            [field]: newValue
                                        };
                                        handleParamChange(
                                            name,
                                            new PinRange(updated.side, updated.low, updated.high)
                                        );
                                    };

                                    return (
                                        <div key={name} className="flex gap-2 items-center">
                                            <select
                                                value={pinRange.side}
                                                onChange={e => update('side', e.target.value)}
                                            >
                                                <option value="in">in</option>
                                                <option value="out">out</option>
                                            </select>

                                            <input
                                                type="number"
                                                value={pinRange.low}
                                                onChange={e =>
                                                    update('low', Number(e.target.value))
                                                }
                                            />

                                            <input
                                                type="number"
                                                value={pinRange.high}
                                                onChange={e =>
                                                    update('high', Number(e.target.value))
                                                }
                                            />
                                        </div>
                                    );
                                }

                                return (
                                    <Input
                                        key={name}
                                        placeholder={name}
                                        value={paramValues[name] || ''}
                                        onChange={e => handleParamChange(name, e.target.value)}
                                    />
                                );
                            })}
                    </Space>
                </div>
            )}
        </DraggableModal>
    );
};
