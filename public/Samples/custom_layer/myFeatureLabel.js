// Copyright (c) 2010-2025 IQGeo Group Plc. Use subject to conditions at $MYWORLD_HOME/Docs/legal.txt
import myw from 'myWorld-client';

export class MyFeatureLabel extends myw.MywVectorLayer {
    createRepForFeature(feature, ...args) {
        const rep = super.createRepForFeature(feature, ...args);
        if (!rep) return;

        if (!myw.isTouchDevice) rep.bindTooltip(this.getLabelTextFor(feature));

        return rep;
    }

    getLabelTextFor(feature) {
        return `${feature.getTitle()} - ${feature.getProperties().id}`;
    }
}

export default MyFeatureLabel;
