// Copyright: IQGeo Limited 2010-2023
import $ from 'jquery';
import _ from 'underscore';
import myw from 'myWorld-client';
import './textBoxOverlay';
import { drag } from 'd3-drag';
import { select } from 'd3-selection';
import { event as currentEvent } from 'd3-selection';
import { add } from 'ol/coordinate';
import Overlay from 'ol/Overlay';

class TextBoxEditor extends myw.TextBoxOverlay {
    /**
     * Initializes the marker used to drag textbox placed on text box centroid.
     * @param  {feature} feature  Instance of myworld feature where marker is placed
     * @param  {object} options
     */
    constructor(feature, options, coords, marker) {
        let overlayId = feature.getUrn();

        options.id = overlayId + '-edit';
        super(feature, options, coords);
        this.marker = marker;

        if (!this.annotations[0].note.label)
            this.setAnnotationText(this.options.owner.msg('default_textbox_text'));

        _.bindAll(this, '_handleMapClick', 'saveOffset', 'savePosition');
    }

    addTo(map) {
        map.addOverlay(this);
        this.onAdd(map);
        this.makeAnnotations.editMode(true).update();
        this.updateEditor();
        this.addWidthHandle();
        this.addRotateHandle();
        this.addEditHandle();
        map.on('click', this._handleMapClick);
    }

    removeFrom(map) {
        map.removeOverlay(this);
        map.un('click', this._handleMapClick);
        return this;
    }

    _handleMapClick() {
        let multiKey = event.shiftKey;
        let feature = this.worldMap.getFeaturesAtPixel(this.worldMap.getEventPixel(event));
        if (feature.length == 0) this.marker.addRemoveEditor(multiKey);
    }

    onRemove(map) {
        this.makeAnnotations.editMode(false).update();
        this.removeWidthHandle();
        this.removeRotateHandle();
        this.removeEditHandle();
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
            .style('fill-opacity', 1) // this.style[4] === 'no-fill' ? 0 : 1)
            .style('stroke', this.style.color)
            .style('stroke-width', this.style.borderWidth);

        anno.on('click', function () {
            _this.stopClickPropagation();
            const multiKey = currentEvent.shiftKey;
            _this.marker.toggleEditor(multiKey);
        });

        const note = anno.select('.annotation-note');
        this.note = note;
        this.rotateNote();
        this.makeAnnotations.disable(this.leaderline ? [] : ['connector']);
    }

    onZoom() {
        let _this = this;
        this.makeAnnotations.updatedAccessors();
        if ($('#textEditor')) {
            let data = this.annotations;
            $('#textEditor').css('transform', () => {
                let coords = _this.getTransform(data[0]);
                return 'translate(' + coords[0] + 'px,' + coords[1] + 'px)';
            });
            $('#textEditorButton').css('transform', () => {
                let coords = _this.getTransform(data[0]);
                return 'translate(' + (coords[0] - 16) + 'px,' + (coords[1] - 16) + 'px)';
            });
        }
    }

    disableDrag() {
        let _this = this;
        this.note.call(
            drag()
                .container(select('g.annotations').node())
                .on('start', function (d) {
                    _this.worldMap.getInteractions().forEach(x => x.setActive(false));
                })
                .on('end', function (d) {
                    _this.worldMap.getInteractions().forEach(x => x.setActive(true));
                })
        );
    }

    dragNote() {
        this.handleDrag('.annotation-note circle.handle', this.saveOffset);
    }
    dragSubject() {
        this.handleDrag('.annotation-subject circle.handle', this.savePosition);
    }

