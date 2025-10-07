import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { WfmDesignsModal } from './wfm_designs_modal';

export class WfmDesignsPlugin extends Plugin {
    static {
        // this.prototype.messageGroup = 'wfmDesignsPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'wfm-designs-button';
                    this.prototype.titleMsg = 'wfm_designs_title';
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
            WfmDesignsModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
