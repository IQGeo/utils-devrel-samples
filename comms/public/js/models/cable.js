// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import CableEditor from './cableEditor';
import NetworkFeature from './networkFeature';

export default class Cable extends NetworkFeature {
    static {
        this.prototype.editorClass = CableEditor;
    }

    // Highlight style
    getCurrentFeatureStyleDef(map) {
        const normalStyle = new myw.LineStyle({
            color: 'blue',
            width: 4,
            lineStyle: 'arrowed',
            opacity: 0.5
        });

        const highlightStyle = new myw.LineStyle({
            color: 'red',
            width: 4,
            lineStyle: 'arrowed',
            opacity: 0.75
        });

        return { normal: normalStyle, highlight: highlightStyle };
    }

    // Returns associated tech of the cable
    definedTech() {
        const cfg = myw.config['mywcom.cables'];

        if (cfg) return cfg[this.type].tech;
        return null;
    }

    // Triggers
    // --------
    async posInsert(featureJson, app) {
        await super.posInsert(featureJson, app);
        this.cableManager(app).fireFeatureEvents('insert');
    }

    async posUpdate(preUpdateGeoJson, app) {
        await super.posUpdate(preUpdateGeoJson, app);
        return this.cableManager(app).fireFeatureEvents('update');
    }

    async posDelete(app) {
        await super.posDelete(app);
        return this.cableManager(app).fireFeatureEvents('delete');
    }

    // Calculated Fields
    // -----------------
    // All connection records
    async connections() {
        return this.cableManager(myw.app).connectionsFor(this, undefined, true);
    }

    // Splice connection records
    async splices() {
        return this.cableManager(myw.app).connectionsFor(this, true, true);
    }

    countField() {
        const techs = ['fiber', 'coax', 'copper'];
        for (const tech of techs) {
            const count_field = `${tech}_count`;
            if (count_field in this.properties) return count_field;
        }
    }

    // Number of 'strands' in the cable
    pinCount() {
        const countField = this.countField();

        if (countField) {
            return this.properties[countField];
        } else {
            return 1;
        }
    }
}
