// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import Report from './report';
import ReportTable from './streams/reportTable';

export default class ValidationReport extends Report {
    static {
        /**
         * @class Report detailing errors within a design
         *
         * Consists of 3 tables
         *      1. Conflict table: showing conflicting fields of conflicts passed
         *      2. Integrity Error table: showing fields of feature with integrity errors
         *      3. Design rules table: Showing problem and resolution for features
         */
        this.prototype.messageGroup = 'ValidationReport';

        // Customisation hooks
        this.prototype.tableStyle = 'modern';
    }

    static canBuildFor(app, featureSet) {
        for (const feature of featureSet.items) {
            if (
                feature.validationFeatureType == 'conflictFeature' ||
                feature.validationFeatureType == 'integrityError' ||
                feature.designRule
            )
                return true;
        }

        return false;
    }

    // ------------------------------------------------------------------------
    //                               CONSTRUCTION
    // ------------------------------------------------------------------------

    /**
     * Init slots of self
     *
     * 'featureSet' is a myw.FeatureSet or list of validation errors
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
        let title = this.typeName();
        if (this.deltaOwner) title += ': ' + this.deltaOwner.getTitle();
        return title;
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
        const conflictingFieldsByFeature = {};
        const integrityDataByFeature = {};

        this.conflicts = [];
        this.integrityErrors = [];
        this.designRules = [];
        for (const feature of this.features) {
            if (feature.validationFeatureType == 'conflictFeature') {
                this._getConflictsInfo(feature, conflictingFieldsByFeature);
                this.conflicts.push(feature);
                this.conflictingFieldsByFeature = conflictingFieldsByFeature;
            } else if (feature.validationFeatureType == 'integrityError') {
                this._getIntegrityErrorInfo(feature, integrityDataByFeature);
                this.integrityErrors.push(feature);
                this.integrityDataByFeature = integrityDataByFeature;
            } else {
                this.designRules.push(feature);
            }
        }

        if (this.app.getDelta()) {
            this.deltaOwner = await this.app
                .getDatasource('myworld')
                .getFeatureByUrn(this.app.getDelta());
        }
    }

    /**
     * Build look-up dict of confict fields keyed by feature urn
     */
    _getConflictsInfo(conflict, conflictingFieldsByFeature) {
        const conflictFields = [
            ...conflict.conflictFields,
            ...conflict.masterFields,
            ...conflict.deltaFields
        ];
        conflictingFieldsByFeature[conflict.getUrn()] = {};

        if (!conflict.master) return;

        for (const fieldName of conflictFields) {
            const field = conflict.master.getFieldDD(fieldName);
            conflictingFieldsByFeature[conflict.getUrn()][fieldName] = this._getConflictFieldInfo(
                conflict,
                field
            );
        }
    }

    /**
     * Get field value for master and delta field
     */
    _getConflictFieldInfo(conflict, field) {
        const fieldInfo = {};

        fieldInfo['base'] = {
            key: field.external_name,
            value: this.reportMgr.getFieldValue(conflict.base, field)
        };

        if (conflict.master && conflict.masterFields.includes(field.internal_name)) {
            fieldInfo['master'] = {
                key: field.external_name,
                value: this.reportMgr.getFieldValue(conflict.master, field)
            };
        }

        if (conflict.delta && conflict.deltaFields.includes(field.internal_name)) {
            fieldInfo['delta'] = {
                key: field.external_name,
                value: this.reportMgr.getFieldValue(conflict.delta, field)
            };
        }

        return fieldInfo;
    }

