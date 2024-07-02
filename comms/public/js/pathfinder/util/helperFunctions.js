import { useState } from 'react';

export const useStructureOrRoute = (appRef, structManager, type, featuresToIgnore, setMethods) => {
    const currentFeature = appRef.currentFeature;
    const presentFeature = featuresToIgnore.filter(feature => {
        return currentFeature.getUrn() === feature.urn;
    });
    if (featuresToIgnore.length > 0 && presentFeature[0]) {
        setErrors(type, true, setMethods, 'structure_already_added');
        return;
    }

    if (!currentFeature) {
        setErrors(type, true, setMethods, 'select_structure');
        return null;
    }

    const isStructureOrRoute =
        structManager.isStructure(currentFeature) || structManager.isRoute(currentFeature);

    if (!isStructureOrRoute) {
        setErrors(type, true, setMethods, 'not_struct_or_route');
        return null;
    }

    setErrors(type, false, setMethods);

    const newStructure = {
        name: currentFeature.getTitle(),
        identifier: `${currentFeature.getType()}_${Math.random()}`,
        urn: currentFeature.getUrn()
    };

    return newStructure;
};

const setErrors = (type, value, setMethods, errorMsg) => {
    if (type.toLowerCase() === 'avoid') {
        setMethods.setIncludeError(false);
        setMethods.setAvoidError({ isError: value, message: errorMsg });
    } else {
        setMethods.setAvoidError(false);
        setMethods.setIncludeError({ isError: value, message: errorMsg });
    }
};

export const useList = (initialValue = []) => {
    const [list, setList] = useState(initialValue);

    const addItem = item => {
        setList(prevState => [...prevState, item]);
    };

    const removeItem = itemId => {
        setList(prevState => prevState.filter(item => item.identifier !== itemId));
    };

    return [list, addItem, removeItem];
};

export const urnListFrom = list => {
    const urns = list.map(item => {
        return item.urn;
    });
    return urns.join(';');
};

/**
 * Creates a UnitScale based on fieldDD settings
 * @param {fieldDD} fieldDD
 * @returns {UnitScale}
 */
const initializeUnitScale = (fieldDD, myw) => {
    const unitScales = myw.app.system.settings['core.units'];
    let scale_config;

    if (fieldDD.unit_scale) {
        scale_config = unitScales[fieldDD.unit_scale];
    }
    return scale_config ? new myw.UnitScale(scale_config) : undefined;
};

export const convertValueString = (valueString, fieldDD, myw, displayUnit = undefined) => {
    const unitScale = initializeUnitScale(fieldDD, myw);
    let n = unitScale.fromString(valueString, displayUnit || fieldDD.display_unit);
    if (n.unit == fieldDD.unit) {
        n = n.value;
    } else {
        n = unitScale.convert(n.value, n.unit, fieldDD.unit);
    }
    return n;
};
