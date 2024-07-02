// Copyright: IQGeo Limited 2010-2023
import CommsFeatureEditor from './commsFeatureEditor';

export default class SlackEditor extends CommsFeatureEditor {
    static {
        this.prototype.messageGroup = 'SlackEditor';
    }

    constructor(owner, options) {
        super(owner, options);
        this.cableManager = this.app.plugins['cableManager'];
    }

    async insertFeature(featureJson) {
        let feature = this.feature;

        if (!this.feature.slackDetails) throw new Error(this.msg('slack_insert_error'));

        //run preInsert hook
        await feature.preInsert(featureJson, this.app);

        // get slack seg and side
        const slackDetails = this.feature.slackDetails;

        // create new slack, segment, updated segment chaie, update connections
        const id = await this.cableManager.addSlack(
            feature.getType(),
            featureJson,
            slackDetails.segUrn,
            slackDetails.side
        );
        //get feature from database (gets values updated by database triggers)
        feature = await this.datasource.getFeature(feature.getType(), id);

        //run post insert hook
        await feature.posInsert(featureJson, this.app);
        this.displayMessage(this.msg('created_ok', { title: feature.getTitle() }));
        return feature;
    }
}
