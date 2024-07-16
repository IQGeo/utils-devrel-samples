// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import PinRange from './pinRange';

export default class ConnectionManagerPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'CableManager';
    }

    /**
     * @class Provides API for connecting and disconnecting signal carriers (ports and cables)
     *
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
    }

    // ------------------------------------------------------------------------------
    //                              DATA ACCESS
    // ------------------------------------------------------------------------------

    /**
     * Returns list of pins on 'side' of 'feature' that are not connected
     * @param  {MywFeature} feature
     * @param  {string} Network type
     * @param  {string} 'in' or 'out'
     * @return {Array} list of used pins
     */
    async freePinsOn(feature, tech, side) {
        const pins = await this.pinStateFor(feature, tech, side);

        const freePins = [];
        Object.keys(pins).forEach(pin => {
            if (pins[pin]) freePins.push(pin);
        });

        return freePins;
    }

    /**
     * returns list of pins on 'side' of 'feature' that are connected
     * @param  {MywFeature} feature
     * @param  {string} Network type
     * @param  {string} 'in' or 'out'
     * @return {Array} list of used pins
     */
    async usedPinsOn(feature, tech, side) {
        const pins = await this.pinStateFor(feature, tech, side);

        const usedPins = [];
        Object.keys(pins).forEach(pin => {
            if (!pins[pin]) usedPins.push(pin);
        });

        return usedPins;
    }

    /**
     * returns highest pin in use
     * @param  {MywFeature} feature
     * @param  {string} 'fiber' or 'copper'
     * @param  {string} 'in' or 'out'
     * @return {integer} highest pin number in use
     */
    async highPinUsedOn(feature, tech, side) {
        const usedPins = await this.usedPinsOn(feature, tech, side);
        return Math.max(...usedPins);
    }

    /**
     * returns list of state of pins for feature
     * @param  {MywFeature} feature
     * @param  {string} Network technology
     * @param  {string} 'in' or 'out'
     * @return {Array} List of pins states, keyed by pin number (true means free, false means connected)
     */
    async pinStateFor(feature, tech, side) {
        // Get connections
        const conns = await this.ds.comms.connectionsOn(feature, tech, side);
        const pinCount = await this.pinCountFor(feature, tech, side);

        // Build list of pins
        const pins = {};
        for (let pin = 1; pin <= pinCount; pin++) pins[pin] = true;

        // Mark ones that are used
        for (const conn of conns) {
            for (let pin = conn.from_pins.low; pin <= conn.from_pins.high; pin++) pins[pin] = false;
        }

        return pins;
    }

    /**
     * Returns number of pins on 'side' of 'feature' (if any)
     * @param  {MywFeature} feature
     * @param  {string} network type
     * @param  {string} 'in' or 'out'
     * @return {integer} number of pins on feature
     */
    async pinCountFor(feature, tech, side) {
        const cableManager = this.app.plugins.cableManager;
        return cableManager.pinCountFor(feature, side);
    }

    // ------------------------------------------------------------------------------
    //                                       TRACING
    // ------------------------------------------------------------------------------

    /**
     * Trace from 'pins' of 'feature'
     * @param  {string} network type
     * @param  {MywFeature} feature
     * @param  {PinRange} pins
     * @param  {string} 'upstream', 'downstream' or 'both'
     * @param  {float} stop distance
     * @return {obect} trace tree
     */
    async traceOut(tech, feature, pins, direction, maxDist = undefined) {
        // Build request
        const urn = feature.getUrn() + '?pins=' + pins.spec;

        // Run request and display results
        const res = await feature.datasource.traceOut(`mywcom_${tech}`, urn, {
            resultType: 'tree',
            direction: direction,
            maxDist: maxDist
        });

        res.tech = tech; // ENH: Include in server result

        return res;
    }

    // ------------------------------------------------------------------------------
    //                                 CONNECT / DISCONNECT
    // ------------------------------------------------------------------------------

    /**
     * Connect two sets of pins
     *
     * 'fromPins' and 'toPins' are PinRanges or vectors of the form [side,low,high]
     * 'housing' is an equipment or structure
     *
     * Raises event 'connected'
     *
     * Returns connection record created
     */
    async connect(tech, fromFeature, fromPins, toFeature, toPins, housing, ripple = false) {
        if (Array.isArray(fromPins)) fromPins = new PinRange(...fromPins);
        if (Array.isArray(toPins)) toPins = new PinRange(...toPins);
        const conn = await this.ds.comms.connect(
            tech,
            fromFeature,
            fromPins,
            toFeature,
            toPins,
            housing
        );
        this.trigger('connected', { tech, conn: conn, ripple: ripple });
        await this.app.plugins.locManager.handleConnect({ conn: conn, ripple: ripple });
    }

    /* Disconnect pins of feature
     *
     * pins is a PinRange or vector of the form [side,low,high]
     *
     * Raises event 'disconnected'
     */
    async disconnect(tech, feature, pins, ripple = false) {
        if (Array.isArray(pins)) pins = new PinRange(...pins);
        await this.ds.comms.disconnect(tech, feature, pins);
        this.trigger('disconnected', { tech, feature: feature, pins: pins, ripple: ripple });
        await this.app.plugins.locManager.handleDisconnect({
            feature: feature,
            pins: pins,
            ripple: ripple
        });
    }

    /**
     * Move fiber connection records to new housing &root_housing
     * @param {Array} conns array of fiber connection urns
     * @param {string} housingUrn
     * @param {StaticRange} rootHousingUrn
     */
    async moveConns(conns, housingUrn, rootHousingUrn) {
        const transaction = new myw.Transaction(this.app.database);

        for (let conn of conns) {
            let connFeature = await this.ds.getFeatureByUrn(conn);
            connFeature.properties.housing = housingUrn;
            connFeature.properties.root_housing = rootHousingUrn;
            transaction.addUpdate(connFeature);
        }

        return this.ds.runTransaction(transaction);
    }

    /**
     * Determines tech for feature on a side.
     * @param {MywFeature} feature
     * @param {String} side
     * @returns
     */
    techFor(feature, side = undefined) {
        let fields = [];
        for (const tech of ['fiber', 'copper', 'coax']) {
            if (feature.type == `mywcom_${tech}_segment`) return tech;

            if (side) fields = [`n_${tech}_${side}_ports`, `n_${tech}_ports`];
            else fields = [`n_${tech}_in_ports`, `n_${tech}_out_ports`, `n_${tech}_ports`];

            for (const field of fields) {
                if (field in feature.properties) return tech;
            }
        }

        return 'fiber';
    }
}
