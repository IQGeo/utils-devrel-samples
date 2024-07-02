// Copyright: IQGeo Limited 2010-2023
import myw, {
    DeltaOwnerPlugin,
    PluginButton,
    GeoJSONVectorLayer,
    LineStyle,
    Dialog
} from 'myWorld-client';
import $ from 'jquery';
import _ from 'underscore';
import ItemSelectDialog from '../base/itemSelectDialog';
import CommsDeltaOwnerWatermark from './commsDeltaOwnerWatermark';
import CommsDeltaOwnerToolbar from './commsDeltaOwnerToolbar';
import UpdateBoundsModal from './updateBoundsModal';
import openImgSrc from 'images/actions/open.svg';
import listImgSrc from 'images/actions/list.svg';
import showConflictsImgSource from 'images/actions/show_conflicts.svg';
import mergeImgSrc from 'images/actions/merge.svg';
import promoteImgSrc from 'images/actions/promote.svg';
import bomImgSrc from 'modules/comms/images/actions/reports.svg';
import uploadeImgSrc from 'modules/comms/images/actions/import.svg';
import exportImg from 'images/actions/export.svg';
import closeImgSrc from 'images/actions/delta-close.svg';
import redrawImgSrc from 'modules/comms/images/toolbar/redraw.svg';
import CableManagerPlugin from '../api/cableManagerPlugin';

export default class CommsDeltaOwnerPlugin extends DeltaOwnerPlugin {
    static {
        this.prototype.messageGroup = 'CommsDeltaOwnerPlugin';

        // ----------------------------------------------------
        //  Action Buttons
        // ----------------------------------------------------
        // Overwritten to disable when busy

        // Open delta owned by current design
        this.prototype.OpenButton = class OpenButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'open_design';
                this.prototype.imgSrc = openImgSrc;
            }

            action() {
                this.owner.openDeltaFor(this.app.currentFeature);
            }

