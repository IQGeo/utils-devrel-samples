import { DataTable, Browser } from 'myWorld-client';
import $ from 'jquery';

export default class CommsDataTable extends DataTable {
    static {
        this.prototype.messageGroup = 'SpecDataTable';
    }

    /**
     * Builds a DataTable for the features
     * @override to correctly render the scrollable area (platform 6.5 regression)
     */
    buildTable() {
        this.gridContainer = $(`#${this.gridId}`);
        const gridTableId = `${this.gridId}-table`;
        const gridFilterId = 'grid-filter-container';

        const gridTable = $(`<table class="display" id="${gridTableId}" width="100%"></table>`);
        gridTable.prepend(this.tableHeader);
        this.gridContainer.css('height', '100%'); //Sets a height for the grid so it fills its parent container
        this.gridContainer.html(gridTable);

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
            },
            sDom: `RC<".gridActionsLeft"<"#${gridFilterId}.left"f>><"clear">tS`,
            colVis: {
                buttonText: '',
                activate: 'click',
                sAlign: 'right',
                exclude: [0, this.columns.length - 1]
            },
            paging: false,
            sScrollY: this.calcDataTableHeight(), //COMMS OVERRIDE
            scrollCollapse: true,
            sScrollX: true,
            autoWidth: false,
            // We only include here the messages that are going to be shown based on the other
            // configuration options. For the full list see
            // http://datatables.net/manual/i18n
            language: {
                processing: this.msg('processing'),
                search: this.msg('filter')
            },
            order: [] // to remove the default ordering by the URN field
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
            $(this).width($(`#${gridTableId}`).width());
        });

        if (Browser.android) {
            // Android native browsers don't recognize table-layout:fixed, hence we need to replace it with auto.
            $('table.dataTable').css('table-layout', 'auto !important');
        }
    }

    calcDataTableHeight() {
        return $(`#${this.gridId}`).parent().height() - 61; // TODO: Calculate the height using the remaining space in the container
    }

    /**
     * Subclassed to prevent console errors from superclass
     * @param {MywFeature} feature
     * @override
     */
    _scrollToFeature(feature) {
        return;
    }
}
