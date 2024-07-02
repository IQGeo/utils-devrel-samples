import myw from 'myWorld-client';
import FeatureModelLoaderPlugin from 'modules/comms/js/models/featureModelLoaderPlugin';
import commsDeltaOwner from 'modules/comms/js/models/commsDeltaOwner';
import commsFeatureEditor from 'modules/comms/js/models/commsFeatureEditor';

class DeltaOwnerEditor extends commsFeatureEditor {
    /**
     * Redirects saved updates to verify design rules first
     */
    async save() {
        if (this.feature.isNew) return super.save();

        const origStatus = this.feature.properties.status;
        const proposedValues = this.getChanges(this.feature);
        const newStatus = proposedValues.properties.status;

        this.app.on(
            'save_delta_state_change',
            () =>
                this.saveUpdate(newStatus).catch(error => {
                    this.displayMessage(error.message, 'error');
                    throw error; // so we get traceback
                }),
            this
        );

        // Run validation if we are moving to approval state
        if (origStatus !== newStatus && newStatus === 'Awaiting Approval') {
            // Ensure design is open so that we can validate
            if (this.datasource.delta !== this.feature.getUrn()) {
                this.displayMessage(
                    `To change state to ${newStatus}, design must be open`,
                    'error'
                );
                return;
            }

            this.displayMessage('Validating design rules...', 'alert');
            const validationPlugin = this.app.plugins.validation;
            await validationPlugin.checkDesignDialogReadOnly();
            return;
        }

        return super.save();
    }

    /**
     * Verify applicable design rules pass before allowing update
     */
    async saveUpdate(newStatus) {
        const validationPlugin = this.app.plugins.validation;
        const designRuleErrors = validationPlugin.validationErrors;

        this.app.off('save_delta_state_change', () => this.saveUpdate(newStatus), this);

        if (designRuleErrors === null) {
            this.displayMessage('Validation did not complete', 'error');
            return;
        }

        if (designRuleErrors > 0) {
            return;
        }

        await myw.Util.delay(1000);
        return super.save();
    }
}

class DevDBDeltaOwner extends commsDeltaOwner {
    static {
        this.prototype.editorClass = DeltaOwnerEditor;
    }
}

// Apply to all delta owner types
FeatureModelLoaderPlugin.prototype.categories.design.model = DevDBDeltaOwner;

export default DevDBDeltaOwner;
