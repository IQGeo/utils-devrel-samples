// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import * as d3_selection from 'd3-selection';
import d3_svg_annotation from 'd3-svg-annotation';

const d3 = Object.assign({}, d3_selection, d3_svg_annotation);

class TextBoxOverlay extends myw.Marker {
    /**
     * This is the parent class of TextBoxViewer, for viewing of text boxes,
     * and TextBoxEditor, for editing them.
     * @param {*} feature
     * @param {*} options
     * @param {*} coords
     * @class TextBoxOverlay
     */
    constructor(feature, options, coords) {
        const container = d3
            .select(document.createElement('div'))
            .append('svg')
            .attr('class', 'text-container')
            .attr('width', '2000px')
            .attr('height', '2000px')
            .attr('overflow', 'visible');

        options.element = container.node();
        options.offset = [-1000, -1000];
        options.className = 'textbox-container';
        super(coords, options);
        this.options = options;
        this.coords = coords;
        this.worldMap = options.worldMap;
        this.overlayId = options.id;

        this.feature = feature;
        this.textEditMode = false;
        this.layer = feature.layer;

        this.overlayPane = this.values_.element;
        this.coordinates = feature.geometry.coordinates;

        this.style = feature.getMarkupStyle();

        // Properties fetched from feature need to be specified in
        // MarkupFeature.customFieldNames
        // Stored as degrees in database
        this.angle = this.feature.properties[this.style.orientationProp] || 0;
        this.leaderline = this.feature.properties['leaderline'];
        let offset_width = JSON.parse(this.feature.properties['offset_width']);
        if (!offset_width) {
            offset_width = { dx: 0, dy: 0, width: 0 };
        }
        if (!this.leaderline) {
            offset_width.dx = 0;
            offset_width.dy = 0;
        }
        offset_width.width = Math.max(offset_width.width, 100);

        this.offset_width = offset_width;

        this.buildDOM();
    }

    buildDOM() {
        let svg = d3.select(this.overlayPane);
        this.svg = svg.attr('pointer-events', 'none');
        if (this.svg.empty()) this.noSvg = true;

        this.type = d3.annotationLabel;

        const labelText = this.feature.getTextContents();

        this.annotations = [
            {
                data: { coords: this.coordinates, angle: this.angle },
                note: {
                    label: labelText, //? labelText : this.options.owner.msg('default_textbox_text'),
                    bgPadding: 15,
                    wrap: this.offset_width.width
                },
                //can use x, y directly instead of data
                className: 'show-bg',
                connector: { end: 'dot' },
                color: this.style.color,
                dx: this.offset_width.dx,
                dy: this.offset_width.dy,
                x: 1000,
                y: 1000
            }
        ];

        const makeAnnotations = d3
            .annotation()
            .editMode(false)
            //also can set and override in the note.padding property
            //of the annotation object
            .notePadding(15)
            .type(this.type)
            .annotations(this.annotations);
        this.makeAnnotations = makeAnnotations;

        let chromeAgent = navigator.userAgent.indexOf('Chrome') > -1;
        let safariAgent = navigator.userAgent.indexOf('Safari') > -1;
        if (chromeAgent && safariAgent) safariAgent = false;
        if (safariAgent) {
            document.addEventListener(
                'touchmove',
                function (event) {
                    if (event.scale !== 1) {
                        event.preventDefault();
                    }
                },
                { passive: false }
            );
        }
    }

    setAnnotationText(txt) {
        this.annotations[0].note.label = txt;
    }

    stopClickPropagation() {
        if (event.stopPropagation) {
            event.stopPropagation(); // W3C model
        } else {
            event.cancelBubble = true; // IE model
        }
    }

    setAngle(angle) {
        this.angle = angle;
        this.annotations[0].data.angle = angle;
        this.rotateNote();
    }

    setOffsetWidth(dx, dy, width) {
        if (this.offset_width) {
            this.offset_width.dx = dx;
            this.offset_width.dy = dy;
            const anno = this.note.data()[0];
            anno.dx = dx;
            anno.dy = dy;
        }
    }
    setWidth(width) {
        if (this.offset_width) {
            this.offset_width.width = width;
            const anno = this.note.data()[0];
            anno.note.wrap = width;
        }
    }

    rotateNote() {
        let _this = this;
        this.note
            .attr('transform', d => {
                return `translate(${d.dx}, ${d.dy}) rotate(${d.data.angle})`;
            })
            .select('.rotateHandle')
            .attr('cy', d => {
                let one = d.dy >= 0 ? 1 : -1;
                return (_this.note.select('.annotation-note-bg').attr('height') + 5) * one;
            });
        this.note
            .select('.rotateIcon')
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
            });
    }

    getTransform(data) {
        var t1 = this.anno.select('.annotation').node(),
            matrix1 = t1.transform.baseVal.consolidate().matrix,
            x1 = matrix1.e,
            y1 = matrix1.f;
        var t2 = this.note.node(),
            matrix2 = t2.transform.baseVal.consolidate().matrix,
            x2 = matrix2.e,
            y2 = matrix2.f;
        var t3 = this.note.select('.annotation-note-content').node(),
            matrix3 = t3.transform.baseVal.consolidate().matrix,
            x3 = matrix3.e,
            y3 = matrix3.f;
        let x = x1 + x2 + x3 - data.note.bgPadding - 1;
        let y = y1 + y2 + y3 - data.note.bgPadding - 1;
        return 'translate(' + (x - 1000) + 'px,' + (y - 1012) + 'px)';
    }

    getPixelSize() {
        return this.style.size;
    }
}
export default TextBoxOverlay;
myw.TextBoxOverlay = TextBoxOverlay;
