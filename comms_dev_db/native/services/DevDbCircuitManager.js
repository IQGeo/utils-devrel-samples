// Copyright: IQGeo Limited 2010-2023
import NetworkView from '../../../comms/native/services/api/NetworkView';
import CircuitManager from '../../../comms/native/services/api/CircuitManager';

/**
 * Example of custom manager class
 */
class DevDbCircuitManager extends CircuitManager {
    static registerTriggers(NetworkView) {
        NetworkView.registerTrigger('circuit', 'pos_insert', this, 'posInsertTrigger');
    }

    /**
     * Called after CIRCUIT is inserted
     */
    async posInsertTrigger(circuit) {
        this.progress(2, 'Running insert trigger', circuit);
    }
}

NetworkView.prototype.custom_manager_classes['DevDbCircuitManager'] = DevDbCircuitManager;

export default DevDbCircuitManager;
