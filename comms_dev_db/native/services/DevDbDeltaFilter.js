// Copyright: IQGeo Limited 2010-2023

/**
 * Engine for controlling which proposed records are shown in GUI
 *
 * Example implementation
 */
class DevDbDeltaFilter extends myw.Class {
    /**
     * Init slots of self
     *
     * NW_VIEW is a NetworkView. PROGRESS is a MywProgressHandler
     */
    constructor(nw_view, progress) {
        super();
        this.nw_view = nw_view;
        this.db_view = nw_view.db_view;
        this.progress = progress;
    }

    /**
     * True if REC should be include when displaying proposed features in GUI
     *
     * Overridden to exclude designs of type 'Network Upgrade'
     */
    /* eslint-disable no-prototype-builtins */
    async include(rec) {
        const design = await this.db_view.get(rec.myw.delta);

        if (!design.properties.hasOwnProperty('type')) {
            return true;
        }

        return design && design.properties.type != 'Network Upgrade';
    }
}

export default DevDbDeltaFilter;

// ==============================================================================
//                               REGISTRATION
// ==============================================================================

import NetworkView from '../../../comms/native/services/api/NetworkView';
NetworkView.prototype.delta_filter = DevDbDeltaFilter;
