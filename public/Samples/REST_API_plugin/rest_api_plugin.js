import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { restApiModal } from './rest_api_modal';
import restAPIImage from '../../images/REST_API_icon.svg'

export class restApiPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'restApiPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'rest_api_title';
                    this.prototype.imgSrc = restAPIImage;
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
