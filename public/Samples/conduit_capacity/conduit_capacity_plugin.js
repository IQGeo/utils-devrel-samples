import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { ConduitCapacityModal } from './conduit_capacity_modal';
import ConduitCapacityIcon from '../../images/Conduit_Capacity_icon.svg';
import ConduitCapacityBuilder from './conduit_capacity_builder';

export class ConduitCapacityPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'ConduitCapacityPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'conduit_capacity-button';
                    this.prototype.titleMsg = 'conduit_capacity_title';
                    this.prototype.imgSrc = ConduitCapacityIcon;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);
        this.builder = new ConduitCapacityBuilder(this.app.database);
    }

    showModal() {
        this.renderRoot = renderReactNode(
            null,
            ConduitCapacityModal,
            {
                open: true,
                plugin: this,
                builder: this.builder
            },
            this.renderRoot
        );
    }
}

