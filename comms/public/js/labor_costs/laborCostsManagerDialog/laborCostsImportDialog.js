// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';
import _ from 'underscore';
import 'jquery-csv';
import laborCostsManagerHtml from 'text-loader!../../../html/laborCostsManager.html';

const laborCostImportHtml = $(laborCostsManagerHtml)
    .filter('#labor-costs-import-dialog-template')
    .html();

export default class LaborCostsImportDialog extends myw.Dialog {
    static {
        this.prototype.messageGroup = 'LaborCostsImportDialog';
        this.prototype.id = 'labor-costs-import-dialog';
        this.prototype.containerTemplate = _.template(laborCostImportHtml);

        this.mergeOptions({
            width: 500
        });

        this.prototype.events = {};
    }

    constructor(owner, options) {
        options.buttons = {
            Load: {
                text: myw.msg('LaborCostsImportDialog', 'load'),
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
        this.laborCostsManager = options.laborCostsManager;

        this.currentLaborCostIds = this.getIdsFrom(options.currentLaborCosts);
        this.laborCostRows = [];

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

        // This is a workaround in case the user selects the same filename over again if they updated the file
        // and want to try again
        $('#csv_upload_dialog_file_input').on('click', function (e) {
            $(this).val('');
        });

        $('#csv_upload_dialog_file').on('drop', event => {
            const files = event.dataTransfer
                ? event.dataTransfer.files
                : event.originalEvent.dataTransfer.files;
            this.validateFile(files);
        });
    }

    render() {
        myw.translate('LaborCostsImportDialog', this.$el);
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
        this.$('.file-name').html(this.msg('validating'));
        if (!files || files.length != 1) {
            return {
                valid: false,
                message: this.msg('one_upload')
            };
        }
        const file = files[0];

        // Check csv
        const fileType = file.name.split('.').pop();
        if (!fileType || fileType.toLowerCase() != 'csv') {
            return {
                valid: false,
                message: this.msg('wrong_file_type')
            };
        }

        this.fileToUpload = file;
        this.$('.file-name').html(file.name);
        this.laborCostRows = await this.readFileContent(file);

        const idList = [];
        for (const laborCost of this.laborCostRows) {
            const id = laborCost.name;
            // Check id doesnt include invalid chars
            if (id.includes('/') || id.includes('?')) {
                return {
                    valid: false,
                    message: this.msg('id_invalid', { id })
                };
            }
            if (id.length) idList.push(id);
        }

        const newIds = [];
        idList.forEach(id => {
            if (!this.currentLaborCostIds.includes(id)) {
                newIds.push(id);
            }
        });
        const numFeaturesToUpdate = idList.length - newIds.length;

        // Display data
        this.$('.num-new-labor-costs').text(newIds.length);
        this.$('.num-updated-labor-costs').text(numFeaturesToUpdate);
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

        this.$('.file-name').html(this.msg('processing'));

        this.laborCostRows.forEach(async laborCostRow => {
            const featureJson = { properties: laborCostRow };
            try {
                if (this.currentLaborCostIds.includes(laborCostRow.name)) {
                    //Update the existing laborCost
                    const feature = this.options.currentLaborCosts.find(
                        laborCost => laborCost.id == laborCostRow.name
                    );
                    await this.laborCostsManager.updateFeature(feature, featureJson);
                } else {
                    //Insert new laborCosts
                    await this.laborCostsManager.insertFeature('mywcom_labor_cost', featureJson);
                }
                this.message(this.msg('file_uploaded', { file_name: fileName }));
                this.$('.file-name').empty();
                this.$('.num-new-labor-costs').empty();
                this.$('.num-updated-labor-costs').empty();
                this.$el.dialog('widget').find('.primary-btn').button('disable');

                this.owner.initGridFor(this.options.laborCostType);
            } catch (err) {
                this.message(err, 'error');
            }
        });
    }

    message(message, type) {
        new myw.DisplayMessage({ el: this.$('.message-container'), type: type, message: message });
    }
}
