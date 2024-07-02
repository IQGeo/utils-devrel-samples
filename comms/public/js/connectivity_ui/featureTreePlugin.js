// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import OptionsMenu from '../base/optionsMenu';
import FilterInputItem from '../base/filterInputItem';

export default class FeatureTreePlugin extends myw.Plugin {
    static {
        this.prototype.statusClass = 'feature-tree-processing';
        this.prototype.dataErrorClass = 'feature-tree-data-error';
    }

    /**
     * Create standard items (titleDiv, optionsDiv, treeDiv, ...)
     */
    _buildDivs(title) {
        // Create title div
        this.titleDiv = $('<div>', { text: title });

        // Create filter box
        this.filterItem = new FilterInputItem(str => this.setFilter(str));

        // Create options menu
        this.settingsMenu = new OptionsMenu(this, { ownerDivId: this.divId });

        // Create options div
        const optionsDiv = $('<div>', {
            class: 'feature-plugins-header-options'
        });
        optionsDiv.append(this.filterItem.$el);
        optionsDiv.append(this.settingsMenu.$el);
        optionsDiv.click(event => event.stopPropagation());

        // Create header dev
        this.headerDiv = $('<div>', {
            class: 'feature-plugins-header'
        });
        this.headerDiv.click(this.toggleTree.bind(this));
        this.headerDiv.append(this.titleDiv);
        this.headerDiv.append(optionsDiv);

        // Create div for tree(s)
        this.treeDiv = $('<div>', { id: this.treeDivId });

        // Create main div
        const div = $('<div>', {
            id: this.divId,
            class: 'feature-details-div'
        });
        div.append(this.headerDiv);
        div.append(this.treeDiv);

        return div;
    }

    /**
     * Build and display treeview for feature
     */
    showTree(div, treeView, feature) {
        this.div.find(`#${this.statusDivId}`).removeClass(this.dataErrorClass).removeAttr('title');

        // Add temporary div to show spinner
        if (!this.div.find(`#${this.statusDivId}`).length) {
            if (this.titleDiv) {
                this.titleDiv.append($('<div>', { id: this.statusDivId }));
            }
        }
        this.div.find(`#${this.statusDivId}`).addClass(this.statusClass);

        // Launch display tree render (handling errors)
        treeView
            .renderFor(feature)
            .catch(error => {
                this.div.find('.js-tree-loading-label').text('');
                this.showInvalid();
                throw error;
            })
            .finally(() => {
                this.div.find(`#${this.statusDivId}`).removeClass(this.statusClass);
                if (!treeView.isValid) this.showInvalid();
            });

        div.show();
    }

    /**
     * Display icon and message for invalid data
     */
    showInvalid() {
        this.div
            .find(`#${this.statusDivId}`)
            .addClass(this.dataErrorClass)
            .attr('title', this.msg('invalid_data'));
    }

    /*
     * Show/hide self's tree
     */
    toggleTree() {
        this.headerDiv.toggleClass('collapsed');
        this.treeDiv.toggle();
    }
}
