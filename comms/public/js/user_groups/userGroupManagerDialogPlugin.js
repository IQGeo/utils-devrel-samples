// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

class UserGroupManagerDialogPlugin extends myw.Plugin {
    static {
        this.prototype.messageGroup = 'UserGroupsManagerDialog';
        this.prototype.dialogPosition = { my: 'top', at: 'top', of: '#map_canvas' };

        this.prototype.buttons = {
            dialog: class extends myw.PluginButton {
                static {
                    this.prototype.id = 'user-group-dialog';
                    this.prototype.titleMsg = 'toolbar_msg';
                    this.prototype.imgSrc = 'modules/comms/images/toolbar/userGroup_manager.svg';
                }

                async initialize(...args) {
                    myw.PluginButton.prototype.initialize.apply(this, args);

                    const hasPermission = await this.hasPermission();
                    if (!hasPermission) this.remove();
                }

                action() {
                    this.owner.showDialog();
                }

                // Does the user have permission to use this button
                // Part of the API for the tools palette
                async hasPermission() {
                    return (
                        (await this.owner.app.userHasPermission('editGroups')) && !myw.isNativeApp
                    );
                }
            }
        };
    }

    /**
     * Provides dialogs for running design check and master data validation
     */
    constructor(owner, options) {
        super(owner, options);
        this.ds = this.app.getDatasource('myworld');
    }

    /**
     * Open data validation dialog
     */
    async showDialog() {
        this.app.fire('toggleUserGroupManager', {
            visible: true
        });
    }
}

export default UserGroupManagerDialogPlugin;
