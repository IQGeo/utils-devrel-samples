import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customerConnectionImage from '../../../images/Customer_Connection_LRT_icon.svg';
import { LrtModal } from './lrt_modal';

export class LrtPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'LRT';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'LRT';
                    this.prototype.imgSrc = customerConnectionImage;
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
            LrtModal,
            {
                open: true
            },
            this.renderRoot
        );
    }
}
