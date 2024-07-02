// Copyright: IQGeo 2023
import myw from 'myWorld-client';
import $ from 'jquery';
import commsFeatureEditor from './commsFeatureEditor';
import _ from 'underscore';
import Overlay from 'ol/Overlay';
import { fromLonLat } from 'ol/proj';

export default class ConduitEditor extends commsFeatureEditor {
    static {
        this.prototype.messageGroup = 'ConduitEditor';

        this.prototype.events = Object.assign(
            {
                'click .preview-route': 'previewPath'
            },
            commsFeatureEditor.prototype.events
        );
    }

    constructor(owner, options) {
        options.editGeom = options.feature.isNew;
        super(owner, options);

        this.structureManager = this.app.plugins['structureManager'];
        this.conduitManager = this.app.plugins['conduitManager'];
        this.previewStyles = myw.config['mywcom.previewCableStyles'];

        this._initPreviewLayers();
    }

    async render() {
        await super.render();
        if (!this.editGeom) return;

        //Show preview button
        if (!this.$('.preview-route').length) {
            const previewDiv = $('<div>', {
                class: 'content-centered',
                id: 'preview-route-button-div'
            });
            const preview = $('<button>', {
                class: 'button preview-route'
            }).button();
            previewDiv.html(preview);
            preview.html(this.msg('preview_path'));

            let beforeClass = '.feature-edit-actions';
            if (this.popup) beforeClass = '.popup-feature-edit-actions';

            previewDiv.insertBefore(this.$(beforeClass));

            this.adjustContainerHeight();
        }
    }

    _initPreviewLayers() {
        const map = this.map;
        this.insertPreviewStyle = new myw.LineStyle(this.previewStyles.insert);

        this.insertPreviewLayer = new myw.GeoJSONVectorLayer({
            map: map
        });

        this.previewLayers = [this.insertPreviewLayer];
    }

    // -----------------------------------------------------------------------
    //                              CALLBACKS
    // -----------------------------------------------------------------------

    // Show path that will be used to create conduits on save
    async previewPath() {
        await this.previewInsert().catch(error =>
            this.displayMessage(error.message, 'error', true, () => {
                this.clearPreview();
            })
        );
    }

    // Create conduits
    async save() {
        if (this.feature.isNew) {
            await this.saveInsert().catch(error =>
                this.displayMessage(error.message, 'error', true, () => {
                    this.clearPreview();
                })
            );
            this.clearPreview();
        } else {
            super.save();
        }
    }

    // -----------------------------------------------------------------------
    //                              INSERT
    // -----------------------------------------------------------------------

    // Show path that will be used to route conduit when saved
    async previewInsert() {
        this.clearPreview();
        const routes = await this.findPath();
        await this.showPath(routes);
    }

    // Create conduits along route
    async saveInsert() {
        // Get attributes
        const featureJson = this.getChanges(this.feature);
        if (!(await this.validateChanges(featureJson))) return;

        // Run preInsert hook
        await this.feature.preInsert(featureJson, this.app);

        // Do we want to create a continuous conduit or not
        const continuous = this.continuous();

        // How many paths of conduits to create
        const numPaths = featureJson.properties.bundle_size || 1;

        this.displayMessage(this.msg('creating_conduits'));

        const structs = await this.findStructures();

        let createdConduits = [];
        if (featureJson.conduits) {
            // Disable button because this operation could take a few seconds.
            this.$('.button').attr('disabled', true);

            featureJson.feature_type = this.feature.type;
            createdConduits = await this.conduitManager.routeNestedConduits([featureJson], structs);

            // Show how many conduits were created.
            this.displayMessage(this.msg('created_conduits', { n: createdConduits.length }));
        } else {
            createdConduits = await this.datasource.comms.routeConduit(
                this.feature.type,
                featureJson,
                structs,
                numPaths
            );

            // Show what we did
            if (continuous) {
                this.displayMessage(this.msg('created_continuous_conduits', { n: numPaths }));
            } else {
                this.displayMessage(this.msg('created_conduits', { n: createdConduits.length }));
            }
        }

        // fire posInsert trigger for user change tracking
        await this.runNestedFeatureTriggers(createdConduits);

        this.app.fire('featureCollection-modified', { featureType: this.feature.type });

        await myw.Util.delay(1000);

        this.app.setCurrentFeatureSet(createdConduits);
    }

