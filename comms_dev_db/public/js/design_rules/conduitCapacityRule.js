// Copyright: IQGeo Limited 2010-2023
import _ from 'underscore';
import designRule from 'modules/comms/js/validation/designRule';

/**
 * Validate that inner duct + cable diameters do not exceed housing conduit
 */
/*eslint-disable no-await-in-loop*/
class conduitCapacityRule extends designRule {
    static {
        this.prototype.type = 'conduit_capacity';

        // Only run in specific states
        this.prototype.designStates = ['Designing'];
    }

    typeDesc() {
        return 'Conduit capacity';
    }

    async run() {
        const featureTypes = ['conduit', 'blown_fiber_tube'];

        for (const featureType of featureTypes) {
            if (this.stop) break;

            // Get an iterator for the features we need
            const features = await this.engine.features(featureType);

            for await (const feature of features) {
                if (this.stop) break;
                await this._validateConduitCapacity(feature);
            }
        }
    }

    async _validateConduitCapacity(conduit) {
        const usedPercentage = (await this._conduitUsage(conduit)) * 100;

        // Simple diameter comparison, not a circle packing algorithm
        if (usedPercentage > 100.0) {
            this.engine.logError(conduit, this, 'Capacity exceeded', [
                {
                    name: 'description',
                    external_name: 'Description',
                    value: `${usedPercentage.toFixed(0)}% of capacity used`
                }
            ]);
        }
    }

    /**
     * Returns an estimate of how full 'conduit' is
     *
     * Uses simplistic estimate based on square cross sectional areas. A production
     * implementation would need to be more sophisticated
     */
    async _conduitUsage(conduit) {
        const conduitDiameter = conduit.properties.diameter;

        if (!conduitDiameter) {
            return;
        }

        // Get contained cables and ducts
        const ftrs = await this._getContents(conduit);

        // Calculate total area used (using square area, to allow for slop)
        let usedArea = 0;
        for (const ftr of ftrs) {
            usedArea += await this._calcUsedAreaFor(ftr);
        }

        // Estimate available area (using circular area)
        const availableArea = Math.PI * (conduitDiameter / 2) ** 2;

        return usedArea / availableArea;
    }

    async _getContents(conduit) {
        const fieldNames = ['cables', 'conduits'];

        const promises = [];
        for (const fieldName of fieldNames) {
            if (fieldName in conduit.featureDD.fields) {
                promises.push(conduit.followRelationship(fieldName));
            }
        }

        return _.flatten(await Promise.all(promises));
    }

    /**
     * Logs diameter not set error with design rules engine
     * @private
     */
    _logDiameterError(ftr) {
        this.engine.logError(ftr, this, 'Diameter not set', [
            {
                name: 'description',
                external_name: 'Description',
                value: 'Objects inside conduits must have their diameter set'
            },

            {
                name: 'resolution',
                external_name: 'Resolution',
                value: 'Set diameter or specification'
            }
        ]);
    }

    /**
     * Calculates used area for a feature
     * If blown fiber bundle feature gets child tubes and calculates area from them
     * Uses square cross sectional areas (rather than πr²) - to allow for slop
     * Else uses feature diameter directly
     */
    async _calcUsedAreaFor(ftr) {
        let usedArea = 0;
        if (ftr.getType() == 'blown_fiber_bundle') {
            // Get tubes in bundle
            const tubes = await ftr.followRelationship('conduits');
            for (const tube of tubes) {
                // Calculate area of tube
                usedArea += tube.properties.diameter ** 2;
            }
        } else {
            const diameter = ftr.properties.diameter;
            if (diameter) {
                usedArea += diameter ** 2;
            } else {
                this._logDiameterError(ftr);
                return;
            }
        }
        return usedArea;
    }
}

export default conduitCapacityRule;
