import myw from 'myWorld-client';
import MarkupFeatureEditor from './markupFeatureEditor';

class MarkupFeature extends myw.MyWorldFeature {
    static {
        this.prototype.editorClass = MarkupFeatureEditor;

        this.prototype.customStyleFieldNames = [
            'line_style',
            'text_style',
            'point_style',
            'fill_style',
            'text',
            'offset_width',
            'leaderline'
        ];
    }

    /**
     *
     * @returns {*} Style object(s) suitable for rendering 'this'
     */
    getMarkupStyle() {
        let style = [];
        if (this.properties.line_style) {
            style.push(new myw.LineStyle(JSON.parse(this.properties.line_style)));
        }
        if (this.properties.point_style) {
            // ENH - Support icons as well.
            style.push(new myw.SymbolStyle(JSON.parse(this.properties.point_style)));
        }
        if (this.properties.text_style) {
            style.push(new myw.TextStyle(JSON.parse(this.properties.text_style)));
        }
        if (this.properties.fill_style) {
            style.push(new myw.FillStyle(JSON.parse(this.properties.fill_style)));
        }

        if (style.length == 0) {
            return undefined;
        } else if (style.length == 1) {
            return style[0];
        } else return new myw.Style(style[0], style[1]);
    }

    getCustomStyles(defaultStyles) {
        const style = this.getMarkupStyle();
        if (style) {
            return { normal: style, highlight: style };
        } else {
            return defaultStyles;
        }
    }

    getTextContents() {
        return this.properties.text;
    }

    getTextStyle() {
        return this.properties.text_style;
    }

    /**
     * Only allow edits if markup mode is active.
     * This provides clean distinction between markup and normal features, and markup
     * mode provides additional functionality.
     */
    isEditable() {
        super.isEditable();
        return myw.app.plugins.markupMode.enabled;
    }
}

myw.featureModels['iqgapp_markup_point'] = MarkupFeature;
myw.featureModels['iqgapp_markup_line'] = MarkupFeature;
myw.featureModels['iqgapp_markup_text'] = MarkupFeature;
myw.featureModels['iqgapp_markup_polygon'] = MarkupFeature;
myw.featureModels['iqgapp_markup_photo'] = MarkupFeature;

export default MarkupFeature;
