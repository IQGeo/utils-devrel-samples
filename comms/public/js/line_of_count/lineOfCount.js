// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import NetworkFeature from '../models/networkFeature';

export default class LineOfCount extends NetworkFeature {
    /**
     * Delete associated section records

     * @param {MywApplication} app 
     * @returns 
     */
    async preDelete(app) {
        super.preDelete(app);
        const sections = await this.followRelationship('loc_sections');

        const transaction = new myw.Transaction(app.database);
        sections.forEach(section => transaction.addDelete(section));
        return this.datasource.runTransaction(transaction);
    }
}
