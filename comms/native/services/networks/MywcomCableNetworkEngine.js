//###############################################################################
// Comms Fiber Network Engine
//###############################################################################
// Copyright: IQGeo Limited 2010-2023

import { NetworkEngine } from 'myWorld-native-services';
import MywcomGraphNetworkEngine from './MywcomGraphNetworkEngine';
import NetworkView from '../api/NetworkView';

class MywcomCableNetworkEngine extends MywcomGraphNetworkEngine {
    /**
     * A network engine for tracing path through cables
     *
     */

    constructor(view, networkDef, extraFilters) {
        super(view, networkDef, extraFilters);

        // Cable manager used to get segments at structure
        const nw_view = new NetworkView(this.db_view);
        this.cable_mgr = nw_view.cable_mgr;
    }

    /**
     * Returns features found following the configured field for DIRECTION
     * DIRECTION is one of 'upstream' or 'downstream'
     */
    async _getFeaturesFor(feature, direction) {
        const fieldName = this.featurePropFieldName(feature.table.name, direction);
        if (!fieldName) return [];

        const struct_urn = feature.getUrn();

        let recs = undefined;
        if (fieldName == 'in_fiber_segments') {
            const segs = await this.cable_mgr.segmentsAt(feature);
            recs = segs.filter(seg => {
                return seg.properties.out_structure == struct_urn;
            });
        } else if (fieldName == 'out_fiber_segments') {
            const segs = await this.cable_mgr.segmentsAt(feature);
            recs = segs.filter(seg => {
                return seg.properties.in_structure == struct_urn;
            });
        } else {
            recs = await feature.followRefSet(fieldName);
        }

        //apply filters
        return recs.filter(this.includesFeature.bind(this));
    }
}

NetworkEngine.engines['mywcom_cable_network_engine'] = MywcomCableNetworkEngine;

export default MywcomCableNetworkEngine;
