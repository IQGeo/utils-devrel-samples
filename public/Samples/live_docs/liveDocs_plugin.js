import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
// import liveDocsImage from '../../images/Customer_Connection_JavaScript_icon.svg';
import { LiveDocsModal } from './liveDocs_modal';
import liveDocsImage from '../../images/Live_Docs_icon.svg';

export class LiveDocsPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'LiveDocsPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'LiveDocsTitle';
                    this.prototype.imgSrc = liveDocsImage;
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
            LiveDocsModal,
            {
                open: true
            },
            this.renderRoot
        );
    }
}
