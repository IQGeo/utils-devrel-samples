// Copyright: IQGeo Limited 2010-2023

import myw from 'myWorld-client';

export default class Menu extends myw.Class {
    constructor(messageGroup = null, defaultIcon = null) {
        super();
        this.messageGroup = messageGroup;
        this.defaultIcon = defaultIcon;
        this.items = [];
    }

    /*
     * Add a simple entry to self
     */
    addItem(group, id, callback, enabled = true, label = null, icon = null) {
        this._add(group, id, { callback, enabled, label, icon });
    }

    /*
     * Add a sub-menu entry to self
     */
    addSubMenu(group, id, subMenu, enabled, label = null) {
        this._add(group, id, { subMenu, enabled, label });
    }

    /*
     * Sort menu items alphabetically
     */
    sortItems() {
        this.items = this.items.sort(this._compareFn);
    }

    /*
     * Add an entry to self
     * 'group' is used to manage separators etc. 'id' is name of item.
     */
    _add(group, id, props) {
        const item = { group, id, ...props };

        if (!item.label) {
            if (this.messageGroup) {
                item.label = myw.msg(this.messageGroup, id);
            } else {
                item.label = id;
            }
        }

        this.items.push(item);

        return item;
    }

    /**
     * Number of entries in self
     */
    nItems() {
        return this.items.length;
    }

    /**
     * Build jsTree context menu from self
     */
    jsTreeItems() {
        let prevItem;
        const jtItems = {};

        for (const item of this.items) {
            // Add separator (if necessary)
            if (prevItem && prevItem.group != item.group) {
                jtItems[prevItem.id].separator_after = true;
            }

            // Create item
            // TODO: Handle icon
            const jtItem = {
                label: item.label,
                action: item.callback,
                _disabled: !item.enabled
            };
            if (item.subMenu) jtItem.submenu = item.subMenu.jsTreeItems();

            // Add to menu
            jtItems[item.id] = jtItem;
            prevItem = item;
        }

        return jtItems;
    }

    /**
     * Build OpenLayers context menu from self
     */
    olItems() {
        let prevItem;
        const olItems = [];

        for (const item of this.items) {
            // Add separator (if necessary)
            if (prevItem && prevItem.group != item.group) {
                olItems.push('-');
            }

            // Create item
            // TODO: Handle not enabled
            const olItem = {
                text: item.label,
                callback: item.callback,
                icon: item.icon || this.defaultIcon
            };
            if (item.subMenu) olItem.items = item.subMenu.olItems();

            // Add to menu
            olItems.push(olItem);
            prevItem = item;
        }

        return olItems;
    }

    _compareFn(a, b) {
        if (a.label < b.label) return -1;
        if (a.label > b.label) return 1;
        return 0;
    }
}
