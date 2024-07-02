// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { msg, Dialog, Dropdown, Input, Form, DisplayMessage } from 'myWorld-client';
import TaskMonitor from './taskMonitor';

// TBR: Replace with UI component from platform when available (PLAT-8647)

export default class DataImportDialog extends Dialog {
    static {
        this.prototype.messageGroup = 'DataImportDialog';
        this.prototype.id = 'data-import-dialog';

        this.mergeOptions({
            width: 500
        });
    }

    // --------------------------------------------------------------------------
    //                                  CONSTRUCTION
    // --------------------------------------------------------------------------

    /**
     * Build dialog
     */
    constructor(owner, dataImportConfigs, deltaOwner = undefined) {
        const title = deltaOwner ? deltaOwner.getTitle() : msg('title');
        super({
            title: title,
            close: close.bind(),
            modal: false,
            destroyOnClose: true // Workaround for file selector doesn't work on reopen
        });

        this.owner = owner;
        this.configs = dataImportConfigs;
        this.updateInterval = 1000; // Progress update rate (millisec)
        this.state = 'empty';

        this.tm = new TaskMonitor(this.owner.ds, this.showMessage.bind(this), this.updateInterval);

        const contents = this.buildGuiItems();
        this.options.contents = contents;

        // Define action buttons
        const buttons = {
            previewData: {
                text: '{:preview}',
                class: 'primary-btn import-btn',
                click: this.previewData.bind(this),
                disabled: true
            },
            importData: {
                text: '{:upload}',
                class: 'primary-btn import-btn',
                click: this.importData.bind(this),
                disabled: true
            },
            close: {
                text: '{:close_btn}',
                class: 'right',
                click: this.close.bind(this)
            }
        };

        this.setButtons(buttons);
        this.setEventHandlers();
    }

    /**
     * Add event handlers for drop area
     */
    setEventHandlers() {
        const self = this;
        this.dropAreaItem.input.change(function (e) {
            if (this.files.length > 0) self.setFile(this.files);
        });

        this.dropAreaItem.dropArea.on('drop', event => {
            event.preventDefault();
            const files = event.dataTransfer
                ? event.dataTransfer.files
                : event.originalEvent.dataTransfer.files;
            this.setFile(files);
        });

        this.app.on('database-view-changed', this.handleDatabaseViewChanged, this);
    }

    /**
     * Build GUI
     */
    buildGuiItems() {
        const rootDiv = $('<div>');

        // Add drop area
        this.dropAreaItem = this.dropAreaWidget();
        this.dropAreaItem.label.html(this.msg('drop_area_hint'));
        rootDiv.append(this.dropAreaItem.div);

        // Add other input items
        const formatKeys = Object.keys(this.configs);
        const formatOptions = [];
        this.reverseKeys = {};

        formatKeys.forEach(key => {
            formatOptions.push(this.configs[key]['name']);
            this.reverseKeys[this.configs[key]['name']] = key;
        });
        const selected = formatOptions.includes('CDIF') ? 'CDIF' : formatOptions[0]; // default to CDIF if included in config

        this.formatItem = new Dropdown({
            name: 'format',
            options: formatOptions,
            selected,
            minWidth: '80px'
        });

        this.coordSysItem = new Input({
            name: 'coordSys',
            type: 'number',
            cssClass: 'small'
        });

        // Create form
        this.form = new Form({
            rows: [
                {
                    label: this.msg('format_item'),
                    components: [this.formatItem]
                },
                {
                    label: this.msg('coord_sys_item'),
                    components: [this.coordSysItem, this.msg('coord_sys_hint')]
                }
            ]
        });
        rootDiv.append(this.form.$el);

        // Add message area
        this.messageArea = $('<label>', { class: 'message-container' });
        rootDiv.append(this.messageArea);

        return rootDiv;
    }

    /**
     * Create a drop area 'widget'
     */
    // Replace by a UI component
    dropAreaWidget() {
        const div = $('<div>', { class: 'file-select-container' });

        const dropAreaDiv = $('<div>', {
            id: 'data_import_dialog_file',
            class: 'file_drop_zone',
            ondragover: 'return false'
        }).appendTo(div);

        const dropAreaInput = $('<input>', {
            type: 'file',
            name: 'file',
            accept: 'application/zip',
            id: 'data_import_dialog_file_input',
            class: 'hidden'
        }).appendTo(dropAreaDiv);

        const dropAreaLabel = $('<label>', {
            class: 'file_input',
            for: 'data_import_dialog_file_input'
        }).appendTo(dropAreaDiv);

        const dropAreaLabelDiv = $('<div>', {
            style: 'padding:30px'
        }).appendTo(dropAreaLabel);

        return {
            div: div,
            input: dropAreaInput,
            dropArea: dropAreaDiv,
            label: dropAreaLabelDiv
        };
    }

    /**
     * Called when dialog is popped up
     */
    async open() {
        super.open();

        // Required to allow subsequent change of selection
        $(this).val('');
    }

    /**
     * Called when user changes to different delta
     */
    handleDatabaseViewChanged(e) {
        this.close();
    }

