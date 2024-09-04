import { PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import structureApiImage from '../../images/structureApi.svg';
import { StructureApiModal } from './structureApiModal';
import StructureManagerPlugin from '../../../../comms/public/js/api/structureManagerPlugin';
import EquipmentManagerPlugin from '../../../../comms/public/js/api/equipmentManagerPlugin';

export class StructureApiPlugin extends StructureManagerPlugin {
    equipmentPlugin;
    static {
        this.prototype.messageGroup = 'structureApiPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'structure-api-button';
                    this.prototype.titleMsg = 'structure_api';
                    this.prototype.imgSrc = structureApiImage;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);
        this.equipmentPlugin = new EquipmentManagerPlugin(owner, options);
    }

    showModal() {
        this.renderRoot = renderReactNode(
            null,
            StructureApiModal,
            {
                open: true,
                plugin: this,
                equipmentPlugin: this.equipmentPlugin
            },
            this.renderRoot
        );
    }
}
