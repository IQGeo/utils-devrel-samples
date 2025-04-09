import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { BFTubeRenameModal } from './bf_tube_rename_modal';
import bfTubeRenameImage from '../../images/BF_Tube_Rename_icon.svg';

export class BFTubeRenamePlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'bfTubeRenamePlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'bf-tube-rename-button';
                    this.prototype.titleMsg = 'bf_tube_rename_title';
                    this.prototype.imgSrc = bfTubeRenameImage;
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
            BFTubeRenameModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
