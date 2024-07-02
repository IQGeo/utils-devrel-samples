// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin, PluginButton, FeatureViewer } from 'myWorld-client';
import ReportPreviewDialog from './reportPreviewDialog';

class ReportManagerPlugin extends Plugin {
    static {
        /**
         * @class Plugin for managing reports
         *
         * Provides mechanism for registering report 'engines'.
         * Also provides dialog for previewing and downloading reports
         *
         * @extends {Plugin}
         */

        this.prototype.messageGroup = 'ReportManagerPlugin';

        this.mergeOptions({
            featureReports: {}, // Report generators available for individual features, keyed by report type ('splice_report' etc)

            featureSetReports: {}, // // Report generators available for feature sets

            outputFormats: {}, // Report stream classes, keyed by format name

            pageSizes: {
                // Predefined paper sizes (in pt)
                letter: [612, 792],
                a4: [595, 842],
                a3: [842, 1191],
                a2: [1191, 1684]
            }
        });
    }

    /**
     * Init slots of self
     */
    constructor(owner, options) {
        super(owner, options);
        this.featureReports = this.options.featureReports;
        this.featureSetReports = this.options.featureSetReports;
        this.designReports = this.options.designReports;
        this.outputFormats = this.options.outputFormats;
        this.pageSizes = options.pageSizes || this.options.pageSizes;

        this.defaults = options.defaults || {}; // Preview dialog state

        // This is how platform dataTable does field viewing
        this._featureViewer = new FeatureViewer(this);

        //Re-render report button
        this.app.on('currentFeatureSet-changed', () => {
            this.trigger('change');
        });

        // Lazy load Japenese font in fonts dir and cache (for pdfStream)
        this.getFont().then(font => {
            this.font = font;
        });
    }

    /**
     * Output format choices for GUI
     */
    outputFormatChoices() {
        const choices = {};
        for (const format in this.outputFormats) {
            choices[format] = format; // ENH: Use message?
        }
        return choices;
    }

    /**
     * Paper size choices for GUI
     */
    pageSizeChoices() {
        const choices = {};
        for (const name in this.pageSizes) {
            choices[name] = this.msg('page_size_' + name);
        }
        return choices;
    }

    /**
     * Orientation choices for GUI
     */
    orientationChoices() {
        const choices = {};
        for (const name of ['portrait', 'landscape']) {
            choices[name] = this.msg('orientation_' + name);
        }
        return choices;
    }

    /**
     * The reports that can be built for 'feature'
     *
     * Returns a dict of Report instances, keyed by report type
     */
    // ENH: Return in sorted order
    reportsFor(feature) {
        const reports = {};
        for (const type in this.featureReports) {
            const reportClass = this.featureReports[type];
            if (reportClass.canBuildFor(this.app, feature)) {
                reports[type] = new reportClass(this.app, feature);
            }
        }
        return reports;
    }

    /**
     * The reports that can be built for 'featureSet'
     *
     * Returns a dict of Report Classes keyed by type
     * Dont instanciate here as reports need delta
     */
    // ENH: Return in sorted order
    featureSetReportsFor(featureSet) {
        const reports = {};
        for (const type in this.featureSetReports) {
            const reportClass = this.featureSetReports[type];
            if (reportClass.canBuildFor(this.app, featureSet)) {
                reports[type] = reportClass;
            }
        }
        return reports;
    }

    /**
     * Show preview of report 'rep'
     */
    preview(title, rep) {
        const strm = this.streamFor('html');
        const htmlDoc = rep.generate(strm);

        return new ReportPreviewDialog(this, title, rep, htmlDoc);
    }

    /**
     * Generate report 'rep' in 'format' and download
     *
     * 'options' is a dict of stream-specific options
     */
    output(title, rep, format, options) {
        const strm = this.streamFor(format, { ...options, font: this.font });
        rep.generate(strm);

        const baseName = title.replace(':', ' -');
        const fileName = baseName + '.' + format;
        strm.saveAs(fileName);
    }

    /**
     * The ReportStream class for 'format'
     */
    streamFor(format, options) {
        const strmClass = this.outputFormats[format];

        if (!strmClass) throw new Error('Bad report format: ' + format);

        return new strmClass(options);
    }

