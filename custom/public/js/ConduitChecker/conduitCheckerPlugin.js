import 'main.standard';
import { PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customRulesImage from '../../images/ConduitChecker.svg';
import { ConduitCheckerModal } from './conduitCheckerModal';
import ConduitManagerPlugin from '../../../../comms/public/js/api/conduitManagerPlugin';

export class ConduitCheckerPlugin extends ConduitManagerPlugin {
    static {
        this.prototype.messageGroup = 'conduitCheckerPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'conduit-checker-button';
                    this.prototype.titleMsg = 'conduit_checker';
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
            ConduitCheckerModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
