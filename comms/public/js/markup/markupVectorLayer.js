// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import TextBoxFeatureRep from './textbox/textBoxFeatureRep';
import MarkupFeatureRep from './markupFeatureRep';

class MarkupVectorLayer extends myw.MywVectorLayer {
    /** Construct layer
     * @param {*} datasource
     * @param {*} options
     * @override Subclassed to setup session variable and custom representation
     */
    constructor(datasource, options) {
        super(datasource, options);

        myw.app.database.setSessionVar('activeDelta', myw.app.getDelta());
        myw.app.on('database-view-changed', this.handleDatabaseViewChanged, this);
    }

    handleDatabaseViewChanged() {
        myw.app.database.setSessionVar('activeDelta', myw.app.getDelta());
    }

    /**
     * Creates and returns a representation for a feature
     * @param  {myw.Feature} feature [description]
     * @param {string} fieldName
     * @return {myw.FeatureRepresentation}
     * @override Subclassed to create appropriate markup feature representation
     */
    createRepForFeature(feature, fieldName) {
        let styles = feature.getCustomStyles();

        // Handles those markup objects with normal style definitions e.g. photos
        if (!styles) {
            styles = this.getStyleFor(feature, fieldName);
        }
        let rep = null;

        if (feature.type == 'iqgapp_markup_text') {
            rep = new TextBoxFeatureRep(feature, {
                eventHandlers: this.eventHandlers,
                styles: styles,
                worldMap: myw.app.map,
                vectorSource: this.vectorSource,
                canvasLayer: this.canvasLayer,
                owner: myw.app.plugins.markupMode
            });
        } else {
            rep = new MarkupFeatureRep(feature, {
                eventHandlers: this.eventHandlers,
                styles: styles,
                worldMap: myw.app.map,
                vectorSource: this.vectorSource,
                canvasLayer: this.canvasLayer,
                owner: myw.app.plugins.markupMode
            });
        }
        return rep;
    }

    /**
     *
     * @param {string} changeType
     * @param {MywFeature} feature
     * @override Subclassed to ensure that if feature is text and inserted then text box editor is shown
     * @returns
     */
    featureModified(changeType, feature) {
        myw.MywVectorLayer.prototype.featureModified.call(this, changeType, feature);
        if (changeType == 'insert' && feature.type == 'iqgapp_markup_text') {
            const reps = this.featureRepresentations[feature.getUrn()];
            reps.map(r => r.ensureEditor());
        }
    }
}
myw.MarkupVectorLayer = MarkupVectorLayer;
export default MarkupVectorLayer;
