// Copyright: IQGeo Limited 2010-2023
import Report from './report';
import ReportTable from './streams/reportTable';

export default class FeatureChangeReport extends Report {
    static {
        /**
         * @class Report detailing errors within a design
         *
         * Consists of 3 tables
         *      1. Conflict table: showing conflicting fields of conflicts passed
         *      2. Integrity Error table: showing fields of feature with integrity errors
         *      3. Design rules table: Showing problem and resolution for features
         */
        this.prototype.messageGroup = 'FeatureChangeReport';

        // Customisation hooks
        this.prototype.featureFields = ['specification'];

        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, featureSet) {
        for (const feature of featureSet.items) {
            if (feature.validationFeatureType == 'featureChange') return true;
        }

        return false;
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
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        return `${this.typeName()}: ${this.deltaOwner.getTitle()}`;
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
     * Get objects and group them
     *
     * Returns true if report non-empty
     */
    async build() {
        this.date = new Date();

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

    writeHeader(strm) {
        // Show report type
        strm.writeHeading(3, this.typeName());

        // Show objects being reported on
        strm.writeHeading(1, this.deltaOwner.getTitle());

        // Add generation date
        strm.writeLine(this.msg('date'), ': ', this.date.toLocaleDateString());

        strm.writeLine();
    }

    /**
     * Write table
     */
    writeBody(strm) {
        const cols = ['feature'];
        cols.push(...this.featureFields);

        // See if we are dealing with user change records
        // ENH: Cleaner way?
        let isUserChange = this.features && 'myw_change_time' in this.features[0];

        const featureChangeFields = [
            'change',
            ...((isUserChange && ['change_user', 'change_time']) || []),
            'changed_field',
            'base_field_value',
            'delta_field_value'
        ];

        cols.push(...featureChangeFields);

        const colHeadings = {
            feature: this.msg('feature'),
            change: this.msg('change'),
            ...((isUserChange && {
                change_user: this.msg('change_user'),
                change_time: this.msg('change_time')
            }) ||
                {}),
            changed_field: this.msg('changed_field'),
            base_field_value: this.msg('base_field_value'),
            delta_field_value: this.msg('delta_field_value')
        };

        //Add feature fields left of change type
        for (const field of this.featureFields) {
            colHeadings[field] = this.msg(field);
        }

        const tab = new ReportTable(cols);

        //For each feature
        for (const feature of this.features) {
            tab.nextRow();
            tab.add('feature', feature.getTitle());

            //Write feature fields requested
            for (const fieldName of this.featureFields) {
                if (feature.properties[fieldName]) {
                    const field = feature.getFieldDD(fieldName);
                    tab.add(fieldName, this.reportMgr.getFieldValue(feature, field));
                }
            }

            //Write change information
            tab.add('change', this.msg(feature.changeType));

            // ADD user and date here. should use getFieldValue as below?
            if (isUserChange) {
                tab.add('change_user', feature.myw_change_user);
                tab.add('change_time', feature.myw_change_time.toLocaleString());
            }

            let i = 0;
            for (const fieldName of feature.changedFields) {
                const field = feature.getFieldDD(fieldName);

                tab.add('changed_field', field.external_name);
                tab.add('base_field_value', this.reportMgr.getFieldValue(feature.base, field));
                tab.add('delta_field_value', this.reportMgr.getFieldValue(feature, field));
                if (i == feature.changedFields.length - 1) continue; //No need to add row when on last field
                i++;
                tab.nextRow();
            }
        }
        const options = { colHeadings, colStyles: {}, skipEmptyCols: true, style: this.tableStyle };
        strm.writeTable(tab, options);
    }
}
