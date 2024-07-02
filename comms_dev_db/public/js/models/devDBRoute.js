import myw from 'myWorld-client';
import Route from 'modules/comms/js/models/route';
import FeatureModelLoaderPlugin from 'modules/comms/js/models/featureModelLoaderPlugin';

myw.geometry.init();

class DevDBRoute extends Route {
    // Calculated length of route (in m)
    // TODO: Rename as geomLength
    geomLengthStr() {
        return this.geometry.length();
    }
}

// Apply to all route types
FeatureModelLoaderPlugin.prototype.categories['route'].model = DevDBRoute;

export default DevDBRoute;
