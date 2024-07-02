// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import NetworkFeature from './networkFeature';
import CircuitEditor from './circuitEditor';

export default class Circuit extends NetworkFeature {
    static {
        this.prototype.editorClass = CircuitEditor;
    }

    /**
     * Fields that cannot be changed in editor
     */
    readonlyFields() {
        return ['in_feature', 'in_pins', 'out_feature', 'out_pins'];
    }

    /**
     * Override highlight style
     */
    getCurrentFeatureStyleDef(map) {
        const styleManager = new myw.StyleManager(map.getView());
        const highlightSpec = 'red:3:arrowed';
        const normalSpec = 'blue:3:arrowed';
        const highlightStyle = styleManager.getLineStyle(highlightSpec, 0.75);
        const normalStyle = styleManager.getLineStyle(normalSpec, 0.5);

        return { normal: normalStyle, highlight: highlightStyle };
    }

    // Triggers
    // --------
    async posInsert(featureJson, app) {
        await super.posInsert(featureJson, app); // For naming
        await this.circuitManager(app).routeCircuit(this);
    }

    async posUpdate(preUpdateGeoJson, app) {
        await this.circuitManager(app).routeCircuit(this);
    }

    async preDelete(app) {
        await this.circuitManager(app).unrouteCircuit(this);
    }
}
