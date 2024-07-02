import { Plugin, ResultsGridControl } from 'myWorld-client';

const url =
    'http://localhost:82/modules/comms/api/v1/resourceInventoryManagement/resource/fiber_cable?limit=5';

export default class ShowObjectsRESTPlugin extends Plugin {
    constructor(owner, options) {
        super(owner, options);
        this.owner = owner;
        this.options = options;
    }

    getObjectsFromRESTAPI() {
        this.app.database.getFeatures('fiber_cable').then(result => {
            console.log(result);
        });

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    console.log('!response.ok :(');
                }
                return response.json();
            })
            .then(data => {
                console.log(data.features);
                // this.app.setCurrentFeatureSet(data.features);
            })
            .catch(error => {
                console.log(':( error = ' + error);
            });
    }
}
