// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Dialog, Form, Label, PrimaryButton, Dropdown } from 'myWorld-base';
import { keyOf } from '../base/collectionUtils';

export default class ReportPreviewDialog extends Dialog {
    static {
        this.prototype.messageGroup = 'ReportPreviewDialog';
    }

    constructor(owner, title, rep, htmlDoc) {
        super({
            title: title,
            autoOpen: false,
            buttons: {
                // Note: buttons replaced on render (we need the buttonpane)
                Close: {
                    text: '{:close_btn}',
                    class: 'right',
                    id: 'report-preview-dialog-close-btn',
                    click() {
                        this.close();
                    }
                }
            },
            close: close.bind() // Ensures the x button calls close(),
        });
        this.owner = owner;
        this.title = title;
        this.rep = rep;
        this.htmlDoc = htmlDoc;

        this.outputFormats = owner.outputFormats;
        this.pageSizes = owner.options.pageSizes;

        this.outputFormatChoices = this.owner.outputFormatChoices();
        this.pageSizeChoices = this.owner.pageSizeChoices();
        this.orientationChoices = this.owner.orientationChoices();

        // Set initial state
        const outputFormat = this.owner.defaults.outputFormat || Object.keys(this.outputFormats)[0];
        this.pageSize = this.owner.defaults.pageSize || Object.keys(this.pageSizes)[0];
        this.orientation = this.owner.defaults.orientation || 'portrait';
        this.setOutputFormat(outputFormat);

        // Set size on open
        this.$el.on('dialogopen', () => {
            this.resize();
        });

        this.render();
        this.open();
    }

    /**
     * Create and display dialog
     */
    render() {
        //Create table wrapper
        const div = $('<div/>', { id: 'report-preview-table-wrapper' });
        div.css({ overflowX: 'scroll' });
        const contentsDiv = $(div).append(this.htmlDoc);

        // Assign dialog options
        this.options.contents = contentsDiv;
        this.options.maxHeight = $(window).height() - 50;
        this.options.resizable = true;
        this.options.destroyOnClose = true;
        super.render();

        // Hide original close button
        $('#report-preview-dialog-close-btn').hide();

        // Create form and wrapper
        this.buildControlItems();
        this.form = new Form({
            messageGroup: 'ReportPreviewDialog',
            rows: [
                {
                    components: [
                        this.downloadButton,
                        this.outputFormatItem,
                        this.pageSizeItem,
                        this.orientationItem,
                        this.closeButton
                    ]
                }
            ]
        });
        const formWrapperDiv = $('<div/>', { id: 'report-preview-form-wrapper' });
        formWrapperDiv.css({ paddingLeft: '5px' });
        const formDiv = $(formWrapperDiv).append(this.form.$el);

        const buttonPane = $('#report-preview-table-wrapper')
            .parent()
            .siblings('.ui-dialog-buttonpane');

        // Remove old form and add form to bottom of dialog content
        buttonPane.children('#report-preview-form-wrapper').remove();
        buttonPane.append(formDiv);
    }

    /**
     * Build buttons and pulldowns
     */
    buildControlItems() {
        //download button
        this.downloadButton = new Label({
            label: '{:format}', // ENH: Workaround for Core issue 22258. Show be on next item really
            wrap: new PrimaryButton({
                style: 'vertical-align: middle',
                text: '{:download}',
                onClick: this.download.bind(this)
            })
        });
        // Output format dropdown
        // ENH: Implement a dropdown widget for which 'value' is key into list
        this.outputFormatItem = new Dropdown({
            id: 'format_item',
            options: Object.keys(this.outputFormatChoices),
            selected: this.outputFormatChoices[this.outputFormat],
            style: 'vertical-align: middle',
            onChange: item => {
                this.setOutputFormat(keyOf(item.getValue(), this.outputFormatChoices));
            }
        });

        // Page size dropdown
        this.pageSizeItem = new Dropdown({
            options: Object.keys(this.pageSizeChoices),
            selected: this.pageSizeChoices[this.pageSize],
            style: 'vertical-align: middle',
            visible: this.showPageItems,
            onChange: item => {
                this.setPageSize(keyOf(item.getValue(), this.pageSizeChoices));
            }
        });

        // Orientations dropdown
        this.orientationItem = new Dropdown({
            options: Object.keys(this.orientationChoices),
            selected: this.orientationChoices[this.orientation],
            style: 'vertical-align: middle',
            visible: this.showPageItems,
            onChange: item => {
                this.setOrientation(keyOf(item.getValue(), this.orientationChoices));
            }
        });

        // Close button
        this.closeButton = new PrimaryButton({
            style: `float: right`,
            text: '{:close}',
            onClick: () => {
                this.close();
            }
        });
    }

    /**
     * Called when download format changed
     */
    setOutputFormat(outputFormat) {
        this.outputFormat = outputFormat;

        // Enable / disable page size choices
        const strmClass = this.outputFormats[outputFormat];
        this.showPageItems = strmClass.prototype.isPaged;

        // Stash values as defaults for future invocations
        this.owner.defaults.outputFormat = outputFormat;
    }

    /**
     * Called when page size changed
     */
    setPageSize(pageSize) {
        this.pageSize = pageSize;
        this.owner.defaults.pageSize = pageSize; // for future invocations
    }

    /**
     * Called when page orientation changed
     */
    setOrientation(orientation) {
        this.orientation = orientation;
        this.owner.defaults.orientation = orientation; // for future invocations
    }

    /**
     * Callback for download button
     */
    download() {
        const options = {};
        if (this.showPageItems) {
            options.pageSize = this.pageSizes[this.pageSize];
            options.orientation = this.orientation;
        }

        this.owner.output(this.title, this.rep, this.outputFormat, options);
    }

    /**
     * Ensure control buttons are visible
     */
    resize() {
        $('#report-preview-table-wrapper').css('max-height', $(window).height() - 200);
        $('#report-preview-table-wrapper').css('max-width', $(window).width() - 50);
    }
}
