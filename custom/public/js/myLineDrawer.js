import myw from 'myWorld-client';

class MyLineDrawer extends myw.MyWorldFeature {
    static {
        this.prototype.customStyleFieldNames = ['description', 'override_design'];
    }

    getCustomStyles(defaultStyles) {
        if (this.properties.override_design) {
            let normal = defaultStyles.normal;
            normal = normal.clone();
            normal.width = 2;
            normal.color = '#F5A623';
            return { normal };
        }
        return defaultStyles;
    }

    async length() {
        await myw.geometry.init();
        return this.geometry.length();
    }

    async posInsert(origFeatureJson, app) {
        origFeatureJson.properties.line_length = this.geometry.length();
        this.properties.line_length = this.geometry.length();
        await this.database.updateFeature(this);
    }
}

myw.featureModels['line_drawer'] = MyLineDrawer;
