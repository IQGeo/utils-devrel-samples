import React from 'react';

import { LayoutStrandInput as Input } from '../../LayoutStrandInput';
import { LayoutStrandDropdown as Dropdown } from '../../LayoutStrandDropdown';
import { LayoutStrandCheckbox as Checkbox } from '../../LayoutStrandCheckbox';

// Build the rows associated to the overhead section of the config.
export const createOverheadItems = async (
    overheadConfig,
    datasource,
    editableFeatures,
    isPlacing,
    overheadFeature,
    overheadRoute,
    fieldData,
    assignData,
    setState,
    msg
) => {
    const { features, config } = await generateStructureConfig(datasource, overheadConfig);
    const routes = generateRoutes(overheadConfig, editableFeatures);

    let feature;
    let route;
    if (!overheadFeature) {
        feature = features[0].featureName;
        setState({ overheadFeature: feature });
    }
    if (!overheadRoute) {
        route = routes[0].featureName;
        setState({ overheadRoute: route });
    }
    let rows = [];
    // Create a hard-coded dropdown for the oh features.
    rows.push(
        generateDropdown(
            features,
            'overhead_features',
            'overheadFeatures',
            isPlacing,
            feature || overheadFeature,
            value => setFeatureType(value, 'overheadFeature', setState),
            msg
        )
    );
    // Create a hard-coded dropdown for the oh routes.
    rows.push(
        generateDropdown(
            routes,
            'overhead_routes',
            'overheadRoutes',
            fieldData.routeSpecUseLinearAssembly?.value || isPlacing,
            route || overheadRoute,
            value => setFeatureType(value, 'overheadRoute', setState),
            msg
        )
    );
    const fields = createFields(
        config,
        feature || overheadFeature,
        fieldData,
        isPlacing,
        assignData
    );
    fields?.forEach(field => rows.push(field));
    return rows;
};

// Build the rows associated to the underground section of the config.
export const createUndergroundItems = async (
    undergroundConfig,
    datasource,
    editableFeatures,
    isPlacing,
    undergroundFeature,
    undergroundRoute,
    fieldData,
    assignData,
    setState,
    msg
) => {
    const { features, config } = await generateStructureConfig(datasource, undergroundConfig);
    const routes = generateRoutes(undergroundConfig, editableFeatures);

    let feature;
    let route;
    if (!undergroundFeature) {
        feature = features[0].featureName;
        setState({ undergroundFeature: feature });
    }
    if (!undergroundRoute) {
        route = routes[0].featureName;
        setState({ undergroundRoute: route });
    }

    let rows = [];
    // Create a hard-coded dropdown for the ug features.
    rows.push(
        generateDropdown(
            features,
            'underground_features',
            'undergroundFeatures',
            isPlacing,
            feature || undergroundFeature,
            value => setFeatureType(value, 'undergroundFeature', setState),
            msg
        )
    );
    // Create a hard-coded dropdown for the ug routes.
    rows.push(
        generateDropdown(
            routes,
            'underground_routes',
            'undergroundRoutes',
            fieldData.routeSpecUseLinearAssembly?.value || isPlacing,
            route || undergroundRoute,
            value => setFeatureType(value, 'undergroundRoute', setState),
            msg
        )
    );
    const fields = createFields(
        config,
        feature || undergroundFeature,
        fieldData,
        isPlacing,
        assignData
    );
    fields?.forEach(field => rows.push(field));
    return rows;
};

// Build the rows associated to the common section of the config.
export const createCommonItems = (commonConfig, isPlacing, fieldData, assignData) => {
    let rows = [];
    for (const idx in commonConfig) {
        const attributes = commonConfig[idx];
        if (attributes.type === 'input') {
            rows.push(
                <Input
                    label={attributes.label}
                    name={attributes.name}
                    id={attributes.id}
                    unit={attributes.input}
                    required={attributes.required}
                    fieldDD={attributes.fieldDD}
                    disabled={isPlacing}
                    value={fieldData[attributes.id]?.value}
                    callback={value => assignData(value, attributes.id, attributes.name)}
                />
            );
        }
        if (attributes.type === 'dropdown') {
            let options = [];
            for (const idx in attributes.options) {
                options.push({
                    externalName: attributes.options[idx],
                    featureName: attributes.options[idx].toLowerCase()
                });
            }

            rows.push(
                <Dropdown
                    key={`${attributes.name}-${attributes.id}`}
                    options={attributes.options}
                    label={attributes.label}
                    name={attributes.name}
                    id={attributes.id}
                    required={attributes.required}
                    disabled={isPlacing}
                    value={fieldData[attributes.id]?.value}
                    callback={value => assignData(value, attributes.id, attributes.name)}
                />
            );
        }
        if (attributes.type === 'checkbox') {
            rows.push(
                <Checkbox
                    key={`${attributes.name}-${attributes.id}`}
                    label={attributes.label}
                    name={attributes.name}
                    id={attributes.id}
                    disabled={isPlacing}
                    callback={value => assignData(value, attributes.id, attributes.name)}
                />
            );
        }
    }
    return rows;
};

