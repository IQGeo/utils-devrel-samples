import 'main.standard';
import { PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customRulesImage from '../../images/customRule.svg';
import { ConnectionCheckerModal } from './connectionCheckerModal';
import ConnectionManagerPlugin from '../../../../comms/public/js/api/connectionManagerPlugin';

export class ConnectionCheckerPlugin extends ConnectionManagerPlugin {
    static {
        this.prototype.messageGroup = 'connectionCheckerPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'connection-checker-button';
                    this.prototype.titleMsg = 'toolbar_msg';
                    this.prototype.imgSrc = customRulesImage;
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
            ConnectionCheckerModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
