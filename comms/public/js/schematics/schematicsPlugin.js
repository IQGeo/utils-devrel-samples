// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import SchematicControl from './schematicControl';

export default class SchematicsPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'SchematicsPlugin';

        this.mergeOptions({
            schematics: []
        });

        this.prototype.showGrid = false;

        /**
         * Button classes
         */
        this.prototype.buttons = {
            toggleView: class extends myw.PluginButton {
                static {
                    this.prototype.titleMsg = 'toggle_view';
                    this.prototype.imgSrc = 'modules/comms/images/toolbar/schematics_view.svg';
                }

                action() {
                    this.owner.toggleView();
                }

                render() {}
            }
        };
    }

    /**
     * Constructor
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');

        // Cache of layout options for each schematic type
        if (!this.options.layoutOpts) this.options.layoutOpts = {};

        // Event handlers
        this.app.on('currentFeature-changed currentFeatureSet-changed', e =>
            this.updateViewIfNecessary()
        );

        this.app.on('database-view-changed', async e => {
            if (!this.view || !this.view.visible) {
                return;
            }
            const schematic = await this.view.rebuildSchematic();

            // case: schematic is no longer valid so close
            if (!schematic) {
                this.toggleView();
            }
        });
    } // for debugging

    /**
     * State to save over sessions
     */
    getState() {
        return { layoutOpts: this.options.layoutOpts };
    }

    /**
     * Set self's state from URL param 'optsStr'
     */
    async setStateFromAppLink(optsStr) {
        this.showGrid = optsStr === 'grid:true'; // ENH: Parse properly
    }

    /**
     * Show/hide the schematics view
     */
    toggleView() {
        // Create view if necessary
        if (!this.view) {
            this.view = new SchematicControl(this, {
                showGrid: this.showGrid,
                layoutOpts: this.options.layoutOpts
            });
        }

        // Show or hide
        if (!this.view.visible) {
            this.view.show();
        } else {
            this.view.hide();
        }

        // Ensure display is up-to-date
        this.updateViewIfNecessary(this.testMode);
    }

    /**
     * Update view to show current set (if  we can)
     */
    async updateViewIfNecessary(forceRebuild = false) {
        // Case: Not active
        if (!this.view || !this.view.visible) return false;

        // Case: No current set .. or inserting
        if (!this.app.currentFeatureSet.items.length) return false;
        if (this.app.currentFeatureSet.items[0].id == null) return false;

        // Case: Data unchanged
        if (this.app.currentFeatureSet === this.features && !forceRebuild) return false;

        // Case: Show current set
        let done = await this.showDataIfPossible(this.app.currentFeatureSet);
        if (done) {
            this.app.recordFunctionalityAccess(
                `comms.schematics.${this.schematic.constructor.name}`
            );
            return true;
        }

        // Case: Show current feature (if not initiated by us)
        // ENH: Extend app.setCurrentFeature() to include initiator
        if (this.app.currentFeatureSet.items.includes(this.app.currentFeature)) {
            const dummySet = { items: [this.app.currentFeature] };
            done = await this.showDataIfPossible(dummySet);
            if (done) {
                this.app.recordFunctionalityAccess(
                    `comms.schematics.${this.schematic.constructor.name}}`
                );
                return true;
            }
        }

        return false;
    }

    /**
     * Show schematic for feature set 'features' (if we can)
     */
    async showDataIfPossible(features, resetView = true) {
        // Build schematic (if we can)
        const schematic = await this.schematicFor(features);
        if (!schematic) return false;

        // Make it the current one
        this.features = features;
        this.schematic = schematic;
        await this.view.setSchematic(this.schematic);
        if (resetView) this.view.setDefaultView();

        return true;
    }

    /**
     * Build schematic for feature set 'features' (if we can)
     *
     * Trys each configured engine in turn until one is found that can handle the data
     */
    async schematicFor(features) {
        for (const schematicClass of this.options.schematics) {
            const schematic = new schematicClass(this.app);
            const data = schematic.getBuildData(features);
            if (data) {
                await schematic.buildFrom(data);
                return schematic;
            }
        }
    }
}
