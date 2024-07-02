// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import myw from 'myWorld-client';
import './textBoxOverlay';
import './textBoxEditor';
import { event as currentEvent } from 'd3-selection';

class TextBoxViewer extends myw.TextBoxOverlay {
    constructor(feature, options, coords) {
        if (!options.id) {
            let overlayId = feature.getUrn();
            options.id = overlayId;
        }
        super(feature, options, coords);
        this.addTo(this.worldMap);
        this.markupMode = myw.app.plugins.markupMode;
    }

    onAdd(map) {
        let _this = this;
        let anno = this.svg
            .append('g')
            .attr('class', 'annotation-group')
            .attr('class', 'interactive')
            .attr('id', this.overlayId)
            .style('font-size', this.getPixelSize() + 'px');

        this.anno = anno;

        anno.call(this.makeAnnotations)
            .select('rect.annotation-note-bg')
            .style('fill', this.style.backgroundColor)
            .style('fill-opacity', 1)
            .style('stroke', this.style.color)
            .style('stroke-width', this.style.borderWidth);

        anno.on('click', function () {
            if (!_this.markupMode.enabled) {
                return;
            }

            _this.stopClickPropagation(currentEvent);
            const multiKey = currentEvent.shiftKey;
            _this.toggleEditor(multiKey);
        });

        const note = anno.select('.annotation-note');
        this.note = note;
        this.rotateNote();
        this.makeAnnotations.disable(this.leaderline ? [] : ['connector']);
    }

    addTo(map) {
        map.addOverlay(this);
        this.onAdd(map);
        return this;
    }

    onRemove(map) {
        this.anno.remove();
        this.deselect();
    }

    onChange() {
        this.deselect();
    }

    onZoom() {
        this.makeAnnotations.updatedAccessors();
    }

    toggleEditor(multiKey) {
        this.addRemoveEditor(multiKey);
    }

    /**
     * Rebuild DOM for this text box and add back onto map. Ensures that any new dimensions from the text box
     * editor are reflected on the text box view.
     */
    rebuildDOM() {
        this.anno.remove();
        this.deselect();
        this.buildDOM();
        this.addTo(this.worldMap);
    }

    ensureEditor() {
        if (!this.editOverlay) this.addEditOverlay(false);
    }

    async addRemoveEditor(multiKey) {
        if (this.editOverlay) {
            // Get text from editor and set on viewer and update feature
            const data = this.editOverlay.note.data();
            let txt = data[0].note.label;
            this.setAnnotationText(txt);
            this.setAngle(this.angle);

            txt = this.options.owner.msg('default_textbox_text') == txt ? '' : txt;

            await this.options.owner?.updateFeature(
                this.feature,
                this.angle,
                txt,
                this.offset_width
            );

            if (!multiKey) {
                this.deselect(multiKey);
                myw.app.setCurrentFeatureSet([]);
            }
            this.rebuildDOM();
        } else {
            this.addEditOverlay(true);
        }
    }

    addEditOverlay(makeCurrent) {
        const editOverlay = new myw.TextBoxEditor(
            this.feature,
            this.options,
            this.feature.geometry.coordinates,
            this
        );
        this.worldMap.removeOverlay(this);
        if (makeCurrent) myw.app.setCurrentFeature(this.feature);
        editOverlay.addTo(this.worldMap);
        this.editOverlay = editOverlay;
    }

    deselect(multiKey) {
        if (this.editOverlay && this.editOverlay.feature) {
            if (multiKey) return;

            this.editOverlay.removeFrom(this.worldMap);
            if ($('#textEditor')) this.editOverlay.removeTextEditor();
            this.worldMap.addOverlay(this);
            this.setAngle(this.angle);
        }
        this.editOverlay = null;
    }

    projectToCanvas(coords) {
        return this.worldMap.getPixelFromCoordinate(myw.proj.toProjCoord(coords));
    }

    editEnabled() {
        return this.editOverlay && this.editOverlay.feature ? true : false;
    }
}

export default TextBoxViewer;
myw.TextBoxViewer = TextBoxViewer;
