// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { Dialog, DisplayMessage } from 'myWorld-client';
import _ from 'underscore';
import 'jquery-csv';
import specManagerHtml from 'text-loader!../../../html/specManager.html';

const specImportHtml = $(specManagerHtml).filter('#spec-import-dialog-template').html();

// TBR: Replace drop area with UI component from platform when available (PLAT-8647)

export default class SpecImportDialog extends Dialog {
    static {
        this.prototype.messageGroup = 'SpecImportDialog';
        this.prototype.id = 'spec-import-dialog';
        this.prototype.containerTemplate = _.template(specImportHtml);

        this.mergeOptions({
            width: 500
        });

        this.prototype.events = {};
    }
    constructor(owner, options) {
        options.buttons = {
            Load: {
                text: myw.msg('SpecImportDialog', 'load'),
                class: 'primary-btn',
                disabled: true,
                click: () => {
                    this.uploadFile();
                }
            },
            Cancel: {
                text: '{:cancel_btn}',
                class: 'right',
                click: function () {
                    this.close();
                }
            }
        };
        super(options);
        this.owner = owner;
        this.specManager = options.specManager;

        this.currentSpecIds = this.getIdsFrom(options.currentSpecs);
        this.specRows = [];

        this.options.contents = this.createContent();
    }

    /**
     * Add event handlers
     */
    addEventHandlers() {
        const that = this;

        // Handle file selections
        $('#csv_upload_dialog_file_input').change(function (e) {
            if (this.files.length > 0) that.validateFile(this.files);
        });

        // This is a workaround incase user selects same filename over again if say they updated the file
        // and want to try again
        $('#csv_upload_dialog_file_input').on('click', function (e) {
            $(this).val('');
        });

        $('#csv_upload_dialog_file').on('drop', event => {
            event.preventDefault();
            const files = event.dataTransfer
                ? event.dataTransfer.files
                : event.originalEvent.dataTransfer.files;
            this.validateFile(files);
        });
    }

    async render() {
        myw.translate('SpecImportDialog', this.$el);
        super.render();
        this.addEventHandlers();
    }

    /**
     * Get ids from array of features
     * @param {Array<MywFeature>} features
     * @returns {Array<String>}
     */
    getIdsFrom(features) {
        const ids = [];
        features.forEach(feature => {
            ids.push(feature.getId());
        });
        return ids;
    }

    createContent() {
        const contents = this.containerTemplate({});
        return $(contents).html();
    }

    /**
     * Enable or disable button if files valid
     * @param {Array} files
     */
    async validateFile(files) {
        let validity = await this.validateFileContent(files);
        if (validity.valid) {
            this.$el.dialog && this.$el.dialog('widget').find('.primary-btn').button('enable');
        } else {
            this.message(validity.message, 'error');
            this.$el.dialog('widget').find('.primary-btn').button('disable');
        }
    }

    /**
     * Validate one file, file is type csv and ids of features dont have invlid chars
     * @param {Array} files
     * @returns {Object} Object with keys valid and optional message
     */
    async validateFileContent(files) {
        // Check only one file
        this.$('.file-name').html(myw.msg('SpecImportDialog', 'validating'));
        if (!files || files.length != 1) {
            return {
                valid: false,
                message: myw.msg('SpecImportDialog', 'one_upload')
            };
        }
        const file = files[0];

        // Check csv
        const fileType = file.name.split('.').pop();
        if (!fileType || fileType.toLowerCase() != 'csv') {
            return {
                valid: false,
                message: myw.msg('SpecImportDialog', 'wrong_file_type')
            };
        }

        this.fileToUpload = file;
        this.$('.file-name').html(file.name);
        const specRows = await this.readFileContent(file);
        this.specRows = specRows;

        const idList = [];
        let numRetired = 0;

        if (specRows.length > 0) {
            if (specRows[0].color_scheme !== undefined) {
                return {
                    valid: false,
                    message: myw.msg('SpecImportDialog', 'legacy_format__color_scheme')
                };
            }
        }

        for (const spec of specRows) {
            const id = spec.name;
            // Check id doesnt include invalid chars
            if (id.includes('/') || id.includes('?')) {
                return {
                    valid: false,
                    message: myw.msg('SpecImportDialog', 'id_invalid', { id })
                };
            }
            if (id.length) idList.push(id);
            const retired = spec['retired'];
            if (retired && ['TRUE', 'YES', 'T', 'Y'].includes(retired.toUpperCase())) {
                numRetired++;
            }
        }

        const newIds = [];
        idList.forEach(id => {
            if (!this.currentSpecIds.includes(id)) {
                newIds.push(id);
            }
        });
        const numFeaturesToUpdate = idList.length - newIds.length;

        // Display data
        this.$('.num-new-specs').text(newIds.length);
        this.$('.num-updated-specs').text(numFeaturesToUpdate);
        this.$('.num-retired-specs').text(numRetired);
        return { valid: true };
    }

    /**
     * Change csv to object
     */
    readFileContent(file) {
        return new Promise(resolve => {
            const r = new FileReader();
            r.onload = f => {
                const content = $.csv.toObjects(f.target.result);
                resolve(content);
            };
            r.readAsText(file);
        });
    }

    /**
     * Send request to upload file to the server
     * @param  {Boolean} process - true - process data, false - validate only
     */
    async uploadFile() {
        const file = this.fileToUpload;
        const fileName = file.name;

        this.$('.file-name').html(myw.msg('SpecImportDialog', 'processing'));

        this.specRows.forEach(async specRow => {
            const featureJson = { properties: specRow };
            try {
                if (this.currentSpecIds.includes(specRow.name)) {
                    const feature = this.options.currentSpecs.find(spec => spec.id == specRow.name);
                    //Update the existing spec
                    await this.specManager.updateFeature(feature, featureJson);
                } else {
                    //Insert new specs
                    const specFeatureType = this.specManager.getSpecFeatureTypeFor(
                        this.options.featureType
                    );
                    await this.specManager.insertFeature(specFeatureType, featureJson);
                }
                this.message(this.msg('file_uploaded', { file_name: fileName }));
                this.$('.file-name').empty();
                this.$('.num-new-specs').empty();
                this.$('.num-updated-specs').empty();
                this.$('.num-retired-specs').empty();
                this.$el.dialog('widget').find('.primary-btn').button('disable');

                this.owner.initGridFor(this.options.featureType);
            } catch (err) {
                this.message(err, 'error');
            }
        });
    }

    message(message, type) {
        new DisplayMessage({ el: this.$('.message-container'), type: type, message: message });
    }
}
