// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { Dialog } from 'myWorld-client';
import _ from 'underscore';
import LaborCostsImportDialog from './laborCostsImportDialog';
import LaborCostsDataTable from './laborCostsDataTable';
import laborCostsManager from 'text-loader!../../../html/laborCostsManager.html';
import LaborCostsReport from '../../reporting/laborCostsReport';

const containerHtml = $(laborCostsManager).filter('#labor-costs-manager-dialog-template').html();

export default class LaborCostsManagerDialog extends myw.Dialog {
    static {
        this.prototype.id = 'labor-costs-manager';
        this.prototype.containerTemplate = _.template(containerHtml);

        this.prototype.events = {
            'click .labor-costs-export': 'exportToCsv',
            'click .labor-costs-import': 'showLaborCostImportDialog',
            'click .labor-costs-add': 'showLaborCostAddDialog',
            'click .labor-costs-report': 'showReportMenu',
            'click #all-labor-costs-report-item': 'generateAllLaborCostsReport',
            'click #labor-costs-report-item': 'generateLaborCostReport'
        };
    }
    constructor(options) {
        super(options);
        this.initialize(options);
    }

    async initialize(options) {
        this.owner = options.owner;
        this.app = this.owner.app;

        this.laborCostsManager = options.laborCostsManager;
        this.laborCostGridId = 'labor-costs-manager-grid';
        const contents = await this.createContent();
        await this.setContent(contents);
        //await myw.Dialog.prototype.initialize.call(this, options);
    }

    render() {
        this.options.width = 1200;
        this.options.height = 650;
        this.options.resizable = true;
        this.options.resizeStop = (event, ui) => this.resize();

        myw.translate('LaborCostsManagerDialog', this.$el);

        super.render();
        this.$('#menu').menu({
            select: (event, ui) => {
                this.laborCostType = ui.item.data().featureType;
                this.currentFeatureType = ui.item.text();
                this.initGridFor(this.laborCostType, this.currentFeatureType);
            }
        }); //Make it a jQuery-ui menu
    }

    async createContent() {
        const types = ['unit_labor_costs', 'linear_labor_costs'];
        const menu = $('<ul>', { id: 'menu' });
        types.forEach(type => {
            const menuItem = $(
                `<li data-feature-type = ${type}><div>${myw.msg(
                    'LaborCostsManagerDialog',
                    type
                )}</div></li>`
            );
            menu.append(menuItem);
        });

        const contents = this.containerTemplate({
            menu: $('<div>').append(menu.clone()).html()
        });

        return $(contents).html();
    }

    async initGridFor(laborCostType, name) {
        const features = (this.features = Object.values(
            this.laborCostsManager.getLaborCosts(laborCostType)
        ));

        if (name) this.$('.labor-costs-type-title').html(`${name}`);
        this.$('.button-container').show();
        this.delegateEvents();

        if (features.length > 0) {
            this.dataTable = new LaborCostsDataTable(this, this.laborCostGridId, features);
        } else {
            $('#' + this.laborCostGridId).html(
                `<div class="no-labor-costs-msg">${myw.msg(
                    'LaborCostsManagerDialog',
                    'no_labor_costs'
                )}</div>`
            );
        }
    }

    _availableWidth() {
        return $(window).width() - 2;
    }

    /**
     * Resizes the dialog height/width based on browser window size
     */
    rePosition() {
        const dialogOpen = super.rePosition();

        if (!dialogOpen) return;

        const widget = this.$el.dialog('widget');

        const panelLeftPos = this.$el.dialog('widget').offset().left;
        const currWidth = widget.width();

        const availableWidth = $(window).width() - panelLeftPos;

        // Only shrink horizontally if need to shrink window
        if (currWidth >= availableWidth)
            this.$el.dialog('option', 'width', Math.max(availableWidth, 20));
    }

    /**
     * Resize the scrollable table area to match with dialog size
     */
    resize() {
        if (!this.dataTable) return;

        const availableHeight = this.dataTable.calcDataTableHeight();

        const tableHeight = $(
            '#labor-costs-manager-grid-table_wrapper .dataTables_scrollBody table'
        ).outerHeight(false);

        // Resize table scrollable area
        $('#labor-costs-manager-grid-table_wrapper .dataTables_scrollBody')
            .outerHeight(availableHeight)
            .css('max-height', tableHeight + 20); // This collapses to smaller height if data doesn't fill vertical

        // Ensure column headers line up
        this.dataTable.grid.api().columns.adjust();
    }

