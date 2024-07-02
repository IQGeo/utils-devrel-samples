// Copyright: IQGeo Limited 2010-2023
import myw, { Feature } from 'myWorld-client';
import _ from 'underscore';

export default class DesignRuleError extends Feature {
    static {
        this.prototype.messageGroup = 'DesignRuleError';
    }

    /**
     * Initialize new instance

     * @param {feature}    feature with the issue
     * @param {designRule} design rule instance that determined the issue
     * @param {string}     brief error type string
     * @param [{object}]   field data. Order controls field ordering.
     *                     Each element: {name: 'name of field',
     *                                    external_name: 'optional, will be derived from actual problem feature field',
     *                                    value: 'optional, will be derived from actual problem feature field'}
     *
     * @param {string}     (Optional) title string. Will be determined from the feature if not provided
     * @param {string}     (Optional) short description string. Will be derived if not provided
     */

    constructor(feature, designRule, errorDesc, data, title = null, shortDescription = null) {
        const buildFields = () => {
            const sortedFieldNames = [];
            const fields = {};

            const featureDDFields = feature.featureDD.fields;

            // Include the problem feature first
            data = [
                {
                    name: 'problem_feature',
                    external_name: 'problem_feature',
                    value: feature
                }
            ].concat(data);

            data.forEach(dataEntry => {
                const fieldName = dataEntry.name;

                // Use value supplied in data, otherwise obtain from feature
                let fieldValue =
                    'value' in dataEntry ? dataEntry.value : feature.properties[fieldName];

                // Fields with feature values will be display as reference fields
                const isFeature = fieldValue instanceof myw.Feature;

                // Use external name provided, otherwise obtain from feature
                const externalName =
                    dataEntry.external_name ||
                    (featureDDFields[fieldName] && featureDDFields[fieldName].external_name) ||
                    fieldName;

                // Fields will be displayed in order provided
                sortedFieldNames.push(fieldName);

                fields[fieldName] = {
                    value: fieldValue,
                    external_name: externalName,
                    is_feature: isFeature
                };
            });
            return { fields, sortedFieldNames };
        };

        const { fields, sortedFieldNames } = buildFields();
        const buildProperties = () => {
            const props = {};
            _.each(fields, (fieldDef, fieldName) => {
                if (fieldDef.is_feature) {
                    props[fieldName] = fieldDef.value.getUrn();
                } else {
                    props[fieldName] = fieldDef.value;
                }
            });
            return props;
        };

        const props = buildProperties();

        const featureData = {
            properties: props,
            geometry: feature.geometry
        };

        // Init as feature
        super(featureData);
        this.feature = feature;
        this.designRule = designRule;
        this.errorDesc = errorDesc;
        this.errorType = designRule.type;
        this.title = title;
        this.shortDescription = shortDescription;
        this.fields = fields;
        this.sortedFieldNames = sortedFieldNames;

        // Simulate myWorld server geojson result
        this.datasource = feature.datasource;

        // Build a minimal DD to support reference fields
        const featureDD = { fields: this.getFieldsDD() };
        this.featureDD = featureDD;

        // Construct values for field viewers
        this.displayValues = this._buildDisplayValues();

        // Set unique id (required for feature reps)
        this.id = Date.now() + Math.floor(Math.random() * 100000) + 1;

        // Important that the combo of type and this.id results in a unique value as is
        // used in places such as activate details from results list. Assumption is we only have
        // one error of a specific type for a specific feature
        this.type = `${feature.type}-${this.errorType}`;
    }

    /**
     * Build values to display in viewer fields
     */
    _buildDisplayValues() {
        const displayValues = {};

        _.each(this.fields, (fieldDef, fieldName) => {
            // Replace features with URNs
            displayValues[fieldName] = fieldDef.is_feature
                ? fieldDef.value.getTitle()
                : fieldDef.value;
        });

        return displayValues;
    }

    /**
     * Returns DD for specified field
     */
    getFieldDD(internalName) {
        const fieldDD = super.getFieldDD(internalName);

        const fieldDef = this.fields[internalName];

        fieldDD.external_name = fieldDef.external_name;

        if (fieldDef.is_feature) fieldDD.type = 'reference';

        return fieldDD;
    }

    /**
     * Title to show in results list etc
     */
    getTitle() {
        return this.title === null ? this.feature.getTitle() : this.title;
    }

    /**
     * Additional info to show in results list etc
     */
    getShortDescription() {
        return this.shortDescription === null ? this.errorDesc : this.shortDescription;
    }

    /**
     * Returns ordered fields
     */
    getFieldsOrder() {
        return this.sortedFieldNames;
    }
}
