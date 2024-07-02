// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { Dialog, UnitScale, FeatureEditor } from 'myWorld-client';
import _ from 'underscore';
import SpecImportDialog from './specImportDialog';
import SpecDataTable from './specDataTable';
import specManagerHtml from 'text-loader!../../../html/specManager.html';
import SpecReport from '../../reporting/specReport';
import CommsFeatureEditor from '../../models/commsFeatureEditor';
import SimpleBundleDialog from '../simpleBundleDialog';

/**
 *
 * Go through all the imports up here
 */

const containerHtml = $(specManagerHtml).filter('#spec-manager-dialog-template').html();

export default class SpecManagerDialog extends Dialog {
    static {
        this.prototype.id = 'spec-manager';
        this.prototype.containerTemplate = _.template(containerHtml);

        this.prototype.events = {
            'click .spec-export': 'exportToCsv',
            'click .spec-import': 'showSpecImportDialog',
            'click .spec-add': 'showSpecAddDialog',
            'click .spec-report': 'showReportMenu',
            'click #all-spec-report-item': 'generateAllSpecsReport',
            'click #spec-report-item': 'generateSpecReport'
        };
    }
    constructor(options) {
        super(options);
        const owner = options.owner;
        this.owner = owner;
        this.app = owner.app;

        this.specManager = owner.specManager;
        this.specGridId = 'spec-manager-grid';
    }

    async render() {
        this.options.width = 1200;
        this.options.height = 650;
        this.options.resizable = true;
        this.options.resizeStop = (event, ui) => this.resize();
        this.options.contents = await this.createContent();

        myw.translate('SpecManagerDialog', this.$el);

        super.render();
        this.$('#menu').menu({
            select: (event, ui) => {
                if (ui.item.children().length < 2) {
                    this.featureType = ui.item.data().featureType;
                    this.currentFeatureType = ui.item.text();
                    this.initGridFor(this.featureType, this.currentFeatureType);
                    ui.item.parent().hide(); //Hides the sub menu after selection
                    document.activeElement.blur();
                }
            }
        }); //Make it a jQuery-ui menu
    }

    async createContent() {
        const types = ['structures', 'equipment', 'cables', 'conduits'];
        const menu = $('<ul>', { id: 'menu' });
        types.forEach(type => {
            const menuItem = $(`<li><div>${myw.msg('SpecManagerDialog', type)}</div></li>`);
            menuItem.append(this.buildSubMenuFor(type));
            menu.append(menuItem);
        });

        const contents = this.containerTemplate({
            menu: $('<div>').append(menu.clone()).html()
        });

        return $(contents).html();
    }

    buildSubMenuFor(type) {
        const subMenu = $('<ul>');
        const featureTypes = Object.keys(myw.config[`mywcom.${type}`]);
        featureTypes.forEach(featureType => {
            const specFeatureType = this.options.specManager.getSpecFeatureTypeFor(featureType);
            const specDD =
                specFeatureType && this.options.specManager.ds.featuresDD[`${specFeatureType}`];
            if (specDD) {
                subMenu.append(
                    `<li data-feature-type = ${featureType}><div>${specDD.external_name}</div></li>`
                );
            }
        });
        return subMenu;
    }

    async initGridFor(featureType, name) {
        const features = (this.features = await this.specManager.getSpecsFor(featureType));
        if (name) this.$('.spec-type-title').html(`${name}`);
        this.$('.button-container').show();
        this.delegateEvents();

        if (features.length > 0) {
            this.dataTable = new SpecDataTable(this, this.specGridId, features);

            // This will fix the size of the scrollable datatable div to elminiate uncessary scrolling.
            this.dataTable.invalidateSize();
        } else {
            $('#' + this.specGridId).html(
                `<div class="no-spec-msg">${myw.msg('SpecManagerDialog', 'no_specs')}</div>`
            );
        }
    }

    updateCurrentGrid() {
        return this.initGridFor(this.featureType, this.currentFeatureType);
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
            '#spec-manager-grid-table_wrapper .dataTables_scrollBody table'
        ).outerHeight(false);

