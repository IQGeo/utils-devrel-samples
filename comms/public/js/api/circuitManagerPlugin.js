// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class CircuitManagerPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'CircuitManager';
    }

    /**
     * @class Provides API for routing and maintaining circuits
     *
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');

        this.circuitConfigs = myw.config['mywcom.circuits'];
    }

    // -----------------------------------------------------------------------
    //                              ROUTING
    // -----------------------------------------------------------------------

    /**
     * Route circuit from its termination port
     */
    async routeCircuit(circuit) {
        await this.ds.comms.routeCircuit(circuit);
    }

    /**
     * Delete routing substructure of 'circuit'
     */
    async unrouteCircuit(circuit) {
        await this.ds.comms.unrouteCircuit(circuit);
    }
}