    // State to be preserved over sessions
    getState() {
        return { defaults: this.defaults };
    }

    /**
     * Converts internal value of field to display value
     * Handles geometry fields
     */
    getFieldValue(feature, fieldDD) {
        const fieldName = fieldDD.internal_name;

        const geometryFieldNames = feature.getGeometryFieldNamesInWorld('geo');
        const isGeometryField = geometryFieldNames.includes(fieldName);

        if (isGeometryField) {
            return this._getGeometryString(feature.geometry);
        }

        let fieldValue = feature.properties[fieldDD.internal_name];
        if (fieldValue == undefined) {
            return this.msg('null');
        }

        // Special case for labor cost fields
        const laborCostFieldName = myw.app.plugins.laborCostsManager.getLaborCostsFieldNameFor(
            feature.getType()
        );
        if (laborCostFieldName == fieldDD.internal_name) return fieldValue;

        const fieldViewer = this._featureViewer.getFieldViewer(feature, fieldDD, {
            inListView: true
        });

        // This gives better results than fieldViewer.convertValue()
        fieldValue = fieldViewer.el.innerHTML;

        //Photo field: return type of image
        if (fieldDD.type.includes('image')) {
            return fieldDD.type;
        }

        // Remove &nbsp char
        if (typeof fieldValue == 'string') {
            fieldValue = fieldValue.replace(/&nbsp;/g, ' ');
        }

        return fieldValue;
    }

    /**
     * Returns string giving information about geometry
     */
    _getGeometryString(geometry) {
        return `${geometry.type}(${geometry.flatCoordinates().length})`;
    }

    /**
     * Get font file from server
     * @returns {Response} Request response
     */
    getFontFile() {
        if (myw.localisation.language == 'ja') {
            return fetch('/modules/comms/style/sass/NotoSans.ttf');
        }
        return null;
    }

    /**
     * Gets base64 string representing font
     * @returns {String} Base64 encoded font string
     */
    async getFont() {
        if (!window.location.href) return null;
        // loading .tff font file crashes android
        // ENH: load in smaller pieces, or load in a different place
        if (this.app.system.server.isAndroid && this.app.system.server.isAndroid()) return null;

        let response = await this.getFontFile();

        // Return null if not found
        if (response === null || response.status == 404) return null;

        // Get base 64
        const blob = await response.blob();
        const base64 = await this.getBase64(blob);
        return base64.split(',')[1];
    }

    /**
     * Gets base64 string for file
     * @param {String} file path to file
     * @returns Base64 encoded string
     */
    getBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }
}

/**
 * Button allowing preview of reports from results list
 */
class ExportReportButton extends PluginButton {
    static {
        this.prototype.messageGroup = 'CommsExportButton';
        this.prototype.id = 'list-export';
        this.prototype.imgSrc = 'modules/comms/images/editor/reports.svg';
        this.prototype.titleMsg = 'create_report';
    }

    /**
     * Set active if has reports
     */
    render() {
        const reports = this.app.plugins.reportManager.featureSetReportsFor(
            this.app.currentFeatureSet
        );

        const reportNames = Object.keys(reports);
        const hasReports = !!reportNames.length;
        this.setActive(hasReports);
    }

    /**
     * Generate report preview for first report available
     */
    action() {
        const reports = this.app.plugins.reportManager.featureSetReportsFor(
            this.app.currentFeatureSet
        );

        const reportNames = Object.keys(reports);
        if (reportNames.length) {
            const reportName = reportNames[0];
            this.generateReport(reportName);
            this.app.recordFunctionalityAccess(`comms.reports.${reportName}`);
        }
    }

    /**
     * Generates report preview
     */
    async generateReport(name) {
        const featureSet = this.app.currentFeatureSet;
        const ReportClass = this.owner.featureSetReports[name];
        const report = new ReportClass(this.app, featureSet);

        await report.build();

        this.owner.preview(report.title(), report);
    }
}

ReportManagerPlugin.prototype.buttons = {
    exportCurrentSet: ExportReportButton
};

export default ReportManagerPlugin;
