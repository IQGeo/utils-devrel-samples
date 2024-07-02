import myw from 'myWorld-client';

const commsApplicationExtension = {
    /**
     * Returns self's details control (if there is one)
     */
    // ENH: Remove when Core idea 16525 implemented
    getDetailsControl() {
        if (this.layout.controls.tabControl && this.layout.controls.tabControl.tabs.details)
            return this.layout.controls.tabControl.tabs.details.control;
    }
};

Object.assign(myw.Application.prototype, commsApplicationExtension);
