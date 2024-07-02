// Copyright: IQGeo Limited 2010-2023
import designRule from 'modules/comms/js/validation/designRule';

/**
 * Design rule that validates aerial routes not over a threshold
 * Simple example that uses a fixed threshold and does not account for the route possibly being split
 * mid-span
 */
class poleSpacingRule extends designRule {
    static {
        this.prototype.type = 'pole_spacing';

        // Threshold (in feet)
        this.prototype.maxDist = 185;

        // Only run in specific states
        this.prototype.designStates = ['Designing'];
    }

    typeDesc() {
        return 'Pole spacing';
    }

    async run() {
        const featureType = 'oh_route';
        const features = await this.engine.features(featureType);

        for await (const feature of features) {
            if (this.stop) break;
            await this._validateLength(feature);
        }
    }

    _validateLength(feature) {
        const lengthMeters = feature.properties.length || feature.geomLengthStr();

        const lengthFeet = lengthMeters * 3.28084; // TODO: Use unit system

        if (lengthFeet <= this.maxDist) return;

        this.engine.logError(feature, this, 'Route too long', [
            {
                name: 'description',
                external_name: 'Description',
                value: `Strand length ${Math.floor(lengthFeet)} feet exceeds max permitted (${
                    this.maxDist
                } feet)`
            }
        ]);
    }
}

export default poleSpacingRule;
