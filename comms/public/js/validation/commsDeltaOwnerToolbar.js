// Copyright: IQGeo Limited 2010-2023
import { DeltaOwnerToolbar, Toolbar } from 'myWorld-client';
import $ from 'jquery';

export default class CommsDeltaOwnerToolbar extends DeltaOwnerToolbar {
    /**
     *
     * @override to allow for overflow buttonDropdown
     */
    render() {
        if (!this.parentDiv) return;

        this.parentDiv.find('.delta-owner-toolbar').remove();

        if (this.visible) {
            const div = $('<ul>');

            // for overflow menu button styling
            div.prop('id', 'delta-owner-tools');

            const ul = $('<div class="delta-owner-toolbar navigation-bar noselect"></div>');
            ul.append(div);
            this.parentDiv.append(ul);

            const availableWidth = $('.ui-layout-west').width();
            const buttonWidth = 40;
            this.toolbar = new Toolbar({
                element: div,
                buttons: this.buttons,
                availableWidth,
                buttonWidth
            });

            this._replaceMenuButtonIcon();
        }
    }

    /**
     * override core myw.ButtonDropDown image so it matches other toolbar buttons
     * TBR: workaround for PLAT-7569, remove when fixed
     */
    _replaceMenuButtonIcon() {
        const menuButton = this.toolbar.$el.find('.menu-button');
        menuButton.css('background-image', 'url("modules/comms/images/toolbar/menu.svg")');
    }
}
