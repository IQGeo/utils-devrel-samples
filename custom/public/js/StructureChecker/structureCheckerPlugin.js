import myw from 'myWorld-client';
import 'main.standard';
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import structureCheckerImage from '../../images/structureChecker.svg';
import { StructureCheckerModal } from './structureCheckerModal';
import StructureManagerPlugin from '../../../../comms/public/js/api/structureManagerPlugin';

export class StructureCheckerPlugin extends StructureManagerPlugin {
    static {
        this.prototype.messageGroup = 'structureCheckerPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'structure-checker-button';
                    this.prototype.titleMsg = 'structure_checker';
                    this.prototype.imgSrc = structureCheckerImage;
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
            StructureCheckerModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
