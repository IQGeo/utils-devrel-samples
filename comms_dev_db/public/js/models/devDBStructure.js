import Structure from 'modules/comms/js/models/structure';
import FeatureModelLoaderPlugin from 'modules/comms/js/models/featureModelLoaderPlugin';

class DevDBStructure extends Structure {
    // Overwritten because DevDB auto-populates name field
    readonlyFields() {
        const fields = super.readonlyFields();
        const managedTypes = ['cabinet', 'manhole', 'pole', 'drop_point']; // ENH: Get from name manager

        if (!managedTypes.includes(this.getType())) return fields;

        return fields.concat(['name']);
    }

    // Calculated field returning structure route to 'exchange'
    pathToHub() {
        return this.datasource.shortestPath(
            'mywcom_routes',
            this,
            'building/1', //TODO: Get Hub based on self's name or service area
            { resultFeatureTypes: ['ug_route', 'oh_route'], resultType: 'tree' }
        );
    }
}

// Apply to all structure types
FeatureModelLoaderPlugin.prototype.categories['structure'].model = DevDBStructure;

export default DevDBStructure;
