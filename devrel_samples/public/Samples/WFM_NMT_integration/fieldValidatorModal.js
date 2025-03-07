import myw from 'myWorld-client';
import React, { useState, useEffect } from 'react';
import { useLocale } from 'myWorld-client/react';
import { DraggableModal, Button } from 'myWorld-client/react';
import { Avatar, Cascader, List } from 'antd';
import greenImg from '../../images/green_circle.png';
import redImg from '../../images/red_circle.png';
import wfm from '../../../../workflow_manager/public/js/base/wfm.js';
import {
    buildFeatureList,
    validate,
    createTicketObject,
    buildFields
} from './fieldValidatorFunctions.js';

export const FieldValidatorModal = ({ open }) => {
    const [appRef] = useState(myw.app);
    const [db] = useState(myw.app.database);
    const { msg } = useLocale('customRuleModal');
    const [isOpen, setIsOpen] = useState(open);
    const [featuresList, setFeaturesList] = useState([]);
    const [features, setFeatures] = useState();
    const [ruleType, setRuleType] = useState();
    const [pickedRule, setPickedRule] = useState('');
    const [inputtedValue, setInputtedValue] = useState('');
    const [pickedFeatureType, setPickedFeatureType] = useState('');
    const [pickedField, setPickedField] = useState('');
    const [result, setResult] = useState([]);

    useEffect(() => {
        const dbFeatures = db.getFeatureTypes();

        const filteredFeatures = Object.keys(dbFeatures)
            .filter(
                key =>
                    !/(IN|OUT|processed|comsof|mywwfm|spec|coax|copper|conduit|mywcom|ticket|iqgapp)/.test(
                        key
                    )
            )
            .reduce((obj, key) => {
                obj[key] = dbFeatures[key];
                return obj;
            }, {});

        setFeatures(filteredFeatures);

        let featuresListArray = [];
        featuresListArray = buildFeatureList(filteredFeatures);
        setFeaturesList(featuresListArray);
    }, []);

    const handleCancel = () => {
        setIsOpen(false);
    };

    const onFieldSelected = value => {
        const cleanType = features[value[0]].fields[value[1]].type.replace(/\(\d+\)$/, '');
        setRuleType(cleanType);
        setPickedFeatureType(value[0]);
        setPickedField(value[1]);
        setPickedRule('');
        setInputtedValue('');
        setResult([]);
    };

    const onValueChange = e => {
        if (ruleType === 'integer' || ruleType === 'double') {
            const regex = /^\d+$/;
            if (regex.test(e.target.value) || e.target.value === '') {
                setInputtedValue(e.target.value);
            }
        } else {
            setInputtedValue(e.target.value);
        }
    };

    const validateRule = async () => {
        setResult([]);
        let tempResult = [];
        db.getFeatures(pickedFeatureType, { bounds: appRef.map.getBounds() }).then(result => {
            for (const feature in result) {
                if (result[feature]?.properties) {
                    const props = result[feature]?.properties;
                    typeof props[pickedField] === 'number'
                        ? (props[pickedField] = props[pickedField].toFixed(2))
                        : props[pickedField];
                    const newResult = {
                        resultFeature: result[feature],
                        result: validate(props[pickedField], pickedRule, inputtedValue)
                    };
                    tempResult.push(newResult);
                }
            }
            setResult(tempResult);
        });
    };

    const createTicket = async itemObj => {
        const ticketObj = createTicketObject(
            itemObj,
            pickedRule,
            pickedField,
            inputtedValue,
            pickedFeatureType
        );

        const { createTicket } = wfm.redux.tickets;
        await wfm.store.dispatch(createTicket({ values: ticketObj }));
    };

    const renderFields = () => {
        switch (ruleType) {
            case 'integer':
            case 'double':
                return (
                    <div>
                        {buildFields(
                            [
                                { value: '<', label: '<' },
                                { value: '>', label: '>' }
                            ],
                            setPickedRule,
                            pickedFeatureType + ' - ' + pickedField,
                            inputtedValue,
                            onValueChange
                        )}
                    </div>
                );
            case 'string':
                return (
                    <div>
                        {buildFields(
                            [
                                { value: 'have', label: msg('have_radio') },
                                { value: 'notHave', label: msg('have_not_radio') }
                            ],
                            setPickedRule,
                            pickedFeatureType + ' - ' + pickedField,
                            inputtedValue,
                            onValueChange
                        )}
                    </div>
                );
            case 'boolean':
                return (
                    <div>
                        {buildFields(
                            [
                                { value: 'true', label: msg('true_radio') },
                                { value: 'false', label: msg('false_radio') }
                            ],
                            setPickedRule
                        )}
                    </div>
                );
        }
    };

    const renderResult = () => {
        return (
            <div>
                <br />
                <List
                    size="small"
                    bordered
                    dataSource={result}
                    header={pickedFeatureType + ' / ' + pickedField + msg('query_result')}
                    renderItem={item => (
                        <List.Item>
                            <List.Item.Meta
                                onClick={() => {
                                    appRef.map.zoomTo(item.resultFeature);
                                    appRef.setCurrentFeature(item.resultFeature);
                                }}
                                avatar={
                                    item.result ? (
                                        <Avatar src={greenImg} />
                                    ) : (
                                        <Avatar src={redImg} />
                                    )
                                }
                                title={
                                    item.resultFeature.properties.name +
                                    ' - ' +
                                    item.resultFeature.properties[pickedField]
                                }
                            />
                            {!item.result ? (
                                <Button
                                    type="primary"
                                    onClick={() => createTicket(item.resultFeature)}
                                >
                                    {msg('wfm_ticket_button')}
                                </Button>
                            ) : null}
                        </List.Item>
                    )}
                />
            </div>
        );
    };

    return (
        <DraggableModal
            wrapClassName="custom-rules-modal"
            open={isOpen}
            title={msg('windowHeader')}
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
            {true && result.length > 0 ? renderResult() : null}
        </DraggableModal>
    );
};
