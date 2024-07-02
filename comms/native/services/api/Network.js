import { MywClass } from 'myWorld-base';
import PinRange from './PinRange';

/**
 * The feature types and field names used for a given network technology
 */
class Network extends MywClass {
    // Defined network types (keyed by name)
    static types = {};

    // Mapping from segment feature type to network
    static segment_types = {};

    // Mapping from connection feature type to network
    static connection_types = {};

    //@classmethod
    static defineTypesFrom(networkTypes) {
        // Can occur when running early upgrade but information is not needed.
        if (!networkTypes) {
            return;
        }

        Object.keys(networkTypes).forEach(name => {
            const props = networkTypes[name];
            if (props) this.defineType(name, props);
        });
    }

    /**
     * Create definition and add to list of known types
     */
    static defineType(name, args) {
        const network = new Network(name, args);

        Network.types[name] = network;
        Network.segment_types[network.segment_type] = network;
        Network.connection_types[network.connection_type] = network;
    }

    /**
     * Init slots of self
     */
    constructor(name, args) {
        super();
        this.name = name;
        this.segment_type = args['segment_type'];
        this.slack_type = args['slack_type'];
        this.connection_type = args['connection_type'];
        this.struct_in_segments_field = args['struct_in_segments_field'];
        this.struct_out_segments_field = args['struct_out_segments_field'];
        this.equip_n_in_pins_field = args['equip_n_in_pins_field'];
        this.equip_n_out_pins_field = args['equip_n_out_pins_field'];
        this.equip_n_pins_field = args['equip_n_pins_field'];
        this.cable_n_pins_field = args['cable_n_pins_field'];
        this.connections_field = args['connections_field'];
        this.splices_field = args['splices_field']; // ENH: Remove need for this
        this.network_name = args['network_name'];

        this.struct_segments_fields = {
            in: this.struct_in_segments_field,
            out: this.struct_out_segments_field
        };
        this.equip_n_pins_fields = {
            in: this.equip_n_in_pins_field,
            out: this.equip_n_out_pins_field
        };
    }

    /**
     * Pins of type SIDE of FEATURE (if any)
     *
     * Returns a PinRange (or None)
     */
    async pinsOn(feature, side) {
        const n_pins = await this.nPinsOn(feature, side);

        if (n_pins) {
            return new PinRange(side, 1, n_pins);
        }

        return undefined;
    }

    /**
     * Number of pins on SIDE of FEATURE (an equip or cable segment)
     */
    async nPinsOn(feature, side) {
        // Case: Equipment with explicit port count
        let field_name = this.equip_n_pins_fields[side];

        // Case: Equipment with implicit port count (for connectors)
        if (!(field_name in feature.properties)) {
            field_name = this.equip_n_pins_field;
        }

        // Case: Cable
        if (!(field_name in feature.properties)) {
            field_name = this.cable_n_pins_field; // For cables
        }

        if (field_name in feature.properties) {
            return feature.properties[field_name];
        }

        // Case: Cable segment
        if (this.isSegment(feature)) {
            const cable = await feature.followRef('cable');
            return cable.properties[field_name];
        }

        return undefined;
    }

    /**
     * True if FEATURE is a cable segment
     */
    isSegment(feature) {
        return feature.getType() == this.segment_type;
    }
}

export default Network;
