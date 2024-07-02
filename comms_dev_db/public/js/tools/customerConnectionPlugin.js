// Copyright: Ubisense Limited 2010-2023
import myw, { PluginButton, Plugin } from 'myWorld-client';
import CustomerConnectionDialog from './customerConnectionDialog';

// Interactive tool for building customer connections
class CustomerConnectionPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'CustomerConnectionPlugin';
    }

    // Init slots and register event handlers
    constructor(owner, options) {
        super(owner, options);
        this.onlyEdit = true;
    }

    // True if self's dialog is open
    isActive() {
        return this.dialog && this.dialog.active;
    }

    // Pop up the dialog
    activate() {
        if (!this.dialog) {
            const title = this.msg('toolbar_msg');
            this.options.title = title;
            this.dialog = new CustomerConnectionDialog(this.app, this.options);
        }
        if (!this.dialog.active) this.dialog.open();
    }

    // Close the dialog (if necessary)
    deactivate() {
        if (this.dialog && this.dialog.active) this.dialog.close();
    }

    toggle() {
        if (this.dialog && this.dialog.active) this.deactivate();
        else this.activate();
    }

    // State to be preserved over sessions
    getState() {
        if (this.dialog) this.options = this.dialog.equipProps();
        return this.options;
    }
}

CustomerConnectionPlugin.prototype.buttons = {
    activate: class extends PluginButton {
        static {
            this.prototype.titleMsg = 'toolbar_msg';
            this.prototype.imgSrc = 'modules/comms_dev_db/images/tools/customer_connection.svg';
        }

        async action() {
            this.owner.toggle();
        }
    }
};

export default CustomerConnectionPlugin;
