import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { ConduitCapacityModal } from './conduit_capacity_modal';

export class ConduitCapacityPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'condtuitCapacityPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'conduit_capacity-button';
                    this.prototype.titleMsg = 'conduit_capacity_title';
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);
    }

    showModal() {
        this.renderRoot = renderReactNode(
            null,
            ConduitCapacityModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}

