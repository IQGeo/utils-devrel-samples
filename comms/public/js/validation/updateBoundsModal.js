// Copyright: IQGeo Limited 2010-2023
import { Dialog } from 'myWorld-client';

export default class UpdateBoundsModal extends Dialog {
    /**
     *
     * @param {object} owner
     * @param {object} options
     */
    constructor(owner, options) {
        const deltaBounds = options.deltaBounds;
        options.destroyOnClose = true;
        options.modal = false;
        options.autoOpen = true;

        super(options);

        this.msg = owner.msg;

        const buttons = {
            OK: {
                text: '{:ok_btn}',
                disabled: !deltaBounds.geometry ? true : false,
                class: 'primary-btn',
                click: async () => {
                    await owner.updateDeltaOwnerBounds(deltaBounds);
                    this.close();
                }
            },
            Cancel: {
                text: '{:cancel_btn}',
                class: 'right',
                click: () => {
                    this.owner.clearLayer();
                    this.close();
                }
            }
        };

        this.setButtons(buttons);
        this.setContent(this.options.contents);

        this.owner = owner;
    }

    close() {
        super.close();
        this.owner.clearLayer();
    }
}
