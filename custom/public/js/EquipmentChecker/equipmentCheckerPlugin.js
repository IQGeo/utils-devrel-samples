import myw from 'myWorld-client';
import 'main.standard';
import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import equipmentCheckerImage from '../../images/equipmentChecker.svg';
import { EquipmentCheckerModal } from './equipmentCheckerModal';
import EquipmentManagerPlugin from '../../../../comms/public/js/api/equipmentManagerPlugin';

export class EquipmentCheckerPlugin extends EquipmentManagerPlugin {
    static {
        this.prototype.messageGroup = 'equipmentCheckerPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'equipment-checker-button';
                    this.prototype.titleMsg = 'equipment_checker';
                    this.prototype.imgSrc = equipmentCheckerImage;
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
            EquipmentCheckerModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
