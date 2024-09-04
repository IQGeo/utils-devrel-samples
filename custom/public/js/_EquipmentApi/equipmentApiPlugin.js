import { PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import equipmentApiImage from '../../images/equipmentApi.svg';
import { EquipmentApiModal } from './structureApiModal';
import EquipmentManagerPlugin from '../../../../comms/public/js/api/equipmentManagerPlugin';

export class EquipmentApiPlugin extends EquipmentManagerPlugin {
    static {
        this.prototype.messageGroup = 'equipmentApiPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'equipment-api-button';
                    this.prototype.titleMsg = 'equipment_api';
                    this.prototype.imgSrc = equipmentApiImage;
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
            EquipmentApiModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
