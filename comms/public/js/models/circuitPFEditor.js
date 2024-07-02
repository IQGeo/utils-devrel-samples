// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import $ from 'jquery';
import commsFeatureEditor from './commsFeatureEditor';

export default class CircuitPFEditor extends commsFeatureEditor {
    static {
        this.prototype.messageGroup = 'CircuitEditor';
    }

    async insertFeature(featureJson) {
        const title = this.msg('pf_confirm_insert_title', {
            feature: this.feature.getTitle()
        });
        const message = this.msg('pf_confirm_insert_message', {
            num_new_connections: this.feature._new_splices
        });
        this._renderConfirmInsert(title, message, featureJson);
    }

    /**
     * Subclassed to call path finder create circuit which will create new connections
     * in path and then create circuit
     * @param {Object} featureJson
     * @returns
     */
    async _confirmedInsert(featureJson) {
        let feature = this.feature;

        //run preInsert hook
        await feature.preInsert(featureJson, this.app);

        const ds = feature.datasource;
        const data = {
            path: JSON.stringify(this.feature._path),
            feature: JSON.stringify({ properties: featureJson.properties }),
            feature_type: this.feature.type
        };

        const raw_record = await ds.comms.createCircuitFromPath(data);
        const features = await this.feature.datasource.asFeatures(raw_record, true, true);
        feature = features[0];

        //run post insert hook
        await feature.posInsert(featureJson, this.app);
        this.displayMessage(this.msg('created_ok', { title: feature.getTitle() }));

        // ENH: Show new conections as well as new circuit
        this.app.setCurrentFeature(feature);
    }

    _renderConfirmInsert(title, message, feature) {
        const self = this;
        const container = document.createElement('div');
        container.innerHTML = message;
        // Show dialog
        new myw.Dialog({
            contents: container,
            destroyOnClose: true,
            title: title,
            buttons: {
                OK: {
                    text: this.msg('ok_btn'),
                    click() {
                        this.close();
                        self._confirmedInsert(feature);
                    }
                },
                Cancel: {
                    text: this.msg('cancel_btn'),
                    class: 'right',
                    click() {
                        this.close();
                        // To reset editor and buttons
                        this.app.setCurrentFeature(self.feature);
                    }
                }
            }
        });
    }
}
