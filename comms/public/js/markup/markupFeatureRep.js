// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
export default class MarkupFeatureRep extends myw.FeatureRepresentation {
    /**
     * Refreshes the representation with the details from an updated feature
     * @param  {Feature} feature Updated feature
     * @override Subclassed to always update regardless of change. For some reason markup feature
     * are not being redrawn after move to new position. As there aren't many markup features on the map redrawing
     * every time is ok.
     */
    update(feature) {
        if (feature) this.feature = feature;

        const tempFeature = this._vectorSource.getFormat().readFeature({
            type: 'Feature',
            geometry: feature.getGeometry(this.geometryFieldName)
        });
        this._olFeature.setGeometry(tempFeature.getGeometry());
        this._olFeature.setProperties(feature.properties);

        this._updateStyle();
    }
}
