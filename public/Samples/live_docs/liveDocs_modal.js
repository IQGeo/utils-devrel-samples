import myw from 'myWorld-client';
import React, { useState, useEffect, useRef } from 'react';
import { DraggableModal, Button, Input } from 'myWorld-client/react';
import { Alert, Space, Select } from 'antd';
import { useLocale } from 'myWorld-client/react';
import { Classes, ConduitMenu, EquipmentMenu, StructureMenu, CableMenu } from './classes_dictionary';

export const LiveDocsModal = ({ open, plugin}) => {
    const { msg } = useLocale('LiveDocsPlugin');
    const [showIntro, setShowIntro] = useState(true);
    const [appRef] = useState(myw.app);
    const [isOpen, setIsOpen] = useState(open);
    const [pickedClass, setPickedClass] = useState('');
    const [pickedFunction, setPickedFunction] = useState('');
    const [paramValues, setParamValues] = useState({});
    // const [selectedFeature, setSelectedFeature] = useState(null);
    const [activeParam, setActiveParam] = useState(null);

    // const [selectedFeatureId, setSelectedFeatureId] = useState(null);
    // const [disabled, setDisabled] = useState(true);
    


    const ApiFunctionMenus = {
        structureApi: StructureMenu,
        equipmentApi: EquipmentMenu,
        conduitApi: ConduitMenu,
        cableApi: CableMenu
        // TODO: Add others
    };
    const apiInstances = {
        structureApi: plugin.structureApi,
        equipmentApi: plugin.equipmentApi,
        conduitApi: plugin.conduitApi,
        cableApi: plugin.cableApi,
        // TODO: Add others
    };


    const getSelectedFunctionParams = () => {
        if (!pickedClass || !pickedFunction) return [];

        const menu = ApiFunctionMenus[pickedClass];
        if (!menu) return [];

        for (const group of menu) {
            const found = group.options.find(opt => opt.value === pickedFunction);
            if (found && found.params) {
                // return Object.keys(found.params);
                // return Object.entries(found.params).map(([type, name]) => ({
                //     name,
                //     type
                // }));
                return found.params;
            }

        }
        return [];

    };

    // useEffect(() => {
    //     setOnFunctions();
    //     updateFeatures();
    // }, []);


     useEffect(() => {

        function listener() {
            const feature = appRef.currentFeature;
            console.log('Listener triggered, feature:', feature);
            if (feature && activeParam) {
                console.log('Updating paramValues for activeParam:', activeParam, 'with feature:', feature);
                setParamValues(prev => ({ ...prev, [activeParam]: feature }));
            }
        }

        appRef.on('currentFeature-changed', listener);
        appRef.on('currentFeatureSet-changed', listener);

        return () => {
            appRef.off('currentFeature-changed', listener);
            appRef.off('currentFeatureSet-changed', listener);
        };

    }, [activeParam]);


    const handleParamChange = (paramName, value) => {
        setParamValues(prev => ({ ...prev, [paramName]: value }));
    };

    const hideIntro = () => {
        setShowIntro(false);
    };

    const handleCancel = () => {
        setIsOpen(false);
    };

    // function setOnFunctions() {
    //     appRef.on('currentFeature-changed currentFeatureSet-changed', updateFeatures);
    // }

    const executeFunction = () => {
        console.log('Executing function:', pickedFunction, 'from class:', pickedClass);
        if (!pickedClass || !pickedFunction) return;


        const apiInstance = apiInstances[pickedClass];
        if (!apiInstance) {
            console.warn(`No API instance found for ${pickedClass}`);
            return;
        }

        const paramMeta = getSelectedFunctionParams();
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
                              disabled={!pickedFunction}
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
                                virtual={false}
                                onChange={value => {
                                    setPickedFunction(value);
                                    setParamValues({});
                                }}
                                options={ApiFunctionMenus[pickedClass].flatMap(group => group.options)}
                            />
                        )}
                        
                        {pickedFunction && getSelectedFunctionParams().map(({ name, type }) => {
                            console.log('paramValues', paramValues);
                        if (type.toLowerCase() === 'myworldfeature') {
                            return (
                                <Input
                                    key={name}
                                    placeholder={`${name} (select on map)`}
                                    value={paramValues[name]?.id || ''}
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
                        // TODO - add array types
                        // TODO - add object type
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
