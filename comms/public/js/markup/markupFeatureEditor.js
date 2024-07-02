// Copyright: IQGeo Limited 2010-2023
import myw, { FeatureEditor } from 'myWorld-client';
import $ from 'jquery';
import _ from 'underscore';
import React from 'react';

import { renderReactNode } from 'myWorld-client/react';

export default class MarkupFeatureEditor extends FeatureEditor {
    static {
        this.prototype.editGeom = true;
    }

    /**
     * @class Provides editor for Markup features
     * Subclassed so that when use makes change to a style field the object is saved and redrawn immediately.
     */
    constructor(owner, options) {
        super(owner, options);
        this.markupMode = this.app.plugins.markupMode;

        if (this.feature.isNew) {
            this.setDefaultsImmediate();
            this.on('ready', this.setDefaults, this);
        }

        // This is a wide net but needed as with alternatives we can miss drags
        this.app.map.on('geomdraw-changed', this._handleModifyEnd.bind(this));
    }

    /**
     * Handle event when user finishes moving geometry marker(s)
     * @param {Event} e
     */
    async _handleModifyEnd(e) {
        // This filters out geom draw change when we are in the process of selecting another object
        if (this.feature.getUrn() !== myw.app.currentFeature.getUrn()) return true;
        if (e.dragging == false) return true;

        const newGeom = this._getGeometryData(this.feature);
        if (_.isEqual(newGeom, this.feature.geometry)) return true;

        const savedFeature = await this.saveFeatureChanges();
        this.trigger('saved', { feature: savedFeature, isLocked: this.isLocked });
        return true;
    }

    /**
     * Handler for the save button.
     * Gets the changes, validates them and if valid saves them to the database
     * @override Subclassed to set this.feature with saved feature prior to close
     */
    async save() {
        const savedFeature = await this.saveFeatureChanges();

        await myw.Util.delay(1000);

        this.close();
        this.trigger('saved', { feature: savedFeature, isLocked: this.isLocked });
    }

    async saveFeatureChanges() {
        const feature = this.feature;
        const featureJson = this.getChanges(feature);

        const validated = await this.validateChanges(featureJson);
        const isNew = feature.isNew;

        if (!validated) return;

        const request = isNew ? this.insertFeature(featureJson) : this.updateFeature(featureJson);

        //for the situation where the  save takes some time,
        //disable the buttons (to avoid the user repeating the save thinking we could cancel the save that is already on its way)
        this.$('.button').attr('disabled', true);
        //and display an information message
        this.displayMessage(this.msg('saving'), 'alert');

        const savedFeature = await request.catch(reason =>
            this._handleSaveError(reason, this.msg('problem_saving'))
        );

        if (!savedFeature) return;
        const changeType = isNew ? 'insert' : 'update';
        this.app.fire('featureCollection-modified', {
            changeType: changeType,
            feature: savedFeature,
            featureType: savedFeature.getType()
        });

        // if save is successfull re-enable the buttons
        this.$('.button').attr('disabled', false);

        this.feature = savedFeature;

        return savedFeature;
    }

    /**
     * @override Subclass to trigger update of geometry
     */
    close() {
        super.close();
        this.app.map.off('geomdraw-changed', this._handleModifyEnd.bind(this));
    }

    /**
     * Sets referenced feature
     */
    setDefaults() {
        const prevFeature = this.app.prevCurrentFeature;
        if (
            prevFeature &&
            !this.isMarkupFeature(prevFeature) &&
            !myw.app.plugins.workflow.isCurrentDeltaOwner(prevFeature)
        )
            this.setValue('referenced_feature', prevFeature);
        this.setValue('owner', myw.app.plugins.workflow.currentDeltaOwner);
    }

    /**
     * Set default values for fields
     */
    setDefaultsImmediate() {
        const that = this;
        const defaultStyles = this.markupMode.defaultStylesFor(this.feature.type);

        _.mapObject(defaultStyles, function (v, k) {
            if (k in that.featureDD.fields) {
                if (!that.feature.properties[k]) {
                    that.feature.properties[k] = JSON.stringify(v);
                }
            }
        });
    }

    render() {
        super.render();

        const formClass = this.markupMode.styleFormFor(this.feature.type);
        if (formClass) {
            this.renderStyleForm(formClass, this.feature.type);
        }
    }

    /**
     * Subclassed so that we can update representation immediately on field editor change
     * @param {} ev
     */
    async _propagateEvent(ev) {
        this.trigger('propagate event change', ev);
        await this.saveFeatureChanges();
        return true;
    }

    /**
     * @param {MywFeature} feature
     * @returns {boolean} True if 'feature' is a markup feature
     */
    isMarkupFeature(feature) {
        const markupTypes = _.keys(this.markupMode.markupFeatureTypes);
        return markupTypes.includes(feature.type);
    }

    /**
     * Renders style form in editor
     * @param {Class} formClass Class that provides style form
     */
    renderStyleForm(formClass, featureType) {
        this.data = this.feature.getMarkupStyle();

        // Fixup styles for polygons to conform to what form expects
        if ('styles' in this.data) {
            this.data = { line: this.data.styles[0], fill: this.data.styles[1] };
        }

        var div = $('<div id="markup-style-form-div" class="markup-style-form-div">');
        this.$('#field-editors').append(div);

        renderReactNode(document.querySelector('#markup-style-form-div'), formClass, {
            data: this.data,
            msg: function (x) {
                return x;
            },
            onChange: this.onStyleChange.bind(this)
        });
    }

    /**
     * Call back for when style changes on the form
     * @param {Style} val
     */
    async onStyleChange(val) {
        Object.assign(this.data, val);
        await this.saveFeatureChanges();
    }

    /**
     * @returns Values from editor. Encoding style values as required
     */
    getFieldEditorValues() {
        const values = super.getFieldEditorValues();
        if ('line_style' in values) {
            values['line_style'] = this.encodeStyle(this.data);
        }
        if ('text_style' in values) {
            values['text_style'] = this.encodeStyle(this.data);
        }
        if ('point_style' in values) {
            values['point_style'] = this.encodeStyle(this.data);
        }
        if ('fill_style' in values) {
            values['fill_style'] = this.encodeStyle(this.data.fill);
            values['line_style'] = this.encodeStyle(this.data.line);
        }
        return values;
    }

    encodeStyle(data) {
        return JSON.stringify(data);
    }

    decodeStyle(style) {
        return JSON.parse(style);
    }
}
