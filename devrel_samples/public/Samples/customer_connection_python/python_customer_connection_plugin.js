import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customerConnectionImage from '../../images/Customer_Connection_Python_icon.svg';
import { PythonCustomerConnectionModal } from './python_customer_connection_modal';

export class PythonCustomerConnectionPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'pythonCustomerConnectionPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'customer-connection-button';
                    this.prototype.titleMsg = 'python_customer_connection';
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
    }

    showModal() {
        this.renderRoot = renderReactNode(
            null,
            PythonCustomerConnectionModal,
            {
                open: true,
                plugin: this,
                datasource: this.app.database.getDatasource('myworld')
            },
            this.renderRoot
        );
    }
}
