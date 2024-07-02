// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import designRuleError from './designRuleError';

/**
 * Engine that validates designs with design rules, gathering errors and reporting progress
 */
/*eslint-disable no-await-in-loop*/
class designRulesEngine extends myw.MywClass {
    constructor(
        owner,
        ds,
        ruleTypes,
        { deltaOnly = false, maxErrors = null, bounds = null, progressCallback = null }
    ) {
        super();
        this.owner = owner;
        this.ds = ds;
        this.ruleTypes = ruleTypes;

        this.deltaOnly = deltaOnly;
        this.maxErrors = maxErrors;
        this.bounds = bounds;
        this.progressCallback = progressCallback;

        this.errors = [];
        this.progress = { rules: {} };

        this.deltaChangesCache = {}; // Populated later when needed
    }

    async run() {
        this.stop = false;
        this.errors = [];
        this.progress = { rules: {} };
        this._reportProgress();

        for (const ruleType of this.ruleTypes) {
            await this._runRule(ruleType);
        }
    }

    /**
     * Run design rule
     */

    async _runRule(ruleType) {
        if (this.stop) return;

        const ruleClass = this.owner.ruleClass(ruleType);

        const rule = new ruleClass(this, this.bounds, this.deltaOnly);

        const progress = (this.progress.rules[ruleType] = {
            running: true,
            errors: 0,
            complete: false,
            stopped: false
        });
        this._reportProgress();

        this.currentRule = rule;
        await rule.run();
        this.currentRule = null;

        progress.running = false;

        if (rule.stop) {
            progress.stopped = true;
        } else {
            progress.complete = true;
        }
        this._reportProgress();
    }

    /**
     * Stop the current validation
     */

    cancel() {
        this.stop = true;
        this.progress.stop = true;

        if (this.currentRule) this.currentRule.cancel();

        this._reportProgress();
    }

    /**
     * Returns async iterable that returns features from delta+master or delta only
     */
    async features(featureType) {
        // ENH: move generators to comms datasource?

        // Get suitable generator for caller to iterate over
        let generator;

        if (this.deltaOnly) {
            generator = this._getDeltaFeatures(featureType);
        } else {
            generator = this._getFeatures(featureType);
        }

        return generator;
    }

    /**
     * Generator function that returns insert & updates from current delta
     */
    async *_getDeltaFeatures(featureType) {
        const delta = this.ds.delta;
        if (!delta) return;

        let deltaChanges = this.deltaChangesCache[featureType];
        if (!deltaChanges) {
            const changeTypes = ['insert', 'update']; // Don't include deletes
            const featureTypes = [featureType];

            deltaChanges = await this.ds.comms.deltaChanges(
                this.ds.delta,
                changeTypes,
                this.bounds,
                featureTypes
            );

            // Cache for next time
            this.deltaChangesCache[featureType] = deltaChanges;
        }

        for (var feature of deltaChanges) {
            yield feature;
        }
    }

    /**
     * Generator function that returns features from current delta or master
     */
    async *_getFeatures(featureType) {
        const bounds = this.bounds;

        let limit = 100; // request from server in chunks of 100
        let done = false;

        for (let offset = 1; !done; offset += limit) {
            // Get next chunk of features
            const result = await this.ds.getFeatures(featureType, {
                limit: limit,
                offset: offset,
                bounds: bounds
            });
            for (var feature of result) {
                yield feature;
            }

            // Determine if we have all features
            done = result.length != limit;
        }
    }

    /**
     * Log a new error
     * @param {feature}    feature with the issue
     * @param {designRule} design rule instance that determined the issue
     * @param {string}     brief error type string
     * @param {object}     field data to include with error (refer to designRuleError for details)
     * @param {string}     (Optional) title string. Will be determined from the feature if not provided
     * @param {string}     (Optional) short description string. Will be derived if not provided
     */
    logError(feature, designRule, errorDesc, data, title = null, shortDescription = null) {
        const newError = new designRuleError(
            feature,
            designRule,
            errorDesc,
            data,
            title,
            shortDescription
        );

        this.errors.push(newError);
        this.progress.rules[designRule.type].errors += 1;

        this._reportProgress();

        // Stop process if reached max errors
        if (this.maxErrors !== null && this.errors.length >= this.maxErrors) this.cancel();

        return newError;
    }

    /**
     * Reports progress with progress callback function
     */
    _reportProgress() {
        if (this.progressCallback) this.progressCallback(this.progress);
    }
}

export default designRulesEngine;
