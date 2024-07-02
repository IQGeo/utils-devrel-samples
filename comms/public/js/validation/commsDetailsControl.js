import myw from 'myWorld-client';
import CommsEditButton from '../base/commsEditButton';

/**
 * Override _getViewerFor method on details control to allow multiple viewer classes on same featureType
 * Required for change and conflict features of the same type
 */
const commsDetailsControl = {
    /*
     * Returns a feature viewer appropriate for the given feature
     * Caches instances of the different viewer classes if not a change or conflict feature
     * @param  {Feature} feature
     * @return {FeatureViewer}
     */
    _getViewerFor(feature) {
        if (feature.viewerClass) {
            const type = feature.getType();

            //if isChangeOrConflictFeature need to disable cache of viewers
            const isChangeOrConflictFeature = !!(
                feature.changedFields ||
                feature.deltaFields ||
                feature.masterFields
            );
            if (!this._viewers) this._viewers = {};

            if (!this._viewers[type] || isChangeOrConflictFeature) {
                this._viewers[type] = new feature.viewerClass(this, {
                    state: this.options.viewersState
                });
            }
            return this._viewers[type];
        } else {
            if (!this._defaultViewer) {
                const viewerOptions = { state: this.options.viewersState };
                this._defaultViewer = new this.options.DefaultFeatureViewer(this, viewerOptions);
            }
            return this._defaultViewer;
        }
    },

    buttons: {
        ...myw.DetailsControl.prototype.buttons,
        edit: CommsEditButton
    }
};

Object.assign(myw.DetailsControl.prototype, commsDetailsControl);
