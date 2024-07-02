// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import $ from 'jquery';
import commsFeatureEditor from './commsFeatureEditor';
import CircuitRoutingDialog from '../connectivity_ui/circuitRoutingDialog';

export default class CircuitEditor extends commsFeatureEditor {
    static {
        this.prototype.messageGroup = 'CircuitEditor';

        this.prototype.events = Object.assign(
            {
                'click .set-path': 'openRoutingDialog'
            },
            commsFeatureEditor.prototype.events
        );
    }

    constructor(owner, options) {
        super(owner, options);
        this.structureManager = this.app.plugins.structureManager;
        this.connectionManager = this.app.plugins.connectionManager;
    }

    async render() {
        await super.render();

        if (!this.$('.set-path').length) {
            const buttonsDiv = $('<div>', { class: 'content-centered', id: 'set-path-button-div' });
            const setPathBtn = $('<button>', { class: 'button set-path' }).button();
            buttonsDiv.html(setPathBtn);
            setPathBtn.html(this.msg('set_path'));

            let beforeClass = '.feature-edit-actions';
            if (this.popup) beforeClass = '.popup-feature-edit-actions';

            buttonsDiv.insertBefore(this.$(beforeClass));

            this.adjustContainerHeight();
        }
    }

    /**
     * Subclassed to validate required circuit properties
     * @param {Object} featureJson
     */
    async validateChanges(featureJson) {
        let isDataValid = this._validateCircuitProps(featureJson);

        if (!isDataValid) return isDataValid;

        // Run core validation
        isDataValid = await super.validateChanges(featureJson);
        return isDataValid;
    }

    /**
     * Validate Circuit Properties
     */
    _validateCircuitProps(featureJson) {
        let isDataValid = true;
        const fields = ['out_feature', 'out_pins', 'in_feature', 'in_pins'];
        const inValidFields = [];

        // Ensure reuired properties are there
        for (const field of fields) {
            if (!featureJson.properties[field]) inValidFields.push(field);
        }

        isDataValid = inValidFields.length == 0;
        if (!isDataValid) {
            this.displayMessage(this.msg('invalid_route'), 'error');
        }
        return isDataValid;
    }

    /**
     * Save circuit. Overriden to call saveUpdate method
     */
    async save() {
        if (this.feature.isNew) {
            super.save();
        } else {
            await this.saveUpate().catch(error =>
                this.displayMessage(error.message, 'error', true)
            );
        }
    }

    /**
     * Saves update to the database. Unroutes circuit if the circuit has no geometry
     */
    async saveUpate() {
        const featureJson = this.getChanges(this.feature);
        if (featureJson.geometry.coordinates) {
            super.save();
        } else {
            await this._unRouteCircuit(featureJson);
        }
    }

    /**
     * Sets feature geometry to just the termination port, calls unroute circuit which deletes all segments
     */
    async _unRouteCircuit(featureJson) {
        const isDataValid = await this._validateCircuitProps(featureJson);
        if (!isDataValid) return;

        //Set geometry to just the termination port
        const lastCoord =
            this.feature.geometry.coordinates[this.feature.geometry.coordinates.length - 1];
        featureJson.geometry.coordinates = [lastCoord, lastCoord];

        //Run transaction
        const transaction = await this.feature.buildUpdateTransaction(featureJson);
        await this._commsRunTransaction(transaction);
        await this.feature.update(); //refresh feature properties

        //Unroute circuit
        await this.datasource.comms.unrouteCircuit(this.feature);

        this.displayMessage(this.msg('unrouted_circuit'));

        this.app.fire('featureCollection-modified', {
            changeType: 'update',
            feature: this.feature,
            featureType: this.feature.getType()
        });

        await myw.Util.delay(1000); //wait for a second before closing the editor (so the user can see the success message)

        this.close();
        this.trigger('saved', { feature: this.feature, isLocked: this.isLocked });
    }

    // -----------------------------------------------------------------------
    //                              CALLBACKS
    // -----------------------------------------------------------------------

    // Open routing dialog
    async openRoutingDialog() {
        const struct = await this.findTerminationStructure();
        if (!struct) return;

        this.routingDialog = new CircuitRoutingDialog(this, {}, this.feature, struct);
    }

    // Find structure at final vertex of current geometry
    async findTerminationStructure() {
        // Get coord
        let coords = this.app.map.geomDrawMode.getCoords();

        if (!coords.length) {
            this.displayMessage(this.msg('no_geometry'), 'error');
            return;
        }
        const coord = coords[coords.length - 1];

        // Find structure
        const struct = await this.structureManager.getStructureAt(coord);
        if (!struct) {
            this.displayMessage(this.msg('no_structure'), 'error');
            return;
        }

        return struct;
    }

    // Set ports and path
    async setPath(outFeature, outPins) {
        // Set termination
        this.feature.properties.out_feature = outFeature.getUrn(); // ENH: Find a cleaner way
        this.feature.properties.out_pins = outPins.spec;

        // Set path
        // ENH: Use service .. or just leave for insert trigger
        const paths = await this.datasource.comms.pinPaths('fiber', outFeature, outPins, true);
        const coords = paths[outPins.low].in.coords;

        this.app.map.geomDrawMode.setCoords([...coords].reverse()); // Reverse to get the arrows to display in the correct orientation

        // Set service port
        // TODO: Support multiple pins
        const inTracePin = paths[outPins.low].in;
        this.feature.properties.in_feature = inTracePin.feature;
        this.feature.properties.in_pins = `${inTracePin.side}:${inTracePin.pin}`;
    }

    /**
     * @override subclassed to handle invalid circuit path error.
     */
    _handleSaveError(reason, defaultMessage) {
        if (reason instanceof myw.ObjectNotFoundError) {
            //created object is not accessible (due to filters)
            this.trigger('created_not_accessible', this.msg('created_not_accessible'));
            this.close();
            return;
        }
        let rethrow = true;
        let message;

        if (reason.messageGroup && reason.messageId) {
            message = myw.msg(reason.messageGroup, reason.messageId);
            rethrow = false;
        } else if (reason.messageId) {
            message = this.msg(reason.messageId);
            rethrow = false;
        } else if (reason instanceof myw.DuplicateKeyError) {
            // Display inline validation error under keyFieldName input
            const editor = this.getFieldEditor(this.feature.keyFieldName);
            const validationResult = this.msg('duplicate_key', { key: editor.getValue() });
            editor.$el.siblings('.inlineValidation').html(validationResult);

            // Display invalid data at bottom of editor
            message = this.msg('invalid_data');
            rethrow = false;
        } else if (reason instanceof myw.BadRequest) {
            // some of the data is invalid (wasn't caught in validation...)
            message = this.msg('invalid_data_no_field');
            rethrow = false;
        } else if (reason.params?.bad_path) {
            message = this.msg('bad_path', { feature: this.feature.getTitle() });
        } else {
            // Unexpected error
            message = defaultMessage;
        }
        this.displayMessage(message, 'error');
        this.$('.button').attr('disabled', false); // Activate the buttons again so another action can be performed
        if (rethrow) throw reason;
    }
}