            render() {
                this.app.currentFeature?.isEditable().then(editable => {
                    this.setActive(
                        editable && !this.owner.isCurrentDeltaOwner(this.app.currentFeature)
                    );
                });
            }
        };

        /**
         * Set the current feature set to the elements of the current design
         */
        this.prototype.SelectElementsButton = class SelectElementsButton extends PluginButton {
            static {
                this.prototype.className = 'list-export';
                this.prototype.titleMsg = 'show_elements';
                this.prototype.imgSrc = listImgSrc;

                this.prototype.events = {
                    mouseover: 'showMenu',
                    mouseout: 'hideMenu',
                    'click .delta-changes': 'deltaChanges',
                    'click .user-changes': 'userChanges'
                };
            }

            initUI() {
                const html = `<ul class='hidden sub-list-export'>
                                <li class='delta-changes'>${this.owner.msg('system_changes')}</li>
                                <li class='user-changes'>${this.owner.msg('user_changes')}</li>
                            </ul>`;
                this.$el.append(html);
            }

            render() {
                this.setActive(
                    this.owner.isCurrentDeltaOwner(this.app.currentFeature) && !this.owner.busy
                );
            }

            /*
             * Sets the title of the button only when its part of a menu
             * @param {string} titleMsg Message key to retrieve the button title
             */
            setTitle(titleMsg) {
                if (this.mode === 'menu') {
                    this.buttonTitle.html(this.owner.msg(titleMsg));
                }
            }

            showMenu() {
                if (this.$el.attr('class').indexOf('inactive') != -1) return;
                this.$('ul').show();
            }

            hideMenu() {
                this.$('ul').hide();
            }

            /**
             * Displays filter for showing delta changes
             */
            deltaChanges() {
                const validationPlugin = this.app.plugins.validation;
                validationPlugin.changesFilterDialog();
            }

            /**
             * Shows user changes in the design
             */
            async userChanges() {
                const [users, featureChanges] =
                    await this.owner.app.plugins.designChangeTracker.getUsersForChanges();
                const dialog = new ItemSelectDialog(this, {
                    title: this.owner.msg('select_users'),
                    data: users,
                    action: userList => {
                        this.owner.app.plugins.designChangeTracker.userChanges(
                            userList,
                            featureChanges
                        );
                    }
                });
                dialog.open();
            }
        };

        /**
         * Sets the current feature set to conflicted elements of the current design
         */
        this.prototype.ShowConflictsButton = class ShowConflictsButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'show_conflicts';
                this.prototype.imgSrc = showConflictsImgSource;
            }

            async action() {
                this.owner.doAction(this.owner.selectConflicts);
            }

            render() {
                this.setActive(
                    this.owner.isCurrentDeltaOwner(this.app.currentFeature) && !this.owner.busy
                );
            }
        };

        /**
         * Runs conflict auto-resolution
         */
        this.prototype.MergeButton = class MergeButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'merge';
                this.prototype.imgSrc = mergeImgSrc;
            }

            action() {
                const merge = this.owner.merge;
                const args = { message: 'fix_conflicts_message', title: 'fix_conflicts_title' };
                this.owner._loadWarningModal(merge, args);
            }

            render() {
                let editable = this.owner.isEditable;
                const state = this.owner.currentDeltaOwner?.properties.status;
                if (!this.owner.editableStates.includes(state)) editable = false;
                this.setActive(
                    editable &&
                        this.owner.isCurrentDeltaOwner(this.app.currentFeature) &&
                        !this.owner.busy
                );
            }
        };

        /**
         * Integrates current design into master
         */
        this.prototype.PromoteElementsButton = class PromoteElementsButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'promote_elements';
                this.prototype.imgSrc = promoteImgSrc;
            }

            action() {
                const publish = this.owner.publishElements;
                const args = { message: 'publish_message', title: 'publish_title' };
                this.owner._loadWarningModal(publish, args);
            }

            render() {
                let editable = this.owner.isEditable;
                const state = this.owner.currentDeltaOwner?.properties.status;
                if (!this.owner.editableStates.includes(state)) editable = false;
                this.setActive(
                    editable &&
                        this.owner.isCurrentDeltaOwner(this.app.currentFeature) &&
                        !this.owner.busy
                );
            }
        };

        /**
         * Shows data upload dialog
         */
        this.prototype.ExportButton = class ExportButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'export_design';
                this.prototype.imgSrc = exportImg;
            }

            action() {
                this.owner.renderExportDialog();
            }

            render() {
                this.setActive(
                    this.owner.isCurrentDeltaOwner(this.app.currentFeature) && !this.owner.busy
                );
            }
        };

        /**
         * Shows Bill of Materials Report
         */
        this.prototype.BOMButton = class BOMButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'create_BOM_report';
                this.prototype.imgSrc = bomImgSrc;
            }

            action() {
                const generateBOMcall = this.owner.showBOMReport;
                const args = { message: 'generate_BOM_message', title: 'generate_BOM_title' };
                this.owner._loadWarningModal(generateBOMcall, args);
            }

            render() {
                this.setActive(
                    this.owner.isCurrentDeltaOwner(this.app.currentFeature) && !this.owner.busy
                );
            }
        };

        /**
         * Shows data upload dialog
         */
        this.prototype.DataImportButton = class DataImportButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'upload_data';
                this.prototype.imgSrc = uploadeImgSrc;
            }

            action() {
                this.owner.doAction(this.owner.showDataImportDialog);
            }

            render() {
                let editable = this.owner.isEditable;
                const state = this.owner.currentDeltaOwner?.properties.status;
                if (!this.owner.editableStates.includes(state)) editable = false;
                this.setActive(
                    editable &&
                        this.owner.isCurrentDeltaOwner(this.app.currentFeature) &&
                        !this.owner.busy
                );
            }
        };

        /**
         * Redraws the boundary of the design to the extent of the design changes
         */
        this.prototype.RedrawBoundsButton = class RedrawBoundsButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'redraw_bounds';
                this.prototype.imgSrc = redrawImgSrc;
            }

            action() {
                this.owner.doAction(this.owner.renderUpdateBoundsModal);
            }

            render() {
                let editable = this.owner.isEditable;
                const state = this.owner.currentDeltaOwner?.properties.status;
                if (!this.owner.editableStates.includes(state)) editable = false;
                this.setActive(
                    editable &&
                        this.owner.isCurrentDeltaOwner(this.app.currentFeature) &&
                        !this.owner.busy
                );
            }
        };

        /**
         * Closes current design
         */
        // ENH: Rename as CloseDeltaButton in workflow module
        this.prototype.CloseDeltaOwnerButton = class CloseDeltaOwnerButton extends PluginButton {
            static {
                this.prototype.titleMsg = 'close_design';
                this.prototype.imgSrc = closeImgSrc;
            }

            action() {
                this.owner.doAction(this.owner.closeDelta);
            }

            render() {
                this.setActive(
                    this.owner.isCurrentDeltaOwner(this.app.currentFeature) && !this.owner.busy
                );
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);
        this.app = owner;
        this.ds = owner.getDatasource('myworld');

        const deltaOwners = Object.keys(myw.config['mywcom.designs']);

        // workaround for options 'undefined' if localstate=false in url
        // const opts = options || {};
        this.options.deltaOwners = deltaOwners;
        this.allCategories = [
            'structures',
            'routes',
            'conduits',
            'conduit_runs',
            'equipment',
            'cables',
            'segments',
            'connections',
            'circuits',
            'line_of_counts',
            'other'
        ];
        this.categoryFeatures = this.getCategoryFeatures();

        this.editableStates = myw.config['mywcom.editableStates'];
        this.toolbar = new CommsDeltaOwnerToolbar(this);

        // Add extra toolbar buttons
        this.toolbar.buttons.splice(this.toolbar.buttons.length - 1, 0, {
            owner: this,
            Button: this.BOMButton
        });

        this.toolbar.buttons.splice(this.toolbar.buttons.length - 1, 0, {
            owner: this,
            Button: this.RedrawBoundsButton
        });

        if (!myw.isNativeApp) {
            this.toolbar.buttons.splice(this.toolbar.buttons.length - 1, 0, {
                owner: this,
                Button: this.DataImportButton
            });
        }

        this.watermark = this._createWatermark();

        //Check if user can publish designs
        this.ready = new Promise(resolve => {
            this.app.userHasPermission('mywcom.publishDesign').then(canPublish => {
                if (!canPublish) {
                    this._removeToolbarButton('promote_elements');
                }
                this.app.userHasPermission('editFeatures').then(canEdit => {
                    if (!canEdit) {
                        this._removeToolbarButton('merge');
                        this._removeToolbarButton('upload_data');
                    }
                    resolve();
                });
            });
        });

        myw.geometry.init();
        this.previewLayer = new GeoJSONVectorLayer({ map: this.app.map });
        this.previewStyles = myw.config['mywcom.previewCableStyles'];
        this.style = new LineStyle(this.previewStyles.insert);
    }

    setActive(editable) {
        this.isEditable = editable;
    }

    /**
     * Update the state of the map label for change to current delta owner
     *
     * @override
     */
    updateMapWatermark() {
        const mapPane = this.app.map.getTargetElement();

        // Remove existing label
        $(mapPane).find('.delta-owner-map-watermark').remove();

        // Create new label .. and add click handler
        if (this.currentDeltaOwner) {
            this.watermark.currentDeltaOwner = this.currentDeltaOwner;
            this.watermark.onSelect = this.selectDeltaOwner.bind(this);

            const watermarkElement = this.watermark.render();
            const watermarkHandle = watermarkElement.find('#watermark-handle');

            $(mapPane).append(watermarkElement);

            watermarkElement.draggable({ handle: watermarkHandle, containment: '#map_canvas' });
        }
    }

    /**
     * Set the current feature set to the elements of the current design
     */
    // Overwritten to show feature changes
    // ENH: Move to workflow
    async selectElements() {
        const delta = this.currentDeltaOwner.getUrn();
        const features = await this.datasource.comms.deltaChanges(delta);

        if (features.length == 0) {
            this.showMessage(this.msg('no_elements'));
            return;
        }

        this.app.setCurrentFeatureSet(features);
    }

    /**
     * Construct lookup from category to features
     */
    getCategoryFeatures() {
        const misc = {
            connections: CableManagerPlugin.connectionTypes(),
            segments: CableManagerPlugin.segmentTypes(),
            conduit_runs: ['mywcom_conduit_run'],
            line_of_counts: ['mywcom_line_of_count', 'mywcom_line_of_count_section']
        };

        const categoryFeatures = {};
        const allFeatures = [];

        for (const category of this.allCategories) {
            if (category === 'other') continue;

            const key = `mywcom.${category}`;
            const types = key in myw.config ? Object.keys(myw.config[key]) : misc[category];

            categoryFeatures[category] = types;
            allFeatures.push(...types);
        }

        // Other category is all other version features not already accounted for.
        const versionedFeatures = _.keys(_.pick(this.ds.featuresDD, data => data.versioned));

        categoryFeatures['other'] = versionedFeatures.filter(ft => !allFeatures.includes(ft));

        return categoryFeatures;
    }

    /**
     * Returns feature types for a list of categories
     * @param {*} categories
     * @returns
     */
    featuresForCategories(categories) {
        const featureTypes = [];
        for (const category of categories) {
            const types = this.categoryFeatures[category];
            featureTypes.push(...types);
        }

        return featureTypes;
    }

    /**
     * Set the current feature set to the elements of the current design
     */
    async changesFiltered(categories, bounds = null, limit = null, bounds_poly = null) {
        const delta = this.currentDeltaOwner.getUrn();

        const featureTypes = this.featuresForCategories(categories);
        const features = await this.datasource.comms.deltaChanges(
            delta,
            null,
            bounds,
            featureTypes,
            limit,
            bounds_poly
        );

        if (features.length == 0) {
            this.showNoElementsMsg();
            return;
        }

        this.app.setCurrentFeatureSet(features);
    }

    showNoElementsMsg() {
        this.showMessage(this.msg('no_elements'));
    }

    /**
     * Launch dialog allowing user to find conflicts/broken data/check design rules
     */
    async selectConflicts() {
        const validationPlugin = this.app.plugins.validation;
        validationPlugin.checkDesignDialog();
    }

    /**
     * Apply auto-conflict resolution and geometry fixup
     */
    async merge() {
        const delta = this.currentDeltaOwner.getUrn();
        let changedFeatures = [];

        // Apply custom auto-resolution
        const conflicts = await this.datasource.deltaConflicts(delta);
        if (this.currentDeltaOwner.resolveConflicts) {
            const features = await this.currentDeltaOwner.resolveConflicts(conflicts);
            changedFeatures = [...changedFeatures, ...features];
        }

        // Apply standard auto-resolution and fixup
        const features = await this.datasource.comms.mergeDelta(delta);
        changedFeatures = [...changedFeatures, ...features];

        // Show changed objects
        // ENH: Provide more info
        if (changedFeatures.length) {
            this.app.setCurrentFeatureSet(changedFeatures);
        } else {
            this.showMessage(this.msg('no_changes_made'));
        }
    }

    /**
     * Integrate current design into master
     */
    async publishElements() {
        const deltaOwner = this.currentDeltaOwner;
        const delta = deltaOwner.getUrn();
        const externalName = deltaOwner.featureDD.external_name;

        // Check for cannot publish
        const hasConflicts = await this.datasource.deltaHasConflicts(delta);

        if (hasConflicts) {
            this.showWarning(this.msg('has_conflicts', { deltaOwnerTitle: externalName }));
            return;
        }

        // Check if have any validation errors
        const validationConflicts = await this.datasource.comms.validateDelta(delta, null, [], 1);

        if (validationConflicts.length) {
            this.showWarning(this.msg('has_errors', { deltaOwnerTitle: externalName }));
            return;
        }

        // Publish
        const nChanges = await this.datasource.deltaPromote(delta);
        if (nChanges > 0) {
            this.showMessage(this.msg('n_changes_applied', { nChanges }));
        } else {
            this.showWarning(this.msg('no_elements_to_publish', { deltaOwnerTitle: externalName }));
        }

        myw.app.plugins.designChangeTracker.deleteChangeDetails(delta);
    }

    /**
     * Display bill-of-materials report (summarises design content and costs)
     */
    async showBOMReport() {
        const deltaOwner = this.currentDeltaOwner;

        const structs = Object.keys(myw.config['mywcom.structures']);
        const routes = Object.keys(myw.config['mywcom.routes']);
        const equip = Object.keys(myw.config['mywcom.equipment']);
        const conduits = Object.keys(myw.config['mywcom.conduits']);
        const cables = Object.keys(myw.config['mywcom.cables']);
        const segments = CableManagerPlugin.segmentTypes();

        const featureTypes = [...structs, ...routes, ...equip, ...conduits, ...cables, ...segments];

        const changes = await this.datasource.comms.deltaChanges(
            deltaOwner.getUrn(),
            null,
            null,
            featureTypes
        );

        const BOMReport = this.app.plugins.reportManager.designReports.bomReport;
        const rep = new BOMReport(this.app, changes, deltaOwner);
        await rep.build();
        this.app.plugins.reportManager.preview(rep.title(), rep);
    }

    /**
     * Display data upload dialog
     */
    async showDataImportDialog() {
        const mgr = this.app.plugins.dataImportManager;
        mgr.showImportDialog();
    }

    async _loadWarningModal(method, args) {
        let { message, title } = args;
        const _this = this;
        new Dialog({
            contents: this.msg(message),
            destroyOnClose: true,
            title: this.msg(title),
            buttons: {
                OK: {
                    text: this.msg('ok_btn'),
                    click: async function () {
                        this.close();
                        await _this.doAction(method);
                    }
                },
                Cancel: {
                    text: this.msg('cancel_btn'),
                    class: 'right',
                    click() {
                        this.close();
                    }
                }
            }
        });
    }

    /**
     * Update deltaOwner bounds as convex hull of delta changes
     */
    async updateDeltaOwnerBounds(deltaBounds) {
        // Will occur if delta has no changes
        if (!deltaBounds.geometry) {
            this.showMessage(this.msg('no_elements'));
            return;
        }

        this.currentDeltaOwner.geometry = deltaBounds.geometry;

        // update the deltaOwner feature and notify
        await this.datasource.updateFeature(this.currentDeltaOwner);

        // Notify design layer to update
        this.app.fire('featureCollection-modified', {
            changeType: 'update',
            feature: this.currentDeltaOwner,
            featureType: this.currentDeltaOwner.getType()
        });

        if (this.app.currentFeature?.getUrn() == this.currentDeltaOwner.getUrn())
            this.app.setCurrentFeature(this.currentDeltaOwner);
    }

    async renderUpdateBoundsModal() {
        const deltaBounds = await this.datasource.comms.deltaBounds(this.datasource.delta);
        this.renderPreviewLayer(deltaBounds);
        const title = `${this.msg('update_bounds_title')}`;
        const contents = !deltaBounds.geometry
            ? `${this.msg('no_elements')}`
            : `${this.msg('accept_bounds')}?`;
        new UpdateBoundsModal(this, { deltaBounds, title, contents });
    }

    async renderPreviewLayer(deltaBounds) {
        if (deltaBounds.geometry) {
            this.previewLayer.addPolygon(deltaBounds.geometry.coordinates, this.style);
            /* eslint-disable no-undef */
            const bbox = turf.bbox(deltaBounds.geometry);
            const bounds = myw.latLngBounds([bbox[0], bbox[1]], [bbox[2], bbox[3]]);
            this.app.map.fitBounds(bounds);
            /* eslint-enable no-undef */
        }
    }

    clearLayer() {
        this.previewLayer.clear();
    }

    /**
     * Run async method this.meth() handling errors
     */
    // ENH: Move to pluginButton
    async doAction(meth, args) {
        if (this.app.currentFeature?.getUrn() !== this.currentDeltaOwner.getUrn()) {
            this.app.setCurrentFeatureSet([]);
        }
        this.setBusy(true, meth.name);
        try {
            meth = meth.bind(this);
            await meth(args);
        } catch (err) {
            this.showWarning(this.msg('internal_error', { name: err.name, message: err.message }));
            throw err;
        } finally {
            this.setBusy(false);
        }
    }

    /**
     * Set or clear the busy flag
     * Show or destroy loading spinner
     */
    setBusy(busy, methodName) {
        this.busy = busy;
        if (busy) this._showLoadingSpinner(methodName);
        else this.closeLoadingSpinner();
        this.toolbar.render();
    }

    /**
     * Show a dialog with a loading icon
     * @private
     */
    _showLoadingSpinner(methodName) {
        if (!this.loadingSpinner) {
            this.loadingSpinner = $(
                `<img src="modules/comms/images/actions/loading.svg" alt="${this.msg(
                    methodName
                )}" />`
            ).dialog({
                modal: true,
                width: 'auto',
                resizable: false,
                position: { my: 'center', at: 'center', of: window },
                closeText: this.msg('close')
            });
            this.loadingSpinner.dialog('widget').addClass('noStyle');
        } else {
            this.loadingSpinner.dialog('open');
        }
    }

    /**
     * Close loading spinner dialog
     */
    closeLoadingSpinner() {
        this.loadingSpinner?.dialog('close');
    }

    /**
     * Removes delta toolbar and watermark toolbar button with name 'buttonName'
     */
    _removeToolbarButton(buttonName) {
        const toolbars = [this.toolbar, this.watermark];

        toolbars.forEach(toolbar => {
            if (!toolbar) return;
            const index = toolbar.buttons.findIndex(
                button => button.Button.prototype.titleMsg == buttonName
            );
            if (index > -1) toolbar.buttons.splice(index, 1);
        });
    }

    _createWatermark() {
        // Define which toolbar buttons will be included in watermark.
        const buttons = [];

        // Should the button be active while not in a designing state
        let editable = false;

        buttons.push({ button: this.SelectElementsButton });
        buttons.push({ button: this.ShowConflictsButton });

        if (!myw.isNativeApp) {
            buttons.push({ button: this.MergeButton, editable: editable });
            buttons.push({ button: this.PromoteElementsButton, editable: editable });
            buttons.push({ button: this.ExportButton, editable: editable });
        }

        buttons.push({ button: this.BOMButton });
        buttons.push({ button: this.RedrawBoundsButton, editable: editable });

        if (!myw.isNativeApp) {
            buttons.push({ button: this.DataImportButton, editable: editable });
        }

        buttons.push({ button: this.CloseDeltaOwnerButton });
        return new CommsDeltaOwnerWatermark(this, buttons);
    }

    /*
     * Subclassed to delete change details records
     */
    async handleFeatureEdited(e) {
        super.handleFeatureEdited(e);

        if (!e.feature || !this.isDeltaOwner(e.feature)) return;

        // Handle deletion of delta owner
        if (e.changeType == 'delete') {
            this.app.plugins.designChangeTracker.deleteChangeDetails(e.feature.getUrn());
        }
    }

    /**
     * @override to add spinners, add file extension
     */
    async export(options) {
        this.setBusy(true, 'export');
        options.fileExt = 'zip';
        await DeltaOwnerPlugin.prototype.export.call(this, options);
        this.setBusy(false);
    }
}
