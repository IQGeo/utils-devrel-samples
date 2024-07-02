// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import _ from 'underscore';
import $ from 'jquery';

/**
 * Override render method on ResultsListControl to allow context menu on row item in list.
 * Context menu will allow user to merge and revert feature
 */
const commsResultsListControl = {
    /**
     * Renders the UI to display the information about the current feature set
     */
    render() {
        this.table = $('<table />', { class: 'tbl-results' });
        let zoomClass, row;

        // Add a new element for each selected feature.
        _.each(this.app.currentFeatureSet.items, feature => {
            const title =
                typeof feature.getResultsHoverText == 'function'
                    ? feature.getResultsHoverText()
                    : this.msg('result-info-link');
            zoomClass = feature.getGeometryInWorld('geo') ? '' : 'inactive';
            const urn = feature.getUrn(true, true); //include delta to support same feature in different deltas (forward view)
            const randomNumber = Math.floor(Math.random() * 10001);

            row = $('<tr />', {
                class: `result tr-${feature.getType()}-${feature.id} ${randomNumber}`,
                id: `tr-${urn}`
            });
            row.append(
                `<td class="result-info-col"><div class="result-title" title="${title}">` +
                    `${feature.getResultsHtmlDescription()}</td>${feature.getExtraButtonsHTML()}`
            ).append(
                `<td class="result-zoom-col ${zoomClass}" title="${this.msg(
                    'result-zoom-link'
                )}"></td>`
            );

            row.data('featureUrn', feature.getUrn());
            row.data('rand', randomNumber); //So the context menu rebuilds

            row.on('contextmenu', this.contextMenuItems.bind(this));

            this.table.append(row);
        });

        this.tableContainer = this.$('#results-content-table')
            .empty()
            .append(this.table)
            .scrollTop(0);

        this.formatResults();

        this._setTableHeight();

        this.delegateEvents();
    },

    /**
     * Creates context menu on items found by selector
     * rand is required so the context menu rebuilds each time
     */
    contextMenuItems(e) {
        // Operations at a record level are disabled - dont show context menu
        if (!this.recordOperationsEnabled) {
            e.preventDefault();
            return;
        }

        const featureUrn = $(e.currentTarget).data('featureUrn');
        const rand = $(e.currentTarget).data('rand');

        //Return if not a validationFeature
        const clickedFeature = this.app.currentFeatureSet.items.find(
            feature => feature.getUrn() == featureUrn
        );
        if (!clickedFeature.validationFeatureType || !this.app.getDelta()) return;

        const selector = `.tr-${featureUrn.split('/')[0]}-${featureUrn.split('/')[1]}.${rand}`;

        const buildFunc = function ($triggerElement, e) {
            return {
                callback: async itemName => {
                    if (itemName == 'merge') await this.merge.call(this, clickedFeature);
                    else await this.revert.call(this, clickedFeature);
                },
                items: this.getItems(clickedFeature)
            };
        };
        $.contextMenu({
            selector: selector,
            build: buildFunc.bind(this)
        });
        e.preventDefault();
    },

    /**
     * Gets items for context menu
     * Merge is not on context menu when the feature has been deleted or inserted
     */
    getItems(feature) {
        const merge = {
            name: this.msg('merge'),
            disabled: () => {
                return this._isMergeDisabled(feature);
            }
        };
        const revert = {
            name: this.msg('undo_changes'),
            disabled: () => {
                return this._isRevertDisabled(feature);
            }
        };
        const canMerge = !(
            feature.changeType == 'insert' ||
            feature.changeType == 'delete' ||
            feature.deltaChange == 'delete' ||
            feature.masterChange == 'delete'
        );

        const items = { revert };
        if (canMerge && !myw.isNativeApp) items.merge = merge;
        return items;
    },

    /**
     * Calls merge feature method on commsDsApi
     * @param {myWorldFeature} feature
     */
    async merge(feature) {
        const delta = this.app.getDelta();
        const type = feature.getType();
        const res = await feature.datasource.comms.mergeFeature(delta, type, feature.id);
        const mergeConflictIncomplete = !!res.conflict?.conflict_fields.length;
        const mergeIntegrityIncomplete =
            feature.validationFeatureType == 'integrityError' &&
            res.change?.fields.length !== feature?.changedFields?.length;

        if (feature.validationFeatureType == 'conflictFeature' && mergeConflictIncomplete) {
            //Incomplete conflict merge
            this._mergeIncompleteDialog();
        } else if (feature.validationFeatureType == 'integrityError' && mergeIntegrityIncomplete)
            //Incomplete integrity error merge
            this._mergeIncompleteDialog();
        else {
            //merge complete - remove from feature set
            const newFeatureSet = this.app.currentFeatureSet.items.filter(
                currentSetFeature => currentSetFeature.getUrn() != feature.getUrn()
            );
            this.app.setCurrentFeatureSet(newFeatureSet);
        }
        this.app.map.redraw();
    },

    /**
     * Calls revert feature method on commsDsApi, removes reverted feature from set
     * @param {myWorldFeature} feature
     */
    async revert(feature) {
        const delta = this.app.getDelta();
        const type = feature.getType();
        await feature.datasource.comms.revertFeature(delta, type, feature.id);

        //remove reverted feature from set
        const newFeatureSet = this.app.currentFeatureSet.items.filter(
            currentSetFeature => currentSetFeature.getUrn() != feature.getUrn()
        );
        this.app.setCurrentFeatureSet(newFeatureSet);

        this.app.map.redraw();
    },

    /**
     * Returns true if delta is editable, else returns false
     * @returns {boolean}
     */
    _isEditableState() {
        // Check design owner
        const deltaOwner = this.app.plugins.workflow.currentDeltaOwner;
        const editStates = myw.config['mywcom.editableStates'];
        const editableDelta = editStates.includes(deltaOwner.properties.status);
        return editableDelta;
    },

    /**
     * Enables merge option on context menu if feature hasnt been deleted or inserted
     * @returns {boolean}
     */
    _isMergeDisabled(feature) {
        const editableState = this._isEditableState();
        if (!editableState) return true;
        if (feature.validationFeatureType == 'conflictFeature') {
            return feature.masterChange == 'delete' && feature.deltaChange == 'delete';
        } else if (feature.validationFeatureType == 'featureChange') {
            return feature.changeType == 'insert' || feature.changeType == 'delete';
        }
    },

    /**
     * Disables revert option if not in editable delta
     * @returns {boolean}
     */
    _isRevertDisabled(feature) {
        const editableState = this._isEditableState();
        if (!editableState) return true;
    },

    /**
     * Renders a dialog to show message to the user that the merge has failed
     */
    _mergeIncompleteDialog() {
        const conflirmCloseDialog = myw.dialog({
            title: this.msg('merge_incomplete_title'),
            contents: this.msg('merge_incomplete'),
            buttons: {
                OK: {
                    text: '{:ok_btn}',
                    class: 'primary-btn',
                    click: function () {
                        this.close();
                    }
                }
            }
        });
        conflirmCloseDialog.render();
    }
};

Object.assign(myw.ResultsListControl.prototype, commsResultsListControl);
