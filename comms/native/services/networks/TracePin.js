//###############################################################################
// Comms Fiber Trace Node
//###############################################################################
// Copyright: IQGeo Limited 2010-2023

//import OrderedDict from 'collections'
//import {MywError} from 'myWorld-native-services'
//import {MywTraceNode} from 'myWorld-native-services'

import { MywClass } from 'myWorld-base';

/**
 * A pin within a pin trace node
 *
 * Used for modelling paths
 */
class TracePin extends MywClass {
    /**
     * Init slots of self
     *
     * NODE is a PinTraceNode
     */
    constructor(node, pin) {
        super();
        this.node = node;
        this.pin = pin;
    }

    /**
     * JSON-serialisable form of self
     */
    async definition(full = false) {
        let feature = this.node.feature;
        let type = '';
        let desc = '';

        if (this.node.type == 'segment') {
            type = 'cable';
            feature = await feature.followRef('cable');
            desc = `${feature.properties.name}#${this.pin}`;
        } else {
            type = 'port';
            desc = `${feature.properties.name}#${this.node.pins.side.toUpperCase()}:${this.pin}`;
        }

        const defn = {
            type: type,
            id: await this.text(),
            feature: this.node.feature.getUrn(),
            title: feature.myw.title,
            desc: desc,
            side: this.node.pins.side,
            pin: this.pin
        };

        if (full) {
            defn['coords'] = this.node.coordsFromRoot();
        }

        return defn;
    }

    /**
     * String representation of self for trace tree
     */
    async text() {
        let name = '';

        if (this.node.type == 'segment') {
            const feature = await this.node.feature.followRef('cable');
            name = feature.properties.name;
        } else {
            name = this.node.feature.properties.name;
        }

        return `${name}#${this.node.pins.side}:${this.pin}`;
    }
}

export default TracePin;