    /**
     * Exports the laborCosts to CSV
     */
    exportToCsv() {
        const csvContent = $.csv.fromObjects(
            this.features.map(feature => this._formatFeature(feature))
        );
        if (navigator.msSaveBlob) {
            // IE 10+
            var exportedFilenmae = `${this.laborCostType}_labor-costs.csv`;
            var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            navigator.msSaveBlob(blob, exportedFilenmae);
        } else {
            var hiddenElement = document.createElement('a');
            hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(csvContent);
            hiddenElement.target = '_blank';
            hiddenElement.download = `${this.laborCostType}_labor-costs.csv`;
            hiddenElement.click();
        }
    }

    _formatFeature(feature) {
        const aFeature = {};
        const fieldsOrder = feature.getFieldsOrder();
        fieldsOrder.unshift('name');

        _.each(fieldsOrder, internalFieldName => {
            let propertyName = internalFieldName;
            let propertyValue = feature.properties[internalFieldName];
            aFeature[propertyName] = propertyValue;
        });

        return aFeature;
    }

    /**
     * Convert numeric value between units based on fieldDD settings
     * @param   {number}  value       Value to convert
     * @param   {fieldDD} fieldDD     Data dictionary information of the field to edit
     * @returns {number}              Value of the converted unit
     * @throws  {UnitNotDefinedError} Will throw if the from or to unit is not defined in the unit def
     */
    _applyUnitConversion(value, fieldDD) {
        const unit_scale = fieldDD.unit_scale;
        const fromUnit = fieldDD.unit;
        const toUnit = fieldDD.display_unit;

        const conf = myw.config['core.units'][unit_scale];
        const unitScale = new myw.UnitScale(conf);
        return unitScale.convert(value, fromUnit, toUnit);
    }

    showLaborCostImportDialog() {
        new LaborCostsImportDialog(this, {
            title: `${this.currentFeatureType} ${myw.msg('LaborCostsImportDialog', 'import')}`,
            laborCostType: this.laborCostType,
            laborCostsManager: this.laborCostsManager,
            currentLaborCosts: this.laborCostsManager.getAllLaborCosts(),
            destroyOnClose: true
        });
    }

    async showLaborCostAddDialog() {
        const feature = await this.laborCostsManager.ds.database.createDetachedFeature(
            'mywcom_labor_cost'
        );
        const addDialog = new myw.FeatureEditor(this, {
            feature,
            map: this.laborCostsManager.app.map
        });

        addDialog.once('saved', featureProps => {
            this.laborCostsManager.updateLaborCostCacheFor(featureProps.feature);
            this.initGridFor(this.laborCostType);
        });
    }

    /**
     * Toggle report menu which displays under the report button
     */
    showReportMenu() {
        if (!this.laborCostReportMenuVisible) {
            this.laborCostReportMenuVisible = true;
            $('#labor-costs-report-menu-container').css('display', 'block');
            $('#labor-costs-report-menu').menu();
        } else {
            this.laborCostReportMenuVisible = false;
            $('#labor-costs-report-menu-container').css('display', 'none');
        }
    }

    /**
     * Show all laborCosts report preview dialog
     */
    async generateAllLaborCostsReport() {
        const linearLaborCosts = Object.values(
            this.laborCostsManager.laborCostsCache.linear_labor_costs
        );
        const unitLaborCosts = Object.values(
            this.laborCostsManager.laborCostsCache.unit_labor_costs
        );
        const allLaborCosts = [...linearLaborCosts, ...unitLaborCosts];
        const laborCostReport = new LaborCostsReport(this.app, allLaborCosts);
        await laborCostReport.build();
        this.app.plugins.reportManager.preview(laborCostReport.title(), laborCostReport);
    }

    /**
     * Show laborCost report preview dialog
     */
    async generateLaborCostReport() {
        if (!this.features) return;

        const laborCostReport = new LaborCostsReport(this.app, this.features);
        await laborCostReport.build();
        this.app.plugins.reportManager.preview(laborCostReport.title(), laborCostReport);
    }

    /**
     * Opens feature editor to edit laborCost properties
     * @param {string} featureUrn
     */
    async showLaborCostEditDialog(featureUrn) {
        const feature = await this.app.database.getFeatureByUrn(featureUrn);

        if (this.editDialog) this.editDialog.close();

        this.editDialog = new myw.FeatureEditor(this, {
            feature,
            map: this.laborCostsManager.app.map
        });

        this.editDialog.once('saved', featureProps => {
            this.laborCostsManager.updateLaborCostCacheFor(featureProps.feature);
            this.initGridFor(this.laborCostType);
        });
    }

    async saveLaborCostFeature(feature) {
        await this.laborCostsManager.saveLaborCostFeature(feature);
    }
}
