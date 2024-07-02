// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';

export default class LaborCostsDataTable extends myw.View {
    static {
        this.prototype.messageGroup = 'LaborCostsDataTable';

        //Maps the database field types with column types used in dataTables
        this.prototype.typeMap = {
            date: 'date',
            double: 'num',
            integer: 'num',
            numeric: 'num',
            default: 'natural'
        };

        this.prototype.events = {
            'click .edit-labor-costs-props': 'editLaborCost'
        };
    }

    /**
     * Builds a grid with the features supplied and attaches it to the DOM element with id = gridId
     * @class Uses the [DataTables]{@link http://www.datatables.net/} javascript library to show a list of myWorld objects in a tabular/grid view
     * @constructs
     * @param  {Control}        owner       The component which is the owner of self.
     * @param  {String}         gridId      Id of the div the grid will be attached tp
     * @param  {array<Feature>} features    features to be displayed in a grid using dataTables
     * @param  {function}       option.onFilterChange Callback for when the filter changes
     */
    constructor(owner, gridId, features, options) {
        super(options);
        this.app = owner.app;
        this.gridId = gridId;
        this.features = features;
        this.owner = owner;

        const feature = features[0];
        const fieldsOrder = feature.getFieldsOrder();
        const fieldsDD = feature.getFieldsDD();
        this.createColumnsAndHeader(fieldsOrder, fieldsDD);
        this.dataSet = this.createDataSet(fieldsOrder, fieldsDD);
        this.buildTable();

        //this.undelegateEvents(); // prevents events from being registered twice

        this.setupSortingOrder();
    }

    /**
     * Uses the fields to create a columns array for DataTables and an HTML table header object for the grid
     * @param  {string[]} fieldsOrder Array of fields organized in display order
     * @param  {object<fieldDD>}  fieldsDD    Field DD information keyed on field name
     */
    createColumnsAndHeader(fieldsOrder, fieldsDD) {
        let fieldDD;
        const columns = [];
        const gridTableHeaderRow = $('<tr></tr>');
        let fieldType;
        let fieldTypeFromRecord;
        let headerName;

        // Build the columns list and their corresponding grid header cells
        fieldsOrder.forEach(fieldName => {
            // get the field's dd
            fieldDD = fieldsDD[fieldName];

            if (fieldDD.type) {
                fieldTypeFromRecord = fieldDD.type.split('(')[0];
                fieldType = this.typeMap[fieldTypeFromRecord]
                    ? this.typeMap[fieldTypeFromRecord]
                    : this.typeMap['default'];
                if (fieldDD.unit) fieldType = this.typeMap['default'];
            } else fieldType = this.typeMap['default'];

            // If the field has a unit, add it to its header
            if (fieldDD) headerName = fieldDD.external_name;
            else headerName = '';

            columns.push({ data: fieldName, type: fieldType });
            gridTableHeaderRow.append(`<th>${headerName}</th>`);
        });

        // Prepend the column list with URN (as the hidden first column) and the Object name
        columns.unshift(
            { data: 'urn', type: this.typeMap['default'] },
            {
                data: null,
                width: '50',
                resizable: false,
                orderable: false,
                render: (data, type, row, meta) => {
                    const el = $('<div>').append(
                        '<span class="edit-labor-costs-props edit-btn"></span>'
                    );
                    return el.html();
                }
            },
            { data: 'myw_feature_title', type: 'natural' }
        );

        columns.push({ data: '-', type: this.typeMap['default'] }); // Dummy blank column to span the remaining available width

        gridTableHeaderRow.prepend(`<th>${this.msg('object')}</th>`);
        gridTableHeaderRow.prepend(`<th>&nbsp;</th>`); // on feature
        gridTableHeaderRow.prepend(`<th>${this.msg('object_urn')}</th>`);
        gridTableHeaderRow.append('<th>&nbsp;</th>'); // Dummy blank column to span the remaining available width

        this.columns = columns;
        this.tableHeader = $('<thead></thead>').append(gridTableHeaderRow);
        this.translate(this.tableHeader);
    }

    /**
     * Create a JSON array listing the features to be passed to the DataTables library
     * @param  {string[]}        fieldsOrder Order in which to display fields
     * @param  {object<fieldDD>} fieldsDD    Field DD information keyed on field name
     * @return {array<object>}               List of features properties
     */
    createDataSet(fieldsOrder, fieldsDD) {
        const dataSet = [];
        let obj;
        let fieldDD;
        let fieldName;

        const featureViewer = new myw.FeatureViewer(this);

        // Add a new element for each feature in the list.
        this.features.forEach(feature => {
            obj = {};

            for (let i = 0; i < fieldsOrder.length; i++) {
                fieldName = fieldsOrder[i];
                fieldDD = fieldsDD[fieldName];

                if (fieldDD) {
                    const fieldViewer = featureViewer.getFieldViewer(feature, fieldDD, {
                        inListView: true
                    });
                    const baseType = fieldDD.type.split('(')[0],
                        hasMapping = this.typeMap[baseType];

                    if (hasMapping) {
                        //The field has a mapping so we need the content, otherwise sorting won't work
                        //Keep the 'num' and 'date' type fields as just text
                        obj[fieldName] = fieldViewer.$el.text();
                    } else {
                        //For string sorting we can pass a html string
                        //Datatables doesn't seem to support passing elements (or jquery elements)
                        //Using outerHTML causes any event handlers to be lost
                        obj[fieldName] = fieldViewer.el.outerHTML;
                    }
                }
            }
            //Add an extra property for URN (will be hidden in the grid)
            obj['urn'] = feature.getUrn();
            obj['myw_feature_title'] = feature.getTitle();
            obj['-'] = ''; // Dummy blank column data to span the remaining available width

            dataSet.push(obj);
        });

        return dataSet;
    }

