// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import FeatureConflictViewer from './featureConflictViewer';

export default class Conflict extends myw.Feature {
    static {
        this.prototype.messageGroup = 'Conflict';
    }

    constructor(delta, master, base, masterChange, masterFields, deltaFields, conflictFields) {
        super();
        this.delta = delta;
        this.base = base;
        this.master = master;
        this.masterChange = masterChange;
        this.masterFields = masterFields || [];
        this.deltaChange = delta.changeType;
        this.deltaFields = deltaFields || [];
        this.conflictFields = conflictFields || [];

        this.feature = delta || base;

        this.datasource = delta.datasource;
        this.app = myw.app;
        // super(this.feature); // TODO: Hack to get goto etc
    }

    /**
     * Augments passed feature with class methods
     * @returns augmented feature
     */
    augmentFeature(feature) {
        feature.getResultsHoverText = this.getResultsHoverText.bind(this);
        feature.getResultsHtmlDescription = this.getResultsHtmlDescription.bind(this);
        feature.viewerClass = FeatureConflictViewer;
        feature.messageGroup = 'FeatureConflict';
        feature.masterChange = this.masterChange;
        feature.masterFields = this.masterFields;
        feature.deltaChange = this.deltaChange;
        feature.deltaFields = this.deltaFields;
        feature.conflictFields = this.conflictFields;
        feature.validationFeatureType = 'conflictFeature';
        if (this.master) feature.master = this.augmentMasterFeature(this.master);
        if (this.delta) feature.delta = this.delta;
        if (this.base) feature.base = this.base;

        return feature;
    }

    /**
     * Set custom draw style on 'feature' (so that the highlight on change is a different color)
     *
     * Also changes URN (required to make map rendering work)
     * @param {myWorldFeature} feature
     * @returns augmented feature
     */
    augmentMasterFeature(feature) {
        //Set urn to ensure it is not the same as feature
        feature.getUrn = () => {
            return `original_feature_${this.masterChange}_${this.getUrn()}`;
        };

        //Set styles
        const styles = myw.config['mywcom.conflictStyles'];

        feature.getCurrentFeatureStyleDef = map => {
            const styleManager = new myw.StyleManager(map.getView());
            const currentFeature = this.app.currentFeature;
            const styleSpec = this._getStyleSpec(currentFeature);
            const geomFieldName = currentFeature.getGeometryFieldNameForWorld('geo');

            let style;

            const isConflictingGeom = this.conflictFields.includes(geomFieldName);
            const color = isConflictingGeom ? styles.conflict.color : styles.change.color;
            if (currentFeature.getGeometryType() == 'Point') {
                style = new myw.SymbolStyle({
                    symbol: 'circle',
                    size: '35',
                    sizeUnit: 'px',
                    borderColor: color
                });
            } else if (currentFeature.getGeometryType() == 'LineString') {
                style = styleManager.getLineStyle(styleSpec.line_style, styles.conflict.opacity);
                style.width = Math.max(style.width * 1.25, 8);
                style.color = color;
            }
            style.opacity = styles.conflict.opacity;

            return { normal: style, highlight: style };
        };
        return feature;
    }

    getTitle() {
        return this.feature.getTitle();
    }

    getResultsHtmlDescription() {
        const title = _.escape(this.feature.getTitle());
        const desc = _.escape(
            `${this.msg('conflict')}: ${this.msg(this.masterChange)} / ${this.msg(
                this.deltaChange
            )}`
        );
        return `${title}</div><div class="result-desc">${desc}</div>`;
    }

    /**
     * Compose string detailing changed fields of master and delta feature
     * Displays when conflict is hovered over in results list
     * @returns {String}
     */
    getResultsHoverText() {
        const masterStr = this._masterInfoStr();
        const deltaStr = this._deltaInfoStr();
        return masterStr + deltaStr;
    }

    /**
     * Get description of changed field of master feature
     * @returns {String}
     */
    _masterInfoStr() {
        const masterStr = this.master
            ? `${this.msg('master')} ${this.master._infoStr(
                  this.masterChange,
                  this.masterFields,
                  this.conflictFields
              )}`
            : `${this.msg('master')} ${this.msg('change')}: ${this.msg(this.masterChange)}\n`; //master delete: need to compose string here
        return masterStr;
    }

    /**
     * Get description of changed field of delta feature
     * @returns {String}
     */
    _deltaInfoStr() {
        const deltaStr = this.delta
            ? `${this.msg('delta')} ${this.delta._infoStr(
                  this.deltaChange,
                  this.deltaFields,
                  this.conflictFields
              )}`
            : '';
        return deltaStr;
    }

    _getStyleSpec(feature) {
        const styleSpecs = [];
        feature.datasource.layerDefs
            .filter(layerDef => layerDef.rendering === 'vector')
            .forEach(layerDef => {
                const styleSpec = layerDef.feature_types.find(
                    featureType =>
                        featureType.name === feature.getType() &&
                        featureType.field_name != 'annotation'
                );
                if (styleSpec) styleSpecs.push(styleSpec);
            });
        return styleSpecs[0];
    }
}
