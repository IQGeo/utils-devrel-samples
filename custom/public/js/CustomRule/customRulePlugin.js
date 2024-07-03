import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customRulesImage from '../../images/customRule.svg';
import { CustomRuleModal } from './customRuleModal';

export class CustomRulePlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'customRulePlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'cable-capture-button';
                    this.prototype.titleMsg = 'toolbar_msg';
                    this.prototype.imgSrc = customRulesImage;
                }

                action() {
                    this.owner.showModal();
                }
            }
        };
    }

    showModal() {
        this.renderRoot = renderReactNode(
            null,
            CustomRuleModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
