import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { restApiModal } from './rest_api_modal';

export class restApiPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'restApiPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'rest_api_title';
                    // this.prototype.imgSrc = wfmDesignsImage;
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
            restApiModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
