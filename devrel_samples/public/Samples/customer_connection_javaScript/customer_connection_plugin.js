import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import { CustomerConnectionModal } from './customer_connection_modal';
import CustomerConnectionBuilder from './customer_connection_builder';
import customerConnectionImage from '../../images/Customer_Connection_JavaScript_icon.svg';

export class CustomerConnectionPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'customerConnectionPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'customer_connection';
                    this.prototype.imgSrc = customerConnectionImage;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }

    constructor(owner, options) {
        super(owner, options);
        this.builder = new CustomerConnectionBuilder(this.app.database);
    }

    showModal() {
        this.renderRoot = renderReactNode(
            null,
            CustomerConnectionModal,
            {
                open: true,
                plugin: this,
                builder: this.builder
            },
            this.renderRoot
        );
    }
}
