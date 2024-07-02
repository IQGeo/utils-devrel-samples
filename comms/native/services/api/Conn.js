//###############################################################################
// A network connection
//###############################################################################
// Copyright: IQGeo Limited 2010-2023

//import OrderedDict from 'collections'
//import copy from 'copy'
//import {MywError} from 'myWorld-native-services'

import PinRange from './PinRange';
import Network from './Network';
import { MywError, Reference } from 'myWorld-native-services';
import { MywClass } from 'myWorld-base';

/**
 * A connection from one set of pins to another
 *
 * Deals with the business of reversing connection when looking
 * upstream
 */
class Conn extends MywClass {
    // ------------------------------------------------------------------------------
    //                                   CONSTRUCTION
    // ------------------------------------------------------------------------------

    /**
     * Init slots of self from connection record CONN_REC
     *
     * If FORWARD is false, reverse the connection
     */
    constructor(conn_rec, forward = true) {
        super();
        // Init slots
        this.conn_rec = conn_rec;
        this.db_view = conn_rec.view;
        this.forward = forward;
        this.network = Network.connection_types[conn_rec.getType()];

        let from_urn,
            from_pin_side,
            from_pin_low,
            from_pin_high,
            to_urn,
            to_pin_side,
            to_pin_low,
            to_pin_high;

        // Get from and to info
        if (forward == true) {
            from_urn = conn_rec.properties.in_object;
            from_pin_side = conn_rec.properties.in_side;
            from_pin_low = conn_rec.properties.in_low;
            from_pin_high = conn_rec.properties.in_high;
            to_urn = conn_rec.properties.out_object;
            to_pin_side = conn_rec.properties.out_side;
            to_pin_low = conn_rec.properties.out_low;
            to_pin_high = conn_rec.properties.out_high;
        } else if (forward == false) {
            from_urn = conn_rec.properties.out_object;
            from_pin_side = conn_rec.properties.out_side;
            from_pin_low = conn_rec.properties.out_low;
            from_pin_high = conn_rec.properties.out_high;
            to_urn = conn_rec.properties.in_object;
            to_pin_side = conn_rec.properties.in_side;
            to_pin_low = conn_rec.properties.in_low;
            to_pin_high = conn_rec.properties.in_high;
        } else {
            throw MywError('Bad direction:', forward);
        }

        this.from_ref = Reference.parseUrn(from_urn);
        this.to_ref = Reference.parseUrn(to_urn);
        this.from_pins = new PinRange(from_pin_side, from_pin_low, from_pin_high);
        this.to_pins = new PinRange(to_pin_side, to_pin_low, to_pin_high);
    }

    /**
     * The subset of self that relates to FROM_PINS (if any)
     *
     * Returns a Conn (or None)
     */
    intersect(from_pins) {
        // Find pin range overlap
        const overlap = this.from_pins.intersect(from_pins);
        if (!overlap) {
            return undefined;
        }

        // Return a shallow copy of self with pins updated
        const conn = new Conn(this.conn_rec, this.forward);

        conn.from_pins = overlap;

        conn.to_pins = new PinRange(
            this.to_pins.side,
            this.toPinFor(overlap.low),
            this.toPinFor(overlap.high)
        );

        return conn;
    }

    // ------------------------------------------------------------------------------
    //                                    PROPERTIES
    // ------------------------------------------------------------------------------

    /**
     * String representation of self for debug messages etc
     */
    __ident__() {
        return `Conn(${this.spec})`;
    }

    //@property
    /**
     * String representation of self's data
     */
    _spec() {
        return `${this.from_ref.urn()}/${this.from_pins.spec} -> ${this.to_ref.urn()}/${
            this.to_pins.spec
        }`;
    }

    /**
     * String representation of self for GUI
     */
    async description() {
        const sep = this.forward ? '->' : '<-';
        const fromDescription = await this.fromDescription();
        const toDescription = await this.toDescription();

        return `${fromDescription} ${sep} ${toDescription}`;
    }

    /**
     * String representation of this's from side for GUI
     */
    async fromDescription() {
        let obj = await this.fromFeatureRec();
        if (this.is_from_cable) obj = await obj.followRef('cable');

        return `${obj.properties.name}#${this.from_pins.spec}`;
    }

    /**
     * String representation of this's to side for GUI
     */
    async toDescription() {
        let obj = await this.toFeatureRec();
        if (this.is_to_cable) obj = await obj.followRef('cable');

        return `${obj.properties.name}#${this.to_pins.spec}`;
    }

    //@property
    /**
     * True if self runs from a cable segment
     */
    _is_from_cable() {
        return this.from_feature_type == this.network.segment_type;
    }

