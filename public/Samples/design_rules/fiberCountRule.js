// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import designRule from 'modules/comms/js/validation/designRule';

class fiberCountRule extends designRule {
    static {
        this.prototype.type = 'fiber_count';

        this.prototype.minCount = 24;

        this.prototype.designStates = ['Designing'];
    }

    typeDesc() {
        return myw.app.msg(this.type + '.title');
    }

    async run() {
        const featureType = 'fiber_cable';
        const features = await this.engine.features(featureType);

        for await (const feature of features) {
            if (this.stop) break;
            await this._validateCount(feature);
        }
    }

    _validateCount(feature) {
        const fiberCount = feature.properties.fiber_count;

        if (fiberCount >= this.minCount) return;
        this.engine.logError(feature, this, myw.app.msg(this.type + '.description'), [
            {
                name: 'description',
                external_name: myw.app.msg(this.type + '.cause'),
                value:
                    myw.app.msg(this.type + '.fiber_count_of') +
                    ` ${feature.properties.name} ` +
                    myw.app.msg(this.type + '.is') +
                    ` ${feature.properties.fiber_count} ` +
                    myw.app.msg(this.type + '.minimum_is') +
                    ` ${this.minCount}`
            }
        ]);
    }
}

export default fiberCountRule;
