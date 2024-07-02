// Copyright: IQGeo Limited 2010-2023
import Equipment from './equipment';
import SlackEditor from './slackEditor';

export default class Slack extends Equipment {
    static {
        this.prototype.editorClass = SlackEditor;
    }

    /**
     * Fields that cannot be changed in editor
     */
    readonlyFields() {
        const flds = super.readonlyFields();

        flds.push('cable');

        return flds;
    }

    // Subclassed to include formatted length in title
    // See Fogbugz #15572
    getTitle() {
        const title = super.getTitle();

        const length = this.properties.length;

        // Don't include length in title if its not set
        if (!length && length != 0) return title;

        // Appends formatted length to the end
        return `${title} (${this.formattedFieldValue('length')})`;
    }
}
