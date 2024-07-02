import Equipment from 'modules/comms/js/models/equipment';
import FeatureModelLoaderPlugin from 'modules/comms/js/models/featureModelLoaderPlugin';

class DevDBEquipment extends Equipment {
    // Overwritten because DevDB auto-populates name field
    readonlyFields() {
        const fields = super.readonlyFields();

        // ENH: Replace by DevDB config of field 'readonly' property ... or get from name engine
        const userNamedObjects = ['floor', 'room', 'rack'];
        if (userNamedObjects.includes(this.getType())) return fields;

        return fields.concat(['name']);
    }
}

// Apply to all equipment types
FeatureModelLoaderPlugin.prototype.categories['equipment'].model = DevDBEquipment;

export default DevDBEquipment;
