// Copyright (c) 2010-2025 IQGeo Group Plc. Use subject to conditions at $MYWORLD_HOME/Docs/legal.txt
import myw from 'myWorld-client';

export class MywAddressLabel extends myw.MywVectorLayer {
    createRepForFeature(feature, ...args) {
        const rep = super.createRepForFeature(feature, ...args);
        if (!rep) return;

        if (!myw.isTouchDevice) rep.bindTooltip(this.getLabelTextFor(feature));

        return rep;
    }

    getLabelTextFor(feature) {
        return 'XYZ';
    }
}

export default MywAddressLabel;
