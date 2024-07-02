import { Dialog } from 'myWorld-client';

export default class CommsDialog extends Dialog {
    /**
     * @class
     * Provides parent class for NMC connection dialogs
     * ENH: Move any other common code into this class.
     */

    /**
     * Sets title of dialog
     * @param {String} title
     */
    setTitle(title) {
        this.$el.dialog('widget').find('.ui-dialog-title').html(title);
    }
}
