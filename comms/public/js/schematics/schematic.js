// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Transform from '../base/transform';
import SchematicMode from './schematicMode';

export default class Schematic extends myw.Class {
    static {
        this.include(myw.Events);
    }

    // ------------------------------------------------------------------------
    //                                 CONSTRUCTION
    // ------------------------------------------------------------------------
    /**
     * Names of layers holding custom styles for self (in order)
     */
    styleLayerNames() {
        return ['mywcom_schematic'];
    }

    /**
     * Transform from grid space to long-lat degrees
     */
    getTransform(layoutOpts) {
        const degToM = 0.000005; // nominal metre -> degree
        return new Transform().scale(degToM);
    }

    /**
     * Layout options (a list of option defs)
     */
    getOptionDefs() {
        return [];
    }

    /**
     * Data of 'features' from which self can be built (if any)
     */
    getBuildData(features) {
        return;
    }

    /**
     * String to show in trace messages
     */
    toString() {
        return this.constructor.name;
    }

    // ------------------------------------------------------------------------
    //                                 INTERACTION
    // ------------------------------------------------------------------------

    /**
     * Called after self has been displayed in 'view' (a SchematicControl)
     */
    activate(view) {
        const mode = new SchematicMode(view.map, view, this, view.options.autoPan);
        view.map.setInteractionMode(mode);
    }

    /**
     * Called before self is removed from 'view' (a SchematicControl)
     */
    deactivate(view) {
        view.map.endCurrentInteractionMode();
    }
}
