// Copyright: IQGeo Limited 2010-2023
import myw, { Plugin, PluginButton } from 'myWorld-client';
import GeomBulkMoveMode from './geomBulkMoveMode';
import _ from 'underscore';
import { openNotificationWithIcon } from '../reactViews/notification';

export default class BulkMoveModePlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'BulkMoveModePlugin';

        this.prototype.buttons = {
            toggle: class extends PluginButton {
                static {
                    this.prototype.id = 'move-mode';
                    this.prototype.titleMsg = 'toolbar_msg';
                    this.prototype.messageGroup = 'BulkMoveModePlugin';
                    this.prototype.imgSrc = 'modules/comms/images/editor/move.svg';
                }

                /**
                 * @param  {...any} args
                 */
                constructor(...args) {
                    super(...args);
                    this.app.userHasPermission('mywcom.bulkMoveFeatures').then(hasPerm => {
                        if (!hasPerm) this.remove();
                    });
                }

                /**
                 * @override
                 */
                async render() {
                    const hasPermissions =
                        (await myw.app.userHasPermission('mywcom.editMaster')) ||
                        this.owner.datasource.getDelta();
                    // Check and make sure all features in feature set are editable.
                    const features = this.app.currentFeatureSet?.items || [];
                    const areFeaturesEditable = features.reduce((areFeaturesEditable, feature) => {
                        if (!areFeaturesEditable) return areFeaturesEditable;

                        return this.owner.app.isFeatureEditable(feature.type, feature);
                    }, true);

                    const isFeatureSet = this.app.currentFeatureSet?.type === 'features';
                    const isEnabled = this.owner.options.config.enabled;

                    const isActive =
                        areFeaturesEditable && hasPermissions && isFeatureSet && isEnabled;
                    this.setActive(isActive);

                    const isVisible = isFeatureSet && isEnabled;
                    if (isVisible) {
                        this.$el.show();
                    } else {
                        this.$el.hide();
                    }
                }

                /**
                 * @override
                 */
                action() {
                    this.owner.toggle();
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);

        this.redrawableFeatureTypes = [
            ..._.keys(myw.config['mywcom.equipment']),
            ..._.keys(myw.config['mywcom.conduits']),
            ..._.keys(myw.config['mywcom.cables']),
            ..._.keys(myw.config['mywcom.structures']),
            ..._.keys(myw.config['mywcom.routes']),
            ..._.keys(myw.config['mywcom.circuit']),
            'mywcom_route_junction'
        ];
        this.moveableFeatureTypes = {
            ...myw.config['mywcom.structures'],
            ...myw.config['mywcom.routes']
        };

        //Re-render move button
        this.app.on('currentFeatureSet-changed', () => {
            this.trigger('change');
        });
        this.map = this.app.map;
        this.enabled = false;
        this.datasource = this.app.getDatasource('myworld');

        this.options['config'] = {
            enabled: false, //Set disabled if no settings are found.
            ...myw.config['mywcom.bulkMove']
        };

        _.bindAll(this, '_endBulkMoveDrag');
        _.bindAll(this, 'disable');

        this.app.on('selection-cleared', this.disable);

        // ensure turf is available
        myw.geometry.init();
    }

    /**
     * Toggles the moving of selected object on/off
     */
    toggle() {
        if (this.enabled) {
            this.disable();
        } else {
            this.enable();
        }
    }

    enable() {
        if (this.enabled) return;

        try {
            this.moveableFeatures = this._getMoveableFeatures();
        } catch (error) {
            //Show warning if some features selected will not be moved.
            openNotificationWithIcon({
                key: 'bulkMove',
                type: 'warning',
                title: this.msg('warning_selection_title'),
                message: error.message,
                duration: 5
            });
            return;
        }

        const mode = new GeomBulkMoveMode(this.map, { features: this.moveableFeatures });
        this.map.setInteractionMode(mode);
        this.map.on('geomBulkMove-dragEnd', this._endBulkMoveDrag);
        this.map.on('geomBulkMove-end', this.disable);

        this.app.fire('bulkMoveModeDialog', {
            visible: true,
            features: this.moveableFeatures
        });
        this.enabled = true;
    }

    disable() {
        this.app.fire('bulkMoveModeDialog', {
            visible: false
        });

        if (!this.enabled) return;

        this.enabled = false;
        delete this.moveableFeatures;
        delete this.allSelectedFeatures;
        delete this.delta;

        this.map.endCurrentInteractionMode();
        this.map.un('geomBulkMove-dragEnd', this._endBulkMoveDrag);
        this.map.un('geomBulkMove-end', this.disable);
    }

    /**
     * Saves the selected routes and structures with a new geometry.
     */
    async saveMove() {
        if (!this.delta) {
            throw Error('features_not_moved');
        }

        //We want structures to be placed in order before routes.
        const features = this.moveableFeatures.sort((feature1, feature2) => {
            const moveableFeatureTypes = _.keys(this.moveableFeatureTypes);
            return (
                moveableFeatureTypes.indexOf(feature1.getType()) -
                moveableFeatureTypes.indexOf(feature2.getType())
            );
        });

        await this.datasource.comms.bulkMoveFeatures(this.app, features, this.delta);

        this.app.clearResults();
        this.app.setCurrentFeatureSet(features); //This will call disable
        this.fireFeatureEvents();
    }

    /**
     * Raise events to update display etc after a change
     */
    fireFeatureEvents() {
        // Redraw all possible features impacted by moving routes and/or structures.
        this.redrawableFeatureTypes.forEach(featureType => {
            this.app.fire('featureCollection-modified', { featureType });
        });
    }

    _endBulkMoveDrag(event) {
        this.delta = event.delta;
    }

    /**
     * Only routes and structures will be included in selection.
     */
    _getMoveableFeatures() {
        const features = this.app.currentFeatureSet.items;
        //Select all valid features for moving.
        const moveableFeatures = features.filter(
            feature => this.moveableFeatureTypes[feature.getType()]
        );

        if (moveableFeatures.length < this.options.config.selectionLimit.min) {
            throw new Error(
                this.msg('warning_selection_min', { min: this.options.config.selectionLimit.min })
            );
        }

        if (moveableFeatures.length > this.options.config.selectionLimit.max) {
            throw new Error(
                this.msg('warning_selection_max', { max: this.options.config.selectionLimit.max })
            );
        }

        return moveableFeatures;
    }
}
