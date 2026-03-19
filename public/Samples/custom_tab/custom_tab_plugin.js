import myw from 'myWorld-client';
import { Plugin, PluginButton } from 'myWorld-client';
import customTabImage from '../../images/Custom_Tab_Plugin.svg';

export class CustomTabPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'customTabPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'custom-tab-button';
                    this.prototype.titleMsg = 'custom_tab_title';
                    this.prototype.imgSrc = customTabImage;
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
        console.log(
            'The currently selected feature is ' + myw.app.system.settings['custom.feature']
        );
    }
}
