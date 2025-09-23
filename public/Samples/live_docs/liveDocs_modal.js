import myw from 'myWorld-client';
import React, { useState, useEffect, useRef } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Alert, Space, Select } from 'antd';
import { useLocale } from 'myWorld-client/react';
import {
    Classes,
    ConduitMenu,
    EquipmentMenu,
    StructureMenu,
    CableMenu,
    ConnectionMenu,
    CircuitMenu,
    StructureDescriptions,
    EquipmentDescriptions,
    ConduitDescriptions,
    CableDescriptions,
    ConnectionDescriptions,
    CircuitDescriptions
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
        structureApi: StructureMenu,
        equipmentApi: EquipmentMenu,
        conduitApi: ConduitMenu,
        cableApi: CableMenu,
        connectionApi: ConnectionMenu,
        circuitApi: CircuitMenu
    };
    const apiInstances = {
        structureApi: plugin.structureApi,
        equipmentApi: plugin.equipmentApi,
        conduitApi: plugin.conduitApi,
        cableApi: plugin.cableApi,
        connectionApi: plugin.connectionApi,
        circuitApi: plugin.circuitApi
    };
    const ApiFunctionDictionaries = {
        structureApi: StructureDescriptions,
        equipmentApi: EquipmentDescriptions,
        conduitApi: ConduitDescriptions,
        cableApi: CableDescriptions,
        connectionApi: ConnectionDescriptions,
        circuitApi: CircuitDescriptions
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
            ({ name, optional }) =>
                optional || (paramValues[name] !== undefined && paramValues[name] !== '')
        );
    }, [pickedFunction, pickedClass, paramValues]);


    useEffect(() => {
        function listener() {
            const feature = appRef.currentFeature;
            if (feature && activeParam) {
                const paramMeta = getSelectedFunctionParams().find(p => p.name === activeParam);
                const type = paramMeta.type.toLowerCase();

                if (type === 'myworldfeature') {
                    setParamValues(prev => ({ ...prev, [activeParam]: feature }));
                } 
                else if (type === 'array<myworldfeature>') {
                    setParamValues(prev => {
                        const current = Array.isArray(prev[activeParam]) ? prev[activeParam] : [];
                        const alreadyExists = current.some(f => f.id === feature.id);
                        return alreadyExists
                            ? prev
                            : { ...prev, [activeParam]: [...current, feature] };
                    });
                } 
                else if (type === 'array<number>') {
                    const coords = feature.getGeometry().coordinates;
                    setParamValues(prev => ({ ...prev, [activeParam]: [coords[0], coords[1]] }));
                } 
                else if (type === 'array<array<number>>') {
                    const coords = feature.getGeometry().coordinates;
                    setParamValues(prev => {
                        const current = Array.isArray(prev[activeParam]) ? prev[activeParam] : [];
                        return { ...prev, [activeParam]: [...current, coords] };
                    });
                }
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
        const paramMeta = getSelectedFunctionParams();

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
                                if (type.toLowerCase() === 'array<string>' ) {
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
                                if (type.toLowerCase() === 'array<number>')
                                {
                                    const coords = paramValues[name] || [];
                                    return (
                                        <Input
                                            key={name}
                                            placeholder={`${name} (click feature to get [x, y])`}
                                            value={coords.join(', ')}
                                            readOnly
                                            onFocus={() => setActiveParam(name)}
                                        />
                                    );
                                }
                                if (type.toLowerCase() === 'array<array<number>>'){
                                    const coordsArray = Array.isArray(paramValues[name]) ? paramValues[name] : [];
                                    return (
                                        <Input
                                            key={name}
                                            placeholder={`${name} (click multiple features to collect [[x,y], [x,y], ...])`}
                                            value={coordsArray.map(c => `[${c[0]}, ${c[1]}]`).join('; ')}
                                            readOnly
                                            onFocus={() => setActiveParam(name)}
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