        // Resize table scrollable area
        $('#spec-manager-grid-table_wrapper .dataTables_scrollBody')
            .outerHeight(availableHeight)
            .css('max-height', tableHeight + 20); // This collapses to smaller height if data doesn't fill vertical

        // Ensure column headers line up
        this.dataTable.grid.api().columns.adjust();
    }

    /**
     * Exports the specs to CSV
     */
    exportToCsv() {
        const csvContent = $.csv.fromObjects(
            this.features.map(feature => this._formatFeature(feature))
        );
        if (navigator.msSaveBlob) {
            // IE 10+
            var exportedFilenmae = `${this.featureType}_spec.csv`;
            var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            navigator.msSaveBlob(blob, exportedFilenmae);
        } else {
            var hiddenElement = document.createElement('a');
            hiddenElement.href = 'data:text/csv;charset=utf-8,' + encodeURI(csvContent);
            hiddenElement.target = '_blank';
            hiddenElement.download = `${this.featureType}_spec.csv`;
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
        const unitScale = new UnitScale(conf);
        return unitScale.convert(value, fromUnit, toUnit);
    }

    showSpecImportDialog() {
        new SpecImportDialog(this, {
            title: `${this.currentFeatureType} ${myw.msg('SpecImportDialog', 'import')}`,
            featureType: this.featureType,
            specManager: this.specManager,
            currentSpecs: this.features,
            destroyOnClose: true
        });
    }

    async showSpecAddDialog() {
        const feature = await this.specManager.ds.database.createDetachedFeature(
            `${this.featureType}_spec`
        );
        const addDialog = new FeatureEditor(this, {
            feature,
            map: this.specManager.app.map
        });

        addDialog.once('saved', featureProps => {
            this.specManager.updateSpecCacheFor(featureProps.feature);
            this.initGridFor(this.featureType);
        });
    }

    /*
     * Launches dialog to edit fiber cable structure for a spec feature
     *
     * @param  {MywFeature} cable spec feature
     * @return {Dialog} dialog instance for editing the bundle configuration
     *
     */
    editCableStructure(spec) {
        return new Promise(resolve => {
            new SimpleBundleDialog(this, spec, {
                beforeClose: () => {
                    //ENH: This cause entire datatable to redraw.
                    this.initGridFor(this.featureType);
                    resolve();
                }
            });
        });
    }

    /**
     * Toggle report menu which displays under the report button
     */
    showReportMenu() {
        if (!this.specReportMenuVisible) {
            this.specReportMenuVisible = true;
            $('#spec-report-menu-container').css('display', 'block');
            $('#spec-report-menu').menu();
        } else {
            this.specReportMenuVisible = false;
            $('#spec-report-menu-container').css('display', 'none');
        }
    }

    /**
     * Show all specs report preview dialog
     */
    async generateAllSpecsReport() {
        const allSpecs = Object.values(this.specManager.specCache);
        const specReport = new SpecReport(this.app, allSpecs);
        await specReport.build();
        this.app.plugins.reportManager.preview(specReport.title(), specReport);
    }

    /**
     * Show spec report preview dialog
     */
    async generateSpecReport() {
        if (!this.features) return;

        const specReport = new SpecReport(this.app, this.features);
        await specReport.build();
        this.app.plugins.reportManager.preview(specReport.title(), specReport);
    }

    /**
     * Opens feature editor to edit spec properties
     * @param {string} featureUrn
     */
    async showSpecEditDialog(featureUrn) {
        const feature = await this.app.database.getFeatureByUrn(featureUrn);

        if (this.editDialog) this.editDialog.close();

        // Use Comms feature editor so specs can edit labor costs
        this.editDialog = new CommsFeatureEditor(this, {
            feature,
            map: this.specManager.app.map
        });

        this.editDialog.once('saved', featureProps => {
            console.log('saved: ', featureProps);
            this.specManager.updateSpecCacheFor(featureProps.feature);
            this.initGridFor(this.featureType);
        });
    }

    async saveSpecFeature(feature) {
        await this.specManager.saveSpecFeature(feature);
    }
}
