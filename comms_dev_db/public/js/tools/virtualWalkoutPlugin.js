// Copyright: Ubisense Limited 2010-2023
import myw from 'myWorld-client';
import VirtualWalkoutToolbar from './virtualWalkoutToolbar';

// Interactive tool for traversing the streetview pegman along a specified route
class VirtualWalkoutPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'VirtualWalkoutPlugin';
    }

    // Init slots and register event handlers
    constructor(owner, options) {
        super(owner, options);
        this.enabled = true;
    }

    // True if self's dialog is open
    isActive() {
        return this.dialog && this.dialog.active;
    }

    // Activate the walkout control
    activate() {
        if (!this.dialog) {
            this.streetview = this.app.plugins['streetview']; // TODO: Use getPlugin() + Check for not found
            this.dialog = new VirtualWalkoutToolbar(this.streetview);
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
}

VirtualWalkoutPlugin.prototype.buttons = {
    activate: class extends myw.PluginButton {
        static {
            this.prototype.titleMsg = 'toolbar_msg';
            this.prototype.imgSrc = 'modules/comms_dev_db/images/tools/virtual_walkout.svg';
        }

        async action() {
            this.owner.toggle();
        }
    }
};

export default VirtualWalkoutPlugin;
