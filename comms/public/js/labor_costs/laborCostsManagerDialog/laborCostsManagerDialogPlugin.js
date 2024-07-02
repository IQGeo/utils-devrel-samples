// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton } from 'myWorld-client';
import LaborCostsManagerDialog from './laborCostsManagerDialog';

class LaborCostsManagerDialogPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'LaborCostsManagerDialog';
    }

    /**
     * @class
     * @param  {Application} owner                       The application
     * @param  {object}      options
     * @constructs
     * @extends {Plugin}
     */
    constructor(owner, options) {
        super(owner, options);
        this.laborCostsManager = this.app.plugins['laborCostsManager'];
        this.ready = new Promise(resolve => {
            this.app.userHasPermission('mywcom.manageLaborCosts').then(active => {
                this.active = active;
                this.trigger('changed-state');
                resolve();
            });
        });
    }

    /**
     * Shows the laborCost manager dialog.
     */
    showDialog() {
        if (!this.dialog) {
            const options = {
                owner: this,
                title: this.msg('dialog_title'),
                msg: this.msg,
                laborCostsManager: this.laborCostsManager
            };

            this.dialog = new LaborCostsManagerDialog(options);
        } else this.dialog.open();
    }
}

LaborCostsManagerDialogPlugin.prototype.buttons = {
    dialog: class extends PluginButton {
        static {
            this.prototype.id = 'a-labor-costs-manager';
            this.prototype.titleMsg = 'toolbar_msg'; //for automated tests
            this.prototype.imgSrc = 'modules/comms/images/toolbar/laborCost_manager.svg';
        }

        constructor(...args) {
            super(...args);
            this.hasPermission().then(hasPerm => {
                if (!hasPerm) this.remove();
            });
        }

        action() {
            this.owner.showDialog();
        }

        // Does the user have permission to use this button
        // Part of the API for the tools palette
        async hasPermission() {
            return this.app.system.userHasPermission('mywcom.manageLaborCosts');
        }
    }
};

export default LaborCostsManagerDialogPlugin;
