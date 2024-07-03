import myw from 'myWorld-client';
import React, { useState, useEffect, Children } from 'react';
import { DraggableModal, Button, Radio, Input, List } from 'myWorld-client/react';
import { Cascader } from 'antd';
import { ItalicOutlined } from '@ant-design/icons';

export const CustomRuleModal = ({ open }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(appRef.database);
    const [isOpen, setIsOpen] = useState(open);
    const [featuresList, setFeaturesList] = useState([]);
    const [features, setFeatures] = useState();
    const [ruleType, setRuleType] = useState();
    const [rule, setRule] = useState('');
    const [value, setValue] = useState('');
    const [pickedFeature, setPickedFeature] = useState('');
    const [pickedField, setPickedField] = useState('');
    const [result, setResult] = useState([]);

    useEffect(() => {
        const dbFeatures = db.getFeatureTypes();
        setFeatures(dbFeatures);
        let dbFeaturesList = [];
        for (const feat in dbFeatures) {
            dbFeaturesList = [];
            for (const field in dbFeatures[feat].fields) {
                if (dbFeatures[feat].fields[field].visible.value) {
                    dbFeaturesList.push({
                        label: dbFeatures[feat].fields[field].external_name,
                        value: dbFeatures[feat].fields[field].internal_name
                    });
                }
            }
            const listItem = {
                label: dbFeatures[feat].external_name,
                value: feat,
                children: dbFeaturesList
            };
            setFeaturesList(prevFeatureList => [...prevFeatureList, listItem]);
        }
    }, []);

    const handleCancel = () => {
        setIsOpen(false);
    };

    const printFeatureList = () => {
        // console.log(featuresList);
        console.log(rule);
    };

    const onFieldSelected = value => {
        console.log(value);
        const cleanType = features[value[0]].fields[value[1]].type.replace(/\(\d+\)$/, '');
        setRuleType(cleanType);
        setPickedFeature(value[0]);
        setPickedField(value[1]);
        setRule('');
        setValue('');
        setResult([]);
    };

    const onRuleChange = ({ target: { value } }) => {
        console.log(value);
        setRule(value);
    };

    const onValueChange = e => {
        if (ruleType === 'integer' || ruleType === 'double') {
            const regex = /^\d+$/;
            if (regex.test(e.target.value)) {
                setValue(e.target.value);
            }
        } else {
            setValue(e.target.value);
        }
    };

    const validate = (a, operator, b) => {
        const operators = {
            '>': (a, b) => a > b,
            '<': (a, b) => a < b,
            true: a => a,
            false: a => !a,
            have: (a, b) => a.includes(b),
            notHave: (a, b) => !a.includes(b)
        };

        if (operators[operator]) {
            return operators[operator](a, b);
        } else {
            throw new Error(`Unknown operator: ${operator}`);
        }
    };

    const validateRule = () => {
        setResult([]);
        db.getFeatures(pickedFeature).then(result => {
            console.log(result);
            console.log(pickedField);
            for (const r in result) {
                if (result[r]?.properties) {
                    // console.log(result[r].properties[pickedField]);
                    // console.log(
                    //     'a = ' +
                    //         value +
                    //         ' - b = ' +
                    //         result[r].properties[pickedField] +
                    //         ' RESULT = ' +
                    //         validate(result[r].properties[pickedField], rule, value)
                    // );
                    const newResult = {
                        resultName: result[r].properties.description,
                        resultValue: result[r].properties[pickedField],
                        result: validate(result[r].properties[pickedField], rule, value)
                    };
                    setResult(prevResult => [...prevResult, newResult]);
                }
            }
        });
    };

    function renderFields() {
        switch (ruleType) {
            case 'integer':
            case 'double':
                return (
                    <div>
                        <br />
                        <br />
                        Rule:&nbsp;&nbsp;&nbsp;
                        <Radio.Group
                            optionType="button"
                            buttonStyle="solid"
                            onChange={onRuleChange}
                        >
                            <Radio value={'<'}>{'<'}</Radio>
                            <Radio value={'>'}>{'>'}</Radio>
                        </Radio.Group>
                        <br />
                        <Input
                            placeholder={pickedFeature + ' - ' + pickedField}
                            value={value}
                            onChange={onValueChange}
                        />
                    </div>
                );
            case 'string':
                return (
                    <div>
                        <br />
                        <br />
                        Rule:&nbsp;&nbsp;&nbsp;
                        <Radio.Group
                            optionType="button"
                            buttonStyle="solid"
                            onChange={onRuleChange}
                        >
                            <Radio value={'have'}>{'MUST contain'}</Radio>
                            <Radio value={'notHave'}>{'MUST NOT contain'}</Radio>
                        </Radio.Group>
                        <Input
                            placeholder={pickedFeature + ' - ' + pickedField}
                            value={value}
                            onChange={onValueChange}
                        />
                    </div>
                );
            case 'boolean':
                return (
                    <div>
                        <br />
                        <br />
                        Rule:&nbsp;&nbsp;&nbsp;
                        <Radio.Group
                            optionType="button"
                            buttonStyle="solid"
                            onChange={onRuleChange}
                        >
                            <Radio value={'true'}>{'True'}</Radio>
                            <Radio value={'false'}>{'False'}</Radio>
                        </Radio.Group>
                    </div>
                );
        }
    }

    function renderResult() {
        // if (result.length > 0) {
        //     return <h1>results</h1>;
        // } else {
        //     return <h1>no results...</h1>;
        // }
        if (result.length > 0) {
            console.log(result);
            return (
                <div>
                    {result.map((item, index) => (
                        <h3 key={index}>
                            {item.resultName} - {item.result.toString()}
                        </h3>
                    ))}
                </div>
            );
        }
    }

    return (
        <DraggableModal
            wrapClassName="custom-rules-modal"
            open={isOpen}
            title={'Custom Rule Creator'}
            width={500}
            onCancel={handleCancel}
            footer={[
                <Button key="cancel" onClick={handleCancel}>
                    Cancel
                </Button>,
                <Button key="ok" onClick={validateRule} type="primary">
                    OK
                </Button>
            ]}
        >
            <Cascader options={featuresList} onChange={onFieldSelected} />
            {renderFields()}
            {renderResult()}
        </DraggableModal>
    );
};
