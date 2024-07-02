// Copyright: IQGeo Limited 2010-2023
import _ from 'underscore';
import NetworkFeature from './networkFeature';
import StructureFeatureEditor from './structureEditor';

export default class Structure extends NetworkFeature {
    static {
        this.prototype.editorClass = StructureFeatureEditor;
    }

    async posInsert(featureJson, app) {
        await super.posInsert(featureJson, app);
        await this.structureManager(app).fireFeatureEvents('insert', this.getType());

        // If placing an assembly, add equipment
        // ENH: Delegate to equipment manager
        // TODO: Perform in same transaction as structure insert
        if (!featureJson.equipment) return;

        return Promise.all(
            featureJson.equipment.map(async equip => {
                const newEquipId = await this.datasource.comms.insertFeature(equip.feature_type, {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: this.geometry.coordinates },
                    properties: Object.assign({}, equip.properties, {
                        housing: this.getUrn(),
                        root_housing: this.getUrn()
                    })
                });
                const insertedEquip = await this.datasource.getFeature(
                    equip.feature_type,
                    newEquipId
                );
                return insertedEquip.posInsert(equip, app);
            })
        );
    }

    async posUpdate(preUpdateGeoJson, app) {
        await super.posUpdate(preUpdateGeoJson, app);
        await this.structureManager(app).fireFeatureEvents('update', this.getType());
    }

    async posDelete(app) {
        await super.posDelete(app);
        await this.structureManager(app).fireFeatureEvents('delete', this.getType());
    }

    /**
     * The fiber cable segments that enter self
     */
    async in_fiber_segments() {
        const urn = this.getUrn();

        const queryParams = {
            limit: null,
            clauses: [
                { fieldName: 'out_structure', operator: '=', value: urn },
                { fieldName: 'in_structure', operator: '<>', value: urn }
            ]
        };

        return this.datasource.getFeatures('mywcom_fiber_segment', queryParams);
    }

    /**
     * The fiber cable segments that leave self
     */
    async out_fiber_segments() {
        const urn = this.getUrn();

        const queryParams = {
            limit: null,
            clauses: [
                { fieldName: 'in_structure', operator: '=', value: urn },
                { fieldName: 'out_structure', operator: '<>', value: urn }
            ]
        };

        return this.datasource.getFeatures('mywcom_fiber_segment', queryParams);
    }

    async cables() {
        let segments = [];

        if (this.featureDD.fields['in_fiber_segments']) {
            const inSegments = await this.followRelationship('in_fiber_segments');
            segments = segments.concat(inSegments);
        }

        if (this.featureDD.fields['out_fiber_segments']) {
            const outSegments = await this.followRelationship('out_fiber_segments');
            segments = segments.concat(outSegments);
        }

        const cableUrns = _.uniq(segments.map(segment => segment.properties.cable));

        return this.datasource.getFeaturesByUrn(cableUrns);
    }
}
