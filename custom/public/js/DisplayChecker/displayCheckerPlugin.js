import myw from 'myWorld-client';
import 'main.standard';
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import displayCheckerImage from '../../images/displayChecker.svg';
import { DisplayCheckerModal } from './displayCheckerModal';
import DisplayManagerPlugin from '../../../../comms/public/js/connectivity_ui/displayManagerPlugin';

export class DisplayCheckerPlugin extends DisplayManagerPlugin {
    static {
        this.prototype.messageGroup = 'displayCheckerPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'display-checker-button';
                    this.prototype.titleMsg = 'display_checker';
                    this.prototype.imgSrc = displayCheckerImage;
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
            DisplayCheckerModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
