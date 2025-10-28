import myw from 'myWorld-client';

export default class ConduitCapacityBuilder extends myw.MywClass {
    constructor(database) {
        super();
        this.app = myw.app;
        this.database = database;
        this.datasource = database.getDatasource('myworld');
    }

    async calculateCapacity(conduit) {
        const diameter = conduit.properties.diameter;

        const segData = await this.datasource.getRelationship(conduit, 'cable_segments');
        const segments = segData || [];
        const cableRefs = [...new Set(
            segments.map(s => s.properties.cable).filter(Boolean)
        )];

        const diameters = [];
        const cableFeatures = await Promise.all(
            cableRefs.map(async cref => {
                const id = cref.split('/').pop();
                try {
                    return await this.database.getFeature('fiber_cable', id);
                } catch (err) {
                    console.warn(`Failed to get cable ${cref}:`, err);
                    return null;
                }
            })
        );

        for (const cable of cableFeatures.filter(Boolean)) {
            if (cable.properties?.diameter) diameters.push(cable.properties.diameter);
        }

        const { ratio, limit } = this.calcFillRatio(diameter, diameters);

        let status;
        if (ratio == null) status = 'No diameter data';
        else if (ratio === 0) status = 'EMPTY';
        else if (ratio <= limit) status = 'OK';
        else status = 'OVERFILL';
        return { ratio, limit, status };
    }

    calcFillRatio(conduitDiameter, cableDiameters) {
        if (!conduitDiameter || conduitDiameter === 0) {
            return { ratio: null, limit: null };
        }
        const ratio = cableDiameters.reduce((a, d) => a + d ** 2, 0) / (conduitDiameter ** 2);

        let limit = 1.0;
        if (cableDiameters.length === 1) limit = 0.65;
        else if (cableDiameters.length === 2) limit = 0.31;
        else limit = 0.40;

        return { ratio, limit };
    }
}