// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';
import ReportTable from 'modules/comms/js/reporting/streams/reportTable';

const punct = "<>?:@{}!$%^&*()+'.;[]`£€¬" + '"';

export default class TestReport extends myw.MywClass {
    /**
     * Init slots of self
     */
    constructor(app) {
        super();
        this.app = app;
    }

    /**
     * Title for preview dialog and download file
     */
    title() {
        return this.typeName();
    }

    /**
     * String used to identify self in choice lists etc
     */
    typeName() {
        return 'Test Report';
    }

    /**
     * Gather data
     */
    async build() {
        this.logo = await this._loadImage('images/logos/IQGeo_logo_main.svg');
        this.iconPng = await this._loadImage(
            'modules/comms_dev_db/images/reporting/fiber_splitter.png'
        );
        this.iconSvg = await this._loadImage('modules/comms/images/features/fiber_olt.svg');
        this.mapScreenshot = await this.app.map.takeScreenshot({ format: 'canvas' });
        this.rendererItem = { renderer: this.renderStreamName.bind(this) };
    }

    /**
     * Get image as HtmlImageElement
     */
    // Support get image in streams?
    async _loadImage(path) {
        const img = new Image();
        img.src = myw.baseUrl + path;
        const promise = new Promise(resolve => {
            img.onload = function () {
                resolve(this);
            };
        });

        try {
            return await myw.Util.timeout(promise, 1000);
        } catch {
            return '<image>'; // ENH: onload never resolved under nodeJs
        }
    }

    /**
     * Write report on ReportStream 'strm'
     */
    generate(strm) {
        // Headings and text
        strm.newSection('Line output');

        strm.writeLine({ value: this.logo, scale: 4 });
        strm.writeHeading(1, 'Heading Level 1 ');
        strm.writeLine('Some text');
        strm.writeLine();

        strm.writeHeading(2, 'Heading Level 2');
        strm.writeLine('A long line of text that is likely to cause a line wrap. '.repeat(10));
        strm.writeLine();

        strm.writeHeading(3, 'Heading ', { value: 'Green', color: '#33aa33' }, ' Level 3 ');
        strm.writeLine('Some text ', 'in', ' multiple ', 'items');
        strm.writeLine(
            'Some ',
            { value: 'bold', bold: true },
            ', ',
            { value: 'underlined', underline: true },
            ' and ',
            { value: 'green', color: '#33aa33' },
            ' text'
        );
        strm.writeLine(
            'Some ',
            { value: 'text with grey', backgroundColor: '#dddddd' },
            ' background'
        );
        strm.writeLine();

        strm.writeHeading(3, 'Heading with Punctuation:', punct);
        strm.writeLine('Text with punctuation: ', punct);
        strm.writeLine('Text with green punctuation: ', { value: punct, color: '#33aa33' });
        strm.writeLine('Text with a PNG icon ', this.iconPng, ' and a SVG icon', this.iconSvg);
        strm.writeLine('This is the ', this.rendererItem, ' report');
        strm.writeLine();

        // Tables
        const { tab, colStyles } = this.buildTable();
        const colHeadings = {
            int: 'int',
            text: { value: 'text' },
            dist: { value: 'dist', color: '#FF0000' },
            empty: { value: 'empty', backgroundColor: '#dddddd' },
            image: { value: this.iconSvg },
            renderer: this.rendererItem,
            punct: punct
        };

        strm.newSection('Table 1', 5);
        strm.writeHeading(2, 'Table 1: Defaults');
        strm.writeTable(tab);
        strm.writeLine();

        strm.newSection('Table 2', 5);
        strm.writeHeading(2, 'Table 2: Modern');
        let options = { colHeadings, colStyles, skipEmptyCols: false, style: 'modern' };
        strm.writeTable(tab, options);
        strm.writeLine();

        strm.newSection('Table 3', 5);
        strm.writeHeading(2, 'Table 3: Clasic + No Empty Columns');
        options = { colHeadings, colStyles, skipEmptyCols: true, style: 'classic' };
        strm.writeTable(tab, options);

        strm.newSection('Table 4', 5);
        strm.writeHeading(2, 'Table 4: Style None, no headings');
        const mapTable = this.buildMapTable();
        options = { colHeadings: {}, colStyles, skipEmptyCols: false, style: 'none' };
        strm.writeTable(mapTable, options);
        strm.writeLine();

        return strm.doc;
    }

    // Builds a report table containing interesting data
    buildTable() {
        const cols = ['int', 'text', 'dist', 'empty', 'image', 'punct', 'renderer', 'empty'];
        const tab = new ReportTable(cols);

        // Test padding
        const colStyles = {};
        colStyles['int'] = { rightPad: 4, hAlign: 'center' };
        colStyles['text'] = { hAlign: 'left' };
        colStyles['dist'] = { hAlign: 'right' };
        colStyles['image'] = { hAlign: 'center' };

        // Populate rows
        for (let i = 0; i < 5; i++) {
            tab.nextRow();

            for (const col of cols) {
                let value;
                if (col == 'text') value = 'Cell text ' + i * i;
                else if (col == 'int') value = i;
                else if (col == 'dist') value = i * 0.333;
                else if (col == 'image') value = i % 2 ? this.iconPng : this.iconSvg;
                else if (col == 'punct') value = punct;
                else if (col == 'renderer') value = this.rendererItem;
                else continue;

                if (col !== 'renderer') {
                    if (i == 2) value = { value: value, color: '#33aa33', scale: 3 };
                    if (i == 3) value = { value: value, backgroundColor: '#33aa33', scale: 0.5 };
                    if (i == 4)
                        value = {
                            value: value,
                            bold: true,
                            underline: true,
                            color: '#33aa33'
                        };
                }

                tab.add(col, value);
            }
        }

        return { tab, colStyles };
    }

    buildMapTable() {
        const cols = ['image1', 'image2'];
        const mapTable = new ReportTable(cols);
        mapTable.nextRow();
        for (const col of cols) {
            mapTable.add(col, { value: this.mapScreenshot, scale: 10 });
        }

        return mapTable;
    }

    renderStreamName(strm, item, draw = true) {
        if (draw) {
            strm._drawItem({ value: strm.type, bold: true });
        }

        //Calculate dims
        switch (strm.type) {
            case 'pdf': {
                const w = strm.doc.getTextDimensions(strm.type).w / strm.doc.getFontSize();
                return { w, h: 1 };
            }

            default:
                return { w: strm.type.length, h: 1 };
        }
    }
}
