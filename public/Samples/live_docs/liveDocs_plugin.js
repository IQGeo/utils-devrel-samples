import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
// import liveDocsImage from '../../images/Customer_Connection_JavaScript_icon.svg';
import { LiveDocsModal } from './liveDocs_modal';
import liveDocsImage from '../../images/Live_Docs_icon.svg';
import StructureManagerPlugin from '../../../../comms/public/js/api/structureManagerPlugin';
import EquipmentManagerPlugin from '../../../../comms/public/js/api/equipmentManagerPlugin';
import CableManagerPlugin from '../../../../comms/public/js/api/cableManagerPlugin';
import ConduitManagerPlugin from '../../../../comms/public/js/api/conduitManagerPlugin';
import ConnectionManagerPlugin from '../../../../comms/public/js/api/connectionManagerPlugin';
import CircuitManagerPlugin from '../../../../comms/public/js/api/circuitManagerPlugin';

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
        this.structureApi = new StructureManagerPlugin(owner, options);
        this.equipmentApi = new EquipmentManagerPlugin(owner, options);
        this.cableApi = new CableManagerPlugin(owner, options);
        this.conduitApi = new ConduitManagerPlugin(owner, options);
        this.connectionApi = new ConnectionManagerPlugin(owner, options);
        this.circuitApi = new CircuitManagerPlugin(owner, options);
    }


    showModal() {
        this.renderRoot = renderReactNode(
            null,
            LiveDocsModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
