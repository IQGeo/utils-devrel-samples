// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class EquipmentManagerPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'EquipmentManager';
    }

    /**
     * @class Provides API for maintaining equipment
     *
     * Called from palette. Provides functions for manipulating assemblies etc
     *
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
    }

    fireFeatureEvents(aspect, type) {
        this.app.fire('featureCollection-modified', { featureType: type });
    }

    /*
     *  Move 'equip' and it children to 'housing'
     */
    async moveAssembly(equip, housing) {
        await this.ds.comms.moveAssembly(equip, housing);
        return equip.posUpdate(equip, this.app);
    }

    /*
     *  Copy 'equip' and it children to 'housing'
     */
    async copyAssembly(equip, housing) {
        const newFeatureJson = await this.ds.comms.copyAssembly(equip, housing);

        // Only run the trigger on the top-level object.
        const newFeature = await this.ds.createDetachedFromJson(equip.type, newFeatureJson);
        newFeature.id = newFeatureJson.id;
        return newFeature.posInsert(newFeature, this.app);
    }

    /**
     * Returns connections of 'housing' and its contained equipment
     */
    async connectionsIn(housing, connections = []) {
        connections.push(...(await this.connectionsOf(housing)));

        if ('equipment' in housing.featureDD.fields) {
            let equips = await housing.followRelationship('equipment');
            await myw.Util.each(equips, equip => this.connectionsIn(equip, connections));
        }

        return connections;
    }

    /*
     * Returns all connections for 'housing'
     */
    // ENH: Use housing field
    // ENH: When splice model changed, rename housing -> equip
    // ENH: Delegate to connections manager
    async connectionsOf(housing) {
        const features = [];

        if ('fiber_connections' in housing.featureDD.fields) {
            features.push(...(await housing.followRelationship('fiber_connections')));
        }
        if ('fiber_splices' in housing.featureDD.fields) {
            features.push(...(await housing.followRelationship('fiber_splices')));
        }

        return features;
    }
}
