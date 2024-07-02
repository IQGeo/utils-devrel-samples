// Copyright: IQGeo Limited 2010-2023
import NetworkFeature from './networkFeature';

export default class Connection extends NetworkFeature {
    // Show subtype in title
    getTitle() {
        let title = this._myw.title;

        if (this.properties.splice) {
            title = title.replace('Connection', 'Splice'); // ENH: use messages
        }
        return title;
    }
}
