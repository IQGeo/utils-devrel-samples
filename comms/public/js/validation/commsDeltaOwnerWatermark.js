// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import { Control, Button, Toolbar } from 'myWorld-client';
import { renderIconDefinitionToSVGElement } from '@ant-design/icons-svg/es/helpers';
import { RightOutlined, HolderOutlined } from '@ant-design/icons-svg';

export default class CommsDeltaOwnerToolbar extends Control {
    constructor(owner, buttons) {
        super(owner, {});
        this.owner = owner;
        this.app = this.owner.app;
        this.buttons = buttons.map(Button => {
            return {
                owner,
                editable: Button.editable,
                Button: class extends Button.button {
                    render() {
                        this.setActive(!this.owner.busy);
                    }
                }
            };
        });
    }

    render() {
        const watermark = $('<div>', {
            class: 'delta-owner-map-watermark noselect',
            id: 'delta-owner-map-watermark'
        });

        const holderOutlined = renderIconDefinitionToSVGElement(HolderOutlined, {
            extraSVGAttrs: {
                height: '16px',
                fill: '#535353'
            }
        });
        const watermarkHandle = $(`<div id="watermark-handle">${holderOutlined}</div>`);

        const watermarkText = $('<div>', {
            class: 'delta-owner-map-watermark-text noselect',
            text: this.currentDeltaOwner?.getTitle()
        });

        watermark.append(watermarkHandle);
        watermark.append(watermarkText);

        if (this.onSelect) watermarkText.click(this.onSelect.bind(this));

        watermark.append(this._renderWatermarkContainer());
        watermark.append(this._renderToggleButton());

        return watermark;
    }

    _renderToggleButton() {
        // expand/collapse toolbar function
        const toggleExpandToolbar = e => {
            const containerDiv = $('#watermark-toolbar-container');
            const caretDiv = $('.toolbar-expand-icon-container');
            e.stopPropagation();
            containerDiv.toggleClass('watermark-toolbar-container-collapsed', 300, 'easeOutSine');
            caretDiv.toggleClass('toolbar-expand-icon-container-active');
            caretDiv.hasClass('toolbar-expand-icon-container-active')
                ? $('#watermark-toolbar').css({ overflow: 'visible' })
                : $('#watermark-toolbar').css({ overflow: 'hidden' });
        };

        //create expand/collapse button
        const rightOutlined = renderIconDefinitionToSVGElement(RightOutlined, {
            extraSVGAttrs: {
                width: '1em',
                height: '1em',
                fill: '#535353',
                class: 'toolbar-expand-icon'
            }
        });

        const expandCollapseButton = $('<button class="toolbar-expand-button"></button>');
        expandCollapseButton.append(
            `<div class="toolbar-expand-icon-container">${rightOutlined}</div>`
        );
        expandCollapseButton.click(toggleExpandToolbar);

        return expandCollapseButton;
    }

    _renderWatermarkContainer() {
        const container = $(
            '<div id="watermark-toolbar-container" class="watermark-toolbar-container watermark-toolbar-container-collapsed"></div>'
        );
        const ul = $('<ul>');
        const div = $(
            '<div class="delta-owner-toolbar watermark-toolbar navigation-bar noselect" id="watermark-toolbar"></div>'
        );
        container.append(div);
        div.append(ul);

        this.toolbar = new Toolbar({
            element: ul,
            buttons: this.buttons.map(toolbarButton => {
                let editable = true;
                const state = this.owner.currentDeltaOwner?.properties.status;
                if (
                    !this.owner.editableStates.includes(state) &&
                    toolbarButton.editable === false
                ) {
                    editable = false;
                }
                return {
                    owner: toolbarButton.owner,
                    Button: class extends toolbarButton.Button {
                        render() {
                            this.setActive(editable && this.currentDeltaOwner && !this.owner.busy);
                        }
                    }
                };
            })
        });

        return container;
    }
}
