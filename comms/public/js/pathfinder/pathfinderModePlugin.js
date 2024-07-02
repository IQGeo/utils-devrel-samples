// Copyright: IQGeo Limited 2010-2023
import React from 'react';
import ReactDOM from 'react-dom/client';
import myw from 'myWorld-client';
import PathfinderModalContainer from './Modal/pathfinderModalContainer';
import CircuitPFEditor from '../models/circuitPFEditor';
import circleSrc from 'images/circle-empty2.png';

export default class PathfinderModePlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'PathfinderModePlugin';
        this.prototype.pluginId = 'pathfinderMode';
        this.mergeOptions({});
        this.prototype.overlays = {};

        this.prototype.buttons = {
            toggle: class extends myw.PluginButton {
                static {
                    this.prototype.imgSrc = 'modules/comms/images/toolbar/path_finder_palette.svg';
                    this.prototype.titleMsg = 'toolbar_msg';
                }

                constructor(...args) {
                    super(...args);
                }

                action() {
                    const modalOptions = {
                        data: {
                            modalType: 'pathFinder',
                            title: '',
                            dialogName: 'PathFinder'
                        }
                    };
                    this.owner.shouldShowOrCreateModal(modalOptions);
                    this.owner.app.recordFunctionalityAccess('comms.pathfinder.open_dialog');
                }

                async hasPermission() {
                    if (myw.isNativeApp) return false;

                    const hasRights =
                        (await this.owner.app.userHasPermission('mywcom.editMaster')) ||
                        this.owner.datasource.getDelta();

                    return hasRights;
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);

        this.map = this.app.map;
        this.active = true;
        this.enabled = false;
        this._initStyles();

        this.app.ready.then(() => {
            this.datasource = this.app.getDatasource('myworld');
        });
    }

    /**
     * Initalizes marker styles
     */
    _initStyles() {
        this.markerStyles = {
            Point: new myw.IconStyle({
                iconUrl: circleSrc,
                iconAnchor: [18, 18]
            }),
            newConnection: new myw.IconStyle({
                iconUrl: 'modules/comms/images/circle-fill-yellow-blue.svg',
                iconAnchor: [18, 18]
            }),
            LineString: new myw.LineStyle({ color: '#0000FF', width: 5, opacity: 0.5 }),
            Polygon: new myw.FillStyle({ color: '#0000FF', opacity: 0.5 })
        };

        this.selectedMarkerStyles = {
            Point: new myw.IconStyle({
                iconUrl: circleSrc,
                iconAnchor: [18, 18]
            }),
            newConnection: new myw.IconStyle({
                iconUrl: 'modules/comms/images/circle-fill-yellow-red.svg',
                iconAnchor: [18, 18]
            }),
            LineString: new myw.LineStyle({ color: '#FF0000', width: 5, opacity: 0.5 }),
            Polygon: new myw.FillStyle({ color: '#FF0000', opacity: 0.5 })
        };
    }

    /**
     * Sets active state of self
     * @param {boolean} active
     */
    async setActive(active) {
        this.active = active;
        if (this.enabled) this.disable();
        this.trigger('changed-state');
    }

    handleVisible(dialogName) {
        const div = document.getElementById(dialogName);
        div.remove();
        this.clearMap();
    }

    createDialogDivElement(dialogName) {
        const div = document.createElement('div');
        div.setAttribute('id', dialogName);
        const body = document.getElementById('myWorldApp');
        body.appendChild(div);
    }

    shouldShowOrCreateModal(modalOptions) {
        if (document.getElementById(modalOptions.data.dialogName)) {
            this.handleVisible(modalOptions.data.dialogName);
        }
        if (!document.getElementById(modalOptions.data.dialogName)) {
            this.createDialogDivElement(modalOptions.data.dialogName);
            const selected = document.getElementById(modalOptions.data.dialogName);

            const root = ReactDOM.createRoot(selected);
            root.render(
                <PathfinderModalContainer
                    // title={this.msg(modalOptions.data.title)}
                    modalContainerName={modalOptions.data.dialogName}
                    handleVisible={this.handleVisible.bind(this)}
                />
            );
        }
    }

    /**
     * Adds trace results features to map for index
     * @param {Array} features
     * @param {Integer} index
     */
    addFeaturesToMap(features, index) {
        const pathNo = index + 1;

        const overlay = (this.overlays[pathNo] = {
            layer: new myw.GeoJSONVectorLayer({ map: this.map }),
            features
        });

        const styleDef = pathNo > 1 ? this.markerStyles : this.selectedMarkerStyles;

        features.forEach(feature => {
            const style = this._getStyleFor(feature, styleDef);
            overlay.layer.addGeom(feature.geometry, style);
        });

        // default the first path to be on top and the current path
        this.overlays[1].layer.setZIndex(150);
        this.currentPath = 1;
    }

    /**
     * Get style for feature based on geometry type. Handles new connection feature.
     * @param {MywFeature} feature
     * @param {Object} styleDef
     * @returns
     */
    _getStyleFor(feature, styleDef) {
        const styleType = feature.isNewConnection
            ? 'newConnection'
            : feature.getGeometry().getType();

        const style = styleDef[styleType];

        return style;
    }

    /**
     * Sets style for features
     * @param {Object}
     * @param {MywStyle} style Mywstyle definition
     */
    _updateStyleFor(overlay, styleDef) {
        const features = overlay.features;

        overlay.layer.clear();

        features.forEach(feature => {
            const style = this._getStyleFor(feature, styleDef);
            overlay.layer.addGeom(feature.geometry, style);
        });
    }

    /**
     * Sets current path's marker style to selected
     * @param {Integer} index selected path index
     */
    setCurrentPath(index) {
        const selectedPathNo = index + 1;

        if (this.currentPath === selectedPathNo) return;

        const currentPathOverlay = this.overlays[this.currentPath];
        const selectedPathOverlay = this.overlays[selectedPathNo];

        this._updateStyleFor(selectedPathOverlay, this.selectedMarkerStyles);
        this._updateStyleFor(currentPathOverlay, this.markerStyles);

        // ensure selected path is on top
        currentPathOverlay.layer.setZIndex(1);
        selectedPathOverlay.layer.setZIndex(150);

        this.currentPath = selectedPathNo;
    }

    /**
     * Clears all trace result features from map
     */
    clearMap() {
        Object.keys(this.overlays).forEach(key => {
            this.overlays[key].layer.clear();
        });
        this.overlays = {};
    }

    /**
     * Open circuit editor for creating new circuit across chosen path
     * @param {Object} pathResult
     * @param {String} featureType
     * @returns
     */
    async openCircuitEditor(pathResult, featureType) {
        const path = pathResult.raw_result.result;

        // Set geometry from coordinates of path
        const result = pathResult.result;
        let coords = [];
        result.items.forEach(item => {
            // Get item geometry as this has been correctly sliced for partial cables
            const geom = item.geometry;
            if (geom.type == 'Point') {
                coords.push(geom.coordinates);
            } else {
                coords = coords.concat(geom.coordinates);
            }
        });

        await this.app.database
            .createDetachedFeature(featureType)
            .then(detachedFeature => {
                detachedFeature.editorClass = CircuitPFEditor;

                // Store information that we need for the editor and calling
                // the server
                detachedFeature._path = path;
                detachedFeature._new_splices = pathResult.properties.new_splices;

                detachedFeature.geometry = {
                    type: 'LineString',
                    coordinates: coords,
                    world_name: 'geo'
                };
                return detachedFeature;
            })
            .then(detachedFeature => this.app.setCurrentFeature(detachedFeature));
    }
}
