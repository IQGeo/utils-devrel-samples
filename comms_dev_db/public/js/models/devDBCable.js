import Cable from 'modules/comms/js/models/cable';
import FeatureModelLoaderPlugin from 'modules/comms/js/models/featureModelLoaderPlugin';

class DevDBCable extends Cable {
    // Subclassed because DevDB auto-populates name field
    readonlyFields() {
        const fields = super.readonlyFields();

        return fields.concat(['name']);
    }
}

// Apply to all cable types
FeatureModelLoaderPlugin.prototype.categories['cable'].model = DevDBCable;

export default DevDBCable;