    /**
     * Builds a DataTable for the features
     */
    buildTable() {
        this.gridContainer = $(`#${this.gridId}`);
        const gridTableId = `${this.gridId}-table`;
        const gridFilterId = 'grid-filter-container';

        const gridTable = $(`<table class="display" id="${gridTableId}" width="100%"></table>`);
        gridTable.prepend(this.tableHeader);
        this.gridContainer.html(gridTable);

        // For MSIE browsers, the show/hide columns button uses the onmouseover activation method
        // This is done to prevent IE from activating the button dropdown on return keypress.
        const activationAction = navigator.appVersion.indexOf('MSIE') >= 0 ? 'mouseover' : 'click';

        // Change the error mode to thorw js errors instead of alerts.
        $.fn.dataTableExt.sErrMode = 'throw';

        this.grid = $(`#${gridTableId}`).dataTable({
            data: this.dataSet,
            columns: this.columns,
            columnDefs: [
                {
                    targets: [0],
                    visible: false,
                    searchable: false
                },
                {
                    targets: [-1],
                    bSortable: false,
                    searchable: false
                }
            ],
            fnCreatedRow: (nRow, aData, iDataIndex) => {
                $(nRow).attr('id', `${this.gridId}-${aData.urn}`);
                $(nRow).prop('data-urn', `${aData.urn}`);
            },
            sDom: `RC<".gridActionsLeft"<"#${gridFilterId}.left"f>><"clear">tS`,
            colVis: {
                buttonText: '',
                activate: activationAction,
                sAlign: 'right',
                exclude: [0, this.columns.length - 1]
            },
            sScrollY: this.calcDataTableHeight(),
            scrollCollapse: true,
            paging: false,
            sScrollX: true,
            autoWidth: false,
            // We only include here the messages that are going to be shown based on the other
            // configuration options. For the full list see
            // http://datatables.net/manual/i18n
            language: {
                processing: this.msg('processing'),
                search: this.msg('filter')
            },
            order: [[3, 'asc']] // to remove the default ordering by the URN field
        });
        $(`#${gridTableId}`).DataTable().colResize.init();
        $(`#${gridFilterId} > div input`).addClass('text');
        this.gridContainer.find('.ColVis > button').attr('title', this.msg('show_hide_columns'));

        $(`#${gridTableId}`).on('search.dt', this._handleFilteredTable.bind(this));

        // To make sure that the grid-header is always aligned with the rest of the table
        this.gridContainer
            .find('.dataTables_scrollHeadInner')
            .width($(`#${gridTableId}`).width() - 17);
        this.gridContainer.find('.dataTables_scrollHeadInner').on('mousemove', () => {
            this.gridContainer
                .find('.dataTables_scrollHeadInner')
                .width($(`#${gridTableId}`).width());
        });

        if (myw.Browser.android) {
            // Android native browsers don't recognize table-layout:fixed, hence we need to replace it with auto.
            $('table.dataTable').css('table-layout', 'auto !important');
        }
        this.setElement(this.grid);
    }

    /*
     * Sets up sorting orders for different types of editable table data to be used in dataTables
     */
    setupSortingOrder() {
        //Create an array with the values of all the select options in a column
        $.fn.dataTable.ext.order['dom-select'] = function (settings, col) {
            return this.api()
                .column(col, { order: 'index' })
                .nodes()
                .map(function (td, i) {
                    return $('select', td).val();
                });
        };
    }

    // method is called when fillter is applied to the table values.
    _handleFilteredTable() {
        if (this.grid) {
            const filteredList = this.grid.api().rows({ filter: 'applied' }).data(); //list of filtered rows
            let listOfFilteredUrns = filteredList.map(list => list.urn);
            if ($(`#${this.gridId}-table_filter`).find('input').val() === '')
                listOfFilteredUrns = undefined;
            if (this.options.onFilterChange) this.options.onFilterChange(listOfFilteredUrns);
        }
        const dataLength = this.grid.fnGetData().length,
            currentDataLength = this.grid.fnSettings().fnRecordsDisplay();

        if (dataLength > currentDataLength) {
            $(`#${this.gridId}-result-report`).html(
                this.msg('result_report_outof', { count: currentDataLength, outof: dataLength })
            );
        } else {
            $(`#${this.gridId}-result-report`).html(
                this.msg('result_report', { count: dataLength })
            );
        }
    }

    calcDataTableHeight() {
        return $(`#${this.gridId}`).parent().height() - 61; // TO-DO: Calculate the height using the remaining space in the container
    }

    clear() {
        $(`#${this.gridId}`).empty();
    }

    /**
     * Show featureEditor for laborCost feature
     * @param {event} ev
     */
    editLaborCost(ev) {
        const featureUrn = $(ev.currentTarget).parents('tr').prop('data-urn');
        this.owner.showLaborCostEditDialog(featureUrn);
    }
}
