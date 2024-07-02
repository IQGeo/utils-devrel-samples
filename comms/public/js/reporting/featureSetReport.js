// Copyright: IQGeo Limited 2010-2023
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';
import { strCmp } from '../base/strUtils';

export default class FeatureSetReport extends Report {
    static {
        /**
         * @class Report detailing the attributes within the given features
         * Returns a table for each feature type
         */
        this.prototype.messageGroup = 'FeatureSetReport';

        // Customisation hooks
        this.prototype.featureFields = [];

        this.prototype.tableStyle = 'modern'; //Fields of feature to be included in the table,
    }

    static canBuildFor(app, featureSet) {
        return featureSet.items.length > 0;
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     *
     * 'featureSet' is a myw.FeatureSet or list of features
     */
    constructor(app, featureSet) {
        super(app, featureSet);
        this.app = app;
        this.features = featureSet.items || featureSet;
        this.reportMgr = this.app.plugins.reportManager;
        this.deltaOwner = null;
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        return this.typeName();
    }

    /**
     * String used to identify self in choice lists etc
     */
    typeName() {
        return this.msg('type');
    }

    // ------------------------------------------------------------------------
    //                               DATA GATHERING
    // ------------------------------------------------------------------------

    /**
     * Get information for report body
     */
    async build() {
        this.features = await this.ensureValues(this.features);

        this.date = new Date();
        this.features.sort((feat1, feat2) => {
            return strCmp(feat1.getTitle(), feat2.getTitle());
        });

        const featuresByType = {};
        for (const feature of this.features) {
            if (!featuresByType[feature.getType()]) featuresByType[feature.getType()] = [];

            const item = featuresByType[feature.getType()];
            item.push(feature);
        }

        this.featuresByType = featuresByType;

        if (this.app.getDelta()) {
            this.deltaOwner = await this.app
                .getDatasource('myworld')
                .getFeatureByUrn(this.app.getDelta());
        }
    }

    // ------------------------------------------------------------------------
    //                                GENERATION
    // ------------------------------------------------------------------------

    /**
     * Write report on ReportStream 'strm'
     */
    generate(strm) {
        this.writeHeader(strm);
        this.writeBody(strm);
        return strm.doc;
    }

    /**
     * Output header info
     */
    writeHeader(strm) {
        strm.newSection(this.msg('summary'));

        // Show report type
        strm.writeHeading(3, this.typeName());

        // Show objects being reported on
        strm.writeHeading(1, `${this.features.length} ${this.msg('features')}`);

        // Add design info (if appropriate)
        if (this.deltaOwner) {
            strm.writeLine(this.deltaOwner.getTitle());
        }

        // Add generation date
        strm.writeLine(this.msg('date'), ': ', this.date.toLocaleDateString());

        strm.writeLine();
    }

    /**
     * Output report body
     */
    writeBody(strm) {
        for (const type in this.featuresByType) {
            this._outputTableForType(strm, type);
        }
    }

    /**
     * Output table for feature type 'type'
     */
    _outputTableForType(strm, type) {
        const features = this.featuresByType[type];

        if (!features.length) return;
        strm.newSection(features[0].featureDD.external_name, features.length);
        strm.writeHeading(3, `${features[0].featureDD.external_name} (x${features.length})`);

        const cols = [];
        const featureFields = features[0].getFieldsOrder();
        cols.push(...featureFields);

        const tab = new ReportTable(cols);
        const colHeadings = {
            feature: this.msg('feature')
        };
        for (const fieldName of featureFields) {
            const field = features[0].getFieldDD(fieldName);
            colHeadings[fieldName] = field.external_name;
        }

        cols.unshift('feature');

        for (const feature of features) {
            tab.nextRow();
            tab.add('feature', feature.getTitle());
            for (const fieldName of featureFields) {
                if (!(fieldName in feature.featureDD.fields)) continue;

                const field = feature.getFieldDD(fieldName);
                if (feature.properties[fieldName]) {
                    tab.add(fieldName, this.reportMgr.getFieldValue(feature, field));
                }
            }
        }

        const options = { colHeadings, colStyles: {}, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);

        strm.writeLine();
    }
}