    /**
     * Called when dialog popped down
     */
    close() {
        this.app.off('database-view-changed', this.handleDatabaseViewChanged, this);
        super.close();
        // ENH: Discard the upload
    }

    // --------------------------------------------------------------------------
    //                                  CALLBACKS
    // --------------------------------------------------------------------------

    /**
     * Set file to upload
     */
    setFile(files) {
        // Required to allow subsequent change of selection
        $(this).val('');

        // Reset GUI
        this.$('.message-container').hide();
        this.enableActionButtons(false);
        this.uploadId = undefined;

        // Check exactly one file
        if (!files || files.length != 1) {
            this.showError(this.msg('one_upload'));
            return false;
        }

        const file = files[0];

        // Check it is a zip
        const fileType = file.name.split('.').pop();

        if (!fileType || !(fileType in this.owner.file_type_config)) {
            this.showError('invalid_file_type', { type: fileType });
            return false;
        }

        // Set it as the current file
        this.fileName = file.name;

        // Set styling
        this.dropAreaItem.label[0].style['overflow-wrap'] = 'break-word';
        this.dropAreaItem.label[0].style['padding'] = '0 20px';
        this.dropAreaItem.label[0].style['position'] = 'relative';
        this.dropAreaItem.label[0].style['top'] = '50%';
        this.dropAreaItem.label[0].style['transform'] = 'translateY(-50%)';

        this.dropAreaItem.label.html(file.name);

        // Read its contents
        const reader = new FileReader();
        reader.onload = file => {
            const mimeData = file.target.result;
            const data = mimeData.split(';')[1]; // strips mime type
            this.data = data.substring(7); // strips 'base64,'   // ENH: Use a regex
        };

        reader.readAsDataURL(file);

        this.state = 'file_selected';
        this.enableActionButtons(true);
        return true;
    }

    /**
     * Upload data and get preview (showing progress and handling errors)
     */
    async previewData() {
        try {
            this.busy(true);

            if (!this.uploadId) await this.uploadData();
            await this.previewUpload();
        } catch (cond) {
            this.showError('operation_failed', { error: cond.message }); // ENH: Show more detail when Core 22808 fixed
        } finally {
            this.busy(false);
        }
    }

    /**
     * Upload data and run import engine (showing progress and handling errors)
     */
    async importData() {
        try {
            this.busy(true);

            if (!this.uploadId) await this.uploadData();
            await this.importUpload();
        } catch (cond) {
            this.showError('operation_failed', { error: cond.message }); // ENH: Show more detail when Core 22808 fixed
        } finally {
            this.busy(false);
        }
    }

    /**
     * Upload data to server
     */
    async uploadData() {
        this.showMessage(this.msg('uploading'));
        this.uploadId = await this.tm.run(taskId =>
            this.owner.uploadData(this.fileName, this.data, taskId)
        );
        this.showMessage(this.msg('upload_complete'));
    }

    /**
     * Preview the uploaded file
     */
    async previewUpload() {
        this.showMessage(this.msg('previewing'));
        const config = this.configs[this.reverseKeys[this.formatItem.getValue()]];
        const coordSys = this.coordSysItem.getValue();
        const features = await this.tm.run(taskId =>
            this.owner.getUploadPreview(this.fileName, this.uploadId, config, coordSys, taskId)
        );

        // Show it
        this.app.setCurrentFeatureSet(features);
        this.showMessage(this.msg('preview_complete', { n: features.length }));
    }

    /**
     * Import the uploaded file
     */
    async importUpload() {
        const config = this.configs[this.reverseKeys[this.formatItem.getValue()]];
        const coordSys = this.coordSysItem.getValue();

        this.showMessage(this.msg('importing'));
        await this.tm.run(taskId =>
            this.owner.importUpload(this.fileName, this.uploadId, config, coordSys, taskId)
        );
        this.showMessage(this.msg('import_complete'));
    }

    // --------------------------------------------------------------------------
    //                                 UI MANAGEMENT
    // --------------------------------------------------------------------------

    /**
     * Set state of all buttons
     */
    // TODO: Disable close button
    busy(busy) {
        if (busy) {
            this.enableActionButtons(false);
            this.showMessage('');
        } else {
            this.enableActionButtons(true);
        }
    }

    /**
     * Set state of the preview and import buttons
     */
    enableActionButtons(enabled) {
        // ENH: Do this via widget
        this.$el
            .dialog('widget')
            .find('.ui-dialog-buttonset')
            .find('.primary-btn')
            .button('option', 'disabled', !enabled);
    }

    /**
     * Show an error message
     */
    showError(msgId, args) {
        const message = this.msg(msgId, args);
        this.showMessage(message, 'error');
    }

    /**
     * Show a message
     */
    showMessage(message, type = 'info') {
        new DisplayMessage({
            el: this.$('.message-container'),
            type: type,
            message: message
        });
        this.$('.message-container')[0].style['overflow-wrap'] = 'anywhere';
        this.$('.message-container').show();
    }
}
