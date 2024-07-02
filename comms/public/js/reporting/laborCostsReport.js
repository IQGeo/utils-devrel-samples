// Copyright: IQGeo Limited 2010-2023
import Report from 'modules/comms/js/reporting/report';
import ReportTable from './streams/reportTable';
import { strCmp } from '../base/strUtils';

export default class LaborCostsReport extends Report {
    static {
        /**
         * @class Report detailing passed features and thier attributes
         * this.features will be labor costs
         */
        this.prototype.messageGroup = 'LaborCostsReport';

        // Customisation hooks
        this.prototype.tableStyle = 'modern';
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     * @param {MywApp} app
     * @param {MywFeature} feature
     */
    constructor(app, features) {
        super(app, features);
        this.app = app;
        this.features = features || [];
        this.reportMgr = this.app.plugins.reportManager;
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        return `${this.typeName()}: ${this.getTitle()}`;
    }

    /**
     * Get title for dialog
     * @returns {String}
     */
    getTitle() {
        //Find unique types of features
        const types = {};
        for (const feature of this.features) {
            types[feature.getType()] = true;
        }

        // If multiple types must be all labor costs dialog
        if (Object.keys(types).length > 1) {
            return this.msg('all_labor_costs_title');
        } else {
            return this.features[0].getTypeExternalName();
        }
    }

    /**
     * String used to identify self in choice lists etc
     */
    typeName() {
        return this.msg('type');
    }

    /**
     * Get information for report body
     */
    async build() {
        await this.buildHeaderData();
        await this.buildData();
    }

    /**
     * Get information for header
     */
    async buildHeaderData() {
        // Get generation time
        this.date = new Date();
    }

    /**
     * Get information for table
     */
    async buildData() {
        this.features.sort((laborCost1, laborCost2) => {
            return strCmp(laborCost1.properties.name, laborCost2.properties.name);
        });

        // Create lookup table seperated by linear property
        this.featuresByType = {};
        for (const feature of this.features) {
            if (!this.featuresByType[feature.properties.linear])
                this.featuresByType[feature.properties.linear] = [];
            this.featuresByType[feature.properties.linear].push(feature);
        }
    }

    // ------------------------------------------------------------------------
    //                                GENERATION
    // ------------------------------------------------------------------------

    /**
     * Write report on ReportStream 'strm'
     * @param {Stream} strm
     * @returns {Document}
     */
    generate(strm) {
        this.writeHeader(strm);
        this.writeBody(strm);
        return strm.doc;
    }

    /**
     * Output header info
     * @param {Stream} strm
     */
    writeHeader(strm) {
        // Show report type
        strm.writeHeading(3, this.typeName());

        // Show object being reported on
        strm.writeHeading(1, this.getTitle());

        // Add generation date
        strm.writeLine(this.msg('date') + ': ', this.date.toLocaleDateString());

        strm.writeLine();
    }

    /**
     * Output content as a table
     * Adds columns for featureFields
     * @param {Stream} strm
     */
    writeBody(strm) {
        const types = Object.keys(this.featuresByType).sort();
        for (const type of types) {
            this.buildTable(strm, type);
        }
    }

    /**
     * Build table
     * @param {Stream} strm
     * @param {String} type feature type
     * @returns
     */
    buildTable(strm, type) {
        const features = this.featuresByType[type];

        if (!features.length) return;
        strm.newSection(features[0].featureDD.external_name, features.length);
        strm.writeHeading(3, `${this.msg(`linear_${type}`)} (x${features.length})`);

        const cols = ['feature'];
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

        for (const feature of features) {
            tab.nextRow();
            tab.add('feature', feature.getTitle());
            for (const fieldName of featureFields) {
                if (!(fieldName in feature.featureDD.fields)) continue;

                const field = feature.getFieldDD(fieldName);
                if (feature.properties[fieldName] != undefined) {
                    tab.add(fieldName, this.reportMgr.getFieldValue(feature, field));
                }
            }
        }

        const options = { colHeadings, colStyles: {}, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);

        strm.writeLine();
    }
}
