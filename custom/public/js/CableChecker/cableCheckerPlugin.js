import myw from 'myWorld-client';
import 'main.standard';
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customRulesImage from '../../images/customRule.svg';
import { CableCheckerModal } from './cableCheckerModal';
import CableManagerPlugin from '../../../../comms/public/js/api/cableManagerPlugin';

export class CableCheckerPlugin extends CableManagerPlugin {
    static {
        this.prototype.messageGroup = 'cableCheckerPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'cable-checker-button';
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
            CableCheckerModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
