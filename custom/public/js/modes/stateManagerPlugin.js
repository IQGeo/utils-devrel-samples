// Copyright: IQGeo Limited 2010-2023
import _ from 'underscore';
import myw from 'myWorld-client';
import CableManagerPlugin from '../api/cableManagerPlugin';

/**
 * @class
 * Manages editability of Comms objects based on current design state
 * Informs a set of managedPlugins when design state changes
 * @extends {myw.Plugin}
 */
class StateManagerPlugin extends myw.Plugin {
    static {
        this.mergeOptions({
            // Plugins that will be made active/inactive based on design state
            managedPlugins: [],

            // Feature types over and above what are gathered from settings
            additionalFeatureTypes: []
        });
    }

    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');

        // Get editable design states
        this.editStates = myw.config['mywcom.editableStates'];

        // Settings to get feature types from
        // ENH: Replace by calls to managers
        const settings = [
            'mywcom.structures',
            'mywcom.routes',
            'mywcom.equipment',
            'mywcom.conduits',
            'mywcom.cables',
            'mywcom.circuits'
        ];

        // Get list of managed feature types
        let types = [...CableManagerPlugin.connectionTypes(), ...CableManagerPlugin.segmentTypes()];
        settings.forEach(settingName => (types = types.concat(_.keys(myw.config[settingName]))));
        this.featureTypes = types.concat(this.options.additionalFeatureTypes || []);

        // Check for database readonly
        this.inEditableState = false;

        // Check for disabled
        this.enabled =
            myw.config['mywcom.stateManager'] && myw.config['mywcom.stateManager'].enabled;

        if (!this.enabled) {
            this.inEditableState = true;
            return;
        }

        // Register event handlers
        this.app.on('database-view-changed', async e => {
            await this.setStateFor(e.delta);
        });

        // ENH: The workflow module should raise an event on delta owner update
        this.app.on('featureCollection-modified', async e => {
            if (e.changeType == 'update') {
                const delta = e.feature.datasource.getDelta();
                if (e.feature.getUrn() == delta) await this.setStateFor(delta);
            }
        });

        // Set initial state
        this.app.ready.then(() => {
            this.setStateFor(this.ds.getDelta());
        });
    }

    /**
     * Set editable state based on state of owner of 'delta' (null means master)
     *
     * Informs managed plugins of new state by calling plugin.setActive(editable)
     */
    async setStateFor(delta) {
        this.inEditableState = await this._inEditableState(delta);

        // Inform managed plugins
        this.options.managedPlugins.forEach(pluginName => {
            const plugin = this.app.plugins[pluginName];
            if (plugin) plugin.setActive(this.inEditableState); //ENH: Handle errors
        });
    }

    /**
     * Checks if user is in editable state
     * @returns {Boolean}
     */
    async _inEditableState(delta) {
        // Check user has right to edit features
        const editFeatures = await this.app.userHasPermission('editFeatures');
        if (!editFeatures) return false;

        // Check for Native App database not writable
        const ds = this.app.getDatasource('myworld');
        if (!ds.isEditable()) return false;

        // Check design owner is in editable state
        if (delta) {
            const deltaOwner = await this.app.database.getFeatureByUrn(delta);
            return this.editStates.includes(deltaOwner.properties.status);
        } else {
            const userHasPermission = await this.app.userHasPermission('mywcom.editMaster');
            return userHasPermission;
        }
    }

    /**
     * True if featureType can currently be edited
     */
    isFeatureEditable(featureType, feature) {
        if (this.inEditableState) return true;

        // Not in an editable state, so prevent edit if its a feature type we manage
        return !_.includes(this.featureTypes, featureType);
    }
}

export default StateManagerPlugin;
