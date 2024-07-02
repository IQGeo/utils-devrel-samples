// Copyright: IQGeo Limited 2010-2023
import { Plugin, PluginButton } from 'myWorld-client';
import SpecManagerDialog from './specManagerDialog';

class SpecManagerDialogPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'SpecManagerDialog';
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
        this.specManager = this.app.plugins['specManager'];
        this.ready = new Promise(resolve => {
            this.active = this.app.userHasPermission('mywcom.manageSpecifications');
            this.trigger('changed-state');
            resolve();
        });
    }

    /**
     * Shows the spec manager dialog.
     */
    showDialog() {
        if (!this.dialog) {
            const options = {
                owner: this,
                title: this.msg('dialog_title'),
                msg: this.msg,
                specManager: this.specManager
            };

            this.dialog = new SpecManagerDialog(options);
        } else this.dialog.open();
    }
}

SpecManagerDialogPlugin.prototype.buttons = {
    dialog: class extends PluginButton {
        static {
            this.prototype.id = 'a-spec-manager';
            this.prototype.titleMsg = 'toolbar_msg'; //for automated tests
            this.prototype.imgSrc = 'modules/comms/images/toolbar/spec_manager.svg';
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
            return this.app.system.userHasPermission('mywcom.manageSpecifications');
        }
    }
};

export default SpecManagerDialogPlugin;
