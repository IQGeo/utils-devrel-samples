// Copyright: IQGeo Limited 2010-2023
import designRule from 'modules/comms/js/validation/designRule';

/**
 * Design rule that validates specs are set
 */
/*eslint-disable no-await-in-loop*/
class specsSetRule extends designRule {
    static {
        this.prototype.type = 'specs_set';

        // Only run in specific states
        this.prototype.designStates = ['Designing'];
    }

    typeDesc() {
        return 'Cable specs';
    }

    async run() {
        const plugins = this.engine.owner.app.plugins;
        this.specMgr = plugins.specManager;
        this.cableManager = plugins.cableManager;
        const featureTypes = this.cableManager.cableFeatureTypes;

        for (const featureType of featureTypes) {
            if (this.stop) break;

            const dd = (await this.engine.ds.getDDInfoFor([featureType]))[featureType];

            const specFieldName = this.specMgr.getSpecFieldNameFor(featureType);
            const specExternalName = dd.fields[specFieldName].external_name;

            const features = await this.engine.features(featureType);

            for await (const feature of features) {
                if (this.stop) break;

                await this._validateSpec(feature, specFieldName, specExternalName);
            }
        }
    }

    /**
     * Validate that spec is set
     */
    _validateSpec(feature, specFieldName, specExternalName) {
        if (!feature.properties[specFieldName]) {
            this.engine.logError(feature, this, `${specExternalName} not set`, [
                {
                    name: 'description',
                    external_name: 'Description',
                    value: `${specExternalName} field must be set`
                },

                {
                    name: 'resolution',
                    external_name: 'Resolution',
                    value: `Set specification`
                }
            ]);
        }
    }

    /**
     * Feature types to apply rule to
     */
    async _specFeatureTypes() {
        const featureTypes = [];

        const ds = this.engine.ds;
        const specManager = this.specMgr;
        const cfg = specManager.specConfig;

        for (const featureType in cfg) {
            const specFieldName = cfg[featureType];
            const detFeature = await ds.createDetachedFeature(featureType);
            const visibleFields = detFeature.getFieldsOrder();

            // Only apply rule to feature types that have the spec field visible
            if (visibleFields.indexOf(specFieldName) != -1) featureTypes.push(featureType);
        }

        return featureTypes.sort();
    }
}

export default specsSetRule;
