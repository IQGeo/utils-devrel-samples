// Copyright: IQGeo Limited 2010-2023
import RouteEditor from './routeEditor';
import NetworkFeature from './networkFeature';

export default class Route extends NetworkFeature {
    static {
        this.prototype.editorClass = RouteEditor;
    }

    // Fields that cannot be changed in editor
    readonlyFields() {
        return ['in_structure', 'out_structure'];
    }

    // Called after feature inserted
    async posInsert(featureJson, app) {
        await super.posInsert(featureJson, app);
        await this.structureManager(app).fireFeatureEvents('insert', this.getType());
    }

    // Called after feature updated
    async posUpdate(preUpdateGeoJson, app) {
        await super.posUpdate(preUpdateGeoJson, app);
        await this.structureManager(app).fireFeatureEvents('update', this.getType());
    }

    // Called after feature deleted
    async posDelete(app) {
        await super.posDelete(app);
        await this.structureManager(app).fireFeatureEvents('delete', this.getType());
    }

    // Cables under self
    async allCables() {
        return this.datasource.cablesIn(this);
    }

    // Cables directly inside self
    async cables() {
        return this.datasource.comms.cablesOf(this);
    }
}
