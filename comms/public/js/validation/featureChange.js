// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import FeatureChangeViewer from './featureChangeViewer';

const fieldViewerMapping = {
    reference: myw.ReferenceFieldViewer,
    foreign_key: myw.ReferenceFieldViewer,
    integer: myw.NumberFieldViewer,
    double: myw.NumberFieldViewer,
    numeric: myw.NumberFieldViewer,
    default: myw.FieldViewer
};
export default class FeatureChange extends myw.Feature {
    static {
        this.prototype.messageGroup = 'FeatureChange';
        this.prototype.viewerClass = FeatureChangeViewer;
    }

    /**
     * @param {myWorldFeature} feature
     * @param {myWorldFeature} base Feature from base
     * @param {String} changeType Insert, update, delete or rebase
     * @param {Array} changedFields Fields changed in FEATURE
     */
    constructor(feature, base, changeType, changedFields) {
        super(feature);
        this.feature = feature;
        this.base = base;

        // Add change info
        this.changeType = changeType;
        this.changedFields = changedFields || [];

        this.datasource = feature.datasource;
        this.app = myw.app;
    }

    /**
     * Augments passed feature with class methods
     * @returns augmented feature
     */
    augmentFeature(feature) {
        feature.getResultsHoverText = this.getResultsHoverText.bind(this);
        feature.getResultsHtmlDescription = this.getResultsHtmlDescription.bind(this);
        feature._infoStr = this._infoStr.bind(this);
        feature.validationFeatureType = 'featureChange';
        if (this.changeType == 'update') {
            feature.viewerClass = FeatureChangeViewer;
        }

        feature.messageGroup = 'FeatureChange';
        feature.changeType = this.changeType;
        if (this.base) feature.base = this.augmentBaseFeature(this.base);

        feature.changedFields = this.changedFields;
        return feature;
    }

    /**
     * Set custom draw styles on 'feature' (so that the highlight on change is a different color)
     * Also changes URN (required to make map rendering work)
     */
    augmentBaseFeature(feature) {
        //Set urn to ensure it is not the same as feature
        feature.getUrn = () => {
            return `original_feature_${this.changeType}_${this.getUrn()}`;
        };

        //Set styles
        const styles = myw.config['mywcom.conflictStyles'];
        feature.getCurrentFeatureStyleDef = map => {
            const styleManager = new myw.StyleManager(map.getView());
            const currentFeature = this.app.currentFeature;
            const styleSpec = this._getStyleSpec(currentFeature);
            let style;

            if (currentFeature.getGeometryType() == 'Point') {
                style = new myw.SymbolStyle({
                    symbol: 'circle',
                    size: '35',
                    sizeUnit: 'px',
                    borderColor: styles.change.color
                });
            } else if (currentFeature.getGeometryType() == 'LineString') {
                style = styleManager.getLineStyle(styleSpec.line_style, styles.change.opacity);
                style.width = Math.max(style.width * 1.25, 8);
                style.color = styles.change.color;
            }
            style.opacity = styles.change.opacity;

            return { normal: style, highlight: style };
        };
        return feature;
    }

    getTitle() {
        return this.feature.getTitle();
    }

    getShortDescription() {
        var shortDesc = `${this.msg(this.changeType)}`;

        if (this.changeType == 'update') {
            if (this.changedFields.length == 1) {
                shortDesc = `${this.msg(this.changeType)}: ${this.msg('changed_field')}: ${
                    this.feature.getFieldDD(this.changedFields[0]).external_name
                }`;
            } else {
                shortDesc = `${this.msg(this.changeType)}: ${this.msg('changed_fields')}: ${
                    this.changedFields.length
                }`;
            }
        }

        shortDesc = `${shortDesc}`;
        if (this.properties.myw_change_user && this.properties.myw_change_time) {
            shortDesc = `${shortDesc} User: ${
                this.properties.myw_change_user
            } Date: ${this.properties.myw_change_time.toLocaleString()}`;
        }

        return shortDesc;
    }

    getResultsHoverText() {
        return this._infoStr(this.changeType, this.changedFields);
    }

    /**
     * Creates a string to nicely display changed fields (taking into account photo, geometry and long string fields)
     * @param {string} recType
     * @param {string} changeType
     * @param {Array} fields
     * @returns
     */
    _infoStr(changeType, fields, conflictFields = []) {
        let info = `Change: ${this.msg(changeType)}`;
        info += '\n';

        if (changeType == 'update') {
            fields?.forEach(fieldName => {
                const field = this.feature.getFieldDD(fieldName);
                const fieldValueStr = this._getStringForFieldValue(this.feature, field);
                const conflictingFieldStr = conflictFields.includes(fieldName) ? '*' : ' ';

                info += `   ${conflictingFieldStr} ${field.external_name}: ${fieldValueStr}`;
                info += '\n';
            });
        }
        return info;
    }

    /**
     * Returns display formatted string of value in field of feature (taking into account photo fields, long strings and geometry fields)
     * @param {MyWorldFeature} feature
     * @param {string} field
     * @private
     */
    _getStringForFieldValue(feature, field) {
        const geometryFieldNames = feature.getGeometryFieldNamesInWorld('geo');
        const isGeometryField = geometryFieldNames.includes(field.internal_name);

        //Geometry field: return type of geom and length of coords
        if (isGeometryField) {
            const geometry = feature.getGeometry(field.internal_name);
            return this._getGeometryString(geometry);
        }

        let fieldValue = feature.properties[field.internal_name];
        if (!fieldValue) return this.msg('null');

        const fieldType = field.type.split('(')[0];

        //Return internal value for feature ENH: Return external value
        //See the core referenceFieldViewer convertValue method
        if (fieldType == 'reference' || fieldType == 'foreign_key') {
            return fieldValue;
        }

        //Convert using fieldViewer if possible
        const viewerClass = fieldViewerMapping[fieldType] || fieldViewerMapping.default;
        const fieldViewer = new viewerClass(this, feature, field);
        fieldValue = fieldViewer.convertValue(fieldValue);

        //Photo field: return type of image
        if (field.type.includes('image')) {
            return field.type;
        }

        let fieldValueStr = fieldValue.toString();

        //Long string: truncate
        if (fieldValueStr.length > 50) {
            fieldValueStr = fieldValueStr.substring(0, 50);
            fieldValueStr += '...';
        }

        return fieldValueStr;
    }

    _getGeometryString(geometry) {
        return `${geometry.type}(${geometry.flatCoordinates().length})`;
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
