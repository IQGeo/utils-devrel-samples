// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

import Connection from './connection';
import Slack from './slack';
import Equipment from './equipment';
import Structure from './structure';
import Route from './route';
import Conduit from './conduit';
import ConduitRun from './conduitRun';
import Cable from './cable';
import CableSegment from './cableSegment';
import Circuit from './circuit';
import CircuitSegment from './circuitSegment';
import CommsDeltaOwner from './commsDeltaOwner';
import DataBlock from './dataBlock';
import LineOfCount from '../line_of_count/lineOfCount';

export default class FeatureModelLoaderPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'FeatureModelLoader';

        /**
         * @class Engine for registering Comms feature models based on feature's configured category
         */

        this.prototype.categories = {
            equipment: { settingName: 'mywcom.equipment', model: Equipment },
            structure: { settingName: 'mywcom.structures', model: Structure },
            conduit: { settingName: 'mywcom.conduits', model: Conduit },
            route: { settingName: 'mywcom.routes', model: Route },
            cable: { settingName: 'mywcom.cables', model: Cable },
            circuit: { settingName: 'mywcom.circuits', model: Circuit },
            design: { settingName: 'mywcom.designs', model: CommsDeltaOwner }
        };
    }

    constructor(owner, options) {
        super(owner, options);

        this._registerFeatureModels();
    }

    /**
     * Set features models based on configured category (where not set explicitly)
     */
    _registerFeatureModels() {
        // System feature types
        myw.featureModels['mywcom_conduit_run'] = ConduitRun;
        myw.featureModels['mywcom_circuit_segment'] = CircuitSegment;

        const networkTypes = myw.config['mywcom.network_types'];
        Object.values(networkTypes).map(network => {
            myw.featureModels[network.segment_type] = CableSegment;
            myw.featureModels[network.connection_type] = Connection;
            myw.featureModels[network.slack_type] = Slack;
        });

        myw.featureModels['mywcom_line_of_count'] = LineOfCount;

        // Custom feature types
        for (const category in this.categories) {
            const categoryDef = this.categories[category];

            const featureTypes = this._featureTypesIn(categoryDef);
            const model = categoryDef.model;

            for (const featureType of featureTypes) {
                if (!myw.featureModels[featureType]) {
                    myw.trace('featureModelLoader', 1, 'Setting model', featureType, model.name);
                    myw.featureModels[featureType] = model;
                } else {
                    myw.trace('featureModelLoader', 1, 'Custom model', featureType, model.name);
                }
            }
        }
    }

    /**
     * The feature types configured for given category
     */

    _featureTypesIn(categoryDef) {
        const settingVal = myw.config[categoryDef.settingName];
        return Object.keys(settingVal);
    }
}
