// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import designRulesEngine from '../validation/designRulesEngine';

export default class DesignRulesManagerPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'DesignRulesManager';

        this.mergeOptions({
            // List of registered design rule classes
            // Order defines the order the checks will be run
            rules: []
        });
    }

    /**
     * @class Provides API for design rules
     *
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');

        this.rules = {};
        this.ruleTypes = [];
        this.ruleOptions = [];

        this.options.rules.forEach(ruleClass => {
            const rule = new ruleClass(this);
            this.ruleTypes.push(rule.type);
            this.rules[rule.type] = ruleClass;
            this.ruleOptions.push({ type: rule.type, title: rule.typeDesc() });
        });
    }

    /**
     * Returns new validation engine instance
     *
     * @param [string] rule types the engine will run
     * @param {object} options passed to new instance
     */
    async validationEngine(ruleTypes, options) {
        return new designRulesEngine(this, this.ds, ruleTypes, options);
    }

    /**
     * Returns rule options applicable to the delta state
     */
    async currentDeltaRuleOptions(delta = null) {
        delta = delta || this.ds.delta;

        if (!delta) return;

        const deltaFeature = await this.ds.getFeatureByUrn(delta);

        const ruleTypes = this.ruleTypes;
        const rules = this.rules;

        const ruleOptions = [];
        ruleTypes.forEach(ruleType => {
            const ruleClass = rules[ruleType];
            const rule = new ruleClass(this);

            if (rule.applicableForDelta(deltaFeature))
                ruleOptions.push({ type: ruleType, title: rule.typeDesc() });
        });

        return ruleOptions;
    }

    /**
     * Rule class for a given type
     */
    ruleClass(ruleType) {
        return this.rules[ruleType];
    }
}