    _getIntegrityErrorInfo(integrityError, integrityDataByFeature) {
        integrityDataByFeature[integrityError.getUrn()] = {};

        for (const errorName in integrityError.errorItems) {
            const errorItem = integrityError.errorItems[errorName];
            integrityDataByFeature[integrityError.getUrn()][errorItem.field] = errorItem;
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
        strm.newSection(this.msg('conflict_table')); // ENH: If multiple tables, show summary

        // Show report type
        strm.writeHeading(3, this.typeName());

        // Show object being reported on
        const desc = this.deltaOwner ? this.deltaOwner.getTitle() : this.msg('master_title');
        strm.writeHeading(1, desc);
        // ENH: If sub-area, show extent

        // Add generation date
        strm.writeLine(this.msg('date'), ': ', this.date.toLocaleDateString());

        strm.writeLine();
    }

    /**
     * Write conflict, integrity, and design rule table if required
     */
    writeBody(strm) {
        if (this.conflicts.length) {
            strm.writeHeading(2, this.msg('conflict_table'));
            const { tab, options } = this._getConflictTable();
            strm.writeTable(tab, options);
            strm.writeLine();
        }

        if (this.integrityErrors.length) {
            strm.newSection(this.msg('integrity_error_table'), this.integrityErrors.length);
            strm.writeHeading(2, this.msg('integrity_error_table'));
            const { tab: integrityTab, options: integrityOptions } = this._getIntegrityErrorTable();
            strm.writeTable(integrityTab, integrityOptions);
        }

        if (this.designRules.length) {
            strm.newSection(this.msg('design_rules_table'), this.designRules.length);
            strm.writeHeading(2, this.msg('design_rules_table'));
            const { tab: designRulesTab, options: designRulesOpts } = this._getDesignRulesTable();
            strm.writeTable(designRulesTab, designRulesOpts);
        }
    }

    /**
     * Get conflict table
     */
    _getConflictTable() {
        const cols = [
            'feature',
            'master_change',
            'delta_change',
            'conflicting_field',
            'base_field_value',
            'master_field_value',
            'delta_field_value'
        ];

        const colHeadings = {
            feature: this.msg('feature'),
            master_change: this.msg('master_change'),
            delta_change: this.msg('delta_change'),
            conflicting_field: this.msg('conflicting_field'),
            base_field_value: this.msg('base_field_value'),
            master_field_value: this.msg('master_field_value'),
            delta_field_value: this.msg('delta_field_value')
        };
        const tab = new ReportTable(cols);

        // Add conflict info to table, adding each conflicting field to new line
        for (const conflict of this.conflicts) {
            tab.nextRow();
            tab.add('feature', conflict.getTitle());
            tab.add('master_change', this.msg(conflict.masterChange));
            tab.add('delta_change', conflict.deltaChange ? this.msg(conflict.deltaChange) : '');

            if (this.conflictingFieldsByFeature[conflict.getUrn()]) {
                const conflictInfo = this.conflictingFieldsByFeature[conflict.getUrn()];
                const fieldsLen = Object.keys(conflictInfo).length;
                let i = 0;
                for (const field in conflictInfo) {
                    let fieldName =
                        conflictInfo[field].master?.key || conflictInfo[field].delta?.key;

                    let masterValue = conflictInfo[field].master
                        ? conflictInfo[field].master.value
                        : '';
                    let deltaValue = conflictInfo[field].delta
                        ? conflictInfo[field].delta.value
                        : '';

                    //If a conflict, highlight fieldName and conflicting values red
                    if (conflict.conflictFields.includes(field)) {
                        fieldName = { value: fieldName, color: '#FF0000' };
                        masterValue = { value: masterValue, color: '#FF0000' };
                        deltaValue = { value: deltaValue, color: '#FF0000' };
                    }

                    tab.add('conflicting_field', fieldName);
                    tab.add('base_field_value', conflictInfo[field].base.value);
                    tab.add('master_field_value', masterValue);
                    tab.add('delta_field_value', deltaValue);
                    if (i == fieldsLen - 1) continue; //No need to add row when on last field
                    i++;
                    tab.nextRow();
                }
            }
        }

        const options = {
            colHeadings,
            colStyles: {},
            skipEmptyCols: true,
            style: this.tableStyle
        };
        return { tab, options };
    }

    /**
     * Get data integrity error table
     */
    _getIntegrityErrorTable() {
        const cols = ['feature', 'field', 'problem', 'details'];
        const colHeadings = {
            feature: this.msg('feature'),
            field: this.msg('field'),
            problem: this.msg('problem'),
            details: this.msg('details')
        };

        const tab = new ReportTable(cols);

        // Add integrity info to table, adding each error to new line
        for (const integrityError of this.integrityErrors) {
            tab.nextRow();
            tab.add('feature', integrityError.getTitle());

            this._addErrorInfo(tab, integrityError);
        }

        const options = { colHeadings, colStyles: {}, skipEmptyCols: true, style: this.tableStyle };
        return { tab, options };
    }

    /**
     * Adds integrity error information to table
     */
    _addErrorInfo(tab, integrityError) {
        const errorInfos = this.integrityDataByFeature[integrityError.getUrn()];
        const errorsLen = Object.keys(errorInfos).length;
        let i = 0;

        for (const errorName in errorInfos) {
            const errorItem = errorInfos[errorName];
            const problemStr = integrityError._getErrorTitle(errorItem, errorName);

            // Get field if exists
            const field = integrityError.getFieldDD(errorName);
            const fieldName = field?.external_name ?? '';

            // Add to table
            tab.add('field', fieldName);
            tab.add('problem', problemStr);
            const details = this._getDetailsFor(
                integrityError,
                field?.internal_name,
                integrityError,
                errorItem
            );
            let j = 0;
            for (const detail of details) {
                tab.add('details', detail);
                if (j == details.length - 1) continue;
                j++;
                tab.nextRow();
            }
            if (i == errorsLen - 1) continue; //No need to add row when on last field
            i++;
            tab.nextRow();
        }
    }

    /**
     * Composes error details array from props of ERROR
     */
    _getDetailsFor(feature, fieldName, integrityErrorFeature, errorItem) {
        const strs = [];

        const isGeometryField =
            fieldName && feature.getGeometryFieldNamesInWorld('geo').includes(fieldName);

        if (isGeometryField) {
            //Compose geometry string
            const featureStr = `${integrityErrorFeature.getTitle()}: ${this.reportMgr._getGeometryString(
                integrityErrorFeature.geometry
            )}`;
            strs.push(featureStr);
            if (!integrityErrorFeature.refFeatures || !integrityErrorFeature.refFeatures[fieldName])
                return strs;

            const refFeature = integrityErrorFeature.refFeatures[fieldName];
            const refFeatureStr = `${refFeature.getTitle()}: ${this.reportMgr._getGeometryString(
                refFeature.geometry
            )}`;
            strs.push(refFeatureStr);
        } else {
            //Compose error information from data in error
            for (const prop in errorItem.data) {
                const val = errorItem.data[prop];
                if (prop.startsWith('_')) continue;
                if (prop == 'ref_side' && !val) continue;
                let str = '';
                if (prop == 'referenced_feature' && fieldName) {
                    const refFeature = integrityErrorFeature.refFeatures[fieldName];
                    str = `${refFeature.featureDD.external_name}: ${val}`;
                } else str = `${myw.msg('IntegrityError', prop)}: ${val}`;
                strs.push(str);
            }
        }

        return strs;
    }

    /**
     * Get design rule table
     */
    _getDesignRulesTable() {
        const cols = ['feature', 'design_rule_error', 'resolution'];
        const colHeadings = {
            feature: this.msg('feature'),
            design_rule_error: this.msg('design_rule_error'),
            resolution: this.msg('resolution')
        };

        const tab = new ReportTable(cols);

        for (const ruleError of this.designRules) {
            tab.nextRow();
            tab.add('feature', ruleError.getTitle());
            tab.add('design_rule_error', ruleError.properties.description);
            tab.add('resolution', ruleError.properties.resolution);
        }

        const options = { colHeadings, colStyles: {}, skipEmptyCols: true, style: this.tableStyle };
        return { tab, options };
    }
}
