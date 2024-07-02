// Copyright: IQGeo Limited 2010-2023
import PinRange from './pinRange';
import myw from 'myWorld-client';

class Conn extends myw.MywClass {
    /**
     * @class A connection from one set of pins to another
     * Deals with the business of reversing connection when looking
     * upstream
     */

    // ------------------------------------------------------------------------------
    //                                  CONSTRUCTION
    // ------------------------------------------------------------------------------

    /**
     * Init slots of self from connection record CONN_REC
     *  If 'forward' is false, reverse the connection
     *  Optional 'features' is a dict of features keyed by urn (used to populate .from_feature etc)
     */
    constructor(conn_rec, forward = true, features = null) {
        super();
        // Init slots
        this.conn_rec = conn_rec;
        this.forward = forward;
        this.urn = conn_rec.getUrn();
        this.isValid = true;

        let from_urn,
            from_pin_side,
            from_pin_low,
            from_pin_high,
            to_urn,
            to_pin_side,
            to_pin_low,
            to_pin_high;

        // Get from and to info
        if (forward) {
            from_urn = conn_rec.properties.in_object;
            from_pin_side = conn_rec.properties.in_side;
            from_pin_low = conn_rec.properties.in_low;
            from_pin_high = conn_rec.properties.in_high;
            to_urn = conn_rec.properties.out_object;
            to_pin_side = conn_rec.properties.out_side;
            to_pin_low = conn_rec.properties.out_low;
            to_pin_high = conn_rec.properties.out_high;
        } else {
            from_urn = conn_rec.properties.out_object;
            from_pin_side = conn_rec.properties.out_side;
            from_pin_low = conn_rec.properties.out_low;
            from_pin_high = conn_rec.properties.out_high;
            to_urn = conn_rec.properties.in_object;
            to_pin_side = conn_rec.properties.in_side;
            to_pin_low = conn_rec.properties.in_low;
            to_pin_high = conn_rec.properties.in_high;
        }

        this.from_ref = from_urn;
        this.to_ref = to_urn;
        this.from_pins = new PinRange(from_pin_side, from_pin_low, from_pin_high);
        this.to_pins = new PinRange(to_pin_side, to_pin_low, to_pin_high);

        // Set referenced features
        if (features) {
            this.from_feature = features[this.from_ref];
            this.isValid = this.from_feature && this.isValid;
            if (this.from_feature?.properties.cable) {
                this.from_cable = features[this.from_feature.properties.cable];
                this.from_cable_side = this.from_pins.otherSide();
            }

            this.to_feature = features[this.to_ref];
            this.isValid = this.to_feature && this.isValid;
            if (this.to_feature?.properties.cable) {
                this.to_cable = features[this.to_feature.properties.cable];
                this.to_cable_side = this.to_pins.otherSide();
            }

            this.housing_feature = features[this.conn_rec.properties.housing];
        }

        // Store delta information
        if (this.conn_rec.isProposed()) {
            this.delta = this.conn_rec._myw.delta; // ENH: Use accessor
            this.deltaTitle = this.conn_rec._myw.delta_owner_title;
        }
    }

    /**
     * True if self relates to a record from another design
     */
    reversed() {
        return new Conn(this.conn_rec, !this.forward, this.features());
    }

    /**
     * Features that self relates to (if known)
     */
    features() {
        const features = {};

        for (const ftr of [
            this.from_feature,
            this.from_cable,
            this.to_feature,
            this.to_cable,
            this.housing
        ]) {
            if (ftr) features[ftr.getUrn()] = ftr;
        }
        return features;
    }

    /**
     * String representation for test results
     */
    __ident__() {
        return (
            'Conn(' +
            `${this.conn_rec.id}: ` +
            `${this.from_ref}#${this.from_pins._spec()}` +
            ' -> ' +
            `${this.to_ref}#${this.to_pins._spec()}` +
            ')'
        );
    }

    /**
     * True if self relates to a record from another design
     */
    isProposed() {
        return this.conn_rec.isProposed();
    }

    /**
     * The outgoing pin for 'fromPin'
     */
    toPinFor(fromPin) {
        return this.to_pins.low + (fromPin - this.from_pins.low);
    }

    /**
     * The incoming pin for 'toPin'
     */
    fromPinFor(toPin) {
        return this.from_pins.low + (toPin - this.to_pins.low);
    }

    /**
     * The user-level 'from' side for self (for reports etc)
     *
     * For undirected cables this is derived from the port it is connected to
     */
    logicalFromSide() {
        if (this.from_cable && !this.to_cable) {
            if (!this.from_cable.properties.directed) return this.to_pins.otherSide();
        }
        return this.from_pins.side;
    }

    /**
     * The user-level 'from' side for self (for reports etc)
     *
     * For undirected cables this is derived from the port it is connected to
     *
     */
    logicalToSide() {
        if (this.to_cable && !this.from_cable) {
            if (!this.to_cable.properties.directed) return this.from_pins.otherSide();
        }
        return this.to_pins.side;
    }
}

export default Conn;
