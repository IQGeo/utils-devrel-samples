import myw from 'myWorld-client';
import Conduit from 'modules/comms/js/models/conduit';

class DevDBConduit extends Conduit {
    // Subclassed because DevDB auto-populates name field
    readonlyFields() {
        const fields = super.readonlyFields();

        return fields.concat(['name']);
    }
}

// Note: For continuous conduits we allow user to specify name
myw.featureModels['conduit'] = DevDBConduit;

export default DevDBConduit;
