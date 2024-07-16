// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

export default class CommsEditButton extends myw.EditButton {
    /**
     * Overriding this button so that we can call await on isEditable on the feature.
     * Current the async only used for designs but it could be used for more.
     *
     * @override
     */
    async render() {
        const feature = this.app.currentFeature;
        const active =
            feature &&
            (await feature.isEditable()) &&
            !this.owner.editor &&
            this.app.isFeatureEditable(feature.type, feature);
        this.setActive(active);
    }
}
