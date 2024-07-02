// Copyright: Ubisense Limited 2010-2023
import $ from 'jquery';
import { Dialog, Button, Form, DisplayMessage } from 'myWorld-client';
import PathWalker from './pathWalker';
import unionLineStrings from './geomUtils';

/*eslint-disable no-await-in-loop*/
// Sleep for 'ms' milliseconds
// ENH: Move to utils
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms)); // eslint-disable-line
}

/*
 * Toolbar providing functions for moving streetview pegman along a path
 */
//ENH: Make subclass of toolbar?
class VirtualWalkoutToolbar extends Dialog {
    static {
        this.prototype.messageGroup = 'VirtualWalkoutToolbar';
        this.prototype.className = 'virtual-walkout-dialog';
    }

    // Initialise slots of self
    //
    // 'streetview' is a myw.StreetviewPlugin.
    constructor(streetview) {
        // Build self
        super({
            title: 'Virtual Walkout',
            modal: false,
            autoOpen: false,
            height: 'auto',
            minHeight: 100,
            buttons: {}
        });

        this.options.beforeClose = () => this.beforeClose();
        this.app = streetview.app; // ENH: Pass in app instead
        this.streetview = streetview;

        this.render();
        this.addItems();
    }

    // Create the toolbar elements
    addItems() {
        // Create buttons
        this.prevButton = new Button({
            title: '{:previous}',
            cssClass: 'ui-button virtual-walkout-prev',
            onClick: this.prev.bind(this)
        });
        this.nextButton = new Button({
            title: '{:next}',
            cssClass: 'ui-button virtual-walkout-next',
            onClick: this.next.bind(this)
        });
        this.playButton = new Button({
            title: '{:play}',
            cssClass: 'ui-button virtual-walkout-play',
            onClick: this.autoNextPlay.bind(this)
        });
        this.pauseButton = new Button({
            title: '{:pause}',
            cssClass: 'ui-button virtual-walkout-pause',
            onClick: this.pause.bind(this)
        });
        this.setPathButton = new Button({
            text: 'Set Path',
            cssClass: 'ui-button virtual-walkout-setpath',
            onClick: this.setPath.bind(this, false)
        });
        this.reversePathButton = new Button({
            title: '{:reverse}',
            cssClass: 'ui-button virtual-walkout-reverse-path',
            onClick: this.setPath.bind(this, true)
        });

        // Add them to form
        this.form = new Form({
            rows: [
                {
                    components: [
                        this.prevButton,
                        this.playButton,
                        this.pauseButton,
                        this.nextButton,
                        this.setPathButton,
                        this.reversePathButton
                    ]
                }
            ]
        });

        this.$el.html(this.form.$el);
        this.pauseButton.$el.hide();
        this.$el.append($('<div>', { class: 'message-container' }));
    }

    // Open and start listening to events
    open() {
        this.active = true;
        super.open();
        this.app.on(
            'currentFeature-changed currentFeatureSet-changed',
            this.setPathButtonState,
            this
        );
        this.setPathButtonState();
        this.setNavButtonStates();

        if (
            !this.walker &&
            this.app.currentFeatureSet.items &&
            this.app.currentFeatureSet.items.length > 0
        )
            this.setPath(false, false);
    }

    /**
     * Displays the message at the bottom of the dialog
     * @param {string} message
     * @param {string} type     'success'/'alert'/'info'/'error'
     */

    showMessage(message, type) {
        const dm = new DisplayMessage({
            el: this.$('.message-container'),
            type: type,
            message: message
        });

        if (type != 'success') setTimeout(() => dm.closeMessage(), 2000);
    }

    // Stop listening to events
    beforeClose() {
        this.app.off(
            'currentFeature-changed currentFeatureSet-changed',
            this.setPathButtonState,
            this
        );
        this.pause();
        this.active = false;
    }

    //--------------------------------------------------------------------------
    //                                PATH BUILDING
    //--------------------------------------------------------------------------

    // Enable the 'set path' button if something suitable is selected
    setPathButtonState() {
        const canSetPath = true; // this.app.currentFeature && this.app.currentFeature.geometry.type=='LineString';
        this.setPathButton.$el.toggleClass('enabled', canSetPath);
    }

