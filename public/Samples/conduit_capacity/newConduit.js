import myw from 'myWorld-client';
import Conduit from 'modules/comms/js/models/conduit';

export default class NewConduit extends Conduit {

    async capacity_summary() {
        const diameter = this.properties.diameter;
        if (!diameter) return null;

        const cables = await this.cables();
        if (!cables || cables.length === 0) return 0;

        const cableDiameters = cables
            .map(c => c.properties?.diameter)
            .filter(Boolean);

        if (cableDiameters.length === 0) return 0;

        const ratio = cableDiameters.reduce((sum, d) => sum + d ** 2, 0) / (diameter ** 2);
        console.log(ratio);
        return (ratio * 100).toFixed(1);
    }
}

myw.featureModels['conduit'] = NewConduit;