    // Find routing for current geom (showing progress)
    // Returns list of routes
    async findPath() {
        // Do we want to create a continuous conduit or not
        const continuous = this.continuous();

        // How many paths of conduits to create
        const featureJson = this.getChanges(this.feature);
        const numPaths = featureJson.properties.bundle_size || 1;

        // ENH: Check for no geometry
        this.displayMessage(this.msg('finding_path'), 'alert');

        const structs = await this.findStructures();
        const routes = await this.datasource.comms.findConduitPath(this.feature, structs);

        if (!routes.length) throw new Error(this.msg('no_path_found'));

        let foundMsg;
        if (continuous) {
            foundMsg = this.msg('found_continuous_path', {
                n: numPaths
            });
        } else {
            foundMsg = this.msg('found_path', { n: routes.length * numPaths });
        }

        this.displayMessage(foundMsg, 'alert', true, () => {
            this.clearPreview();
        });

        return routes;
    }

    /**
     * Asks the structure manager to validate the route for conduit, i.e. don't add conduits to oh routes
     * if routes are invalid raise an error
     * @param  {array} routes
     */
    validateRoutes(routes) {
        const inValidRoutes = this.structureManager.validateRoutesForConduit(routes, this.feature);

        if (inValidRoutes) {
            const msg = this.msg('invalid_routes');
            throw new Error(msg);
        }
    }

    // Returns boolean as to whether conduit is continuous or not
    continuous() {
        const featureCfg = myw.config['mywcom.conduits'][this.feature.getType()];

        return featureCfg && featureCfg.continuous;
    }

    // -----------------------------------------------------------------------
    //                              PATH FINDING
    // -----------------------------------------------------------------------

    // Find structures under current geometry (highlighting if they don't exist)
    async findStructures() {
        let coords;

        if (this.editGeom) {
            coords = this.map.geomDrawMode.getGeometry().coordinates;
        } else {
            coords = this.feature.getGeometry().coordinates;
        }
        // Find structures
        const structs = await this.structureManager.getStructuresAtCoords(coords);

        // If some bad .. highlight them
        const missing = [];
        _.each(structs, (s, i) => {
            if (!s) missing.push({ coord: coords[i], msg: (i + 1).toString() });
        });

        if (missing.length) {
            this.showVertices(missing); // No await is deliberate
            const msg = this.msg('no_structure', { indexes: _.map(missing, 'msg').join(', ') });
            throw new Error(msg);
        }

        return structs;
    }

    //Briefly show new path on map
    async showPath(routes) {
        this.clearPreview();

        // Add features to map to highlight route changes
        _.each(routes, feature => {
            this.insertPreviewLayer.addLine(feature.geometry.coordinates, this.insertPreviewStyle);
        });
    }

    async showVertices(items) {
        this.clearPreview();
        this.vertexLabels = [];

        _.each(items, item => {
            // use ol/Overlay
            // need add element to dom first
            const elId = `vertex-label-${item.msg}`;
            const $el = $(`<span id='${elId}' class='vertex-label'>${item.msg}</span>`);
            $('body').append($el);

            // init ol/Overlay
            const element = document.getElementById(elId);
            const overlay = new Overlay({ element });
            const pos = fromLonLat(item.coord);
            overlay.setPosition(pos);
            // add to map
            this.map.addOverlay(overlay);
            this.vertexLabels.push([overlay, elId]);
        });
    }

    // Remove preview features from map
    clearPreview() {
        if (this.previewLayers) {
            this.previewLayers.forEach(previewLayer => {
                previewLayer.clear();
            });
        }

        if (this.vertexLabels) {
            this.vertexLabels.forEach(overlay => {
                this.map.removeOverlay(overlay[0]);
                const id = `#${overlay[1]}`;
                $(id).remove();
            });
        }
    }

    // Subclassed to clear preview on close
    close() {
        this.clearPreview();
        super.close();
    }
}
