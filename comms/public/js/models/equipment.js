// Copyright: IQGeo Limited 2010-2023
import myw, { Predicate } from 'myWorld-client';
import EquipmentEditor from './equipmentEditor';
import NetworkFeature from './networkFeature';

export default class Equipment extends NetworkFeature {
    static {
        this.prototype.editorClass = EquipmentEditor;
    }

    /**
     * Fields that cannot be changed in editor
     */
    readonlyFields() {
        return ['housing', 'root_housing'];
    }

    /**
     * Returns tech associated with equipment
     */
    definedTech() {
        const cfg = myw.config['mywcom.equipment'];

        if (cfg) return cfg[this.type].tech;
        return null;
    }

    /**
     * Returns cables connected to self
     */
    async cables() {
        return this.datasource.comms.cablesConnectedTo(this);
    }

    /**
     * Called after feature is inserted from GUI
     */
    async posInsert(featureJson, app) {
        await super.posInsert(featureJson, app);
        this.equipmentManager(app).fireFeatureEvents('insert', this.type);

        // If adding assembly, add sub equipment
        // ENH: Duplicated with structure model. Delagate to equipment manager
        // TODO: Perform in same transaction as equipment insert
        if (!featureJson.equipment) return;

        return Promise.all(
            featureJson.equipment.map(async equip => {
                const newEquipId = await this.datasource.comms.insertFeature(equip.feature_type, {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: this.geometry.coordinates },
                    properties: Object.assign({}, equip.properties, {
                        housing: this.getUrn(),
                        root_housing: this.properties.root_housing
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
        this.equipmentManager(app).fireFeatureEvents('update', this.type);

        // update related data blocks
        if ('mywcom_data_block' in this.datasource.appEditableFeatureTypes) {
            const blocks = await this.getRelatedDataBlocks(this.getUrn());
            const equip_prop_string = JSON.stringify(this.properties);
            blocks.forEach(async block => {
                block.properties['equipment_properties'] = equip_prop_string;
                block.secondary_geometries = {}; // required for comms.updateFeature
                await this.datasource.comms.updateFeature(block);
                this.equipmentManager(app).fireFeatureEvents('update', block.type);
            });
        }

        return;
    }

    async posDelete(app) {
        await super.posDelete(app);
        this.equipmentManager(app).fireFeatureEvents('delete', this.type);

        // delete related data blocks
        if ('mywcom_data_block' in this.datasource.appEditableFeatureTypes) {
            const blocks = await this.getRelatedDataBlocks(this.getUrn());
            blocks.forEach(async block => {
                await this.datasource.comms.deleteFeature(block);
                this.equipmentManager(app).fireFeatureEvents('delete', block.type);
            });
        }

        return;
    }

    async getRelatedDataBlocks(equipmentUrn) {
        const predicate = Predicate.eq('referenced_feature', equipmentUrn);
        const blocks = await this.datasource.getFeatures('mywcom_data_block', { predicate });
        return blocks;
    }
}
