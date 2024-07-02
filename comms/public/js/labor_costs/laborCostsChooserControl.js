// Copyright: IQGeo Limited 2010-2023
import { Control, Dialog, Util } from 'myWorld-client';
import $ from 'jquery';
import LaborCostsDataTable from './laborCostsChooserDataTable';

class LaborCostsChooserControl extends Control {
    static {
        this.prototype.messageGroup = 'LaborCostsChooserControl';
    }
    constructor(owner, options) {
        super(owner, options);
        this.initialize(owner, options);
    }

    async initialize(owner, options) {
        Control.prototype.initialize.call(this, owner, options);

        this.feature = options.feature;
        this.laborCostsGridId = 'labor-costs-grid';
        this.laborCostFeatureName = options.laborCostFeatureName;
        this.owner = owner;
        //  ENH: betterway to access the editor?
        this.editor = owner.owner.owner;
        this.app = this.owner.app;
        await this.render();
    }

    /**
     * Builds the dialog, adds the feature dataTable, adds the event handlers
     * @return {[type]} [description]
     */
    async render() {
        this.initDialog();
        await Util.delay(100); // ENH: remove this delay, yuck! Dialog has not been rendered yet so can't initGrit
        await this.initGrid();
        this.setElement(this.laborCostsChooserDialog.$el);
        this.initEventHandlers();
    }

    async refresh() {
        $('#' + this.laborCostsGridId).empty();
        $('.labor-costs-filter-desc').empty();
        await this.initGrid();
    }

    /**
     * create new Dialog
     */
    async initDialog() {
        const container = $('<div></div>');
        const filterDescContainer = $('<div></div>', { class: 'labor-costs-filter-desc' });
        const gridContainer = $('<div></div>', { id: this.laborCostsGridId });
        container.append(filterDescContainer).append(gridContainer);

        const options = {
            title: this.feature.getTypeExternalName() + ' ' + this.msg('labor_costs_catalog'),
            app: this.app,
            modal: false,
            contents: container,
            postClose: this.onClose.bind(this)
        };

        this.laborCostsChooserDialog = new LaborCostsChooserDialog(options);
    }

    /**
     * once dialog is open, initalize the grid
     */
    async initGrid() {
        const features = await this.getLaborCostFeatures();
        const hasFeatures = features.length > 0;

        if (hasFeatures) {
            const value = this.owner.getValue();
            this.dataTable = new LaborCostsDataTable(this, this.laborCostsGridId, features, {
                laborCostsOnFeature: !value ? '' : value
            });
        }
    }

    _renderNoFeaturesMessage() {
        const elClass = '.labor-costs-filter-desc';
        this._getLaborCostFilterDesc(elClass);
        const container = $(elClass);
        const messageDiv = $('<div></div>').text('No matches found');
        container.append($('<br/>')).append(messageDiv);
    }

    /**
     * Get laborCost features, sorted by name
     * @return {Array} list of laborCost features
     */
    async getLaborCostFeatures() {
        let features = await this.editor.getLaborCostFeatures();

        const sortProc = (feature1, feature2) => {
            const name1 = feature1.properties.name;
            const name2 = feature2.properties.name;
            if (name1 < name2) return -1;
            if (name1 > name2) return +1;
            return 0;
        };
        features = features.sort(sortProc);
        return features;
    }

    initEventHandlers() {
        this.initUserEventHandlers();
        this.initAppEventHandlers();
    }

    initUserEventHandlers() {
        this.$el.on('click', 'tbody > tr', e => {
            this.setValueOnFeature(e.currentTarget);
            this.refresh();
        });
    }

    initAppEventHandlers() {
        this.app.on('featureCollection-modified', e => {
            this.close();
        });

        this.editor.once('cancelled', () => {
            this.close();
        });

        this.editor.off('laborCostsFilter-changed').on('laborCostsFilter-changed', e => {
            this.refresh();
        });
    }

    removeAppEventHandlers() {
        this.app.off('featureCollection-modified', e => {
            this.close();
        });

        this.editor.off('laborCostsFilter-changed', e => {
            this.render();
        });
    }

    close() {
        if (this.laborCostsChooserDialog) this.laborCostsChooserDialog.close();
    }

    /**
     * reopen laborCost dialog
     */
    open() {
        this.close();
        this.render();
    }

    /**
     * When dialog closes, empty the $el and set properties to null
     */
    onClose() {
        this.removeAppEventHandlers();
        this.$el.remove();
        this.laborCostsChooserDialog = null;
        this.dataTable = null;
    }

    /**
     * select feature name from laborCost feature grid
     * @param  {dtRow} row
     * @return {string} featureName
     */
    selectFeatureNameFromRow(row) {
        this.$('tr.grid-row-selected').removeClass('grid-row-selected');
        $(row).addClass('grid-row-selected');

        const featureName = this.getFeatureName(row);
        return featureName;
    }

    /**
     * get feature name from row id
     * @param  {dtRow} row
     * @return {string} feature name
     */
    getFeatureName(row) {
        const featureId = $(row).prop('id');
        return featureId.split('/')[1];
    }

    invalidateSize() {
        if (!this.dataTable) return;

        const gridSettings = this.dataTable.grid.fnSettings();
        gridSettings.oScroll.sY = `${this.dataTable.calcDataTableHeight()}px`;
        this.dataTable.grid.fnDraw();
    }

    /**
     * Sets value of field editor on owning feature
     * @param {Event} e
     */
    setValueOnFeature(row) {
        let newValue = this.selectFeatureNameFromRow($(row));
        const currentValue = this.owner.getValue();
        if (currentValue) {
            const currentValues = currentValue.split(',');

            if (currentValues.includes(newValue)) {
                // Remove value
                newValue = currentValues.filter(str => str !== newValue).join(',');
            } else {
                // Add value
                newValue = `${currentValue},${newValue}`;
            }
        }
        this.owner.setValue(newValue);
    }
}

class LaborCostsChooserDialog extends Dialog {
    static {
        this.prototype.events = {};
    }

    render() {
        this.options.width = this._availableWidth();
        this.options.height = this._availableHeight();

        super.render();
    }

    _availableWidth() {
        const sideBarWidth = this.options.app.layout.layout.panes.west.width();
        return $(window).width() - sideBarWidth - 8;
    }

    _availableHeight() {
        const topBarHeight = this.options.app.layout.layout.panes.north.height();
        return $(window).height() - topBarHeight - 30;
    }

    /**
     * @override
     */
    close() {
        super.close();
        if (this.options.postClose) this.options.postClose();
    }

    /**
     * Positions the dialog to superimpose the map area
     */
    rePosition() {
        // TODO: at myWorld 6.o super class method will return true or false if dialog is available
        // use that to check
        if (!this.$el.is(':ui-dialog')) return;

        super.rePosition();
        const sideBarWidth = this.options.app.layout.layout.panes.west.width();
        const topBarHeight = this.options.app.layout.layout.panes.north.height();

        this.$el.dialog('widget').css({
            left: sideBarWidth + 5,
            top: topBarHeight + 6,
            height: this._availableHeight(),
            width: this._availableWidth()
        });
    }
}

export default LaborCostsChooserControl;
