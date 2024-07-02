import React, { useState, useEffect, useRef } from 'react';

const Selector = ({ props }) => {
    const { title, config, structConfig, type, feature, app } = props;
    const [structure, setStructure] = useState(title.innerHTML);
    const [optionList, setOptionList] = useState();
    const [housings, setHousings] = useState();
    const finalFeatureTypeList = [];
    const finalHousingList = [];
    const housingArray = [];
    const joinedArray = [];
    const finalList = [];
    let optionRef = useRef();
    let allHousingValues;

    useEffect(() => {
        getHousings();
    }, []);

    useEffect(() => {
        if (!housings) {
            return;
        }
        configOptionsList();
    }, [housings]);

    const getHousings = async () => {
        if (!feature.featureDD.fields.equipment) {
            setHousings([Object.keys(structConfig)]);
            return;
        }
        const equips = await feature.followRelationship('equipment');
        if (equips.length < 1) {
            setHousings([Object.keys(structConfig)]);
            return;
        }
        const foundHousings = equips.map(x => config[x.getType()].housings);
        setHousings(foundHousings);
    };

    const configOptionsList = async () => {
        joinIntersection();
        await getIntersection();
        sortAllHousingValues();
        createHousingArrayOfObjects();
        countInstancesOfValues();
        compareToStructConfig();
        await getExternalNames();
        setOptionList(finalList);
    };

    const joinIntersection = () => {
        let joined = [];
        housings.forEach(x => joined.push(...x));
        joinedArray.push(...joined);
    };

    const getIntersection = async () => {
        allHousingValues = await joinedArray.reduce((allHousingsObject, housingType) => {
            if (housingType in allHousingsObject) {
                allHousingsObject[housingType]++;
            } else {
                allHousingsObject[housingType] = 1;
            }
            return allHousingsObject;
        }, {});
    };

    const sortAllHousingValues = () => {
        allHousingValues = Object.fromEntries(
            Object.entries(allHousingValues).sort(([, a], [, b]) => b - a)
        );
    };

    const createHousingArrayOfObjects = () => {
        for (const key of Object.keys(allHousingValues)) {
            if (key !== type) {
                housingArray.push({ [key]: allHousingValues[key] });
            }
        }
    };

    const countInstancesOfValues = () => {
        if (housingArray.length === 1) {
            finalHousingList.push(Object.keys(housingArray[0])[0]);
            return;
        }
        housingArray.reduce((prevValue, currValue, index) => {
            if (index === 1) {
                finalHousingList.push(Object.keys(prevValue)[0]);
            }
            if (Object.values(prevValue)[0] > Object.values(currValue)[0]) {
                return prevValue;
            }
            finalHousingList.push(Object.keys(currValue)[0]);
            return currValue;
        });
    };

    const compareToStructConfig = () => {
        finalHousingList.forEach(item => {
            if (Object.keys(structConfig).includes(item) && item !== 'mywcom_route_junction') {
                finalFeatureTypeList.push(item);
            }
        });

        finalFeatureTypeList.push(feature.getType());
    };

    const getExternalNames = async () => {
        const datasource = app.getDatasource('myworld');
        const featureDDs = await datasource.getDDInfoFor(finalFeatureTypeList);

        finalFeatureTypeList.forEach(featureType => {
            const finalListObj = { featureType };
            finalListObj.externalName = featureDDs[featureType].external_name;
            finalList.push(finalListObj);
        });
    };

    const replaceFeature = async featureType => {
        const detFeature = await app.database.createDetachedFeature(featureType);
        detFeature.isReplacing = true;
        detFeature.prevFeature = feature;
        app.setCurrentFeature(detFeature);
    };

    const handleChange = () => {
        setStructure(optionRef.current.value);
        replaceFeature(optionRef.current.value);
    };

    const optionListCompiler = () => {
        return optionList.map(item => {
            return (
                <option
                    className="selected-structure-option"
                    key={item.externalName}
                    value={item.featureType}
                >
                    {item.externalName}
                </option>
            );
        });
    };

    return (
        <>
            <label htmlFor="structureList" hidden>
                Structure List
            </label>
            <select
                className="selected"
                name="structureList"
                onChange={e => handleChange()}
                value={structure}
                ref={optionRef}
            >
                <option className="selected-structure-option" value={title.innerHTML}>
                    {title.innerHTML}
                </option>
                {optionList ? optionListCompiler() : null}
            </select>
        </>
    );
};

export default Selector;