    handleDrag(selector, callback) {
        let _this = this;
        let data = this.note.data();
        this.anno
            .selectAll(selector)
            .attr('fill', data[0].color)
            .attr('fill-opacity', 0.1)
            .attr('stroke', data[0].color)
            .attr('r', 16)
            .call(
                drag()
                    .container(select('g.annotations').node())
                    .on('start', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(false));
                        d.start && d.start(d);
                    })
                    .on('drag', d => {
                        let data = _this.note.data();
                        if (!this.dragCoords) {
                            this.dragCoords = data[0].data.coords;
                            this.origPx = _this.worldMap.getPixelFromCoordinate(this.dragCoords);
                        }
                        let newCoords = _this.worldMap.getCoordinateFromPixel([
                            data[0].x - 1000 + this.origPx[0],
                            data[0].y - 1000 + this.origPx[1]
                        ]);

                        this.dragCoords = newCoords;
                        d.drag && d.drag(d);
                        this.rotateNote();
                        if ($('#textEditor')) {
                            $('#textEditor').css('transform', () => {
                                let coords = _this.getTransform(data[0]);
                                return coords;
                            });
                            $('#textEditorButton').css('transform', () => {
                                let coords = _this.getTransform(data[0]);
                                return coords;
                            });
                        }
                    })
                    .on('end', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(true));
                        callback(d, selector);
                        d.end && d.end(d);
                    })
            );
    }

    addRotateHandle() {
        let _this = this;
        this.note
            .append('circle')
            .attr('class', 'rotateHandle')
            .attr('fill', d => {
                return d.color;
            })
            .attr('fill-opacity', 0.1)
            .attr('cursor', 'pointer')
            .attr('stroke-dasharray', 5)
            .attr('stroke', d => {
                return d.color;
            })
            .attr('r', 16)
            .attr('cx', 0)
            .attr('cy', d => {
                let one = d.dy >= 0 ? 1 : -1;
                return (_this.note.select('.annotation-note-bg').attr('height') + 5) * one;
            })
            .call(
                drag()
                    .on('start', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(false));
                        d.start && d.start(d);
                    })
                    .on('drag', d => {
                        _this.updateRotation(d);
                        d.drag && d.drag(d);
                    })
                    .on('end', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(true));
                        _this.saveRotation(d);
                        d.end && d.end(d);
                    })
            );
        this.rotateIcon = this.note
            .append('image')
            .attr('class', 'rotateIcon')
            .attr('cursor', 'pointer')
            .attr('xlink:href', 'modules/comms/images/markup/rotate.svg')
            .attr('height', 24)
            .attr('width', 24)
            .attr('x', -12)
            .attr('y', d => {
                let height = () => {
                    return _this.note.select('.annotation-note-bg').attr('height');
                };
                let num = Number(height());
                let offset = d.dy >= 0 ? num - 12 : -(num + 12);
                return offset;
            })
            .style('transform-origin', d => {
                let height = () => {
                    return _this.note.select('.annotation-note-bg').attr('height');
                };
                let num = Number(height());
                return d.dy >= 0 ? '0 0' : '-12px ' + -num + 'px';
            })
            .style('transform', d => {
                return d.dy >= 0 ? 'scaleY(1)' : 'scaleY(-1)';
            })
            .call(
                drag()
                    .on('start', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(false));
                        d.start && d.start(d);
                    })
                    .on('drag', d => {
                        _this.updateRotation(d);
                        d.drag && d.drag(d);
                    })
                    .on('end', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(true));
                        _this.saveRotation(d);
                        d.end && d.end(d);
                    })
            );
    }

    removeRotateHandle() {
        this.note.selectAll('.rotateHandle').remove();
        this.note.selectAll('.rotateIcon').remove();
    }

    addWidthHandle() {
        let _this = this;
        this.widthHandle = this.note
            .append('circle')
            .attr('class', 'widthHandle')
            .attr('fill', d => {
                return d.color;
            })
            .attr('fill-opacity', 0.1)
            .attr('cursor', 'pointer')
            .attr('stroke-dasharray', 5)
            .attr('stroke', d => {
                return d.color;
            })
            .attr('r', 16)
            .attr('cx', d => {
                return this.note.select('.annotation-note-bg').attr('width') / 2;
            })
            .attr('cy', 0)
            .call(
                drag()
                    .on('start', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(false));
                        d.start && d.start(d);
                    })
                    .on('drag', d => {
                        _this.updateWidth(d);
                        d.drag && d.drag(d);
                    })
                    .on('end', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(true));
                        _this.saveWidth(d);
                        d.end && d.end(d);
                    })
            );
        this.widthIcon = this.note
            .append('image')
            .attr('class', 'widthIcon')
            .attr('cursor', 'pointer')
            .attr('xlink:href', 'modules/comms/images/markup/width.svg')
            .attr('height', 24)
            .attr('width', 24)
            .attr('x', d => {
                return this.note.select('.annotation-note-bg').attr('width') / 2 - 12;
            })
            .attr('y', -12)
            .call(
                drag()
                    .on('start', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(false));
                        d.start && d.start(d);
                    })
                    .on('drag', d => {
                        _this.updateWidth(d);
                        d.drag && d.drag(d);
                    })
                    .on('end', d => {
                        _this.worldMap.getInteractions().forEach(x => x.setActive(true));
                        _this.saveWidth(d);
                        d.end && d.end(d);
                    })
            );
    }

    removeWidthHandle() {
        this.note.selectAll('.widthHandle').remove();
        this.note.selectAll('.widthIcon').remove();
    }

    addEditHandle() {
        let _this = this;
        this.editHandle = this.note
            .append('circle')
            .attr('class', 'editHandle')
            .attr('fill', d => {
                return d.color;
            })
            .attr('fill-opacity', 0.1)
            .attr('cursor', 'pointer')
            .attr('stroke-dasharray', 5)
            .attr('stroke', d => {
                return d.color;
            })
            .attr('r', 16)
            .attr('cx', d => {
                return -this.note.select('.annotation-note-bg').attr('width') / 2;
            })
            .on('click', () => {
                _this.stopClickPropagation();
                _this.removeEditHandle();
                _this.addTextEditor();
            });
        this.editIcon = this.note
            .append('image')
            .attr('class', 'editIcon')
            .attr('cursor', 'pointer')
            .attr('xlink:href', 'modules/comms/images/markup/edit_pencil.svg')
            .attr('x', d => {
                return -this.note.select('.annotation-note-bg').attr('width') / 2 - 10;
            })
            .attr('y', -10)
            .attr('height', 20)
            .attr('width', 20)
            .on('click', () => {
                _this.stopClickPropagation();
                _this.removeEditHandle();
                _this.addTextEditor();
            });
    }

    removeEditHandle() {
        this.note.selectAll('.editHandle').remove();
        this.note.selectAll('.editIcon').remove();
    }

    editBoxHeight() {
        return Number(this.note.select('.annotation-note-bg').attr('height')) + 'px';
    }

    editBoxWidth() {
        return Number(this.note.select('.annotation-note-bg').attr('width')) + 'px';
    }

    addTextEditor() {
        let _this = this;
        this.textEditMode = true;
        let data = this.note.data();
        const container = $('<div/>');

        const input = $('<textarea/>')
            .attr('id', 'textEditor')
            .attr('contenteditable', true)
            .attr('pointer-events', 'auto')
            .css({
                cursor: 'text',
                backgroundColor: 'white',
                resize: 'none',
                'font-size': () => {
                    return _this.anno.style('font-size');
                },
                height: () => {
                    return _this.editBoxHeight();
                },
                width: () => {
                    return _this.editBoxWidth();
                },
                padding: () => {
                    return data[0].note.bgPadding - 1 + 'px';
                },
                paddingTop: () => {
                    return data[0].note.bgPadding - 4 + 'px';
                },
                paddingBottom: () => {
                    return data[0].note.bgPadding + 2 + 'px';
                },
                border: '2px dashed grey',
                transform: () => {
                    let coords = _this.getTransform(data[0]);
                    return coords;
                }
            })
            .addClass('interactive')
            .on('click', d => {
                _this.stopClickPropagation();
            })
            .on('pointerdown mousedown touchstart', d => {
                _this.worldMap.getInteractions().forEach(x => x.setActive(false));
                _this.stopClickPropagation();
            })
            .on('pointerup mouseup touchend', d => {
                _this.stopClickPropagation();
                _this.worldMap.getInteractions().forEach(x => x.setActive(true));
            })
            .on('keyup textInput input', i => {
                const txt = $('#textEditor').val();

                data[0].note.label = txt;
                _this.makeAnnotations.updateText();
                _this.makeAnnotations.update();
                _this.rotateNote();
                _this.removeWidthHandle();
                _this.addWidthHandle();
                _this.updateEditor();
                $('#textEditor').css('height', () => {
                    return _this.editBoxHeight();
                });
                $('#textEditor').css('width', () => {
                    return _this.editBoxWidth();
                });
                $('#textEditor').css('transform', () => {
                    let coords = _this.getTransform(data[0]);
                    return coords;
                });
                $('#textEditorButton').css('transform', () => {
                    let coords = _this.getTransform(data[0]);
                    return coords;
                });
            })
            .text(
                data[0].note.label == this.options.owner.msg('default_textbox_text')
                    ? ''
                    : data[0].note.label
            );
        const button = $('<button />');
        button
            .css({
                'background-image': 'url(modules/comms/images/markup/edit_check.svg)',
                'z-index': 9999,
                width: '32px',
                height: '32px',
                'border-radius': '16px',
                border: '1px dashed grey',
                'background-repeat': 'no-repeat',
                'background-size': '20px',
                'background-position': '5px',
                position: 'absolute',
                top: '-16px',
                left: '-16px'
            })
            .css('transform', () => {
                let coords = _this.getTransform(data[0]);
                return coords;
            })
            .attr('id', 'textEditorButton')
            .attr('pointer-events', 'auto')
            .addClass('interactive')
            .on('click', d => {
                _this.stopClickPropagation();
                this.removeTextEditor();
                this.addEditHandle();
            });

        container.append(input);
        container.append(button);
        const textOverlay = new Overlay({
            element: container[0],
            position: data[0].data.coords,
            className: 'text-edit-overlay'
        });
        this.textOverlay = textOverlay;
        this.worldMap.addOverlay(this.textOverlay);

        this.note.select('.annotation-note-content').style('opacity', 0.35);
    }

    removeTextEditor() {
        this.textEditMode = false;
        this.worldMap.removeOverlay(this.textOverlay);
        this.editIcon.attr('xlink:href', 'modules/comms/images/markup/edit_pencil.svg');
        this.note.select('.annotation-note-content').style('opacity', 1);
        this.updateEditor();
    }

    toDegrees(rad) {
        return rad * (180 / Math.PI);
    }

    updateRotation(d) {
        const exy = this.worldMap.getEventPixel(event);
        const coords = d.data.coords;
        const pixelCoords = this.worldMap.getPixelFromCoordinate(coords);
        const dxy = [pixelCoords[0] + d.dx, pixelCoords[1] + d.dy];
        let angle = this.angleBetweenPoints(dxy, exy);

        d.dy >= 0 ? (angle -= Math.PI / 2) : (angle += Math.PI / 2);
        d.data.angle =
            this.toDegrees(angle) > -2.5 && this.toDegrees(angle) < 2.5
                ? 0
                : this.toDegrees(angle) > -92.5 && this.toDegrees(angle) < -87.5
                ? -90
                : this.toDegrees(angle) > 87.5 && this.toDegrees(angle) < 90.5
                ? 90
                : this.toDegrees(angle);
        this.rotateNote();
    }

    updateWidth(d) {
        let _this = this;
        const exy = this.worldMap.getEventPixel(event);
        const coords = d.data.coords;
        const pixelCoords = this.worldMap.getPixelFromCoordinate(coords);
        const dxy = [pixelCoords[0] + d.dx, pixelCoords[1] + d.dy];
        d.note.wrap = this.distanceBetweenPoints(exy, dxy) * 2;
        this.makeAnnotations.updateText();
        this.widthHandle.attr('cx', d => {
            return _this.note.select('.annotation-note-bg').attr('width') / 2;
        });
        this.widthIcon.attr('x', d => {
            return _this.note.select('.annotation-note-bg').attr('width') / 2 - 12;
        });
        this.editIcon.attr('x', d => {
            return -_this.note.select('.annotation-note-bg').attr('width') / 2 - 10;
        });
        this.editHandle.attr('cx', d => {
            return -_this.note.select('.annotation-note-bg').attr('width') / 2;
        });
        this.makeAnnotations.update();
        this.rotateNote();
        if ($('#textEditor')) {
            $('#textEditor').css('height', () => {
                return (
                    _this.note.select('.annotation-note-bg').attr('height') -
                    d.note.bgPadding * 2 +
                    'px'
                );
            });
            $('#textEditor').css('width', () => {
                return (
                    _this.note.select('.annotation-note-bg').attr('width') -
                    d.note.bgPadding * 2 +
                    'px'
                );
            });
            $('#textEditor').css('transform', () => {
                let coords = _this.getTransform(d);
                return coords;
            });
            $('#textEditorButton').css('transform', () => {
                let coords = _this.getTransform(d);
                return coords;
            });
        }
    }

    updateEditor() {
        this.rotateNote();
        this.dragSubject();
        if (this.anno.selectAll('.annotation-connector').size() > 0) {
            this.dragNote();
        } else {
            this.anno.selectAll('.annotation-note circle.handle').remove();
        }
        let data = this.note.data();
        this.anno.selectAll('circle').attr('fill', data[0].color).attr('stroke', data[0].color);
        this.disableDrag();
    }

    saveRotation(d) {
        this.marker.setAngle(d.data.angle);
    }

    saveWidth(d) {
        this.marker.setWidth(d.note.wrap);
        this.updateEditor();
    }

    saveOffset(d) {
        let annotation = this.note.data()[0];
        this.marker.setOffsetWidth(annotation.dx, annotation.dy, 0);
        this.updateEditor();
    }

    savePosition(d, selector) {
        let _this = this;
        let annotation = this.note.data()[0];
        let coords = _this.worldMap.getPixelFromCoordinate(annotation.data.coords);
        let newCoords = _this.worldMap.getCoordinateFromPixel(
            add(coords, [annotation.x - 1000, annotation.y - 1000])
        );

        // Maybe marker should update feature?
        this.options.owner?.updateFeatureGeometry(this.feature, newCoords);

        this.annotations[0].data.coords = newCoords;
        this.marker.setPosition(newCoords);
        annotation.x = 1000;
        annotation.y = 1000;
        this.setPosition(newCoords);
        this.makeAnnotations.update();
        this.updateEditor();
        this.dragCoords = null;
        this.origPx = null;
    }

    // Returns radians
    angleBetweenPoints(p1, p2) {
        if (p1[0] == p2[0] && p1[1] == p2[1]) return Math.PI / 2;
        else return Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
    }

    distanceBetweenPoints(p1, p2) {
        return Math.sqrt(Math.pow(p2[1] - p1[1], 2) + Math.pow(p2[0] - p1[0], 2));
    }
}

export default TextBoxEditor;
myw.TextBoxEditor = TextBoxEditor;
