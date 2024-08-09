// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw, { Control } from 'myWorld-client';
import React from 'react';

import PaletteTooltip from './paletteTooltip';
import ReactDOM from 'react-dom/client';

/*eslint-disable no-await-in-loop*/
class ToolsPaletteControl extends Control {
    static {
        this.prototype.messageGroup = 'ToolsModePlugin';
    }

    /**
     * @class Control to display a palette of buttons for tools defined by various plugins
     * @param  {object}  options
     * @param  {string}  options.divId    Id of the div where the palette should be created
     * @constructs
     * @extends {Control}
     */
    constructor(owner, options) {
        super(owner, options);
        this.render();
    }

    async render() {
        this.buttonList = $('<ul>');
        this.$el.html(this.buttonList);

        if (!this.options.toolButtons.length) {
            this.buttonList.append(`<div class="palette-msg">${this.msg('palette_empty')}</div>`);
        }

        for (const button of this.options.toolButtons) {
            // eslint-disable-next-line no-await-in-loop
            const paletteBtn = await this._addButtonToPalette(button);

            if (!paletteBtn) continue;
            const el = document.getElementById(`${button}-tooltip-container`);
            if (!el) {
                let rootDiv = document.createElement('div');
                rootDiv.setAttribute('id', `${button}-tooltip-container`);
                paletteBtn?.$el[0].append(rootDiv);
                const root = ReactDOM.createRoot(rootDiv);
                root.render(
                    <PaletteTooltip
                        id={`${button}-tooltip-container`}
                        content={paletteBtn?.$el[0].innerText}
                        // Need to hard code as buttons are made then populated.
                        height="91px"
                    />
                );
            }
        }
    }

    async _addButtonToPalette(button) {
        const buttonRef = this.getButtonRef(button);
        const paletteBtn = new PaletteButton(buttonRef);

        const hasPermission = await paletteBtn.hasPermission();
        if (!hasPermission) return;
        this.buttonList.append(paletteBtn.$el);
        return paletteBtn;
    }
}

// ENH: Render the actual palette button rather than this additional class
class PaletteButton extends myw.View {
    static {
        this.prototype.tagName = 'li';
        this.prototype.className = 'palette-btn';

        this.prototype.events = {
            click: 'action'
        };
    }

    constructor(options) {
        super(options);
        this.owner = this.options.owner;

        this.Button = new this.options.Button(this.options.owner, options);

        this.setState();
        this.listenTo(this.owner, 'changed-state', this.setState);
    }

    setState() {
        this.$el.toggleClass('inactive', !this.owner.enabled);
        this.render();
    }

    render() {
        this.$el
            .html(`<div><img src="${this.Button.imgSrc}"></div>`)
            .append(`<div>${this.owner.msg(this.Button.titleMsg)}</div>`);
    }

    async action() {
        this.Button.action.call(this);
    }

    async hasPermission() {
        if (this.Button.hasPermission) return this.Button.hasPermission();
        return true;
    }
}

export default ToolsPaletteControl;
