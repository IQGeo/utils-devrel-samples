import CommsDataTable from '../base/commsDataTable';
import $ from 'jquery';
import _ from 'underscore';

class LaborCostsDataTable extends CommsDataTable {
    static {
        this.prototype.messageGroup = 'LaborCostsDataTable';
    }

    /**
     * Uses the fields to create a columns array for DataTables and an HTML table header object for the grid
     * @param  {string[]} fieldsOrder Array of fields organized in display order
     * @param  {object<fieldDD>}  fieldsDD    Field DD information keyed on field name
     */
    createColumnsAndHeader(fieldsOrder, fieldsDD) {
        const columns = [];
        const gridTableHeaderRow = $('<tr></tr>');
        let headerName;

        // Build the columns list and their corresponding grid header cells
        _.each(fieldsOrder, fieldName => {
            // get the field's dd
            const fieldDD = fieldsDD[fieldName];
            const baseType = fieldDD?.type.split('(')[0];
            let dtType = this.typeMap[baseType] ?? this.typeMap['default'];
            if (fieldDD.unit) dtType = this.typeMap['default'];
            const columnDef = { data: fieldName, type: dtType };

            if (baseType == 'date' || baseType == 'timestamp') {
                //date/times need a separate value for sorting which will be created when generating the dataset
                columnDef.render = { _: 'display', sort: 'iso' };
            }

            columns.push(columnDef);
            // If the field has a unit, add it to its header
            if (fieldDD) headerName = fieldDD.external_name;
            else headerName = '';

            gridTableHeaderRow.append(`<th>${headerName}</th>`);
        });
        // Prepend the column list with URN (as the hidden first column) and the Object name
        columns.unshift(
            { data: 'urn', type: this.typeMap['default'] },
            {
                data: 'on_feature',
                type: 'natural',
                className: 'text-center',
                width: '50',
                resizable: false,
                orderable: false,
                render: (data, type, row, meta) => {
                    const checked = row.labor_costs_on_feature.includes(row.urn.split('/')[1]);
                    const checkboxState = checked ? 'checked' : '';
                    return `<input class="labor-cost-on-feature-checkbox" type="checkbox" ${checkboxState}>`;
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
        // Add a new element for each feature in the list.
        _.each(this.features, feature => {
            let obj = {};

            for (let i = 0; i < fieldsOrder.length; i++) {
                const fieldName = fieldsOrder[i];
                const fieldDD = fieldsDD[fieldName];

                if (fieldDD) {
                    const baseType = fieldDD.type.split('(')[0];
                    const hasMapping = this.typeMap[baseType];
                    const fieldViewer = this._featureViewer.getFieldViewer(feature, fieldDD, {
                        inListView: true
                    });

                    if (baseType == 'date' || baseType == 'timestamp') {
                        const val = feature.getProperties()[fieldName];
                        //for dates to be sorted correctly we need to pass to datatables the iso string - not localised by any field viewer
                        //Dates already come as ISO strings whereas timestamps come as Date objects and need to be converted
                        obj[fieldName] = {
                            display: fieldViewer.$el.text(),
                            iso: (baseType == 'timestamp' ? val?.toISOString() : val) ?? ''
                        };
                        continue;
                    }

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
            obj['urn'] = feature.getUrn(true);
            obj['myw_feature_title'] = _.escape(feature.getTitle());
            obj['-'] = ''; // Dummy blank column data to span the remaining available width
            obj['labor_costs_on_feature'] = this.options.laborCostsOnFeature || [];

            dataSet.push(obj);
        });

        return dataSet;
    }
}

export default LaborCostsDataTable;
