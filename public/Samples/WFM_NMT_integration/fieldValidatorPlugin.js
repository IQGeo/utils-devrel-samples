import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import customRulesImage from '../../images/fieldValidator.svg';
import { FieldValidatorModal } from './fieldValidatorModal';

export class FieldValidatorPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'customRulePlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'cable-capture-button';
                    this.prototype.titleMsg = 'customRulePlugin';
                    this.prototype.imgSrc = customRulesImage;
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
            FieldValidatorModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