    //@property
    /**
     * True if self runs to a cable segment
     */
    _is_to_cable() {
        return this.to_feature_type == this.network.segment_type;
    }

    //@property
    /**
     * True if self connects two cables
     */
    _is_splice() {
        return this.is_from_cable && this.is_to_cable;
    }

    //@property
    /**
     * The feature type that self connects to
     */
    _to_feature_type() {
        return this.to_ref.feature_type;
    }

    //@property
    /**
     * The feature type that self connects to
     */
    _from_feature_type() {
        return this.from_ref.feature_type;
    }

    /**
     * The feature record to which the connection points
     */
    async toFeatureRec() {
        if (this.forward) {
            return this.conn_rec.followRef('out_object');
        } else {
            return this.conn_rec.followRef('in_object');
        }
    }

    /**
     * The feature record from which the connection points
     */
    async fromFeatureRec() {
        if (this.forward) {
            return this.conn_rec.followRef('in_object');
        } else {
            return this.conn_rec.followRef('out_object');
        }
    }

    // ------------------------------------------------------------------------------
    //                                   PIN MAPPING
    // ------------------------------------------------------------------------------

    /**
     * Yields from,to pairs of self
     */
    pinPairs() {
        let to_pin = this.to_pins.low;
        const from_pin_range = this.from_pins.range();
        const pairs = [];

        for (const from_pin of from_pin_range) {
            pairs.push([from_pin, to_pin]);
            to_pin += 1;
        }

        return pairs;
    }

    /**
     * The pins that FROM_PINS connect to
     *
     * Assumes FROM_PINS is within range
     */
    toPinsFor(from_pins) {
        return new PinRange(
            this.to_pins.side,
            this.toPinFor(from_pins.low),
            this.toPinFor(from_pins.high)
        );
    }

    /**
     * The pin that FROM_PIN connects to
     *
     * Assumes FROM_PIN is within range
     */
    toPinFor(from_pin) {
        return this.to_pins.low + (from_pin - this.from_pins.low);
    }

    /**
     * The pin that TO_PIN connects to
     *
     * Assumes TO_PIN is within range
     */
    fromPinFor(to_pin) {
        return this.from_pins.low + (to_pin - this.to_pins.low);
    }

    // ------------------------------------------------------------------------------
    //                                   SERIALISATION
    // ------------------------------------------------------------------------------

    /**
     * Self in JSON-serialisable form
     */
    async definition() {
        const defn = {};

        defn['urn'] = this.conn_rec.getUrn();
        defn['forward'] = this.forward;
        defn['from_feature'] = this.from_ref.urn();
        defn['from_pins'] = this.from_pins.definition();
        defn['to_feature'] = this.to_ref.urn();
        defn['to_pins'] = this.to_pins.definition();

        // For cable segments, add cable
        if (this.is_from_cable) {
            const from_rec = await this.fromFeatureRec();
            defn['from_cable'] = from_rec.properties.cable;
            defn['from_cable_side'] = this.from_pins.otherSide();
        }

        if (this.is_to_cable) {
            const to_rec = await this.toFeatureRec();
            defn['to_cable'] = to_rec.properties.cable;
            defn['to_cable_side'] = this.to_pins.otherSide();
        }

        // get delta owner description for displaying proposed objects
        // ENH: this is duplicated from myw_feature_model_mixin
        const delta = this.db_view.delta;
        if (delta) {
            const delta_owner = await this.db_view.get(delta);
            defn['delta'] = { name: delta, title: delta_owner.myw.title };
        }

        return defn;
    }

    /**
     * The features referenced in self
     *
     * Returns a set of features
     */
    features() {
        const features = set(); // eslint-disable-line

        features.add(this.fromFeatureRec());
        features.add(this.toFeatureRec());

        // For cable segments, add cable
        if (this.is_from_cable) {
            features.add(this.fromFeatureRec()._field('cable').rec());
        }

        if (this.is_to_cable) {
            features.add(this.toFeatureRec()._field('cable').rec());
        }

        return features;
    }
}

Object.defineProperty(Conn.prototype, 'spec', {
    get() {
        return this._spec();
    }
});

Object.defineProperty(Conn.prototype, 'is_from_cable', {
    get() {
        return this._is_from_cable();
    }
});

Object.defineProperty(Conn.prototype, 'is_to_cable', {
    get() {
        return this._is_to_cable();
    }
});

Object.defineProperty(Conn.prototype, 'is_splice', {
    get() {
        return this._is_splice();
    }
});

Object.defineProperty(Conn.prototype, 'to_feature_type', {
    get() {
        return this._to_feature_type();
    }
});

Object.defineProperty(Conn.prototype, 'from_feature_type', {
    get() {
        return this._from_feature_type();
    }
});

export default Conn;