// Build the rows for use of linear assembly.
// Hard coded, not associated with the config.
export const createRouteSpecItems = (objectRef, isPlacing, msg, assignData, setState) => {
    let rows = [];
    rows.push(
        <Checkbox
            label={msg('use_linear_assembly')}
            name="useLinearAssembly"
            id="routeSpecUseLinearAssembly"
            require={false}
            disabled={isPlacing}
            callback={value => {
                assignData(value, 'routeSpecUseLinearAssembly', 'useLinearAssembly');
            }}
        />
    );
    rows.push(
        <Checkbox
            label={msg('add_struct')}
            name="addStructure"
            id="routeSpecAddStructure"
            require={false}
            callback={value => {
                setState({ addStructure: !objectRef.state.addStructure });
            }}
        />
    );
    return rows;
};

const generateDropdown = (options, key, name, disabled, value, setValue, msg) => {
    return (
        <Dropdown
            key={`${msg(key)}-${Math.floor(Math.random() * 5)}`}
            options={options}
            label={`${msg(key)}:`}
            name={name}
            id={name}
            required={true}
            disabled={disabled}
            value={value}
            callback={value => {
                setValue(value);
            }}
        />
    );
};

const generateStructureConfig = async (datasource, config) => {
    const structures = await datasource.getDDInfoFor(Object.keys(config.structures));

    let features = [];
    let structureConfig = { structures: {} };
    for (const structureName in structures) {
        const structure = structures[structureName];
        features.push({
            externalName: structure.external_name,
            featureName: structureName
        });
        assignStructureData(config, structure, structureName, structureConfig);
    }
    return { features: features, config: structureConfig };
};

const assignStructureData = (config, structure, structureName, structureConfig) => {
    for (const fieldName in structure.fields) {
        const field = structure.fields[fieldName];
        config.structures[structureName].fields.forEach(configField => {
            if (fieldName != configField) {
                return;
            }
            if (!structureConfig.structures[structureName]) {
                structureConfig.structures[structureName] = {};
            }
            assignDataToConfig(field, structureConfig, structureName, fieldName);
        });
    }
};

const assignDataToConfig = (field, structureConfig, structureName, fieldName) => {
    const type = field.enumValues ? 'dropdown' : 'input';
    structureConfig.structures[structureName][fieldName] = {
        type: type,
        name: fieldName,
        id: `${structureName}_${fieldName}`,
        unit: field.display_unit,
        label: field.external_name,
        fieldDD: {
            unit: field.unit,
            display_unit: field.display_unit,
            unit_scale: field.unit_scale
        },
        required: true
    };
    if (type === 'dropdown') {
        let options = [];
        for (const idx in field.enumValues) {
            const option = field.enumValues[idx];
            options.push({
                externalName: option.display_value,
                featureName: option.value
            });
        }
        Object.assign(structureConfig.structures[structureName][fieldName], {
            options: options
        });
    }
};

const generateRoutes = (config, editableFeatures) => {
    let routes = [];
    for (const idx in config.routes) {
        const key = config.routes[idx];
        for (const featureName in editableFeatures) {
            if (featureName.includes(key)) {
                routes.push({
                    externalName: editableFeatures[featureName].external_name,
                    featureName: key
                });
            }
        }
    }
    return routes;
};

const createFields = (config, currentFeature, fieldData, isPlacing, assignData) => {
    let rows = [];
    for (const structureName in config.structures) {
        if (structureName !== currentFeature) continue;
        for (const fieldName in config.structures[structureName]) {
            const attributes = config.structures[structureName][fieldName];
            if (attributes.type === 'input') {
                rows.push(
                    <Input
                        label={attributes.label}
                        name={attributes.name}
                        id={attributes.id}
                        required={attributes.required}
                        fieldDD={attributes.fieldDD}
                        unit={attributes.unit}
                        disabled={isPlacing}
                        value={fieldData[attributes.id]?.value}
                        callback={value => assignData(value, attributes.id, attributes.name)}
                    />
                );
            }
            if (attributes.type === 'dropdown') {
                rows.push(
                    <Dropdown
                        key={`${attributes.name}-${attributes.id}`}
                        options={attributes.options}
                        label={attributes.label}
                        name={attributes.name}
                        id={attributes.id}
                        required={attributes.required}
                        disabled={isPlacing}
                        value={fieldData[attributes.id]?.value}
                        callback={value => assignData(value, attributes.id, attributes.name)}
                    />
                );
            }
            if (attributes.type === 'checkbox') {
                rows.push(
                    <Checkbox
                        key={`${attributes.name}-${attributes.id}`}
                        label={attributes.label}
                        name={attributes.name}
                        id={attributes.id}
                        disabled={isPlacing}
                        callback={value => assignData(value, attributes.id, attributes.name)}
                    />
                );
            }
        }
    }
    if (rows.length === 0) {
        return;
    }
    return rows;
};

const setFeatureType = (value, featureType, setState) => {
    setState({
        [featureType]: value,
        currentFeature: value
    });
};