    // Set path from currently selected features
    setPath(reverse = false, alert = true) {
        const items = this.app.currentFeatureSet.items;
        const pathGeom = reverse ? this.buildReversePathFrom(items) : this.buildPathFrom(items);
        if (!pathGeom) {
            if (alert) this.showMessage('Bad path', 'alert');
            return;
        }

        this.walker = new PathWalker(pathGeom);
        this.displayView();
        this.showMessage('Path set', 'success');
        this.setNavButtonStates();
    }

    // Builds linear geometry from features (if possible)
    buildPathFrom(features) {
        // Find linear geoms
        const lineGeoms = [];
        features.forEach(feature => {
            const geom = { ...feature.geometry };
            if (geom && geom.type == 'LineString') lineGeoms.push(geom);
        });
        if (!lineGeoms.length) return null;

        // Union them
        return unionLineStrings(lineGeoms);
    }

    // Builds linear geometry in reverse from features (if possible)
    buildReversePathFrom(features) {
        // Find linear geoms
        const lineGeoms = [];
        features.reverse().forEach(feature => {
            if (feature.geometry && feature.geometry.type == 'LineString') {
                const geom = { ...feature.geometry };
                geom.coordinates = geom.coordinates.reverse();
                lineGeoms.push(geom);
            }
        });
        if (!lineGeoms.length) return null;

        // Union them
        return unionLineStrings(lineGeoms);
    }

    //--------------------------------------------------------------------------
    //                                VIEWPOINT  NAVIGATION
    //--------------------------------------------------------------------------

    // Move to the next viewpoint
    async next() {
        let isLooping = true;
        while (isLooping) {
            if (!this.walker.next()) {
                this.showMessage('Done', 'success');
                return;
            }

            const viewChanged = await this.displayView();
            if (viewChanged) isLooping = false;
            await sleep(200);
        }
        this.setNavButtonStates();
    }

    //Makes the walker go forward till the path ends or the walker is paused
    async autoNextPlay() {
        this.playButton.$el.hide();
        this.pauseButton.$el.show();
        this.autoPlay = true;
        while (this.autoPlay) {
            if (!this.walker.next()) {
                this.showMessage('Done', 'success');
                this.pause();
                return;
            }
            await this.displayView();
            await sleep(1000);
        }
    }

    //Stops the walker
    pause() {
        this.autoPlay = false;
        this.pauseButton.$el.hide();
        this.playButton.$el.show();
        this.setNavButtonStates();
    }

    // Move to the previous viewpoint
    // ENH: Better as a view stack?
    async prev() {
        let isLooping = true;
        while (isLooping) {
            if (!this.walker.prev()) {
                this.showMessage('Done', 'success');
                return;
            }

            const viewChanged = await this.displayView();
            if (viewChanged) isLooping = false;
            await sleep(200);
        }
        this.setNavButtonStates();
    }

    // Set streetview to the current view
    async displayView() {
        // Find nearest streetview location
        const info = await this.streetview.findPano(this.walker.geoLocation);

        // Check for no significant change
        const p = this.streetview.panorama.getPosition();
        const changed =
            !p ||
            p.lat() != info.location.lat || // ENH: Find a better way to test equality
            p.lng() != info.location.lng;

        // Show it
        this.streetview.panorama.setPano(info.id);
        this.streetview.panoramaLocation = info.location;
        this.streetview.panorama.setPov({ heading: this.walker.heading, zoom: 1, pitch: 0 });
        this.streetview.showPanorama();

        // Pan map to pegman
        // ENH: Do this in core (via events)
        const map = this.streetview.app.map;
        map.setView(this.walker.geoLocation, map.getZoom());

        return changed;
    }

    // Enable / disable buttons depending on current position
    setNavButtonStates() {
        this.prevButton.$el.prop('disabled', !this.walker || this.walker.atStart());
        this.playButton.$el.prop('disabled', !this.walker || this.walker.atEnd());
        this.nextButton.$el.prop('disabled', !this.walker || this.walker.atEnd());
    }
}

export default VirtualWalkoutToolbar;
