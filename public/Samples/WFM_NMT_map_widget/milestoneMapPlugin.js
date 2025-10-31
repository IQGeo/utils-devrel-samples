import { Plugin, PluginButton } from 'myWorld-client';
import { renderReactNode } from 'myWorld-client/react';
import mapWidgetImage from '../../images/map_search_white.svg';
import { MilestoneMapModal } from './milestoneMapModal';

export class MilestoneMapPlugin extends Plugin {
    static {
        this.prototype.messageGroup = 'mapWidgetPlugin';

        this.prototype.buttons = {
            dialog: class extends PluginButton {
                static {
                    this.prototype.id = 'map-widget-button';
                    this.prototype.titleMsg = 'mapWidgetPluginTitle';
                    this.prototype.imgSrc = mapWidgetImage;
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
            MilestoneMapModal,
            {
                open: true,
                plugin: this
            },
            this.renderRoot
        );
    }
}
