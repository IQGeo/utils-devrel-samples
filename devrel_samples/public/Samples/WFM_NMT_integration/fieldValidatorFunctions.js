import React from 'react';
import { useLocale } from 'myWorld-client/react';
import { Radio, Input } from 'myWorld-client/react';

export const buildFeatureList = features => {
    let fieldsList = [];
    let featuresList = [];
    for (const feat in features) {
        fieldsList = [];
        for (const field in features[feat].fields) {
            if (features[feat].fields[field].visible.value) {
                fieldsList.push({
                    label: features[feat].fields[field].external_name,
                    value: features[feat].fields[field].internal_name
                });
            }
        }
        const featureListItem = {
            label: features[feat].external_name,
            value: feat,
            children: fieldsList
        };
        featuresList.push(featureListItem);
    }
    return featuresList;
};

export const validate = (a, rule, b) => {
    if (a && b) {
        const rules = {
            '>': (a, b) => Number(a) > Number(b),
            '<': (a, b) => Number(a) < Number(b),
            true: a => a,
            false: a => !a,
            have: (a, b) => a.includes(b),
            notHave: (a, b) => !a.includes(b)
        };

        if (rules[rule]) {
            return rules[rule](a, b);
        } else {
            throw new Error(`Unknown rule: ${rule}`);
        }
    } else {
        return false;
    }
};

export const buildFields = (
    radioOptions,
    setRuleFunction,
    inputPlaceholder = null,
    valueState = null,
    onValueChangeFunction = null
) => {
    const { msg } = useLocale('customRuleModal');
    return (
        <div>
            <br />
            <strong>{msg('rule_title')}</strong>
            <Radio.Group
                optionType="button"
                buttonStyle="solid"
                onChange={e => setRuleFunction(e.target.value)}
            >
                {radioOptions.map(option => (
                    <Radio key={option.value} value={option.value}>
                        {option.label}
                    </Radio>
                ))}
            </Radio.Group>
            {inputPlaceholder && (
                <div>
                    <br />
                    <strong>{msg('value_title')}</strong>
                    <Input
                        placeholder={inputPlaceholder}
                        value={valueState}
                        onChange={onValueChangeFunction}
                    />
                </div>
            )}
        </div>
    );
};

export const createTicketObject = (itemObj, rule, pickedField, value, pickedFeature) => {
    const { msg } = useLocale('customRuleModal');
    let ruleStr = '';
    switch (rule) {
        case '<':
            ruleStr = msg('less_than');
            break;
        case '>':
            ruleStr = msg('more_than');
            break;
        case 'true':
            ruleStr = msg('true');
            break;
        case 'false':
            ruleStr = msg('false');
            break;
        case 'have':
            ruleStr = msg('have');
            break;
        case 'notHave':
            ruleStr = msg('not_have');
            break;
    }

    const issueStr =
        msg('value_of') +
        pickedFeature +
        ' - ' +
        pickedField +
        msg('is') +
        itemObj.properties[pickedField] +
        ruleStr +
        ' ' +
        value;

    const ticketObj = {
        geometry_type: 'Point',
        id: 'Null',
        mywwfm_assigned_username: 'admin',
        // mywwfm_cause: 'Broken Custom Rule',
        mywwfm_cause: msg('cause'),
        mywwfm_geomety_features: itemObj.geometry.coordinates,
        mywwfm_indicator: msg('medium'),
        mywwfm_issue: issueStr,
        mywwfm_last_modified_datetime: undefined,
        mywwfm_node: msg('node'),
        mywwfm_project: 'mywwfm_project/1',
        mywwfm_project_name: null,
        mywwfm_region: 'South',
        mywwfm_related_feature: null,
        mywwfm_source_system: null,
        mywwfm_status: 'Open',
        mywwfm_ticket_details: msg('default_ticket_details'),
        mywwfm_ticket_group: ['admin:Default'],
        mywwfm_type: 'Trouble Ticket',
        mywwfm_type_category: msg('default_category')
    };
    return ticketObj;
};
