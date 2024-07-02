// Copyright: IQGeo Limited 2010-2023
import { Control, Dialog } from 'myWorld-client';
import $ from 'jquery';
import FilterTag from '../base/filterTag';
import CommsDataTable from '../base/commsDataTable';

class SpecDataTable extends CommsDataTable {
    static {
        this.prototype.messageGroup = 'SpecDataTable';
    }
}

class SpecChooserControl extends Control {
    static {
        this.prototype.messageGroup = 'SpecChooserControl';
    }
    constructor(owner, options) {
        super(owner, options);
        this.initialize(owner, options);
    }
    async initialize(owner, options) {
        Control.prototype.initialize.call(this, owner, options);

        this.feature = options.feature;
        this.specGridId = 'spec-grid';
        this.specFeatureName = options.specFeatureName;
        this.owner = owner;
        this.editor = this.owner.editor;
        this.app = this.owner.app;
        await this.render();
    }

    /**
     * Builds the dialog, adds the feature dataTable, adds the event handlers
     * @return {[type]} [description]
     */
    async render() {
        this.initDialog();
        await this.initGrid();
        this.setElement(this.specChooserDialog.$el);
        this.initEventHandlers();
        this.app.fire('editHeader');
    }

    async refresh() {
        $('#' + this.specGridId).empty();
        $('.spec-filter-desc').empty();
        await this.initGrid();
    }

    /**
     * create new myw.Dialog
     */
    async initDialog() {
        const container = $('<div></div>');
        const filterDescContainer = $('<div></div>', { class: 'spec-filter-desc' });
        const gridContainer = $('<div></div>', { id: this.specGridId });
        container.append(filterDescContainer).append(gridContainer);

        const options = {
            title: this.feature.getTypeExternalName() + ' ' + this.msg('spec_catalog'),
            app: this.app,
            modal: false,
            contents: container,
            postClose: this.onClose.bind(this)
        };

        this.specChooserDialog = new SpecChooserDialog(options);
    }

    /**
     * once dialog is open, initalize the grid
     */
    async initGrid() {
        const features = await this.getSpecFeatures();
        const hasFeatures = features.length > 0;

        if (hasFeatures) {
            this.dataTable = new SpecDataTable(this, this.specGridId, features);
            this.invalidateSize();
        }

        this._renderFilterDescription(hasFeatures);
    }

    _renderFilterDescription(hasFeatures) {
        $('.spec-filter-desc').empty();
        if (!hasFeatures) {
            this._renderNoFeaturesMessage();
        } else {
            const elClass = '.gridActionsLeft';
            this._getSpecFilterDesc(elClass);
        }
    }

    _renderNoFeaturesMessage() {
        const elClass = '.spec-filter-desc';
        this._getSpecFilterDesc(elClass);
        const container = $(elClass);
        const messageDiv = $('<div></div>').text('No matches found');
        container.append($('<br/>')).append(messageDiv);
    }

    /**
     * Get spec features, sorted by name
     * @return {FeatureSet} set of spec features
     */
    async getSpecFeatures() {
        let features = await this.editor.getSpecFeatures();

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

    _getSpecFilterDesc(elClass) {
        const filterButtons = this._getSpecFilterButtons();
        filterButtons.forEach(button => {
            this.specChooserDialog.$el.find(elClass).append(button.$el);
        });
    }

    _getSpecFilterButtons() {
        const filters = this.editor.getSpecFilter();
        const buttons = [];
        const _this = this;

        Object.keys(filters).forEach(field => {
            if (field == 'retired') return;
            const button = new FilterTag({
                text: filters[field].description,
                field: field,
                onClose: function (e) {
                    _this.editor.removeFromSpecFilter(e.options.field);
                    e.$el.remove();
                }
            });

            buttons.push(button);
        });

        return buttons;
    }

    initEventHandlers() {
        this.initUserEventHandlers();
        this.initAppEventHandlers();
    }

    initUserEventHandlers() {
        this.$el.on('click', 'tbody > tr', e => {
            const featureName = this.selectFeatureNameFromRow($(e.currentTarget));
            this.owner.setValue(featureName);
            this.close();
        });
    }

    editHeader() {
        let arrIndex;
        const scrollHead = document.querySelector('.dataTables_scrollHead');
        const styles = scrollHead.getAttribute('style');
        const newStyles = styles.split('; ');

        newStyles.forEach((el, index) => {
            const indexString = el.substring(0, 5);
            if (indexString === 'width') {
                arrIndex = index;
            }
        });

        newStyles.splice(arrIndex, 1);
        newStyles.push('width: 100%;');

        const finalStyles = newStyles.join('; ');

        scrollHead.setAttribute('style', finalStyles);
    }

    initAppEventHandlers() {
        this.app.on('featureCollection-modified', e => {
            this.close();
        });

        this.app.on('editHeader', e => {
            this.editHeader();
        });

        this.editor.once('cancelled', () => {
            this.close();
        });

        this.editor.off('specFilter-changed').on('specFilter-changed', e => {
            this.refresh();
        });
    }

    removeAppEventHandlers() {
        this.app.off('featureCollection-modified', e => {
            this.close();
        });

        this.app.off('editHeader', e => {
            this.editHeader();
        });

        this.editor.off('specFilter-changed', e => {
            this.render();
        });
    }

    close() {
        if (this.specChooserDialog) this.specChooserDialog.close();
    }

    /**
     * reopen spec dialog
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
        this.specChooserDialog = null;
        this.dataTable = null;
    }

    /**
     * select feature name from spec feature grid
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
        // Find the slashes in the feature id starting from the end
        // This allows a spec name to contain forward slashes
        const firstSlash = featureId.indexOf('/');
        return featureId.substring(firstSlash + 1);
    }

    invalidateSize() {
        if (!this.dataTable) return;

        const gridSettings = this.dataTable.grid.fnSettings();
        gridSettings.oScroll.sY = `${this.dataTable.calcDataTableHeight()}px`;
        this.dataTable.grid.fnDraw();
    }
}

class SpecChooserDialog extends Dialog {
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

export default SpecChooserControl;
