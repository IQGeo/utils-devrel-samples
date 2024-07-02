// Copyright: IQGeo Limited 2010-2023
import myw, { CurrentReferenceFieldEditor, IconStyle } from 'myWorld-client';
import NetworkFeature from './networkFeature';
import { Buffer } from 'buffer';
import DataBlockStyle from '../styles/dataBlockStyle';

/**
 * Subclassed to add validation for data block references
 */
class DataBlockReferenceFieldEditor extends CurrentReferenceFieldEditor {
    static {
        this.prototype.messageGroup = 'DataBlockReferenceFieldEditor';
    }

    validateValue(value) {
        if (value) {
            const featureType = value.split('/')[0];
            const validFeatureTypes = Object.keys(myw.config['mywcom.dataBlocks']);
            if (!validFeatureTypes.includes(featureType)) {
                return this.msg('invalid_feature_type');
            }
        }
        return true;
    }
}

class DataBlock extends NetworkFeature {
    static {
        this.prototype.customStyleFieldNames = [
            'referenced_feature',
            'equipment_properties',
            'svg'
        ];
        this.prototype.fieldEditors = {
            referenced_feature: DataBlockReferenceFieldEditor
        };
    }

    async svgAsString(iconpath) {
        const response = await fetch(iconpath);
        let svg = '';
        if (response.ok) {
            svg = await response.text();
        }

        return svg;
    }

    getCustomStyles(defaultStyles) {
        // fresh load of the config
        const refFeatureText = this.properties['referenced_feature'];
        const refFeatureType = refFeatureText?.split('/')[0];
        const equipPropsJson = JSON.parse(this.properties['equipment_properties']);
        const featureConfig = myw.config['mywcom.dataBlocks'][refFeatureType];

        // we retrieved the svg in posInsert because we can't be async here
        let svg = this.properties['svg'];

        let normal = defaultStyles.normal.clone();
        if (svg) {
            // replace token with value from reference properties
            for (const token of Object.keys(featureConfig.properties)) {
                const fldName = featureConfig.properties[token];
                const curVal = equipPropsJson[fldName] ? equipPropsJson[fldName] : '';
                svg = svg.replace(`{${token}}`, curVal);
            }

            const crossOrigin = 'anonymous';
            const svgBytes = Buffer.from(svg).toString('base64');
            const iconBase64 = 'data:image/svg+xml;base64,' + svgBytes;

            // call the static parse method on IconStyle to get anchor, size and size unit
            const iconStyle = IconStyle.parse(featureConfig['svg']);
            // add the open layer icon properties
            const dataBlockStyle = new DataBlockStyle({ ...iconStyle, crossOrigin, iconBase64 });
            normal = dataBlockStyle;
        }

        return { normal };
    }

    // ------------------------------------------------------------------------------
    //                                  TRIGGERS
    // ------------------------------------------------------------------------------

    /**
     * OnInsert this override retrieves the config and the svg for rendering
     * @param {*} featureJson
     * @param {*} app
     */
    async posInsert(featureJson, app) {
        await super.posInsert(featureJson, app);

        // get svg async
        const refFeatureText = this.properties['referenced_feature'];
        const featureType = refFeatureText.split('/')[0];
        let defStr = myw.config['mywcom.dataBlocks'][featureType].svg;
        const dataBlockStyle = DataBlockStyle.parse(defStr);
        const svg = await this.svgAsString(dataBlockStyle.iconUrl);

        // get equipment properties
        const refFeature = await this.followReference('referenced_feature');

        this.properties['svg'] = svg;
        this.properties['equipment_properties'] = JSON.stringify(refFeature.properties);
        this.secondary_geometries = {}; // required for comms.updateFeature

        await this.datasource.comms.updateFeature(this);
    }
}

myw.featureModels['mywcom_data_block'] = DataBlock;

export default DataBlock;
