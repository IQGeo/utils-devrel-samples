// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import commsFeatureEditor from './commsFeatureEditor';
import { allCoordsEqual } from '../base/geomUtils';
import _ from 'underscore';

export default class RouteEditor extends commsFeatureEditor {
    static {
        this.prototype.messageGroup = 'RouteEditor';
    }

    /**
     * Save route, then split at structs along it
     */
    async save() {
        const featureJson = this.getChanges(this.feature);
        const validated = await this.validateChanges(featureJson);
        if (!validated) return;

        const originalCoords = this.feature.isNew ? null : [...this.feature.geometry.coordinates];
        const newCoords = [...featureJson.geometry.coordinates];

        //Coords equal (or length of 2), nothing more to do
        const dontSplitRoute = newCoords.length == 2 || allCoordsEqual(originalCoords, newCoords);
        if (dontSplitRoute && _.isEmpty(featureJson.conduits) && _.isEmpty(featureJson.cables)) {
            await super.save(); //No need to use overridden methods
            return;
        }

        const feature = await this._save(featureJson);
        let createdRoutes = [feature];

        if (!dontSplitRoute) {
            this.displayMessage(this.msg('splitting_routes'));
            createdRoutes = await this.datasource.comms.splitRoute(
                this.feature.getType(),
                feature.id
            );
        }

        const nestedFeatures = await this._saveNestedFeatures(featureJson);

        // Show number of routes created
        this.displayMessage(this.msg('created_routes', { n: createdRoutes.length }));
        const changeType = this.feature.isNew ? 'insert' : 'update';

        // fire post insert triggers for user change tracking
        if (changeType === 'insert') {
            await this.runNestedFeatureTriggers(nestedFeatures);
        }

        this.app.fire('featureCollection-modified', {
            changeType: changeType,
            feature: this.feature,
            featureType: this.feature.getType()
        });

        this._fireNestedFeatureEvents(nestedFeatures);

        await myw.Util.delay(1000);

        if (createdRoutes.length === 1 && _.isEmpty(nestedFeatures)) {
            this.app.setCurrentFeature(createdRoutes[0]);
        } else {
            this.app.setCurrentFeatureSet([...createdRoutes, ...nestedFeatures]);
        }
    }

    /**
     *
     * @param {*} featureJson
     * @returns
     */
    async _saveNestedFeatures(featureJson) {
        const nestedConduits = await this._saveNestedConduits(featureJson);
        const nestedCables = await this._saveNestedCables(featureJson);
        return [...nestedConduits, ...nestedCables];
    }

    /**
     * If there are conduits that are part of this routes assembly, then add them.
     *
     * @param {*} featureJson
     * @returns New Conduits
     * @private
     */
    async _saveNestedConduits(featureJson) {
        if (_.isEmpty(featureJson.conduits)) return [];

        const conduitManager = this.app.plugins['conduitManager'];
        const structures = this.structures;
        return conduitManager.routeNestedConduits(featureJson.conduits, structures);
    }

    /**
     *
     * @param {*} featureJson
     * @returns
     */
    async _saveNestedCables(featureJson) {
        if (_.isEmpty(featureJson.cables)) return [];

        const cableManager = this.app.plugins['cableManager'];
        const structures = this.structures;
        return cableManager.routeCables(featureJson.cables, structures);
    }

    /**
     * Raise events to update the display for all nested types there were created.
     * @private
     */
    _fireNestedFeatureEvents(features) {
        const featureTypes = _.uniq(features.map(feature => feature.getType()));
        featureTypes.forEach(featureType => {
            this.app.fire('featureCollection-modified', { featureType });
        });
    }

    /**
     * Override validate changes
     * @override
     */
    async validateChanges(featureJson) {
        let validated = await super.validateChanges(featureJson);
        if (validated && (featureJson.conduits || featureJson.cables)) {
            // If conduits are found, then there are child conduits to be added. We need to make sure there are structures.
            const structures = await this.findStructures();

            //Should be two structures since we're looking at both ends.
            if (structures?.length === 2) {
                this.structures = structures;
                validated = true;
            } else {
                const message = this.msg('no_structure');
                this.displayMessage(message, 'error');
                validated = false;
            }
        }
        return validated;
    }

    /**
     * Copied from featureEditor.save without waiting for a second after saving (as we do that later here)
     */
    async _save(featureJson) {
        const isNew = this.feature.isNew;

        const request = isNew ? this.insertFeature(featureJson) : this.updateFeature(featureJson);

        //for the situation where the  save takes some time,
        //disable the buttons (to avoid the user repeating the save thinking we could cancel the save that is already on its way)
        this.$('.button').attr('disabled', true);

        const feature = await request.catch(reason =>
            this._handleSaveError(reason, this.msg('problem_saving'))
        );

        return feature;
    }

    /**
     * Overridden from featureEditor to allow us to always rethrow errors (because we dont want to continue with splitting the route if an error has occured)
     * @private
     */
    _handleSaveError(reason, defaultMessage) {
        if (reason instanceof myw.ObjectNotFoundError) {
            //created object is not accessible (due to filters)
            this.trigger('created_not_accessible', this.msg('created_not_accessible'));
            this.close();
            return;
        }
        let rethrow = true; //Notice rethrow is never set to false in this method
        let message;

        if (reason.messageGroup && reason.messageId) {
            message = myw.msg(reason.messageGroup, reason.messageId);
        } else if (reason.messageId) {
            message = this.msg(reason.messageId);
        } else if (reason instanceof myw.DuplicateKeyError) {
            // Display inline validation error under keyFieldName input
            const editor = this.getFieldEditor(this.feature.keyFieldName);
            const validationResult = this.msg('duplicate_key', { key: editor.getValue() });
            editor.$el.siblings('.inlineValidation').html(validationResult);

            // Display invalid data at bottom of editor
            message = this.msg('invalid_data');
        } else {
            // Unexpected error
            message = defaultMessage;
        }
        this.displayMessage(message, 'error');
        this.$('.button').attr('disabled', false); // Activate the buttons again so another action can be performed
        if (rethrow) throw reason;
    }

    /**
     * Find structures under both ends of the current geometry.
     */
    async findStructures() {
        let coordinates;

        if (this.editGeom) {
            coordinates = this.map.geomDrawMode.getGeometry().coordinates;
        } else {
            coordinates = this.feature.getGeometry().coordinates;
        }

        // Find structures
        const structures = await this.app.plugins.structureManager.getStructuresAtCoords([
            _.first(coordinates),
            _.last(coordinates)
        ]);

        return structures.filter(structure => !!structure);
    }
}
