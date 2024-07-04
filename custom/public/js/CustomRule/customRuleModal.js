import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { DraggableModal, Button, Radio, Input } from 'myWorld-client/react';
import { Avatar, Cascader, List } from 'antd';
import greenImg from '../../images/green_circle.png';
import redImg from '../../images/red_circle.png';

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

    const onFieldSelected = value => {
        const cleanType = features[value[0]].fields[value[1]].type.replace(/\(\d+\)$/, '');
        setRuleType(cleanType);
        setPickedFeature(value[0]);
        setPickedField(value[1]);
        setRule('');
        setValue('');
        setResult([]);
    };

    const onRuleChange = ({ target: { value } }) => {
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
            '>': (a, b) => Number(a) > Number(b),
            '<': (a, b) => Number(a) < Number(b),
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
            appRef.map.zoomTo(result[0]);
            for (const r in result) {
                if (result[r]?.properties) {
                    if (result[r]?.properties) {
                        typeof result[r].properties[pickedField] === 'number'
                            ? (result[r].properties[pickedField] =
                                  result[r].properties[pickedField].toFixed(2))
                            : result[r].properties[pickedField];
                        const newResult = {
                            resultObj: result[r],
                            result: validate(result[r].properties[pickedField], rule, value)
                        };
                        setResult(prevResult => [...prevResult, newResult]);
                    }
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
                        <br />
                        Value:
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
                        <br />
                        <br />
                        String:
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
        if (result.length > 0) {
            return (
                <div>
                    <br />
                    <List
                        size="small"
                        bordered
                        dataSource={result}
                        header={pickedFeature + ' / ' + pickedField + ' query result'}
                        renderItem={item => (
                            <List.Item>
                                <List.Item.Meta
                                    onClick={() => appRef.map.zoomTo(item.resultObj)}
                                    avatar={
                                        item.result ? (
                                            <Avatar src={greenImg} />
                                        ) : (
                                            <Avatar src={redImg} />
                                        )
                                    }
                                    title={
                                        item.resultObj.properties.description +
                                        ' - ' +
                                        item.resultObj.properties[pickedField]
                                    }
                                />
                                {!item.result ? (
                                    <Button type="primary">Create WFM Ticket</Button>
                                ) : null}
                            </List.Item>
                        )}
                    />
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
