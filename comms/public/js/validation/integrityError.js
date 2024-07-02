// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import FeatureChange from './featureChange';
import IntegrityErrorViewer from './integrityErrorViewer';

export default class IntegrityError extends FeatureChange {
    static {
        this.prototype.messageGroup = 'IntegrityError';
    }

    /**
     * @param {myWorldFeature} feature
     * @param {myWorldFeature} referencedFeatures by field
     * @param {String} featureName =integrity+error
     * @param {Array} errorItems contains information about the errors
     */
    constructor(feature, refFeatures, featureName, errorItems = {}) {
        super(feature);
        this.feature = feature;
        this.refFeatures = refFeatures;

        // Add change info
        this.changeType = featureName;
        this.errorItems = errorItems;
        this.changedFields = Object.keys(errorItems);
        this.errorTypes = Object.values(errorItems).map(item => item.type);

        this.datasource = feature.datasource;
        this.app = myw.app;

        //Ensure the type is unique
        this.type = `feature_change_${this.changeType}_${this.feature.getType()}`;
    }

    /**
     * Augments passed feature with class methods
     * @returns augmented feature
     */
    augmentFeature(feature) {
        feature.getResultsHoverText = this.getResultsHoverText.bind(this);
        feature.getResultsHtmlDescription = this.getResultsHtmlDescription.bind(this);
        feature._infoStr = this._infoStr.bind(this);
        feature._getErrorTitle = this._getErrorTitle.bind(this);
        feature.viewerClass = IntegrityErrorViewer;
        feature.messageGroup = 'FeatureChange';
        feature.changeType = this.changeType;
        feature.errorTypes = this.errorTypes;
        feature.errorItems = this.errorItems;
        feature.validationFeatureType = 'integrityError';
        if (Object.keys(this.refFeatures).length) {
            for (const refFeatureKey in this.refFeatures) {
                this.augmentRefFeature(this.refFeatures[refFeatureKey]);
            }
            feature.refFeatures = this.refFeatures;
        }

        feature.changedFields = this.changedFields;
        return feature;
    }

    /**
     * Augments 'feature' so that we can set custom styles on it
     * Changes URN to ensure it is different from this.feature (as will otherwise cause problems when hiding feature rep)
     * @param {myWorldFeature} base
     * @returns augmented feature
     */
    augmentRefFeature(feature) {
        //Set urn to ensure it is not the same as feature
        feature.getUrn = () => {
            return `original_feature_${this.changeType}_${this.getUrn()}`;
        };

        //Set styles
        const styles = myw.config['mywcom.conflictStyles'];
        feature.getCurrentFeatureStyleDef = map => {
            const styleManager = new myw.StyleManager(map.getView());
            const currentFeature = this.app.currentFeature;
            const geomFieldName = currentFeature.getGeometryFieldNameForWorld('geo'); //always showing primary geometry
            const refFeature = currentFeature.refFeatures[geomFieldName];
            const styleSpec = this._getStyleSpec(refFeature);
            let style;

            if (refFeature.getGeometryType() == 'Point') {
                style = new myw.SymbolStyle({
                    symbol: 'circle',
                    size: '35',
                    sizeUnit: 'px',
                    borderColor: styles.conflict.color
                });
            } else if (refFeature.getGeometryType() == 'LineString') {
                style = styleManager.getLineStyle(styleSpec.line_style, styles.conflict.opacity);
                style.width = Math.max(style.width * 1.25, 8);
                style.color = styles.conflict.color;
            }
            style.opacity = styles.conflict.opacity;

            return { normal: style, highlight: style };
        };
        return feature;
    }

    /**
     * If one error, returns error title, else returns number of errors
     * @returns {String}
     */
    getShortDescription() {
        const errorKeys = Object.keys(this.uniqueErrorItems());
        if (errorKeys.length == 1) {
            return `${this.msg('integrity_error')}: ${this._getErrorTitle(
                this.errorItems[errorKeys[0]],
                this.changedFields[0]
            )}`;
        } else {
            return `${this.msg('integrity_error')}: ${this.msg('number_of_errors')}: ${
                errorKeys.length
            }`;
        }
    }

    /**
     * Gets unique errors from this.errorItems
     * Compares data and type
     */
    uniqueErrorItems() {
        const errors = {};
        const errorArray = Object.values(this.errorItems);
        const result = {};
        for (const item of errorArray) {
            const key = item.type + this._composeMsgFromError(item.data);
            if (key in result) continue;
            result[key] = item;
            errors[item.field] = item;
        }
        return errors;
    }

    /**
     * Creates a string to nicely display changed fields (taking into account photo, geometry and long string fields)
     * Overriden in integrityError to display error message
     * @param {string} recType
     * @param {string} changeType
     * @param {Array} fields
     * @returns
     */
    _infoStr(errorType, fields) {
        let info = '';
        const errors = this.uniqueErrorItems();

        fields?.forEach((fieldName, i) => {
            const isGeometryField = this.feature
                .getGeometryFieldNamesInWorld('geo')
                .includes(fieldName);
            const error = errors[fieldName];
            if (!error) return;

            //Get info str (composing on client side if geometry field)
            info += this._getErrorTitle(error, fieldName);
            if (isGeometryField) {
                info += this._getGeomStrForField(fieldName);
            } else {
                info += this._composeMsgFromError(error.data);
            }
        });

        return info;
    }

    /**
     * Gets error string for FIELDNAME
     * @param {String} fieldName
     * @returns
     */
    _getGeomStrForField(fieldName) {
        let info = '';

        const featureStr = `    ${this.feature.getTitle()}: ${this._getGeometryString(
            this.feature.geometry
        )}`;
        info += featureStr;
        info += '\n';

        if (!this.refFeatures || !this.refFeatures[fieldName]) return info;

        const refFeature = this.refFeatures[fieldName];
        const refFeatureStr = `    ${refFeature.getTitle()}: ${this._getGeometryString(
            refFeature.geometry
        )}`;

        info += refFeatureStr;
        info += '\n';
        return info;
    }

    _getGeometryString(geometry) {
        return `${geometry.type}(${geometry.flatCoordinates().length})`;
    }

    /**
     * Composes error message from props of ERROR
     */
    _composeMsgFromError(error) {
        const strs = [];

        for (const prop in error) {
            const val = error[prop];
            if (prop.startsWith('_')) continue;
            if (prop == 'ref_side' && !val) continue;

            let str = '';
            if (prop == 'referenced_feature') {
                str = `    ${this.refFeature.featureDD.external_name}: ${val}`;
            } else {
                str = `    ${this.msg(prop)}: ${val}`;
            }
            strs.push(str);
        }
        return strs.join('\n') + '\n';
    }

    /**
     * Gets summary title for error tooltip
     * @param {String} errorType
     * @param {Object} error
     * @param {String} field
     * @returns
     */
    _getErrorTitle(error, field) {
        const props = { ...error.data };
        let external_name = '';
        if (field in this.feature.featureDD.fields) {
            external_name = this.feature.getFieldDD(field).external_name;
        }
        props.field = external_name;
        props.referenced_feature = this.refFeatures[field]
            ? this.refFeatures[field].getTitle()
            : '';
        return this.msg(error.type, { ...props }) + '\n';
    }
}
